// The weather record: the one data shape every source must produce and the model consumes.
//
// A WeatherRecord is { site, hours: Hour[] } with hours strictly hourly and ascending.
// Hour = {
//   t:      epoch milliseconds (UTC instant)
//   temp:   air temperature, °C
//   rh:     relative humidity, %
//   dew:    dew point, °C
//   precip: total precipitation in the hour, mm (liquid equivalent)
//   wind:   10 m wind speed, m/s
//   gust:   10 m gust, m/s
//   dir:    wind direction, degrees from which it blows
//   sw:     shortwave (solar) radiation, W/m²
//   cloud:  cloud cover, %
// }
// Rain/snow partitioning is NOT part of the record: the model decides that from wet-bulb temperature.

export const HOUR = 3600_000;

export const FIELDS = ['temp', 'rh', 'dew', 'precip', 'wind', 'gust', 'dir', 'sw', 'cloud'];

/** Stull (2011) wet-bulb temperature from air temperature (°C) and RH (%). */
export function wetBulb(temp, rh) {
  const r = Math.max(1, Math.min(100, rh));
  return temp * Math.atan(0.151977 * Math.sqrt(r + 8.313659))
    + Math.atan(temp + r) - Math.atan(r - 1.676331)
    + 0.00391838 * r ** 1.5 * Math.atan(0.023101 * r) - 4.686035;
}

/**
 * Merge records covering overlapping spans into one hourly record. Later arguments win in the
 * overlap, so pass the coarsest/oldest source first and the freshest/highest-resolution last.
 * Hours after `until` (epoch ms) are dropped: the record never contains the future.
 */
export function stitch(records, until = Infinity) {
  const byT = new Map();
  for (const rec of records) for (const h of rec.hours) if (h.t <= until) byT.set(h.t, h);
  const hours = [...byT.values()].sort((a, b) => a.t - b.t);
  return { site: records[0]?.site, hours: fillGaps(hours) };
}

/**
 * Replace null/NaN fields by carrying the previous hour's value forward (precip becomes 0). A gap at
 * the very start is filled from the first hour that has the field, not with zeros.
 */
export function fillGaps(hours) {
  const missing = (v) => v == null || Number.isNaN(v);
  const prev = {};
  for (const f of FIELDS) prev[f] = f === 'precip' ? 0 : (hours.find((h) => !missing(h[f]))?.[f] ?? 0);
  for (const h of hours) {
    for (const f of FIELDS) {
      if (missing(h[f])) h[f] = f === 'precip' ? 0 : prev[f];
      prev[f] = h[f];
    }
  }
  return hours;
}
