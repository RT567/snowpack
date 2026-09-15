// The snowpack model: a pure hourly step function from (stack, weather hour) to the next stack.
// No DOM, no rendering. Layers are ordered bottom → top. Units: SI, except swe/lwc in kg/m² (= mm).
//
// Layer = {
//   id, born (epoch ms of first snowfall), buried (epoch ms when first covered, or null),
//   swe    frozen mass, kg/m²
//   lwc    liquid water held, kg/m²
//   thick  thickness, m           (rho = swe / thick)
//   temp   bulk temperature, °C (≤ 0)
//   grain  IACS code: PP DF RG FC DH SH MF IF
//   wetCount   how many times it has been wetted then refrozen
//   facetHours hours spent under a strong temperature gradient
//   windPacked true if wind-hardened while at the surface
//   storm  { tempMin, tempMax, windMax, dir, rain }  weather during deposition, for labels
// }
import { DEFAULT_PARAMS } from './params.js';
import { wetBulb, HOUR } from '../weather/record.js';

const G = 9.81;
const RHO_ICE = 917;
const LF = 334_000;   // J/kg
const C_ICE = 2100;   // J/kg/K
const DT = 3600;      // s
const SIGMA = 5.67e-8;
const K0 = 273.15;

/** Enough liquid for wetting to show in the grains (mass fraction). */
function wetEnough(l, p) { return l.lwc > p.wetGrainFraction * (l.swe + l.lwc); }

/**
 * Wetting changes the grains: a damp layer rounds (new snow, facets and hoar lose their shape), and
 * only a layer soaked through becomes melt forms. Melt-freeze is otherwise an event at the surface,
 * recorded as a thin crust when the top refreezes (see refreezeTop).
 */
function wetGrains(l, p) {
  if (l.grain === 'IF' || l.grain === 'MF') return;
  if (!wetEnough(l, p)) return;
  if (l.lwc > p.soakFraction * (l.swe + l.lwc)) {
    // soaked through: melt forms, and loose snow slumps to slush density
    l.grain = 'MF';
    if (rho(l) < p.slushRho) l.thick = l.swe / p.slushRho;
  } else {
    l.grain = 'RG';
  }
}

/**
 * Rain or melt has wetted the top layer. Water enters from above, so if the layer is thick, split a
 * skin of `crustThickness` off its top and give the water to the skin first: the skin becomes wet
 * melt forms, the bulk beneath is merely damp and keeps rounding. Melt-freeze stays a surface event.
 */
function soakTop(s, p) {
  const l = top(s);
  if (!l || l.lwc <= 0 || !wetEnough(l, p) || l.thick < 2 * p.crustThickness || l.grain === 'IF') return;
  const f = p.crustThickness / l.thick;
  const skin = { ...l, id: nextId++, storm: { ...l.storm }, swe: l.swe * f, thick: p.crustThickness, lwc: 0, facetHours: 0 };
  const skinTakes = Math.min(l.lwc, 0.3 * skin.swe);
  skin.lwc = skinTakes;
  l.swe -= skin.swe; l.thick -= p.crustThickness; l.lwc -= skinTakes;
  l.buried = s.t;
  s.layers.push(skin);
  wetGrains(skin, p); wetGrains(l, p);
}

/**
 * The wet top layer has just frozen solid. Split off a crust of `crustThickness` at its top: the
 * refrozen skin is dense melt-freeze (or ice), the snow beneath keeps its own grains.
 */
