// Snowy Hydro snow-course readings (Spencers Creek 1830 m, Deep Creek, Three Mile Dam) from the
// chart endpoint behind their snow-depths page. Ground truth for calibrating modelled depth.
export const SNOWY_HYDRO_URL = (yearA, yearB) => `https://www.snowyhydro.com.au/wp-content/themes/snowyhydro/inc/getData.php?yearA=${yearA}&yearB=${yearB}`;

/** Parse the getData.php JSON into { year: [{ date: 'YYYY-MM-DD', site, cm }] }. */
export function parseSnowyHydro(json) {
  const out = {};
  for (const [year, v] of Object.entries(json)) {
    const rows = [];
    for (const day of v?.snowyhydro?.level ?? []) {
      const snow = day.snow == null ? [] : Array.isArray(day.snow) ? day.snow : [day.snow];
      for (const s of snow) rows.push({ date: day['-date'], site: s['-name'], cm: Number(s['#text']) });
    }
    out[year] = rows;
  }
  return out;
}

export function spencersCreek(parsed, year) {
  return (parsed[year] ?? []).filter((r) => r.site === 'Spencers Creek');
}
