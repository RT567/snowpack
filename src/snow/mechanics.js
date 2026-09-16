// What holds the column together and what loads it. Pure functions over a stack snapshot.
//
// Layer strength comes from measured shear-frame regressions on density by grain form
// (Jamieson & Johnston 2001, Table 8). The bond between two layers is the weaker of the two,
// reduced when wet or when hardness jumps across the boundary. The load is the overburden on the
// slope; friction follows Roch (1966); the stability index is strength over shear stress
// (Jamieson & Johnston 1995). Sources and numbers: research/slab-mechanics-for-simulation.md.
import { hardness } from './grains.js';
import { rho } from './model.js';
import { HOUR } from '../weather/record.js';

const G = 9.81;
const RHO_ICE = 917;

export const MECH = {
  // Σ∞ = A·(ρ/ρ_ice)^B in kPa, Jamieson & Johnston 2001 Table 8
  regression: {
    PP: { A: 5.32, B: 1.35 },
    DF: { A: 12.4, B: 1.68 },
    RG: { A: 8.54, B: 1.26 },
    FC: { A: 9.7, B: 1.58 },
    DH: { A: 18.5, B: 2.11 },   // Group II (facets and depth hoar), log-form fit
    MF: { A: 14.5, B: 1.73 },   // Group I form applied to dense melt-freeze grains
    IF: { A: 14.5, B: 1.73 },
  },
  strengthCap: 8,             // kPa, beyond the measured range
  // buried surface hoar: no density regression; measured series (Table 3) start ~0.3–0.65 kPa and
  // gain roughly 0.1–0.2 kPa per day as the layer thins and crystals penetrate the neighbours
  shBase: 0.35,
  shPerDay: 0.12,
  shMax: 5,
  // liquid water weakens the bond: full penalty (×0.5) once either side holds 5 % water by mass,
  // proportionally less for damp snow (Brun & Rey 1987 report the trend; the magnitude is ours)
  wetFactor: 0.3,           // strength left when soaked (Brun & Rey 1987: wet snow loses most of its cohesion above a few % water)
  // liquid water by VOLUME (Fierz et al. 2009 classes): below 3 % the snow is merely moist and bonds as
  // well as dry snow; the penalty ramps to its full value at 8 % ("very wet"), where free water sits in the pores
  wetOnsetFraction: 0.03,
  wetFullFraction: 0.08,
  contrastStep: 1.7,          // hand-hardness difference marking instability (Schweizer & Jamieson 2003)
  contrastFactor: 0.8,        // our judgement of its effect on the bond
  // Roch (1966): tanφ = 0.4 + 0.08·Σ (kPa), used by Jamieson & Johnston 1995
  frictionBase: 0.4,
  frictionPerKPa: 0.08,
  // stability index bands (S = (Σ + σn·tanφ)/σxz): measured transitions 1.6–1.8 without friction,
  // 2.7–3.0 with (Jamieson & Johnston 1995, Table 1)
  unstableS: 1.5,
  marginalS: 2.5,
  stableS: 4,
  // words for a bond's material strength (kPa): the unstable and stable medians from Schweizer &
  // Jamieson 2003 were 0.77 and 1.48
  weakKPa: 0.8,
  moderateKPa: 1.6,
};

/** Shear strength (kPa) of a layer's own snow from its density and grain form, at time t. */
export function layerStrength(layer, t, m = MECH) {
  if (layer.grain === 'SH') {
    const days = Math.max(0, (t - (layer.buried ?? t)) / (24 * HOUR));
    return Math.min(m.shMax, m.shBase + m.shPerDay * days);
  }
  const r = m.regression[layer.grain] ?? m.regression.RG;
  const rel = Math.max(0.03, rho(layer) / RHO_ICE);
  return Math.min(m.strengthCap, r.A * rel ** r.B);
}

