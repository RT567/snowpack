// Mark up the Mountain Safety Collective's daily report text so phrases point at ONE thing in the
// modelled snow column. The model is run first with the report facts assimilated (as the app does);
// then Claude (the owner's `claude -p` login, no API key) reads each report together with the model's
// column for that morning and says which modelled layer or boundary each phrase refers to. The app
// resolves chips by layer id, so this must be re-run whenever the model or its inputs change.
// Usage: node scripts/chip-msc.mjs --year=2026 [--batch=3] [--limit=N] [--redo=YYYY-MM-DD,...] [--dates=YYYY-MM-DD,...] [--dry] [--stamp]
// Writes public/data/msc-<year>-chips.json: { days: { date: { ids, chips: [ { text, layer?: id, boundaryBelow?: id } ] } } }
// where `ids` stamps the model's layer ids at the report hour; the app ignores a day's chips when its own
// run has different ids there (model changed, chips not re-made). `--stamp` re-stamps without asking Claude.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { toRecord } from '../src/weather/openMeteo.js';
import { stitch } from '../src/weather/record.js';
import { simulate, depth, rho } from '../src/snow/model.js';
import { DEFAULT_PARAMS, SLOPE_DEG, ASSIMILATION } from '../src/snow/params.js';
import { THREDBO_TOP } from '../src/weather/site.js';
import { correctWithStation } from '../src/weather/stationDaily.js';
import { interfaces } from '../src/snow/mechanics.js';
import { snowName, condition, stabilityWord } from '../src/scene/column.js';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=').slice(1).join('=');
const year = arg('year', '2026'), batch = Number(arg('batch', 3)), limit = Number(arg('limit', 1000));
const redo = arg('redo', '').split(',').filter(Boolean);
const only = arg('dates', '').split(',').filter(Boolean); // restrict to these days
const dry = process.argv.includes('--dry');
const stampOnly = process.argv.includes('--stamp'); // just (re)write each day's layer-id stamp from the current model
const MODEL = 'claude-sonnet-5';
const TZ = 'Australia/Sydney';

// the same record and run the app makes for this season
const a = toRecord(JSON.parse(readFileSync(`test/fixtures/openmeteo-archive-${year}.json`)), THREDBO_TOP);
const parts = [a];
if (existsSync(`test/fixtures/openmeteo-forecast-${year}-09-15.json`)) parts.push(toRecord(JSON.parse(readFileSync(`test/fixtures/openmeteo-forecast-${year}-09-15.json`)), THREDBO_TOP));
const raw = stitch(parts, Date.UTC(2026, 8, 14, 14));
const rec = correctWithStation(raw, JSON.parse(readFileSync(`public/data/thredbo-top-daily-${year}.json`)).days);
const facts = JSON.parse(readFileSync(`public/data/msc-${year}-facts.json`)).days;
const snaps = simulate(rec, { ...DEFAULT_PARAMS, precipFactor: 1 }, facts);
const dayOf = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ });
const hourOf = (t) => Number(new Date(t).toLocaleString('en-AU', { timeZone: TZ, hour: '2-digit', hour12: false }).slice(0, 2)) % 24;
const atReport = new Map(); rec.hours.forEach((h, i) => { if (hourOf(h.t) === ASSIMILATION.reportHour) atReport.set(dayOf(h.t), i); });

const reports = JSON.parse(readFileSync(`public/data/msc-${year}.json`)).days;
const mainOf = (d) => reports[d].find((x) => /main/i.test(x.region)) ?? reports[d][0];
const outPath = `public/data/msc-${year}-chips.json`;
const out = existsSync(outPath) ? JSON.parse(readFileSync(outPath)) : { source: `Claude (${MODEL}) mark-up of MSC daily reports against the model column; see scripts/chip-msc.mjs`, days: {} };
for (const d of redo) delete out.days[d];
const stampOf = (i) => snaps[i].layers.map((l) => l.id).join(',');
if (stampOnly) {
  let stale = 0;
  for (const d of Object.keys(out.days)) {
    if (!atReport.has(d)) continue;
    const day = Array.isArray(out.days[d]) ? { chips: out.days[d] } : out.days[d];
    const ids = new Set(snaps[atReport.get(d)].layers.map((l) => l.id));
    const missing = day.chips.filter((c) => !ids.has(c.layer ?? c.boundaryBelow));
    if (missing.length) { stale++; console.error(`${d}: ${missing.length} chip(s) name layers the current model does not have at ${ASSIMILATION.reportHour}:00; re-run with --redo=${d}`); }
    out.days[d] = { ids: stampOf(atReport.get(d)), chips: day.chips };
  }
  writeFileSync(outPath, JSON.stringify(out));
  console.log(`stamped ${Object.keys(out.days).length} days${stale ? `, ${stale} stale` : ''} → ${outPath}`);
  process.exit(stale ? 1 : 0);
}

