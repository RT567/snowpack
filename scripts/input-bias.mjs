// Compare Open-Meteo hourly inputs with the Bureau's daily observations at Thredbo Top (DWO CSVs).
import { readFileSync, readdirSync } from 'node:fs';
import { toRecord } from '../src/weather/openMeteo.js';
import { stitch } from '../src/weather/record.js';
import { THREDBO_TOP } from '../src/weather/site.js';
import { snowFraction } from '../src/snow/model.js';

const a = toRecord(JSON.parse(readFileSync('test/fixtures/openmeteo-archive-2026.json')), THREDBO_TOP);
const r = toRecord(JSON.parse(readFileSync('test/fixtures/openmeteo-forecast-2026-09-15.json')), THREDBO_TOP);
const rec = stitch([a, r], Date.UTC(2026, 8, 14, 14));
const TZ = 'Australia/Sydney';
const dayOf = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ });
const hourOf = (t) => Number(new Date(t).toLocaleString('en-AU', { timeZone: TZ, hour: '2-digit', hour12: false }).slice(0, 2)) % 24;

const dwo = new Map();
for (const f of readdirSync('test/fixtures/dwo')) {
  for (const line of readFileSync(`test/fixtures/dwo/${f}`, 'latin1').split('\n')) {
    const c = line.split(',');
    if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(c[1] ?? '')) continue;
    const [y, m, d] = c[1].split('-');
    dwo.set(`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`, { min: +c[2], max: +c[3], rain: c[4] === '' ? null : +c[4], gust: +c[8], t9: +c[10], t15: +c[16], w9: +c[14], w15: +c[20] });
  }
}
// Bureau "day": min/max are for the 24 h to 9 am; rain likewise. Build the same windows from Open-Meteo.
const byDay = new Map(); // key = DWO date, values = hours 09:00 previous day .. 08:59 this day
for (const h of rec.hours) {
  const hr = hourOf(h.t);
  const key = hr >= 9 ? dayOf(h.t + 24 * 3600_000) : dayOf(h.t);
  if (!byDay.has(key)) byDay.set(key, []);
  byDay.get(key).push(h);
}
const rows = [];
for (const [date, hs] of byDay) {
  const o = dwo.get(date);
  if (!o || hs.length < 20) continue;
  const temps = hs.map((h) => h.temp);
  const precip = hs.reduce((x, h) => x + h.precip, 0);
  const rainOnly = hs.reduce((x, h) => x + h.precip * (1 - snowFraction(h.temp, h.rh)), 0);
  const t9 = hs.find((h) => hourOf(h.t) === 9)?.temp, t15 = hs.find((h) => hourOf(h.t) === 15)?.temp;
  rows.push({ date, dMax: Math.max(...temps) - o.max, dMin: Math.min(...temps) - o.min, d9: t9 != null ? t9 - o.t9 : null, d15: t15 != null ? t15 - o.t15 : null, omP: precip, omRain: rainOnly, bomRain: o.rain, gustRatio: o.gust ? (Math.max(...hs.map((h) => h.gust)) * 3.6) / o.gust : null, w15Ratio: o.w15 ? (hs.find((h) => hourOf(h.t) === 15)?.wind * 3.6) / o.w15 : null, minBom: o.min, maxBom: o.max });
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
console.log(`${rows.length} days compared (24 h to 9 am windows)`);
console.log(`temperature bias Open-Meteo − BOM: max ${mean(rows.map((x) => x.dMax)).toFixed(2)} (median ${med(rows.map((x) => x.dMax)).toFixed(2)}), min ${mean(rows.map((x) => x.dMin)).toFixed(2)}, 9am ${mean(rows.filter((x) => x.d9 != null).map((x) => x.d9)).toFixed(2)}, 3pm ${mean(rows.filter((x) => x.d15 != null).map((x) => x.d15)).toFixed(2)} °C`);
console.log(`wind: Open-Meteo gust / BOM gust median ${med(rows.filter((x) => x.gustRatio).map((x) => x.gustRatio)).toFixed(2)}; 3pm speed ratio median ${med(rows.filter((x) => x.w15Ratio).map((x) => x.w15Ratio)).toFixed(2)}`);
const withRain = rows.filter((x) => x.bomRain != null);
console.log(`precip totals: BOM gauge ${withRain.reduce((a, x) => a + x.bomRain, 0).toFixed(0)} mm vs Open-Meteo raw ${withRain.reduce((a, x) => a + x.omP, 0).toFixed(0)} mm (×1.8 = ${(1.8 * withRain.reduce((a, x) => a + x.omP, 0)).toFixed(0)})`);
const warm = withRain.filter((x) => x.minBom > 1); // days entirely above freezing: gauge catches rain well
console.log(`warm days (BOM min > 1 °C, gauge reliable): ${warm.length} days, BOM ${warm.reduce((a, x) => a + x.bomRain, 0).toFixed(0)} mm vs Open-Meteo raw ${warm.reduce((a, x) => a + x.omP, 0).toFixed(0)} mm → ratio ${(warm.reduce((a, x) => a + x.bomRain, 0) / warm.reduce((a, x) => a + x.omP, 0)).toFixed(2)}`);
const cold = withRain.filter((x) => x.maxBom < 0);
console.log(`cold days (BOM max < 0 °C, snow, gauge under-catches): ${cold.length} days, BOM ${cold.reduce((a, x) => a + x.bomRain, 0).toFixed(0)} mm vs Open-Meteo raw ${cold.reduce((a, x) => a + x.omP, 0).toFixed(0)} mm`);
console.log('\nworst temperature days (Open-Meteo max − BOM max):');
for (const x of [...rows].sort((p, q) => Math.abs(q.dMax) - Math.abs(p.dMax)).slice(0, 8)) console.log(` ${x.date} Δmax ${x.dMax.toFixed(1)} Δmin ${x.dMin.toFixed(1)} BOM max ${x.maxBom}`);
console.log('\nbiggest precipitation disagreements (BOM − Open-Meteo raw):');
for (const x of [...withRain].sort((p, q) => Math.abs(q.bomRain - q.omP) - Math.abs(p.bomRain - p.omP)).slice(0, 8)) console.log(` ${x.date} BOM ${x.bomRain} mm, Open-Meteo ${x.omP.toFixed(1)} mm (of which model-rain ${x.omRain.toFixed(1)}), BOM min/max ${x.minBom}/${x.maxBom}`);