function refreezeTop(s, p) {
  const l = top(s);
  if (!l || l.lwc > 0) return;
  const crustT = Math.min(p.crustThickness, l.thick);
  if (l.grain === 'IF' || l.thick < 1.5 * p.crustThickness) {
    // thin: the whole layer is the crust
    l.wetCount += 1;
    const r = Math.max(rho(l), p.crustRhoMin);
    l.thick = l.swe / r;
    l.grain = r >= p.iceRho ? 'IF' : 'MF';
    return;
  }
  const f = crustT / l.thick;
  // the refrozen skin is a dense crust; the snow beneath keeps its density (soaked snow stays melt forms)
  const crust = {
    ...l, id: nextId++, storm: { ...l.storm }, swe: l.swe * f, thick: crustT, lwc: 0,
    wetCount: l.wetCount + 1, grain: 'MF', facetHours: 0,
  };
  const r = Math.max(rho(crust), p.crustRhoMin);
  crust.thick = crust.swe / r;
  if (r >= p.iceRho) crust.grain = 'IF';
  l.swe -= crust.swe; l.thick -= crustT; l.wetCount += 1;
  l.buried = s.t;
  s.layers.push(crust);
}

let nextId = 1;

export function createStack(t) {
  return { t, layers: [], albedo: DEFAULT_PARAMS.albedoFresh, shHours: 0, runoff: 0, snowfall: 0, rain: 0 };
}

export function depth(stack) {
  let d = 0;
  for (const l of stack.layers) d += l.thick;
  return d;
}

export function rho(layer) {
  return layer.thick > 0 ? layer.swe / layer.thick : 0;
}

/** Hedstrom & Pomeroy (1998) new snow density with a wind bonus. */
export function newSnowDensity(temp, wind, p = DEFAULT_PARAMS) {
  let r = 67.92 + 51.25 * Math.exp(temp / 2.59);
  r += Math.max(0, wind - p.windBonusFrom) * p.windBonusPerMs;
  return Math.max(p.newSnowRhoMin, Math.min(p.newSnowRhoMax, r));
}

/** Fraction of precipitation falling as snow, from wet-bulb temperature. */
export function snowFraction(temp, rh, p = DEFAULT_PARAMS) {
  const tw = wetBulb(temp, rh);
  return Math.max(0, Math.min(1, (p.rainTw - tw) / (p.rainTw - p.snowTw)));
}

function cloneStack(s) {
  return { ...s, layers: s.layers.map((l) => ({ ...l, storm: { ...l.storm } })) };
}

function top(s) { return s.layers[s.layers.length - 1]; }

function addSnow(s, w, mm, p) {
  const r = newSnowDensity(w.temp, w.wind, p);
  const l = top(s);
  const sameStorm = l && l.grain === 'PP'
    && (s.t - l.lastSnow) <= p.stormGapHours * HOUR
    && Math.abs(l.storm.tempMean - w.temp) < p.stormTempJump;
  if (sameStorm) {
    const st = l.storm;
    st.tempMean = (st.tempMean * l.swe + w.temp * mm) / (l.swe + mm);
    st.tempMin = Math.min(st.tempMin, w.temp); st.tempMax = Math.max(st.tempMax, w.temp);
    st.windMax = Math.max(st.windMax, w.wind);
    l.swe += mm; l.thick += mm / r; l.lastSnow = s.t;
    l.temp = Math.min(0, (l.temp + Math.min(0, w.temp)) / 2);
  } else {
    if (l && l.buried == null) l.buried = s.t;
    s.layers.push({
      id: nextId++, born: s.t, lastSnow: s.t, buried: null,
      swe: mm, lwc: 0, thick: mm / r, temp: Math.min(0, w.temp), grain: 'PP',
      wetCount: 0, facetHours: 0, windPacked: false,
      storm: { tempMean: w.temp, tempMin: w.temp, tempMax: w.temp, windMax: w.wind, dir: w.dir, rain: 0 },
    });
  }
  s.snowfall += mm;
  s.albedo = Math.min(p.albedoFresh, s.albedo + (p.albedoFresh - s.albedo) * Math.min(1, mm / p.albedoRefreshMm));
}

