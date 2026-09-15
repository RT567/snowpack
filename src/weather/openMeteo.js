// Open-Meteo adapters. Two endpoints, one record schema.
//   archive:  ERA5-based reanalysis, hourly, from 1940 to ~5 days ago. Immutable → cacheable forever.
//   forecast: higher-resolution NWP, past_days up to 92, plus forecast. We only keep the past.
// Both are asked for the station elevation so temperature is lapse-rate corrected to 1957 m.
import { HOUR } from './record.js';

const HOURLY = 'temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m,shortwave_radiation,cloud_cover';
const COMMON = `hourly=${HOURLY}&timeformat=unixtime&wind_speed_unit=ms&timezone=Australia%2FSydney`;

export function archiveUrl(site, startDate, endDate) {
  return `https://archive-api.open-meteo.com/v1/archive?latitude=${site.lat}&longitude=${site.lon}&elevation=${site.elevation}&start_date=${startDate}&end_date=${endDate}&${COMMON}`;
}

export function forecastUrl(site, pastDays = 14) {
  return `https://api.open-meteo.com/v1/forecast?latitude=${site.lat}&longitude=${site.lon}&elevation=${site.elevation}&past_days=${pastDays}&forecast_days=1&${COMMON}`;
}

/** Turn an Open-Meteo hourly response into a WeatherRecord. */
export function toRecord(json, site) {
  const h = json.hourly;
  const n = h.time.length;
  const hours = new Array(n);
  for (let i = 0; i < n; i++) {
    hours[i] = {
      t: h.time[i] * 1000,
      temp: h.temperature_2m[i],
      rh: h.relative_humidity_2m[i],
      dew: h.dew_point_2m[i],
      precip: h.precipitation[i],
      wind: h.wind_speed_10m[i],
      gust: h.wind_gusts_10m[i],
      dir: h.wind_direction_10m[i],
      sw: h.shortwave_radiation[i],
      cloud: h.cloud_cover[i],
    };
  }
  return { site, hours };
}

/** Fetch JSON with a few retries: Open-Meteo drops the odd connection. */
async function getJson(url, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status >= 500) throw new Error(`Open-Meteo ${res.status}`);
      if (!res.ok) throw Object.assign(new Error(`Open-Meteo ${res.status} for ${url}`), { fatal: true });
      return await res.json();
    } catch (e) {
      if (e.fatal) throw e;
      lastErr = e;
      await new Promise((r) => setTimeout(r, 600 * 2 ** i));
    }
  }
  throw lastErr;
}

/** Fetch the archive for a date span (YYYY-MM-DD strings). */
export async function fetchArchive(site, startDate, endDate) {
  return toRecord(await getJson(archiveUrl(site, startDate, endDate)), site);
}

/** Fetch the recent past from the forecast model. Future hours are dropped by the caller via stitch(). */
export async function fetchRecent(site, pastDays = 14) {
  return toRecord(await getJson(forecastUrl(site, pastDays)), site);
}

export { HOUR };
