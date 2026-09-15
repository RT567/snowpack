// Dev tool: run the 2026 fixtures through the model and print the season.
import { readFileSync } from 'node:fs';
import { toRecord } from '../src/weather/openMeteo.js';
import { stitch } from '../src/weather/record.js';
import { simulate, depth, rho } from '../src/snow/model.js';
import { hardness, hardnessName } from '../src/snow/grains.js';
import { interfaces } from '../src/snow/mechanics.js';
import { THREDBO_TOP } from '../src/weather/site.js';

const a = toRecord(JSON.parse(readFileSync('test/fixtures/openmeteo-archive-2026.json')), THREDBO_TOP);
const r = toRecord(JSON.parse(readFileSync('test/fixtures/openmeteo-forecast-2026-09-15.json')), THREDBO_TOP);
const rec = stitch([a, r], Date.UTC(2026, 8, 14, 14)); // up to 15 Sep 00:00 AEST
const snaps = simulate(rec);
const fmt = (t) => new Date(t).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', day: '2-digit', month: 'short' });
let peak = { d: 0, i: 0 };
console.log('date   depth_cm  layers  swe_mm');
for (let i = 0; i < snaps.length; i++) {
  const d = depth(snaps[i]);
  if (d > peak.d) peak = { d, i };
  const dt = new Date(snaps[i].t);
  if (dt.getUTCHours() === 23 && dt.getUTCDate() % 4 === 0) {
    const swe = snaps[i].layers.reduce((s, l) => s + l.swe + l.lwc, 0);
    console.log(fmt(snaps[i].t).padEnd(7), (d * 100).toFixed(0).padStart(6), String(snaps[i].layers.length).padStart(7), swe.toFixed(0).padStart(7));
  }
}
console.log(`peak ${(peak.d * 100).toFixed(0)} cm on ${fmt(snaps[peak.i].t)}; total snowfall ${snaps.at(-1).snowfall.toFixed(0)} mm, rain ${snaps.at(-1).rain.toFixed(0)} mm`);
const show = process.argv[2] ? snaps[Number(process.argv[2])] : snaps[peak.i];
console.log(`\nprofile at ${fmt(show.t)} (top first)`);
const ifs = interfaces(show);
for (let i = show.layers.length - 1; i >= 0; i--) {
  const l = show.layers[i];
  const f = ifs.find((x) => x.index === i);
  console.log(`${(l.thick * 100).toFixed(1).padStart(5)} cm  ${l.grain}  rho ${rho(l).toFixed(0).padStart(3)}  ${hardnessName(hardness(l)).padEnd(2)}  T ${l.temp.toFixed(1).padStart(5)}  lwc ${l.lwc.toFixed(1)}  born ${fmt(l.born)}  wet×${l.wetCount} facetH ${l.facetHours.toFixed(0)}${l.windPacked ? ' wind' : ''}${l.storm.rain ? ` rain ${l.storm.rain.toFixed(0)}mm` : ''}` + (f ? `   | bond below ${f.strength.toFixed(2)} kPa` : ''));
}