/** Shear strength (kPa) of the bond between an upper and a lower layer at time t. */
export function bondStrength(upper, lower, t, m = MECH) {
  let s = Math.min(layerStrength(upper, t, m), layerStrength(lower, t, m));
  const byVolume = (l) => (l.thick > 0 ? l.lwc / (l.thick * 1000) : 0); // kg/m² of water over m of snow → m³/m³
  const wetness = Math.max(byVolume(upper), byVolume(lower));
  // moist snow (a few % water) sinters and bonds as well as dry snow; only wet to soaked snow loses cohesion
  if (wetness > m.wetOnsetFraction) s *= 1 - (1 - m.wetFactor) * Math.min(1, (wetness - m.wetOnsetFraction) / (m.wetFullFraction - m.wetOnsetFraction));
  if (Math.abs(hardness(upper) - hardness(lower)) >= m.contrastStep) s *= m.contrastFactor;
  return s;
}

/** Roch's internal friction coefficient for snow of strength Σ (kPa). */
export function friction(kPa, m = MECH) { return m.frictionBase + m.frictionPerKPa * kPa; }

/**
 * Every interface of a stack (index i is between layers[i-1] below and layers[i] above) with its
 * bond strength and the loads on it for a slope of `slopeDeg`:
 *   z        height above ground (m, vertical at x = 0)
 *   load     overlying mass, kg/m²
 *   strength bond shear strength, kPa
 *   shear    slope-parallel shear stress from the overburden, kPa
 *   normal   slope-normal stress, kPa
 *   S        stability index (strength + friction·normal) / shear; Infinity with no load
 */
export function interfaces(stack, slopeDeg = 0, m = MECH) {
  const out = [];
  const L = stack.layers;
  const psi = (slopeDeg * Math.PI) / 180;
  const total = L.reduce((a, l) => a + l.swe + l.lwc, 0);
  let z = 0, below = 0;
  for (let i = 1; i < L.length; i++) {
    z += L[i - 1].thick; below += L[i - 1].swe + L[i - 1].lwc;
    const load = total - below;
    const sigmaV = (load * G) / 1000;
    const shear = sigmaV * Math.sin(psi) * Math.cos(psi);
    const normal = sigmaV * Math.cos(psi) ** 2;
    const strength = bondStrength(L[i], L[i - 1], stack.t, m);
    const S = shear > 0 ? (strength + friction(strength, m) * normal) / shear : Infinity;
    out.push({ index: i, z, load, strength, shear, normal, S, upper: L[i], lower: L[i - 1] });
  }
  return out;
}

/** Fraction of a load applied at height `from` that reaches height `to` (to < from): hard snow transmits, soft snow soaks. */
function transmission(stack, from, to) {
  let f = 1, z = 0;
  for (const l of stack.layers) {
    const z0 = z, z1 = z + l.thick; z = z1;
    const lo = Math.max(z0, to), hi = Math.min(z1, from);
    if (hi > lo) f *= Math.exp(-(hi - lo) / (0.15 * hardness(l) ** 2));
  }
  return f;
}

function pick(cands) {
  let best = null;
  for (const c of cands) if (!best || c.ratio > best.ratio) best = c;
  return best && best.ratio >= 1 ? best : null;
}

function evaluate(stack, ifaces, extraShear, m) {
  return ifaces.map((f) => {
    const shear = f.shear + extraShear(f);
    const resist = f.strength + friction(f.strength, m) * f.normal;
    return { ...f, shear, resist, ratio: shear / resist };
  });
}

/** Push sideways on the column at height h (m) with shear pressure kPa. */
export function sidePush(stack, h, kPa, slopeDeg = 0, m = MECH) {
  const cands = evaluate(stack, interfaces(stack, slopeDeg, m).filter((f) => f.z < h), (f) => kPa * transmission(stack, h, f.z), m);
  return { failed: pick(cands), candidates: cands };
}

/** Tap the top of the column with a vertical pressure kPa: a compression test. */
export function topTap(stack, kPa, slopeDeg = 0, m = MECH) {
  const H = stack.layers.reduce((a, l) => a + l.thick, 0);
  const cands = evaluate(stack, interfaces(stack, slopeDeg, m), (f) => kPa * transmission(stack, H, f.z) * Math.exp(-(H - f.z) / 0.5), m);
  return { failed: pick(cands), candidates: cands };
}

/** Tilt the column to a slope angle with no other load. */
export function tilt(stack, slopeDeg, m = MECH) {
  const cands = evaluate(stack, interfaces(stack, slopeDeg, m), () => 0, m);
  return { failed: pick(cands), candidates: cands };
}

export { rho };
