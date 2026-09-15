// Correct an Open-Meteo hourly record with the Bureau's Daily Weather Observations for the station.
//
// The Bureau publishes, for each day, the minimum and maximum temperature and the rain in the 24 h
// to 9 am, plus 9 am and 3 pm spot readings. Against these, Open-Meteo at Thredbo Top runs warm by
// day and cold by night, badly under-catches rain, and reports ridge-top wind at less than half
// the measured speed (scripts/input-bias.mjs). Where daily observations exist we rescale each
// 24 h-to-9 am window so its hourly temperatures span the observed min and max and its precipitation
// matches the gauge (boosted for snow, which gauges under-catch); wind is scaled everywhere.
import { HOUR } from './record.js';
import { snowFraction } from '../snow/model.js';
import { STATION_CORRECTION } from '../snow/params.js';
export { STATION_CORRECTION };

/** Parse a DWO CSV (Latin-1 text) into { 'YYYY-MM-DD': { min, max, rain, gustKmh, t9, rh9, w9, t15, rh15, w15 } }. */
export function parseDwo(text) {
  const out = {};
  for (const line of text.split('\n')) {
    const c = line.split(',');
    if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(c[1] ?? '')) continue;
    const [y, m, d] = c[1].split('-');
    const num = (v) => (v === '' || v == null ? null : Number(v));
    out[`${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`] = { min: num(c[2]), max: num(c[3]), rain: num(c[4]), gustKmh: num(c[8]), t9: num(c[10]), rh9: num(c[11]), w9: num(c[14]), t15: num(c[16]), rh15: num(c[17]), w15: num(c[20]) };
  }
  return out;
}

const dayKey = (t, tz) => new Date(t).toLocaleDateString('en-CA', { timeZone: tz });
const hourOf = (t, tz) => Number(new Date(t).toLocaleString('en-AU', { timeZone: tz, hour: '2-digit', hour12: false }).slice(0, 2)) % 24;

/**
 * Return a corrected copy of `record`. `daily` maps DWO dates to observations; a DWO date covers the
 * 24 h ending 9 am local that day for minimum and rain, the 24 h from 9 am for maximum; its 9 am and
 * 3 pm readings are for that calendar day. Windows without observations are left alone (apart from wind).
 */