/** The model's column on a report morning, top first, as a table the reader can point into. */
function columnText(i) {
  const s = snaps[i], L = s.layers, t = rec.hours[i].t;
  if (!L.length) return '  (no snow)';
  const faces = new Map(interfaces(s, SLOPE_DEG).map((f) => [f.index, f]));
  const lines = []; let z = 0;
  for (let k = L.length - 1; k >= 0; k--) {
    const l = L[k]; const from = z, to = z + l.thick * 100; z = to;
    const age = Math.round((t - l.born) / 86400_000);
    const flags = [condition(l), l.windPacked && l.grain !== 'MF' ? 'wind-packed' : null, l.observed ? 'from observers' : null].filter(Boolean).join(', ');
    lines.push(`  L${l.id}  ${from.toFixed(0)}–${to.toFixed(0)} cm  ${snowName(l)} (${l.grain}), ${(l.thick * 100).toFixed(l.thick < 0.01 ? 1 : 0)} cm thick, ${rho(l).toFixed(0)} kg/m³, ${flags}, ${age === 0 ? 'fell today' : `${age} day${age === 1 ? '' : 's'} old`}`);
    const f = faces.get(k);
    if (k > 0 && f) lines.push(`    boundary under L${l.id}: ${stabilityWord(f.S)} (S ${Number.isFinite(f.S) ? f.S.toFixed(1) : '∞'}), bond ${f.strength.toFixed(2)} kPa`);
  }
  return lines.join('\n');
}

const SCHEMA = `Output ONLY a JSON object mapping each report date to an array of chips, no prose, no code fences:
{ "YYYY-MM-DD": [ { "text": string, "layer": number } | { "text": string, "boundaryBelow": number } ] }

"text": an EXACT substring of that report's SNOWPACK text (copy characters verbatim, 1–6 words, keep capitalisation and punctuation inside it; no trailing full stop). Chips must not overlap.
"layer": the id (the number after L) of the ONE modelled layer the phrase refers to.
"boundaryBelow": for phrases about how snow is bonded to what lies beneath ("may not be bonding well", "rests on an icy surface", "poor bond", "interface"): the id of the layer whose underside is that boundary.

Read each report with its MODEL COLUMN and match phrases to the column: a "crust" the storm snow overlies is the first crust BELOW the storm snow layers, not a refrozen skin above them; "surface" words point at the top layer; "new snow"/"storm snow" point at the main (thickest) layer of the most recent storm; a quoted depth ("35 cm deep") points at the layer that lies at that depth. Only chip phrases about the alpine / Main Range snowpack (the station is at 1950 m). Do NOT chip: the pack as a whole (isothermal, consolidated, settled, shallow cover, total depths, coverage), the subalpine or lower elevations or resorts, weather, forecasts ("will", "expected"), danger ratings, aspects, terrain. If a phrase refers to several distinct things ("older crusts deeper in the pack") or the model column has nothing that corresponds (the report says facets but no layer is faceted), give it no chip.`;

const wanted = Object.keys(reports).sort().filter((d) => !out.days[d] && atReport.has(d) && (!only.length || only.includes(d))).slice(0, limit);
console.log(`${wanted.length} days to mark up (${Object.keys(out.days).length} already done)`);
for (let i = 0; i < wanted.length; i += batch) {
  const dates = wanted.slice(i, i + batch);
  const items = dates.map((d) => {
    const r = mainOf(d);
    return `### ${d} (${r.region})\nSNOWPACK: ${r.snowpack || ''}\nWEATHER (context only, never chip it): ${r.weather}\nMODEL COLUMN at ${ASSIMILATION.reportHour}:00 (depth below the surface → layer; total ${(depth(snaps[atReport.get(d)]) * 100).toFixed(0)} cm):\n${columnText(atReport.get(d))}`;
  });
  const prompt = `You annotate Australian backcountry avalanche reports (Kosciuszko Main Range) so a snowpack simulation can link words in the text to its own modelled snow layers at Thredbo Top Station.\n\n${SCHEMA}\n\n${items.join('\n\n')}`;
  if (dry) { console.log(prompt); break; }
  const r = spawnSync('claude', ['-p', '--model', MODEL, '--output-format', 'text', '--mcp-config', '{"mcpServers":{}}', '--strict-mcp-config'], { input: prompt, encoding: 'utf8', timeout: 300_000, env: { ...process.env, CLAUDECODE: undefined } });
  const m = (r.stdout ?? '').match(/\{[\s\S]*\}/);
  if (!m) { console.error(`batch ${dates[0]}: no JSON (${(r.stderr ?? '').slice(0, 200)})`); continue; }
  let obj; try { obj = JSON.parse(m[0]); } catch (e) { console.error(`batch ${dates[0]}: bad JSON ${e.message}`); continue; }
  for (const d of dates) {
    const chips = Array.isArray(obj[d]) ? obj[d] : [];
    const text = mainOf(d).snowpack ?? '';
    const ids = new Set(snaps[atReport.get(d)].layers.map((l) => l.id));
    const ok = (c) => c && typeof c.text === 'string' && c.text.length > 0 && text.includes(c.text) && ((typeof c.layer === 'number' && ids.has(c.layer)) || (typeof c.boundaryBelow === 'number' && ids.has(c.boundaryBelow)));
    const kept = chips.filter(ok);
    if (kept.length !== chips.length) console.error(`${d}: dropped ${chips.length - kept.length} chip(s): ${chips.filter((c) => !ok(c)).map((c) => JSON.stringify(c)).join(', ')}`);
    out.days[d] = { ids: stampOf(atReport.get(d)), chips: kept.map((c) => (typeof c.layer === 'number' ? { text: c.text, layer: c.layer } : { text: c.text, boundaryBelow: c.boundaryBelow })) };
  }
  writeFileSync(outPath, JSON.stringify(out));
  process.stdout.write(`${dates[0]}..${dates.at(-1)} ✓ (${dates.reduce((n, d) => n + out.days[d].chips.length, 0)} chips)\n`);
}
console.log(`done: ${Object.keys(out.days).length} days → ${outPath}`);
