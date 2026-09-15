// Snapshot the Mountain Safety Collective's daily backcountry reports for a season into public/data,
// so the page can show what human observers said about the snowpack on each day.
// Usage: node scripts/fetch-msc.mjs --year=2026 [--from=06-01 --to=09-15]
import { writeFileSync } from 'node:fs';
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1];
const year = arg('year', '2026'), from = arg('from', '06-01'), to = arg('to', '09-15');
const strip = (h) => (h ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const out = { source: 'https://api.mountainsafetycollective.org/embedd/get_view_data_by_date (POST {date})', fetched: new Date().toISOString().slice(0, 10), days: {} };
let d = new Date(`${year}-${from}T00:00:00Z`);
const end = new Date(`${year}-${to}T00:00:00Z`);
while (d <= end) {
  const date = d.toISOString().slice(0, 10);
  try {
    const res = await fetch('https://api.mountainsafetycollective.org/embedd/get_view_data_by_date', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date }) });
    const j = await res.json();
    const reports = [];
    for (const e of j.reports ?? []) {
      const r = e.report;
      if (!r || r.date !== date || r.status !== 'Published') continue;
      const danger = (e.alpine_hazards ?? []).find((h) => h.category === 'Avalanche danger');
      const problems = (e.categorisation ?? []).filter((c) => c.hazard).map((c) => ({ type: c.type, hazard: c.hazard, characteristic: c.characteristic, elevation: c.elevation, aspect: c.aspect, size: c.avalanche_size, likelihood: c.likelihood, summary: strip(c.summary) }));
      reports.push({ region: r.region, snowpack: strip(r.snowpack_summary), weather: strip(r.weather_summary), hazard: strip(r.hazard_summary), outlook: strip(r.regional_outlook), confidence: r.forecast_confidence, danger: danger ? { name: danger.name, rating: danger.rating } : null, problems });
    }
    if (reports.length) out.days[date] = reports;
    process.stdout.write(reports.length ? '#' : '.');
  } catch (e) { process.stdout.write('x'); }
  await new Promise((r) => setTimeout(r, 250));
  d = new Date(d.getTime() + 86_400_000);
}
writeFileSync(`public/data/msc-${year}.json`, JSON.stringify(out));
console.log(`\n${Object.keys(out.days).length} days with published reports → public/data/msc-${year}.json`);
