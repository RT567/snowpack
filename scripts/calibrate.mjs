// Compare modelled depth at Thredbo Top with Snowy Hydro Spencers Creek readings for a season,
// across precipitation factors. Usage: node scripts/calibrate.mjs --year=2026 [--factors=1.6,1.8,2.0]
import { readFileSync, existsSync } from 'node:fs';
import { toRecord, archiveUrl } from '../src/weather/openMeteo.js';
import { stitch } from '../src/weather/record.js';
import { simulate, depth } from '../src/snow/model.js';
import { DEFAULT_PARAMS } from '../src/snow/params.js';
import { THREDBO_TOP } from '../src/weather/site.js';
import { parseSnowyHydro, spencersCreek } from '../src/weather/snowyHydro.js';
import { correctWithStation, STATION_CORRECTION } from '../src/weather/stationDaily.js';
const station = process.argv.includes('--station');
const snowfArg = process.argv.find((a) => a.startsWith('--snowf='));
const windArg = process.argv.find((a) => a.startsWith('--wind='));

const year = (process.argv.find((a) => a.startsWith('--year=')) ?? '--year=2026').split('=')[1];
const factors = ((process.argv.find((a) => a.startsWith('--factors=')) ?? '--factors=1.6,1.8,1.9,2.0,2.2').split('=')[1]).split(',').map(Number);

let rec;
if (year === '2026') {
  const a = toRecord(JSON.parse(readFileSync('test/fixtures/openmeteo-archive-2026.json')), THREDBO_TOP);
  const r = toRecord(JSON.parse(readFileSync('test/fixtures/openmeteo-forecast-2026-09-15.json')), THREDBO_TOP);
  rec = stitch([a, r], Date.UTC(2026, 8, 14, 14));
} else {
  rec = toRecord(await (await fetch(archiveUrl(THREDBO_TOP, `${year}-05-01`, `${year}-10-31`))).json(), THREDBO_TOP);
}
if (station && existsSync(`public/data/thredbo-top-daily-${year}.json`)) {
  const daily = JSON.parse(readFileSync(`public/data/thredbo-top-daily-${year}.json`)).days;
  const c = { ...STATION_CORRECTION, ...(snowfArg ? { snowPrecipFactor: Number(snowfArg.split('=')[1]) } : {}), ...(windArg ? { windFactor: Number(windArg.split('=')[1]) } : {}) };
  rec = correctWithStation(rec, daily, c);
  console.log(`station-corrected ${rec.correctedWindows} days (snow factor ${c.snowPrecipFactor}, wind ×${c.windFactor})`);
}
// daily sensor series, if digitised (public/data/spencers-sensor-<year>.json)
const sensorFile = `public/data/spencers-sensor-${year}.json`;
const sensor = existsSync(sensorFile) ? JSON.parse(readFileSync(sensorFile)).days : null;
const readings = [];
for (const f of ['test/fixtures/snowyhydro-2026-2025.json', 'test/fixtures/snowyhydro-2024-2022.json']) {
  if (existsSync(f)) readings.push(...spencersCreek(parseSnowyHydro(JSON.parse(readFileSync(f))), year));
}
if (!readings.length) { console.error(`no Spencers Creek readings for ${year} in fixtures`); process.exit(1); }

const dayOf = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
const at9 = new Map(); // date → snapshot index at ~9 am local
rec.hours.forEach((h, i) => { const d = new Date(h.t); if (d.getUTCHours() === 23) at9.set(dayOf(h.t + 3600_000 * 10), i); });

console.log(`Spencers Creek ${year}: ${readings.length} readings. Modelled depth (cm) at Thredbo Top by precipFactor:`);
const header = ['date      ', 'obs'.padStart(5), ...factors.map((f) => `f${f}`.padStart(6))];
console.log(header.join(' '));
const rows = readings.map((r) => ({ ...r, cols: [] }));
const errs = factors.map(() => []);
factors.forEach((f, k) => {
  const snaps = simulate(rec, { ...DEFAULT_PARAMS, precipFactor: f });
  for (const r of rows) {
    const i = at9.get(r.date);
    const cm = i != null ? depth(snaps[i]) * 100 : NaN;
    r.cols.push(cm);
    if (!Number.isNaN(cm)) errs[k].push(cm - r.cm);
  }
});
for (const r of rows) console.log([r.date, r.cm.toFixed(0).padStart(5), ...r.cols.map((c) => (Number.isNaN(c) ? '   n/a' : c.toFixed(0).padStart(6)))].join(' '));
console.log(['bias      ', '     ', ...errs.map((e) => (e.reduce((a, b) => a + b, 0) / e.length).toFixed(0).padStart(6))].join(' '));
console.log(['rmse      ', '     ', ...errs.map((e) => Math.sqrt(e.reduce((a, b) => a + b * b, 0) / e.length).toFixed(0).padStart(6))].join(' '));
if (sensor) {
  const dates = Object.keys(sensor).filter((d) => at9.has(d));
  const sErr = factors.map((f) => { const snaps = simulate(rec, { ...DEFAULT_PARAMS, precipFactor: f }); return dates.map((d) => depth(snaps[at9.get(d)]) * 100 - sensor[d]); });
  console.log(`\ndaily sensor (${dates.length} days, Spencers Research 11:00):`);
  console.log(['bias      ', '     ', ...sErr.map((e) => (e.reduce((a, b) => a + b, 0) / e.length).toFixed(0).padStart(6))].join(' '));
  console.log(['rmse      ', '     ', ...sErr.map((e) => Math.sqrt(e.reduce((a, b) => a + b * b, 0) / e.length).toFixed(0).padStart(6))].join(' '));
  const worst = sErr[0].map((e, i) => [Math.abs(e), dates[i], e]).sort((a, b) => b[0] - a[0]).slice(0, 6).map(([, d, e]) => `${d} ${e > 0 ? '+' : ''}${e.toFixed(0)}`);
  console.log('worst days (first factor):', worst.join(', '));
}
