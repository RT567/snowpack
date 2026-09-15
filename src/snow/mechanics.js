// What breaks when you load the column. Pure functions over a stack snapshot.
//
// Every interface between two layers has a bond strength (kPa) from the grain types either side,
// how long they have been in contact, and whether they are wet. Loads reach an interface after being
// transmitted through the slab above it: hard snow passes force on, soft snow soaks it up.
// The interface with the highest load/strength ratio fails if that ratio reaches 1.
import { hardness } from './grains.js';
import { rho } from './model.js';
import { HOUR } from '../weather/record.js';

const G = 9.81;

export const MECH = {
  // base shear strength by grain type, kPa (dry)
  base: { SH: 0.4, DH: 0.6, FC: 0.9, PP: 0.8, DF: 1.2, RG: 2.5, MF: 2.0, IF: 2.5 },
  wetMF: 0.7,
  wetFactor: 0.5,           // either side holding liquid water
  contrastStep: 2,          // hand hardness difference that counts as a contrast
  contrastFactor: 0.7,
  sinterPerDay: 0.2,        // non-persistent grains strengthen fast after burial
  sinterMax: 3,
  persistentSinterPerDay: 0.03,
  persistentSinterMax: 1.5,
  friction: 0.3,            // strength gained per kPa of normal stress
  // transmission length (m) of load through a layer, by hand hardness index 1..6
  transmitLength: (h) => 0.15 * h * h,   // F: 15 cm, 4F: 60 cm, 1F: 1.35 m, P and harder: effectively rigid
  tapSpread: 0.5,           // m, geometric decay scale for a tap from the top
};

export function isPersistent(g) { return g === 'SH' || g === 'FC' || g === 'DH'; }

/** Shear strength (kPa) of the bond between an upper and a lower layer at time t. */
export function bondStrength(upper, lower, t, m = MECH) {
  const b = (l) => (l.grain === 'MF' && l.lwc > 0 ? m.wetMF : m.base[l.grain]);
  let s = Math.min(b(upper), b(lower));
  const persistent = isPersistent(upper.grain) || isPersistent(lower.grain);
  const days = Math.max(0, (t - upper.born) / (24 * HOUR));
  s *= persistent
    ? Math.min(m.persistentSinterMax, 1 + m.persistentSinterPerDay * days)
    : Math.min(m.sinterMax, 1 + m.sinterPerDay * days);
  if (upper.lwc > 0 || lower.lwc > 0) s *= m.wetFactor;
  if (Math.abs(hardness(upper) - hardness(lower)) >= m.contrastStep) s *= m.contrastFactor;
  return s;
}

/**
 * Describe every interface of a stack (index i means between layers[i-1] below and layers[i] above).
 * z: height above ground (m); load: overlying mass (kg/m²); strength: bond shear strength (kPa).
 */
export function interfaces(stack, m = MECH) {
  const out = [];
  const L = stack.layers;
  const total = L.reduce((a, l) => a + l.swe + l.lwc, 0);
  let z = 0, below = 0;
  for (let i = 1; i < L.length; i++) {
    z += L[i - 1].thick; below += L[i - 1].swe + L[i - 1].lwc;
    out.push({ index: i, z, load: total - below, strength: bondStrength(L[i], L[i - 1], stack.t, m), upper: L[i], lower: L[i - 1] });
  }
  return out;
}

/** Fraction of a load applied at height `from` that reaches height `to` (to < from). */
function transmission(stack, from, to, m) {
  let f = 1, z = 0;
  for (const l of stack.layers) {
    const z0 = z, z1 = z + l.thick; z = z1;
    const lo = Math.max(z0, to), hi = Math.min(z1, from);
    if (hi > lo) f *= Math.exp(-(hi - lo) / m.transmitLength(hardness(l)));
  }
  return f;
}

function pick(cands) {
  let best = null;
  for (const c of cands) if (!best || c.ratio > best.ratio) best = c;
  return best && best.ratio >= 1 ? best : null;
}

function evaluate(stack, ifaces, shearAt, slopeDeg, m) {
  const psi = (slopeDeg * Math.PI) / 180;
  return ifaces.map((f) => {
    const w = (f.load * G) / 1000; // kPa of overburden weight
    const shear = shearAt(f) + w * Math.sin(psi) * Math.cos(psi);
    const normal = w * Math.cos(psi) ** 2;
    const strength = f.strength + m.friction * normal;
    return { ...f, shear, strength, ratio: shear / strength };
  });
}

/** Push sideways on the column at height h (m) with shear pressure kPa. Returns the failing interface or null, plus all candidates. */
export function sidePush(stack, h, kPa, slopeDeg = 0, m = MECH) {
  const cands = evaluate(stack, interfaces(stack, m).filter((f) => f.z < h), (f) => kPa * transmission(stack, h, f.z, m), slopeDeg, m);
  return { failed: pick(cands), candidates: cands };
}

/** Tap the top of the column with a vertical pressure kPa: a compression test. */
export function topTap(stack, kPa, slopeDeg = 0, m = MECH) {
  const H = stack.layers.reduce((a, l) => a + l.thick, 0);
  const cands = evaluate(stack, interfaces(stack, m), (f) => kPa * transmission(stack, H, f.z, m) * Math.exp(-(H - f.z) / m.tapSpread), slopeDeg, m);
  return { failed: pick(cands), candidates: cands };
}

/** Tilt the column to a slope angle with no other load. */
export function tilt(stack, slopeDeg, m = MECH) {
  const cands = evaluate(stack, interfaces(stack, m), () => 0, slopeDeg, m);
  return { failed: pick(cands), candidates: cands };
}

export { rho };
