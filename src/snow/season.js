// Season bounds and the time axis the time bar exposes.
import { depth } from './model.js';

/** Australian snow seasons: 1 May to 31 October, local dates in Australia/Sydney. */
export function seasonDates(year, now = new Date()) {
  const start = `${year}-05-01`;
  const endFull = `${year}-10-31`;
  const today = localDate(now, 'Australia/Sydney');
  return { year, start, end: endFull < today ? endFull : today, current: endFull >= today };
}

/** YYYY-MM-DD of an instant in a time zone. */
export function localDate(d, tz) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

/** The season year an instant belongs to (a January date belongs to no season; we return that calendar year). */
export function seasonYearOf(now = new Date()) {
  return Number(localDate(now, 'Australia/Sydney').slice(0, 4));
}

/** Index of the first snapshot with a real snow cover, or -1. */
export function firstSnowIndex(snapshots, minDepth = 0.02) {
  for (let i = 0; i < snapshots.length; i++) if (depth(snapshots[i]) >= minDepth) return i;
  return -1;
}

/** Seasons selectable in the picker: the archive is reliable from 1940, we offer 1990 onward. */
export function availableSeasons(now = new Date()) {
  const y = seasonYearOf(now);
  const out = [];
  for (let k = y; k >= 1990; k--) out.push(k);
  return out;
}