function surfaceHoar(s, w, p) {
  const l = top(s);
  if (!l) { s.shHours = 0; return; }
  const night = w.sw < 5;
  const forming = night && w.cloud < p.shCloudMax && w.rh > p.shRhMin && w.wind < p.shWindMax && w.temp < p.shTempMax && l.lwc === 0;
  const destroying = w.wind > p.shDestroyWind || w.temp > 1.5 || w.sw > 300;
  if (forming) {
    s.shHours += 1;
    if (l.grain === 'SH') { l.swe += p.shSwe / p.shHoursToForm; l.thick = l.swe / p.shRho; }
    else if (s.shHours >= p.shHoursToForm) {
      l.buried = s.t;
      s.layers.push({
        id: nextId++, born: s.t, lastSnow: s.t, buried: null,
        swe: p.shSwe, lwc: 0, thick: p.shSwe / p.shRho, temp: Math.min(0, w.temp), grain: 'SH',
        wetCount: 0, facetHours: 0, windPacked: false,
        storm: { tempMean: w.temp, tempMin: w.temp, tempMax: w.temp, windMax: w.wind, dir: w.dir, rain: 0, hoar: true },
      });
      s.shHours = 0;
    }
  } else {
    if (!night) s.shHours = 0;
    if (destroying && l.grain === 'SH') { s.layers.pop(); const nl = top(s); if (nl) nl.buried = null; }
  }
}

/**
 * Wind reworks the surface: only the top `windSkin` of fresh snow densifies, gradually, in proportion
 * to how far the wind exceeds the transport threshold. A thick fresh layer is split so the bulk
 * beneath keeps its density.
 */
function windPack(s, w, p) {
  let l = top(s);
  if (!l || w.wind < p.windPackSpeed || l.lwc > 0) return;
  if (l.grain !== 'PP' && l.grain !== 'DF') return;
  if (l.thick > 1.5 * p.windSkin) {
    const f = p.windSkin / l.thick;
    const skin = { ...l, id: nextId++, storm: { ...l.storm }, swe: l.swe * f, thick: p.windSkin, lwc: 0 };
    l.swe -= skin.swe; l.thick -= p.windSkin; l.buried = s.t;
    s.layers.push(skin);
    l = skin;
  }
  const r0 = rho(l);
  const r1 = Math.min(p.windPackRhoMax, r0 + p.windPackRate * (w.wind - p.windPackSpeed + 1));
  if (r1 > r0) { l.thick = l.swe / r1; l.windPacked = true; }
}

/** Take `mm` of melt from the top down; melted mass stays in its layer as liquid. */
function meltDown(s, mm) {
  for (let i = s.layers.length - 1; i >= 0 && mm > 0; i--) {
    const l = s.layers[i];
    const take = Math.min(mm, l.swe);
    if (take <= 0) continue;
    l.thick *= (l.swe - take) / l.swe;
    l.swe -= take; l.lwc += take; l.temp = 0;
    mm -= take;
  }
}

/**
 * Surface energy balance on the top layer: absorbed solar, net longwave, sensible and latent
 * exchange with the air. Solved implicitly in the surface temperature so an hour step cannot
 * overshoot the air temperature. Positive energy warms the surface to 0 °C then melts; negative
 * energy refreezes held water then cools the surface.
 */
