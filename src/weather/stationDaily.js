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

export const STATION_CORRECTION = {
  windFactor: 2.0,          // Open-Meteo 3 pm speed / BOM 3 pm speed, median 0.40 in 2026; kept conservative
  gustFactor: 1.5,          // gusts: median ratio 0.63
  // Rain: the gauge is trusted, so rainy windows are scaled to it. Snow: an unshielded alpine gauge
  // catches an unreliable fraction of snowfall, so snowy windows keep Open-Meteo scaled by the
  // depth-calibrated factor instead. Windows in between blend by snow fraction.
  snowPrecipFactor: 1.9,     // calibrated with wind ×2 against Spencers Creek 2026 (bias +2 cm, RMSE 10)
  rainBelowSnowFraction: 0.3,
  snowAboveSnowFraction: 0.7,
  minPrecipHours: 3,        // spread gauge rain the model missed over at least this many hours
};

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
 * 24 h ending 9 am local that day. Windows without observations are left alone (apart from wind).
 */
export function correctWithStation(record, daily, c = STATION_CORRECTION) {
  const tz = record.site.tz;
  const hours = record.hours.map((h) => ({ ...h, wind: h.wind * c.windFactor, gust: h.gust * c.gustFactor }));
  const windows = new Map();
  hours.forEach((h, i) => {
    const hr = hourOf(h.t, tz);
    const key = hr >= 9 ? dayKey(h.t + 24 * HOUR, tz) : dayKey(h.t, tz);
    if (!windows.has(key)) windows.set(key, []);
    windows.get(key).push(i);
  });
  let corrected = 0;
  for (const [date, idx] of windows) {
    const o = daily[date];
    if (!o || idx.length < 20) continue;
    corrected++;
    // temperature: affine map so the window's min/max hit the observed min/max
    if (o.min != null && o.max != null && o.max > o.min) {
      const temps = idx.map((i) => hours[i].temp);
      const lo = Math.min(...temps), hi = Math.max(...temps);
      const scale = hi > lo ? (o.max - o.min) / (hi - lo) : 1;
      for (const i of idx) {
        const h = hours[i];
        const t2 = o.min + (h.temp - lo) * scale;
        h.dew = h.dew + (t2 - h.temp) * 0.8; // dew point follows most of the shift
        h.temp = t2;
        if (h.dew > h.temp) h.dew = h.temp;
      }
    }
    // precipitation: match the gauge, boosted by the snow fraction for under-catch
    if (o.rain != null) {
      const raw = idx.reduce((a, i) => a + hours[i].precip, 0);
      let fSnow = 0;
      if (raw > 0) fSnow = idx.reduce((a, i) => a + hours[i].precip * snowFraction(hours[i].temp, hours[i].rh), 0) / raw;
      else fSnow = idx.reduce((a, i) => a + snowFraction(hours[i].temp, hours[i].rh), 0) / idx.length;
      const gaugeTarget = o.rain;
      const modelTarget = raw * c.snowPrecipFactor;
      const wSnow = Math.max(0, Math.min(1, (fSnow - c.rainBelowSnowFraction) / (c.snowAboveSnowFraction - c.rainBelowSnowFraction)));
      const target = gaugeTarget * (1 - wSnow) + modelTarget * wSnow;
      if (raw > 0) { const k = target / raw; for (const i of idx) hours[i].precip *= k; }
      else if (target > 0) {
        // the model missed it entirely: put it in the most humid hours
        const ranked = [...idx].sort((p, q) => hours[q].rh - hours[p].rh).slice(0, Math.max(c.minPrecipHours, Math.round(idx.length / 4)));
        for (const i of ranked) hours[i].precip = target / ranked.length;
      }
    }
  }
  return { ...record, hours, correctedWindows: corrected };
}
