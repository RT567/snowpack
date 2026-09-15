// Compare the model with real SnowPilot pits in Australia: run the raw model at each pit's location
// for its season and look at the snapshot at the pit time. Usage: node scripts/compare-pits.mjs [--all]
import { readFileSync } from 'node:fs';
import { toRecord, archiveUrl } from '../src/weather/openMeteo.js';
import { simulate, depth, rho } from '../src/snow/model.js';
import { hardness, hardnessName } from '../src/snow/grains.js';
import { interfaces } from '../src/snow/mechanics.js';

const all = process.argv.includes('--all');
const pits = JSON.parse(readFileSync('test/fixtures/snowpilot-australia.json')).pits.filter((p) => p.lat && p.lon && p.time && (all || p.lon > 148));
for (const p of pits) {
  const t = new Date(p.time);
  const year = t.getUTCFullYear();
  const site = { name: `pit ${p.nid}`, lat: p.lat, lon: p.lon, elevation: p.elevation ?? (p.lon > 148 ? 1950 : 1750), tz: 'Australia/Sydney' };
  const json = await (await fetch(archiveUrl(site, `${year}-05-01`, `${year}-10-31`))).json();
  const rec = toRecord(json, site);
  const snaps = simulate(rec);
  let i = rec.hours.findIndex((h) => h.t >= t.getTime()); if (i < 0) i = snaps.length - 1;
  const s = snaps[i];
  const H = depth(s) * 100;
  console.log(`\n=== ${p.time} ${p.lat},${p.lon} elev ${site.elevation} m (assumed ${p.elevation == null}) aspect ${p.aspectDeg}° incline ${p.inclineDeg}°  ${p.source}`);
  console.log(`observed HS ${p.HS} cm | model HS ${H.toFixed(0)} cm (raw Open-Meteo ×1.8, no station correction)`);
  console.log('observed layers (top→bottom, depths from top):');
  for (const L of p.layers) console.log(`  ${String(L.top).padStart(5)}–${String(L.bottom).padEnd(5)} ${(L.hardness ?? '').padEnd(3)} ${(L.grainType ?? '').padEnd(6)} ${L.wetness ?? ''} ${L.grainSize ?? ''}`);
  console.log('observed tests:', p.tests.map((x) => x.summary).join(' | '));
  console.log('model layers (top→bottom):');
  let fromTop = 0;
  const ifs = interfaces(s, p.inclineDeg ?? 30);
  for (let k = s.layers.length - 1; k >= 0; k--) {
    const l = s.layers[k]; const cm = l.thick * 100;
    const b = ifs.find((f) => f.index === k);
    console.log(`  ${fromTop.toFixed(0).padStart(5)}–${(fromTop + cm).toFixed(0).padEnd(5)} ${hardnessName(hardness(l)).padEnd(3)} ${l.grain.padEnd(6)} ${l.lwc > 0 ? 'wet' : '   '} ρ${rho(l).toFixed(0)}${b ? `  bond below ${b.strength.toFixed(2)} kPa S ${b.S.toFixed(1)}` : ''}`);
    fromTop += cm;
  }
  const weakest = [...ifs].sort((a, b) => a.S - b.S).slice(0, 3).map((f) => `${((depth(s) - f.z) * 100).toFixed(0)} cm down (S ${f.S.toFixed(1)}, ${f.strength.toFixed(2)} kPa)`);
  console.log('model weakest boundaries from top:', weakest.join(' | '));
}