function surfaceEnergy(s, w, p) {
  const l = top(s);
  if (!l) return;
  const U = Math.max(p.windFloor, w.wind);
  const Ts0 = l.temp;
  const ea = p.clearSkyEmissivity + p.cloudEmissivityGain * Math.max(0, Math.min(1, w.cloud / 100));
  const flux = (Ts) => w.sw * (1 - s.albedo)
    + ea * SIGMA * (w.temp + K0) ** 4 - p.emissivitySnow * SIGMA * (Ts + K0) ** 4
    + p.ch * U * (w.temp - Ts) + p.ce * U * (w.dew - Ts);
  const C = C_ICE * Math.max(p.skinMassMin, l.swe + l.lwc); // J/m²/K thermal mass of the skin
  // linearise flux(Ts) ≈ A − B·Ts around Ts0
  const B = 4 * p.emissivitySnow * SIGMA * (Ts0 + K0) ** 3 + (p.ch + p.ce) * U;
  const A = flux(Ts0) + B * Ts0;
  if (l.lwc > 0) {
    // wet surface sits at 0 °C: any deficit refreezes, any surplus melts
    const e = flux(0) * DT;
    if (e >= 0) { meltDown(s, e / LF); return; }
    const frz = Math.min(l.lwc, -e / LF);
    l.lwc -= frz; l.swe += frz;
    if (l.lwc === 0) {
      refreezeTop(s, p); // the frozen skin becomes a crust; the snow beneath keeps its grains
      const left = e + frz * LF; // remaining deficit cools the now-dry skin
      top(s).temp = Math.min(0, left / (C + B * DT)); // implicit from 0 °C
    }
    return;
  }
  // dry surface: implicit step  C (Ts − Ts0)/dt = A − B Ts
  const Ts = (C * Ts0 / DT + A) / (C / DT + B);
  if (Ts <= 0) { l.temp = Ts; return; }
  // would exceed 0 °C: warm to 0, spend the rest on melt (flux evaluated at 0 °C)
  const warm = C * (0 - Ts0);
  const e = flux(0) * DT - warm;
  l.temp = 0;
  if (e > 0) meltDown(s, e / LF);
}

/**
 * Gravity drainage: water entering a cold layer refreezes against its cold content first (warming
 * it toward 0 °C and densifying it); what remains is held up to the irreducible capacity and the
 * excess flows on down. This is what keeps the deep pack dry under a diurnal melt-freeze surface.
 */
function percolate(s, p) {
  let flow = 0;
  for (let i = s.layers.length - 1; i >= 0; i--) {
    const l = s.layers[i];
    l.lwc += flow;
    if (l.lwc > 0 && l.temp < 0) {
      const cc = (C_ICE * l.swe * -l.temp) / LF; // kg/m² that can freeze
      const frz = Math.min(l.lwc, cc);
      l.lwc -= frz; l.swe += frz;
      l.temp = cc > 0 ? l.temp * (1 - frz / cc) : 0; // warmed in proportion to cold content spent
      if (frz > 0 && l.lwc === 0 && l.grain !== 'IF' && frz > p.wetGrainFraction * l.swe) {
        // water froze inside a cold layer: an ice lens if it was a soaking, otherwise rounded grains
        l.wetCount += 1;
        if (frz > p.soakFraction * l.swe || rho(l) >= p.iceRho) l.grain = rho(l) >= p.iceRho ? 'IF' : 'MF';
        else if (l.grain !== 'MF') l.grain = 'RG';
      }
    }
    const pore = Math.max(0, l.thick * (1 - rho(l) / RHO_ICE));
    const cap = l.grain === 'IF' ? 0 : p.wirr * pore * 1000;
    flow = Math.max(0, l.lwc - cap);
    l.lwc -= flow;
    if (l.lwc > 0) { l.temp = 0; wetGrains(l, p); }
  }
  s.runoff += flow;
}

/** Heat conduction downwards: each layer relaxes toward the one above; liquid refreezes against cold content. */
function conduct(s, p) {
  let z = 0;
  for (let i = s.layers.length - 2; i >= 0; i--) {
    const above = s.layers[i + 1];
    const l = s.layers[i];
    z += above.thick;
    const k = 1 - Math.exp(-1 / (p.conductTauHours * (1 + z / p.conductDepthScale)));
    if (l.lwc > 0) {
      const coolTo = Math.min(0, l.temp + (above.temp - l.temp) * k);
      const cc = (C_ICE * l.swe * Math.max(0, -coolTo)) / LF;
      const frz = Math.min(l.lwc, cc);
      if (frz > 0) {
        l.lwc -= frz; l.swe += frz;
        if (l.lwc === 0) {
          l.wetCount += 1;
          if (rho(l) >= p.iceRho) l.grain = 'IF';
          l.temp = Math.min(0, coolTo / 2);
        }
      }
      if (l.lwc > 0) { l.temp = 0; wetGrains(l, p); }
    } else {
      l.temp = Math.min(0, l.temp + (above.temp - l.temp) * k);
    }
  }
  // ground heat: the bottom layer creeps toward 0 °C
  const b = s.layers[0];
  if (b && b.lwc === 0) b.temp = Math.min(0, b.temp + (p.groundFlux * DT) / (C_ICE * Math.max(p.skinMassMin, b.swe)));
  else if (b && b.temp < 0) b.lwc = b.lwc; // no-op, kept for clarity
}