export function correctWithStation(record, daily, c = STATION_CORRECTION) {
  const tz = record.site.tz;
  const hours = record.hours.map((h) => ({ ...h, wind: h.wind * c.windFactor, gust: h.gust * c.gustFactor }));
  // Bureau conventions: minimum temperature and rainfall are for the 24 h TO 9 am on the date;
  // maximum temperature is for the 24 h FROM 9 am on the date.
  const windows = new Map();   // date → hours in the 24 h to 9 am that date (min, rain)
  const fwd = new Map();       // date → hours in the 24 h from 9 am that date (max)
  hours.forEach((h, i) => {
    const hr = hourOf(h.t, tz);
    const toKey = hr >= 9 ? dayKey(h.t + 24 * HOUR, tz) : dayKey(h.t, tz);
    const fromKey = hr >= 9 ? dayKey(h.t, tz) : dayKey(h.t - 24 * HOUR, tz);
    if (!windows.has(toKey)) windows.set(toKey, []);
    windows.get(toKey).push(i);
    if (!fwd.has(fromKey)) fwd.set(fromKey, []);
    fwd.get(fromKey).push(i);
  });
  let corrected = 0;
  // 1. temperature: four station facts a day become anchors on the hourly series: the 9 am and 3 pm
  //    readings at their hours, the minimum at the hour Open-Meteo is coldest in the 24 h to 9 am, the
  //    maximum at the hour it is warmest in the 24 h from 9 am. The series is shifted by an offset
  //    interpolated linearly in time through every anchor, so it passes through all four and keeps its
  //    shape between them (no flat clamped plateaus).
  const anchorAt = new Map(); // hour index → [offsets]
  const addAnchor = (i, off) => { if (!anchorAt.has(i)) anchorAt.set(i, []); anchorAt.get(i).push(off); };
  hours.forEach((h, i) => {
    const hr = hourOf(h.t, tz);
    if (hr !== 9 && hr !== 15) return;
    const o = daily[dayKey(h.t, tz)];
    const obs = hr === 9 ? o?.t9 : o?.t15;
    if (obs != null) addAnchor(i, obs - h.temp);
  });
  for (const [date, idx] of windows) {
    const o = daily[date];
    if (o?.min == null || idx.length < 20) continue;
    const iMin = idx.reduce((a, i) => (hours[i].temp < hours[a].temp ? i : a), idx[0]);
    addAnchor(iMin, o.min - hours[iMin].temp);
  }
  for (const [date, idx] of fwd) {
    const o = daily[date];
    if (o?.max == null || idx.length < 20) continue;
    const iMax = idx.reduce((a, i) => (hours[i].temp > hours[a].temp ? i : a), idx[0]);
    addAnchor(iMax, o.max - hours[iMax].temp);
  }
  const anchors = [...anchorAt.entries()].map(([i, offs]) => ({ i, off: offs.reduce((a, b) => a + b, 0) / offs.length })).sort((a, b) => a.i - b.i);
  if (anchors.length) {
    let k = 0;
    hours.forEach((h, i) => {
      while (k < anchors.length - 1 && anchors[k + 1].i <= i) k++;
      const a = anchors[k], b = anchors[Math.min(k + 1, anchors.length - 1)];
      const off = i <= a.i || a.i === b.i ? a.off : i >= b.i ? b.off : a.off + ((b.off - a.off) * (i - a.i)) / (b.i - a.i);
      h.temp += off; h.dew += off * 0.8; if (h.dew > h.temp) h.dew = h.temp;
    });
  }
  for (const [date, idx] of windows) {
    const o = daily[date];
    if (!o || idx.length < 20) continue;
    corrected++;
    // 2a. the 24 h to 9 am may not go below the observed minimum (by more than a little)
    if (o.min != null) {
      for (const i of idx) { const h = hours[i]; h.temp = Math.max(o.min - c.extremeSlack, h.temp); }
    }
    // 2b. the 24 h from 9 am may not exceed the observed maximum
    if (o.max != null && fwd.has(date)) {
      for (const i of fwd.get(date)) { const h = hours[i]; h.temp = Math.min(o.max + c.extremeSlack, h.temp); if (h.dew > h.temp) h.dew = h.temp; }
    }
    // 3. precipitation: gauge for rain, calibrated Open-Meteo for snow, blended by snow fraction
    if (o.rain != null) {
      const raw = idx.reduce((a, i) => a + hours[i].precip, 0);
      let fSnow = 0;
      if (raw > 0) fSnow = idx.reduce((a, i) => a + hours[i].precip * snowFraction(hours[i].temp, hours[i].rh), 0) / raw;
      else fSnow = idx.reduce((a, i) => a + snowFraction(hours[i].temp, hours[i].rh), 0) / idx.length;
      const wSnow = Math.max(0, Math.min(1, (fSnow - c.rainBelowSnowFraction) / (c.snowAboveSnowFraction - c.rainBelowSnowFraction)));
      if (raw > 0) {
        const target = o.rain * (1 - wSnow) + raw * c.snowPrecipFactor * wSnow;
        const k = target / raw; for (const i of idx) hours[i].precip *= k;
      } else if (o.rain > 0) {
        // Open-Meteo missed it: the gauge saw something. Rain as measured; snow boosted for under-catch.
        const target = o.rain * (1 + (c.snowPrecipFactor - 1) * wSnow);
        const ranked = [...idx].sort((p, q) => hours[q].rh - hours[p].rh).slice(0, Math.max(c.minPrecipHours, Math.round(idx.length / 4)));
        for (const i of ranked) hours[i].precip = target / ranked.length;
      }
    }
  }
  return { ...record, hours, correctedWindows: corrected };
}
