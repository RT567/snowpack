// Score the model against the facts extracted from MSC daily reports (public/data/msc-<year>-facts.json).
// For each report day, look at the model at 9 am and compare: new snow in 24 h, surface type, surface
// crust, pack wetness, crust depths, weak-layer depths. Usage: node scripts/compare-msc.mjs [--year=2026] [--raw]
import { readFileSync, existsSync } from 'node:fs';
import { toRecord } from '../src/weather/openMeteo.js';
import { stitch } from '../src/weather/record.js';
import { simulate, depth, rho } from '../src/snow/model.js';
import { DEFAULT_PARAMS, SLOPE_DEG } from '../src/snow/params.js';
import { THREDBO_TOP } from '../src/weather/site.js';
import { correctWithStation } from '../src/weather/stationDaily.js';
import { interfaces, MECH } from '../src/snow/mechanics.js';
import { hardness } from '../src/snow/grains.js';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const year = arg('year', '2026');
const a = toRecord(JSON.parse(readFileSync(`test/fixtures/openmeteo-archive-${year}.json`)), THREDBO_TOP);
const parts = [a];
if (existsSync(`test/fixtures/openmeteo-forecast-${year}-09-15.json`)) parts.push(toRecord(JSON.parse(readFileSync(`test/fixtures/openmeteo-forecast-${year}-09-15.json`)), THREDBO_TOP));
const raw = stitch(parts, Date.UTC(2026, 8, 14, 14));
const useStation = !process.argv.includes('--raw') && existsSync(`public/data/thredbo-top-daily-${year}.json`);
const rec = useStation ? correctWithStation(raw, JSON.parse(readFileSync(`public/data/thredbo-top-daily-${year}.json`)).days) : raw;
const facts = JSON.parse(readFileSync(`public/data/msc-${year}-facts.json`)).days;
const useMsc = process.argv.includes('--msc');
const snaps = simulate(rec, useStation ? { ...DEFAULT_PARAMS, precipFactor: 1 } : DEFAULT_PARAMS, useMsc ? facts : null);
const TZ = 'Australia/Sydney';
const dayOf = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ });
const hourOf = (t) => Number(new Date(t).toLocaleString('en-AU', { timeZone: TZ, hour: '2-digit', hour12: false }).slice(0, 2)) % 24;
const at9 = new Map(); rec.hours.forEach((h, i) => { if (hourOf(h.t) === 9) at9.set(dayOf(h.t), i); });
// observers describe the surface as they found it at first light, before the sun and the 9 am reading
const SURFACE_HOUR = 7;

function modelFacts(i) {
  const s = snaps[i], L = s.layers, H = depth(s);
  const t = rec.hours[i].t;
  const newSnow = L.filter((l) => t - l.born <= 24 * 3600_000 && (l.grain === 'PP' || l.grain === 'DF' || l.grain === 'RG')).reduce((x, l) => x + l.thick, 0) * 100;
  // observers have no 'surface hoar' surface category: a few mm of hoar sits on whatever they would call the surface
  const dawn = snaps[i - (9 - SURFACE_HOUR)].layers;
  const top = dawn.at(-1)?.grain === 'SH' && dawn.at(-1).thick < 0.005 ? dawn.at(-2) : dawn.at(-1);
  const isCrust = (l) => l && (l.grain === 'IF' || l.rime || (l.grain === 'MF' && l.lwc === 0 && rho(l) >= DEFAULT_PARAMS.crustDisplayRho));
  let surface = null;
  if (top) {
    if (top.lwc > 0) surface = 'wet';
    else if (top.rime) surface = 'rime ice';
    else if (isCrust(top)) surface = hardness(top) >= 4 ? 'supportive crust' : 'breakable crust';
    else if (top.grain === 'RG' && top.windPacked) surface = 'wind slab';
    else if (top.grain === 'PP' || top.grain === 'DF') surface = 'new snow';
    else surface = 'old snow';
  }
  // crust within the top 5 cm
  let z = 0, surfaceCrust = false;
  for (let k = L.length - 1; k >= 0 && z < 0.05; k--) { if (isCrust(L[k])) surfaceCrust = true; z += L[k].thick; }
  // wetness by thickness below the top 5 cm
  let wetT = 0, totT = 0; z = 0;
  for (let k = L.length - 1; k >= 0; k--) { z += L[k].thick; if (z < 0.05) continue; totT += L[k].thick; if (L[k].lwc > 0) wetT += L[k].thick; }
  const wetFrac = totT > 0 ? wetT / totT : 0;
  const packState = wetFrac > 0.7 ? 'wet' : wetFrac > 0.3 ? 'moist' : 'dry';
  // crust depths (below surface), weakest boundaries
  const crustDepths = []; z = 0;
  for (let k = L.length - 1; k >= 0; k--) { if (isCrust(L[k])) crustDepths.push(z * 100); z += L[k].thick; }
  const ifs = interfaces(s, SLOPE_DEG);
  // the model's three weakest boundaries by stability index
  const weak = [...ifs].sort((a, b) => a.S - b.S).slice(0, 3).map((f) => ((H - f.z) * 100));
  return { HcM: H * 100, newSnow, surface, surfaceCrust, packState, crustDepths, weak };
}