/** Anderson (1976) densification: overburden creep plus destructive metamorphism. */
function densify(s, p) {
  let above = 0; // kg/m² overlying mass
  for (let i = s.layers.length - 1; i >= 0; i--) {
    const l = s.layers[i];
    if (l.grain === 'IF' || l.grain === 'SH') { above += l.swe + l.lwc; continue; }
    const r = rho(l);
    const T = l.temp; // °C
    const wet = l.lwc > 0;
    const creep = r * G * (above + (l.swe + l.lwc) / 2) / (p.eta0 * Math.exp(-T / 12.4 + r / 55.6));
    const meta = r * p.snda * Math.exp(T / 23.8 - Math.max(r - 150, 0) / 21.7) * (wet ? 2 : 1);
    const rMax = wet || l.grain === 'MF' ? p.rhoMaxWet : p.rhoMaxDry;
    const r1 = Math.min(rMax, r + (creep + meta) * DT);
    if (r1 > r) l.thick = l.swe / r1;
    above += l.swe + l.lwc;
  }
}

/** Grain evolution: ageing of new snow, faceting under gradients, depth hoar at the base. */
function metamorphose(s, w, p) {
  const D = depth(s);
  if (D <= 0) return;
  const clearNight = w.sw < 5 && w.cloud < 40 && w.wind < 4;
  const tSurf = Math.min(0, w.temp - (clearNight ? p.clearNightCooling : 0));
  const gradient = Math.abs(tSurf) / Math.max(D, 0.05); // °C/m, ground assumed 0 °C
  let z = 0;
  for (let i = s.layers.length - 1; i >= 0; i--) {
    const l = s.layers[i];
    const age = (s.t - l.born) / HOUR;
    if (l.lwc > 0 || l.grain === 'MF' || l.grain === 'IF' || l.grain === 'SH') { z += l.thick; continue; }
    if (l.grain === 'PP' && age > p.ppToDfHours && (s.t - l.lastSnow) > p.stormGapHours * HOUR) l.grain = 'DF';
    if (l.grain === 'DF' && (age > p.dfToRgHours || rho(l) > p.dfToRgRho)) l.grain = 'RG';
    if (l.windPacked && l.grain === 'DF') l.grain = 'RG';
    const nearSurface = z < p.facetDepth;
    const nearCrust = i > 0 && (s.layers[i - 1].grain === 'MF' || s.layers[i - 1].grain === 'IF');
    if (gradient > p.facetGradient && l.temp < p.facetTempMax && (nearSurface || D < 1)) {
      l.facetHours += Math.min(2, gradient / (2 * p.facetGradient)) * (nearCrust ? 1.5 : 1);
    } else if (l.facetHours > 0 && l.temp > -3) {
      l.facetHours -= 0.25; // slow rounding when warm and gradient-free
    }
    if (l.facetHours > p.facetHoursToFC && (l.grain === 'DF' || l.grain === 'RG')) l.grain = 'FC';
    if (l.grain === 'FC' && l.facetHours > p.facetHoursToDH && (D - z) < 0.3 && D < 1 && gradient > 2 * p.facetGradient) l.grain = 'DH';
    if (l.grain === 'FC' && l.facetHours < p.facetHoursToFC / 2) l.grain = 'RG';
    z += l.thick;
  }
}

