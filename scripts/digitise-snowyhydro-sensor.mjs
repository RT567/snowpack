// Digitise Snowy Hydro's daily snow-depth sensor chart (HYPLOT PDF, station 00003 "Spencers (Research)")
// into a daily series. The PDF is vector: the series is a polyline whose vertices sit on daily x positions;
// collinear days are dropped by the plotter, so we interpolate between vertices.
// Usage: pdftocairo -svg 00003SD.pdf out.svg && node scripts/digitise-snowyhydro-sensor.mjs out.svg 2026 > public/data/spencers-sensor-2026.json
import { readFileSync } from 'node:fs';
const [svgPath, yearArg] = process.argv.slice(2);
const year = Number(yearArg);
const svg = readFileSync(svgPath, 'utf8');
const paths = [...svg.matchAll(/<path([^>]*)d="([^"]+)"/g)].map((m) => ({ attrs: m[1], pts: [...m[2].matchAll(/[ML]\s*(-?[\d.]+)\s+(-?[\d.]+)/g)].map((p) => [Number(p[1]), Number(p[2])]) }));
// axes: long horizontal lines are the 50 cm gridlines (bottom = 0), long vertical lines are month starts
const hLines = [...new Set(paths.filter((p) => p.pts.length === 2 && Math.abs(p.pts[0][1] - p.pts[1][1]) < 0.01 && Math.abs(p.pts[0][0] - p.pts[1][0]) > 300).map((p) => +p.pts[0][1].toFixed(1)))].sort((a, b) => a - b);
const vLines = [...new Set(paths.filter((p) => p.pts.length === 2 && Math.abs(p.pts[0][0] - p.pts[1][0]) < 0.01 && Math.abs(p.pts[0][1] - p.pts[1][1]) > 150).map((p) => +p.pts[0][0].toFixed(1)))].sort((a, b) => a - b);
const yZero = hLines[hLines.length - 1], pxPer50 = (hLines[hLines.length - 1] - hLines[0]) / (hLines.length - 1);
const cmOf = (y) => ((yZero - y) / pxPer50) * 50;
// months: the chart runs 1 May → 1 Dec; the first vertical line is 1 May
const monthStarts = [4, 5, 6, 7, 8, 9, 10, 11].map((m) => Date.UTC(year, m, 1));
const xOfDay = (t) => { for (let k = 0; k < vLines.length - 1; k++) { const a = monthStarts[k], b = monthStarts[k + 1]; if (t >= a && t <= b) return vLines[k] + ((vLines[k + 1] - vLines[k]) * (t - a)) / (b - a); } return null; };
// the series: the stroked blue polyline with the most vertices in the un-transformed coordinate system
const series = paths.filter((p) => /stroke="rgb\(0%, 0%, 100%\)"/.test(p.attrs) && p.pts.length > 20).sort((a, b) => b.pts.length - a.pts.length)[0];
const verts = series.pts;
const out = {};
let cursor = Date.UTC(year, 4, 1);
const lastX = verts[verts.length - 1][0];
for (let t = cursor; ; t += 86_400_000) {
  const x = xOfDay(t);
  if (x == null || x > lastX + 0.5) break;
  // interpolate y along the polyline at x
  let y = null;
  for (let k = 0; k < verts.length - 1; k++) {
    const [x0, y0] = verts[k], [x1, y1] = verts[k + 1];
    if (x >= x0 - 0.01 && x <= x1 + 0.01 && x1 > x0) { y = y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); break; }
  }
  if (y == null) continue;
  out[new Date(t).toISOString().slice(0, 10)] = Math.max(0, Math.round(cmOf(y) * 10) / 10);
}
console.log(JSON.stringify({ source: 'https://www.snowyhydro.com.au/wp-content/uploads/pdfs/watrel/00003SD.pdf (HYPLOT chart, digitised from vector paths)', station: '00003 Spencers (Research), daily 11:00 snow depth sensor, near the Spencers Creek snow course ~1830 m', note: 'experimental site; gaps possible; digitised to ~0.5 cm', digitised: new Date().toISOString().slice(0, 10), days: out }));