const detail = process.argv.includes('--detail');
const every = Number(arg('every', 1));
let dayCount = 0;
const rows = []; const agree = { newSnow: [0, 0], surface: [0, 0], surfaceCrust: [0, 0], packState: [0, 0], crustDepth: [0, 0], weakDepth: [0, 0] };
const near = (xs, d, tol) => xs.some((x) => Math.abs(x - d) <= tol);
for (const [date, f] of Object.entries(facts).sort()) {
  const i = at9.get(date); if (i == null) continue;
  if ((dayCount++) % every !== 0) continue;
  const m = modelFacts(i);
  if (detail) {
    const s = snaps[i], L = s.layers;
    console.log(`\n=== ${date} ===`);
    console.log(`MSC: ${f.quote ?? ''}`);
    console.log(`MSC facts: new ${f.newSnowCm24h ?? '-'} cm, storm ${f.stormSnowCm ?? '-'} cm, surface ${f.surface ?? '-'}, crust@surface ${f.surfaceCrust ?? '-'}, crusts at ${JSON.stringify(f.crustDepthsCm ?? [])} cm, weak ${JSON.stringify((f.weakLayers ?? []).map((w) => `${w.kind}@${w.depthCm ?? '?'}`))}, pack ${f.packState ?? '-'}, refreeze ${f.refreezeQuality ?? '-'}, depths ${JSON.stringify(f.depthsCm ?? [])}, rain ${f.rainMentioned}`);
    console.log(`model: HS ${m.HcM.toFixed(0)} cm, new24h ${m.newSnow.toFixed(0)} cm, surface ${m.surface}, crust@surface ${m.surfaceCrust}, crusts at ${JSON.stringify(m.crustDepths.map((x) => +x.toFixed(0)))}, weakest3 at ${JSON.stringify(m.weak.map((x) => +x.toFixed(0)))}, pack ${m.packState}`);
    let z = 0; const lines = [];
    for (let k = L.length - 1; k >= 0 && z < 0.4; k--) { const l = L[k]; lines.push(`${(z * 100).toFixed(0)}–${((z + l.thick) * 100).toFixed(0)} ${l.grain}${l.windPacked ? 'w' : ''}${l.lwc > 0 ? ' wet' : ''} ρ${rho(l).toFixed(0)}`); z += l.thick; }
    console.log(`model top 40 cm: ${lines.join(' | ')}`);
  }
  const out = { date, H: m.HcM.toFixed(0) };
  if (f.newSnowCm24h != null) { agree.newSnow[1]++; const ok = Math.abs(f.newSnowCm24h - m.newSnow) <= Math.max(3, 0.5 * f.newSnowCm24h); if (ok) agree.newSnow[0]++; out.newSnow = `${f.newSnowCm24h} vs ${m.newSnow.toFixed(0)} ${ok ? '✓' : '✗'}`; }
  if (f.surface) { agree.surface[1]++; const crustish = (x) => /crust|rime/.test(x ?? ''); const ok = f.surface === m.surface || (crustish(f.surface) && crustish(m.surface)) || (f.surface === 'mixed'); if (ok) agree.surface[0]++; out.surface = `${f.surface} vs ${m.surface} ${ok ? '✓' : '✗'}`; }
  if (f.surfaceCrust != null) { agree.surfaceCrust[1]++; const ok = f.surfaceCrust === m.surfaceCrust; if (ok) agree.surfaceCrust[0]++; out.surfaceCrust = `${f.surfaceCrust} vs ${m.surfaceCrust} ${ok ? '✓' : '✗'}`; }
  if (f.packState) { agree.packState[1]++; const obs = f.packState === 'isothermal' ? 'wet' : f.packState; const ok = obs === m.packState || obs === 'mixed' || (obs === 'moist' && m.packState !== 'dry') || (m.packState === 'moist' && obs !== 'dry'); if (ok) agree.packState[0]++; out.pack = `${f.packState} vs ${m.packState} ${ok ? '✓' : '✗'}`; }
  for (const d of f.crustDepthsCm ?? []) { agree.crustDepth[1]++; const ok = near(m.crustDepths, d, 8); if (ok) agree.crustDepth[0]++; out.crust = `${(out.crust ?? '')}${d}cm${ok ? '✓' : '✗'} `; }
  for (const w of f.weakLayers ?? []) if (w.depthCm != null) { agree.weakDepth[1]++; const ok = near(m.weak, w.depthCm, 10); if (ok) agree.weakDepth[0]++; out.weak = `${(out.weak ?? '')}${w.kind}@${w.depthCm}${ok ? '✓' : '✗'} `; }
  rows.push(out);
}
for (const r of rows) console.log(Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(' | '));
console.log(`\nagreement (${useStation ? 'station-corrected' : 'raw'}${useMsc ? ' + MSC nudges' : ''} model), MSC ${year}:`);
for (const [k, [ok, n]] of Object.entries(agree)) if (n) console.log(`  ${k.padEnd(13)} ${ok}/${n}  ${(100 * ok / n).toFixed(0)}%`);