function tidy(s, p) {
  // drop vanished layers, merge slivers into the layer below unless they are crusts or hoar
  for (let i = s.layers.length - 1; i >= 0; i--) {
    const l = s.layers[i];
    if (l.swe + l.lwc < p.minSwe || l.thick <= 0) {
      if (i > 0) s.layers[i - 1].lwc += l.lwc;
      s.layers.splice(i, 1);
      continue;
    }
    const keep = l.grain === 'IF' || l.grain === 'SH' || (l.grain === 'MF' && l.wetCount > 0);
    if (!keep && l.thick < p.minThickness && i > 0) {
      const b = s.layers[i - 1];
      b.swe += l.swe; b.lwc += l.lwc; b.thick += l.thick;
      s.layers.splice(i, 1);
    }
  }
  // merge adjacent dry layers of the same storm and grain
  for (let i = s.layers.length - 1; i >= 1; i--) {
    const u = s.layers[i], b = s.layers[i - 1];
    const crust = (l) => l.grain === 'IF' || (l.grain === 'MF' && l.wetCount > 0 && l.thick <= 1.5 * p.crustThickness);
    // same storm, same grains, both wet or both dry, neither a crust or hoar: one layer, not slivers
    const mergeable = u.grain === b.grain && (u.lwc > 0) === (b.lwc > 0) && u.grain !== 'SH' && !crust(u) && !crust(b)
      && u.windPacked === b.windPacked && Math.abs(u.born - b.born) <= p.stormGapHours * HOUR;
    if (mergeable) {
      b.swe += u.swe; b.lwc += u.lwc; b.thick += u.thick; b.lastSnow = Math.max(b.lastSnow, u.lastSnow);
      b.wetCount = Math.max(b.wetCount, u.wetCount); b.storm.rain += u.storm.rain;
      b.temp = (b.temp + u.temp) / 2; b.windPacked = b.windPacked || u.windPacked;
      b.storm.tempMin = Math.min(b.storm.tempMin, u.storm.tempMin); b.storm.tempMax = Math.max(b.storm.tempMax, u.storm.tempMax);
      b.storm.windMax = Math.max(b.storm.windMax, u.storm.windMax);
      s.layers.splice(i, 1);
    }
  }
  const t = top(s);
  if (t) t.buried = null;
}

/** One hour of weather applied to a stack. Returns a new stack; the input is not mutated. */
export function step(stack, w, p = DEFAULT_PARAMS) {
  const s = cloneStack(stack);
  s.t = w.t;
  const fSnow = snowFraction(w.temp, w.rh, p);
  const precip = w.precip * p.precipFactor;
  const snowMm = precip * fSnow;
  const rainMm = precip - snowMm;

  if (snowMm > 0.05) addSnow(s, w, snowMm, p);
  surfaceHoar(s, w, p);
  windPack(s, w, p);
  surfaceEnergy(s, w, p);
  if (rainMm > 0 && s.layers.length) {
    const l = top(s); l.lwc += rainMm; l.storm.rain += rainMm; l.temp = 0; s.rain += rainMm;
  }
  soakTop(s, p);
  percolate(s, p);
  conduct(s, p);
  densify(s, p);
  metamorphose(s, w, p);
  tidy(s, p);
  // albedo ageing
  const melting = s.layers.length && top(s).lwc > 0;
  const tau = melting ? p.albedoDecayMeltHours : p.albedoDecayColdHours;
  const floor = melting ? p.albedoOldMelt : p.albedoOldCold;
  s.albedo = Math.max(floor, floor + (s.albedo - floor) * Math.exp(-1 / tau));
  s.t = w.t + HOUR;
  return s;
}

/** Run a whole record. Returns one snapshot per hour, snapshots[i] is the stack after hours[i]. */
export function simulate(record, p = DEFAULT_PARAMS) {
  const out = new Array(record.hours.length);
  let s = createStack(record.hours[0]?.t ?? 0);
  for (let i = 0; i < record.hours.length; i++) {
    s = step(s, record.hours[i], p);
    out[i] = s;
  }
  return out;
}
