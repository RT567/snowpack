// Audit: for random 2026 dates, compare the model's inputs and behaviour with the Bureau's daily
// observations (DWO CSV, Thredbo Top) and the Mountain Safety Collective's daily report text.
// Usage: node scripts/audit-days.mjs [--seed=7] [--days=10] [--date=2026-08-13]
import { readFileSync, readdirSync } from 'node:fs';
import { toRecord } from '../src/weather/openMeteo.js';
import { stitch } from '../src/weather/record.js';
import { simulate, depth, rho, snowFraction } from '../src/snow/model.js';
import { DEFAULT_PARAMS } from '../src/snow/params.js';
import { THREDBO_TOP } from '../src/weather/site.js';
import { correctWithStation } from '../src/weather/stationDaily.js';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const seed = Number(arg('seed', 7)), nDays = Number(arg('days', 10)), only = arg('date', '');

const a = toRecord(JSON.parse(readFileSync('test/fixtures/openmeteo-archive-2026.json')), THREDBO_TOP);
const r = toRecord(JSON.parse(readFileSync('test/fixtures/openmeteo-forecast-2026-09-15.json')), THREDBO_TOP);
const raw = stitch([a, r], Date.UTC(2026, 8, 14, 14));
const rec = process.argv.includes('--raw') ? raw : correctWithStation(raw, JSON.parse(readFileSync('public/data/thredbo-top-daily-2026.json')).days);
const snaps = simulate(rec, process.argv.includes('--raw') ? DEFAULT_PARAMS : { ...DEFAULT_PARAMS, precipFactor: 1 });
const TZ = 'Australia/Sydney';
const dayOf = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ });
const hourOf = (t) => Number(new Date(t).toLocaleString('en-AU', { timeZone: TZ, hour: '2-digit', hour12: false }).slice(0, 2)) % 24;

// DWO
const dwo = new Map();
for (const f of readdirSync('test/fixtures/dwo')) {
  const txt = readFileSync(`test/fixtures/dwo/${f}`, 'latin1');
  for (const line of txt.split('\n')) {
    const c = line.split(',');
    if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(c[1] ?? '')) continue;
    const [y, m, d] = c[1].split('-');
    dwo.set(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`, { min: +c[2], max: +c[3], rain: c[4] === '' ? null : +c[4], gustDir: c[7], gustKmh: +c[8], t9: +c[10], rh9: +c[11], w9: +c[14], t15: +c[16], rh15: +c[17], w15: +c[20] });
  }
}

// pick dates
let s = seed; const rnd = () => { s = (s * 1103515245 + 12345) % 2 ** 31; return s / 2 ** 31; };
const start = Date.UTC(2026, 5, 1), end = Date.UTC(2026, 8, 10);
const dates = only ? [only] : Array.from({ length: nDays }, () => dayOf(start + rnd() * (end - start))).sort();

async function msc(date) {
  try {
    const res = await fetch('https://api.mountainsafetycollective.org/embedd/get_view_data_by_date', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date }) });
    const d = await res.json();
    const reps = Array.isArray(d) ? d : d.reports ?? [];
    return reps.map((x) => x.report ?? x).map((rep) => ({ title: rep.title ?? rep.region ?? rep.name ?? '', weather: strip(rep.weather_summary), snowpack: strip(rep.snowpack_summary), hazard: strip(rep.hazard_summary) }));
  } catch (e) { return [{ title: `MSC fetch failed: ${e.message}` }]; }
}
const strip = (h) => (h ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

for (const date of dates) {
  const idx = rec.hours.map((h, i) => [h, i]).filter(([h]) => dayOf(h.t) === date);
  if (!idx.length) continue;
  const hs = idx.map(([h]) => h);
  const temps = hs.map((h) => h.temp);
  let snowMm = 0, rainMm = 0;
  const pf = process.argv.includes('--raw') ? DEFAULT_PARAMS.precipFactor : 1;
  for (const h of hs) { const f = snowFraction(h.temp, h.rh); snowMm += h.precip * pf * f; rainMm += h.precip * pf * (1 - f); }
  const i0 = idx[0][1], i1 = idx.at(-1)[1];
  const d0 = depth(snaps[Math.max(0, i0 - 1)]), d1 = depth(snaps[i1]);
  const top = snaps[i1].layers.at(-1);
  const o = dwo.get(date);
  console.log(`\n=== ${date} ===`);
  console.log(`BOM DWO      : min ${o?.min} max ${o?.max} °C, rain(24h to 9am) ${o?.rain} mm, gust ${o?.gustKmh} km/h ${o?.gustDir}, 9am ${o?.t9}°C/${o?.rh9}% ${o?.w9} km/h, 3pm ${o?.t15}°C/${o?.rh15}% ${o?.w15} km/h`);
  console.log(`model inputs : min ${Math.min(...temps).toFixed(1)} max ${Math.max(...temps).toFixed(1)} °C, precip ${(hs.reduce((x, h) => x + h.precip, 0)).toFixed(1)} mm: snow ${snowMm.toFixed(1)} + rain ${rainMm.toFixed(1)} mm, wind max ${(Math.max(...hs.map((h) => h.wind)) * 3.6).toFixed(0)} km/h, gust ${(Math.max(...hs.map((h) => h.gust)) * 3.6).toFixed(0)} km/h`);
  console.log(`Model        : depth ${(d0 * 100).toFixed(0)} → ${(d1 * 100).toFixed(0)} cm, layers ${snaps[i1].layers.length}, surface ${top ? `${top.grain} ${(top.thick * 100).toFixed(0)} cm ρ${rho(top).toFixed(0)}${top.lwc > 0 ? ' wet' : ''} T${top.temp.toFixed(1)}` : 'bare'}`);
  // hourly strip
  let line = '  hour  T    precip  wind  depth  top';
  console.log(line);
  for (const [h, i] of idx) {
    const t = snaps[i].layers.at(-1);
    console.log(`  ${String(hourOf(h.t)).padStart(2, '0')}   ${h.temp.toFixed(1).padStart(5)} ${h.precip.toFixed(1).padStart(6)} ${(h.wind * 3.6).toFixed(0).padStart(5)} ${(depth(snaps[i]) * 100).toFixed(1).padStart(6)}  ${t ? `${t.grain}${t.lwc > 0 ? 'w' : ''} ρ${rho(t).toFixed(0)}` : '-'}`);
  }
  for (const rep of await msc(date)) {
    console.log(`MSC ${rep.title}`);
    if (rep.weather) console.log(`  weather : ${rep.weather.slice(0, 500)}`);
    if (rep.snowpack) console.log(`  snowpack: ${rep.snowpack.slice(0, 600)}`);
  }
}
