// Synthetic weather for model tests.
import { HOUR } from '../src/weather/record.js';
import { THREDBO_TOP } from '../src/weather/site.js';
import { DEFAULT_PARAMS } from '../src/snow/params.js';

/** Model parameters with the reanalysis precipitation correction switched off: synthetic weather is already in true units. */
export const P1 = { ...DEFAULT_PARAMS, precipFactor: 1 };

export const T0 = Date.UTC(2026, 6, 1); // 1 July 2026 UTC

/** Build `n` hours from a function of hour index returning partial fields. */
export function hours(n, fn, start = T0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ t: start + i * HOUR, temp: -5, rh: 80, dew: -8, precip: 0, wind: 3, gust: 5, dir: 270, sw: 0, cloud: 50, ...fn(i) });
  }
  return out;
}

export const record = (hs) => ({ site: THREDBO_TOP, hours: hs });

/** A day/night solar cycle for hour-of-day (UTC hour offset by +10 for AEST). */
export function solar(i, peak = 400) {
  const h = (i + 10) % 24;
  return h >= 7 && h <= 17 ? Math.round(peak * Math.sin(((h - 7) / 10) * Math.PI)) : 0;
}
