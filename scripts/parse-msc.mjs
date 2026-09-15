// Turn the Mountain Safety Collective's daily report text into structured snowpack facts with Claude
// (the owner's `claude -p` login, no API key; same approach as the FBi autotracklist project).
// Usage: node scripts/parse-msc.mjs --year=2026 [--region="Main range"] [--batch=4] [--limit=N]
// Writes public/data/msc-<year>-facts.json: { date: { ...facts } }. Re-running only parses missing days.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const year = arg('year', '2026'), region = arg('region', 'Main range'), batch = Number(arg('batch', 4)), limit = Number(arg('limit', 1000));
const MODEL = 'claude-sonnet-5';

const reports = JSON.parse(readFileSync(`public/data/msc-${year}.json`)).days;
const outPath = `public/data/msc-${year}-facts.json`;
const facts = existsSync(outPath) ? JSON.parse(readFileSync(outPath)) : { source: `Claude (${MODEL}) extraction from MSC daily reports; see scripts/parse-msc.mjs`, days: {} };

const SCHEMA = `For each report return one object with exactly these keys (use null when the text does not say):
{
  "date": "YYYY-MM-DD",
  "newSnowCm24h": number|null,          // new snow reported in the last 24 h, cm (0 if it says none)
  "stormSnowCm": number|null,           // total recent storm snow sitting on the old surface, cm
  "surface": "new snow"|"wind slab"|"breakable crust"|"supportive crust"|"rime ice"|"wet"|"mixed"|null,
  "surfaceCrust": boolean|null,         // is there a melt-freeze/rain crust at or just under the surface
  "crustDepthsCm": number[],            // depths below the surface of any crusts mentioned, cm
  "weakLayers": [ { "kind": "surface hoar"|"facets"|"graupel"|"new snow interface"|"crust interface"|"wet layer"|"other", "depthCm": number|null, "aspects": string|null } ],
  "packState": "dry"|"moist"|"wet"|"isothermal"|"mixed"|null,   // the bulk of the pack below the surface
  "refreezeQuality": "good"|"poor"|"none"|null,                 // overnight refreeze if mentioned
  "windLoadedAspects": string|null,     // e.g. "SE", "E to SE"
  "depthsCm": number[],                 // any total snow depths quoted, cm
  "rainMentioned": boolean,
  "avalancheActivity": string|null,     // observed avalanches/whumpfs/cracking, brief
  "quote": string                       // the single most informative sentence, verbatim
}`;

const wanted = Object.keys(reports).sort().filter((d) => !facts.days[d]).slice(0, limit);
console.log(`${wanted.length} days to parse for ${region} (${Object.keys(facts.days).length} already done)`);
for (let i = 0; i < wanted.length; i += batch) {
  const dates = wanted.slice(i, i + batch);
  const items = dates.map((d) => {
    const r = reports[d].find((x) => x.region.toLowerCase() === region.toLowerCase()) ?? reports[d][0];
    return `### ${d} (${r.region})\nSNOWPACK: ${r.snowpack}\nWEATHER: ${r.weather}\nHAZARD: ${r.hazard}\nPROBLEMS: ${r.problems.map((p) => `${p.type}: ${p.hazard}${p.elevation ? ` (${p.elevation}` : ''}${p.aspect ? `, ${p.aspect})` : p.elevation ? ')' : ''}${p.summary ? ` — ${p.summary}` : ''}`).join(' | ')}`;
  });
  const prompt = `You extract snowpack observations from Australian backcountry avalanche reports (Kosciuszko Main Range, ~1900 m). Read the reports below and output ONLY a JSON array with one object per report, in order, no prose, no code fences.\n\n${SCHEMA}\n\nRules: only state what has been OBSERVED about the snowpack. Sentences predicting future weather or its effects ("will", "expect", "forecast", "tomorrow", "overnight rain will have…") are forecasts: ignore them for every field, including rainMentioned and packState. Assessments of how the present snowpack behaves ("may not be bonding well", "rests on an icy surface", "increasing the potential for slab instability") ARE observations: record them as weakLayers (kind "crust interface" or "new snow interface") even without a depth. Wind slabs forming from wind-transported snow are an observation: set surface "wind slab" and windLoadedAspects. Do not infer from the weather forecast; depths are below the snow surface; convert "a dusting" to 1, "a few cm" to 3, "5-10cm" to 7.5; if a crust is described as "non-breakable"/"supportive" use "supportive crust", "breakable" → "breakable crust".\n\n${items.join('\n\n')}`;
  const r = spawnSync('claude', ['-p', '--model', MODEL, '--output-format', 'text', '--mcp-config', '{"mcpServers":{}}', '--strict-mcp-config'], { input: prompt, encoding: 'utf8', timeout: 300_000, env: { ...process.env, CLAUDECODE: undefined } });
  const m = (r.stdout ?? '').match(/\[[\s\S]*\]/);
  if (!m) { console.error(`batch ${dates[0]}: no JSON (${(r.stderr ?? '').slice(0, 200)})`); continue; }
  let arr;
  try { arr = JSON.parse(m[0]); } catch (e) { console.error(`batch ${dates[0]}: bad JSON ${e.message}`); continue; }
  for (const f of arr) if (f?.date && dates.includes(f.date)) facts.days[f.date] = f;
  writeFileSync(outPath, JSON.stringify(facts));
  process.stdout.write(`${dates[0]}..${dates.at(-1)} ✓ (${arr.length})\n`);
}
console.log(`done: ${Object.keys(facts.days).length} days → ${outPath}`);
