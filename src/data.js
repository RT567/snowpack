// Load a season's weather record for the site: archive (cached, immutable) plus the recent past.
import { fetchArchive, fetchRecent } from './weather/openMeteo.js';
import { stitch } from './weather/record.js';
import { seasonDates, localDate } from './snow/season.js';
import { correctWithStation } from './weather/stationDaily.js';

const CACHE_PREFIX = 'snowpack:archive:';
const MAX_CACHED = 6;

function daysAgo(n, now) {
  return localDate(new Date(now.getTime() - n * 86_400_000), 'Australia/Sydney');
}

function readCache(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch { return null; }
}

function writeCache(key, value) {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX)).sort();
    while (keys.length >= MAX_CACHED) localStorage.removeItem(keys.shift());
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage full or unavailable: fine, we just refetch next time */ }
}

/** Compact a record for storage (columns instead of objects). */
function pack(rec) {
  const cols = {};
  for (const f of ['t', 'temp', 'rh', 'dew', 'precip', 'wind', 'gust', 'dir', 'sw', 'cloud']) cols[f] = rec.hours.map((h) => h[f]);
  return cols;
}
function unpack(cols, site) {
  const n = cols.t.length, hours = new Array(n);
  for (let i = 0; i < n; i++) {
    hours[i] = { t: cols.t[i], temp: cols.temp[i], rh: cols.rh[i], dew: cols.dew[i], precip: cols.precip[i], wind: cols.wind[i], gust: cols.gust[i], dir: cols.dir[i], sw: cols.sw[i], cloud: cols.cloud[i] };
  }
  return { site, hours };
}

/**
 * The weather record for a season year, ending now (or at the season end for past years).
 * Archive data older than a week is treated as immutable and cached in localStorage.
 */
export async function loadSeason(site, year, now = new Date()) {
  const { start, end, current } = seasonDates(year, now);
  const archiveEnd = current ? daysAgo(2, now) : end;
  const immutable = archiveEnd < daysAgo(7, now);
  const key = `${CACHE_PREFIX}${site.name}:${start}:${archiveEnd}`;
  const cached = immutable ? readCache(key) : null;
  const parts = [];
  if (cached) parts.push(unpack(cached, site));
  else {
    const rec = await fetchArchive(site, start, archiveEnd);
    if (immutable) writeCache(key, pack(rec));
    parts.push(rec);
  }
  if (current) {
    try { parts.push(await fetchRecent(site, 14)); } catch (e) { console.warn('recent fetch failed, archive only', e); }
  }
  const until = current ? now.getTime() : Infinity;
  const record = stitch(parts, until);
  // Bureau daily observations for this season, if the repo carries them: rescale to the station
  try {
    const res = await fetch(`./data/thredbo-top-daily-${year}.json`);
    if (res.ok) {
      const daily = (await res.json()).days;
      const corrected = correctWithStation(record, daily);
      console.info(`station-corrected ${corrected.correctedWindows} days from Bureau daily observations`);
      return corrected;
    }
  } catch { /* no daily file: raw Open-Meteo it is */ }
  return record;
}

/** Human observations for a season: the Mountain Safety Collective's daily reports, if the repo carries them. */
export async function loadObservations(year) {
  try {
    const res = await fetch(`./data/msc-${year}.json`);
    if (!res.ok) return null;
    return (await res.json()).days;
  } catch { return null; }
}

/** Snowy Hydro's daily snow-depth sensor near Spencers Creek, if the repo carries the digitised series. */
export async function loadSensor(year) {
  try {
    const res = await fetch(`./data/spencers-sensor-${year}.json`);
    if (!res.ok) return null;
    return (await res.json()).days;
  } catch { return null; }
}

/** Structured facts extracted from the observers' reports (scripts/parse-msc.mjs), if the repo carries them. */
export async function loadObservationFacts(year) {
  try {
    const res = await fetch(`./data/msc-${year}-facts.json`);
    if (!res.ok) return null;
    return (await res.json()).days;
  } catch { return null; }
}
