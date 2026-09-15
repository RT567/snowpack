// Build the 3D column from a snapshot: one sheared box per layer, coloured by how weak its bond is,
// a red seam at every boundary, and height readings printed on the uphill back edge.
import * as THREE from 'three';
import { GRAIN, hardness } from '../snow/grains.js';
import { rho } from '../snow/model.js';
import { interfaces, MECH, layerStrength } from '../snow/mechanics.js';
import { DEFAULT_PARAMS } from '../snow/params.js';
import { SLOPE_DEG } from './geometry.js';
import { COLUMN_W, layerGeometry, vertical, TAN, slopeY } from './geometry.js';

const MIN_VISUAL = 0.004; // m, so ice lenses and hoar stay visible
const HILITE = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95 });

const SNOW_TOP = new THREE.MeshStandardMaterial({ color: '#f7f8f9', roughness: 1, transparent: true, opacity: 0.85, depthWrite: false });

// ---- the look ----------------------------------------------------------------------------------
// The snow is snow: translucent white, a little greyer when wet, bluer and clearer for crusts and
// ice. The meaning lives in the seams between layers, coloured by the stability index of the bond:
// (strength + friction × normal load) / shear load on the slope. Red is at or below the measured
// unstable transition, green comfortably above it (research/slab-mechanics-for-simulation.md).
const BAD = new THREE.Color('#e0453f'), MIDC = new THREE.Color('#e6c144'), GOOD = new THREE.Color('#3fc276');

export function stabilityColour(S) {
  const lo = MECH.unstableS, hi = MECH.stableS;
  const t = Math.max(0, Math.min(1, (Math.log(Math.max(S, 1e-3)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))));
  return t < 0.5 ? BAD.clone().lerp(MIDC, t * 2) : MIDC.clone().lerp(GOOD, (t - 0.5) * 2);
}
export const strengthColour = stabilityColour; // name kept for callers

export function stabilityWord(S) {
  return S < MECH.unstableS ? 'unstable' : S < MECH.marginalS ? 'marginal' : S < MECH.stableS ? 'fair' : 'stable';
}
export function strengthWord(kPa) {
  return kPa < MECH.weakKPa ? 'weak' : kPa < MECH.moderateKPa ? 'moderate' : 'strong';
}

export function isCrust(layer) {
  return layer.grain === 'IF' || layer.rime || (layer.grain === 'MF' && layer.lwc === 0 && rho(layer) >= DEFAULT_PARAMS.crustDisplayRho);
}

const LOOK = {
  dry: { colour: '#f4f6f8', roughness: 0.95, opacity: 0.72 },
  wet: { colour: '#dfe5ea', roughness: 0.6, opacity: 0.72 },
  crust: { colour: '#cfe0ee', roughness: 0.35, opacity: 0.55 },
  ice: { colour: '#b9d3ea', roughness: 0.2, opacity: 0.42 },
};
const materialCache = new Map();

/** Material for a layer: translucent snow, wet snow greyer, crusts and ice bluer and clearer. */
export function layerMaterial(layer) {
  const key = layer.grain === 'IF' ? 'ice' : isCrust(layer) ? 'crust' : layer.lwc > 0 ? 'wet' : 'dry';
  if (materialCache.has(key)) return materialCache.get(key);
  const l = LOOK[key];
  // no depth write: the tinted boundary planes inside must stay visible whatever the draw order
  const m = new THREE.MeshStandardMaterial({ color: l.colour, roughness: l.roughness, metalness: 0, transparent: true, opacity: l.opacity, depthWrite: false });
  materialCache.set(key, m);
  return m;
}

/** The interface below each layer (with strength, loads and stability index); the ground for layer 0. */
export function layerBonds(snapshot) {
  const ifaces = interfaces(snapshot, SLOPE_DEG);
  return snapshot.layers.map((l, i) => (i === 0
    ? { strength: layerStrength(l, snapshot.t), S: Infinity, shear: 0, normal: 0, load: 0, ground: true }
    : ifaces[i - 1]));
}

// ---- seams and height readings ------------------------------------------------------------

const lineCache = new Map();
const sKey = (S) => (Number.isFinite(S) ? Math.round(Math.min(S, 20) * 10) : 'inf');
function lineMaterial(S) {
  const key = sKey(S);
  if (!lineCache.has(key)) lineCache.set(key, new THREE.LineBasicMaterial({ color: stabilityColour(S) }));
  return lineCache.get(key);
}

/** The boundary face of a layer (its top or bottom), tinted with the bond colour and see-through. */
const planeCache = new Map();
function faceMaterial(S) {
  const key = sKey(S);
  if (!planeCache.has(key)) {
    const c = stabilityColour(S).lerp(new THREE.Color('#ffffff'), 0.25);
    planeCache.set(key, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  }
  return planeCache.get(key);
}

/** A thin line around the column at the tilted boundary whose height at x = 0 is `y`, in the bond colour. */
function seam(y, S) {
  const h = (COLUMN_W / 2) * 1.002;
  const pts = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, z]) => new THREE.Vector3(x, y - TAN * x, z));
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), lineMaterial(S));
}

/**
 * Height readings printed on the snow: a texture strip on the +z wall along the uphill back edge
 * (x = −W/2), a tick every 10 cm, a number every 50 cm, the total just under the top. The strip is
 * sheared like the layers; the drawing is pre-sheared the other way so ticks come out horizontal and
 * numbers upright on the wall. Heights are vertical from the ground at that edge.
 */
const STRIP_W = 0.17;
const PPM = 1400; // canvas pixels per metre
function scaleMarks(H) {
  const g = new THREE.Group();
  if (H < 0.02) return g;
  const x0 = -COLUMN_W / 2, z = COLUMN_W / 2 + 0.0012, base = slopeY(x0);
  const c = document.createElement('canvas');
  c.width = Math.round(STRIP_W * PPM); c.height = Math.max(8, Math.round(H * PPM));
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.setTransform(1, -TAN, 0, 1, 0, 0); // undo the geometry shear: world-horizontal stays horizontal
  const yOf = (h) => (H - h) * PPM;      // canvas row of a world height h (before the transform)
  ctx.strokeStyle = 'rgba(58,64,72,0.55)'; ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(58,64,72,0.7)';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const font = (m) => `600 ${Math.round(m * PPM)}px ui-sans-serif, system-ui, sans-serif`;
  const cmTop = Math.floor(H * 100 + 1e-6);
  // the wall's top edge sits lower the further right you go (the tilt); keep text under it
  const clear = (xEnd) => TAN * xEnd + 0.012;
  for (let cm = 10; cm <= cmTop; cm += 10) {
    const h = cm / 100, major = cm % 50 === 0, len = (major ? 0.03 : 0.018) * PPM;
    ctx.beginPath(); ctx.moveTo(0.004 * PPM, yOf(h)); ctx.lineTo(0.004 * PPM + len, yOf(h)); ctx.stroke();
    if (H - h > clear(0.09)) { ctx.font = font(major ? 0.026 : 0.02); ctx.fillText(String(cm), 0.004 * PPM + len + 0.006 * PPM, yOf(h)); }
  }

  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8; tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(STRIP_W, H);
  geo.translate(STRIP_W / 2, H / 2, 0); // hinge on the left edge
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) - TAN * pos.getX(i));
  pos.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const strip = new THREE.Mesh(geo, mat);
  strip.position.set(x0, base, z);
  strip.renderOrder = 4; // after the translucent walls, or they wash it out
  g.add(strip);
  return g;
}

/** The total depth printed flat on the middle of the top surface, tilted with it. */
function topLabel(H) {
  const w = 0.22, h = 0.09;
  const c = document.createElement('canvas'); c.width = 512; c.height = 210;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.font = '600 120px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(58,64,72,0.75)'; ctx.fillText(`${Math.round(H * 100)} cm`, 256, 105);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8; tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(w, h);
  geo.rotateX(-Math.PI / 2);             // lie flat, readable from +z
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 4;
  m.rotation.y = Math.PI / 2;            // static: reads left to right for someone standing downhill looking up
  const tilt = new THREE.Group();        // tilted with the top surface (descending toward +x)
  tilt.rotation.z = -Math.atan(TAN);
  tilt.position.set(0, H + 0.0015, 0);
  tilt.add(m);
  tilt.userData.label = m;
  return tilt;
}

// ---- the column -----------------------------------------------------------------------------

export class Column {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.position.y = 0.002; // a hair above the ground so the base never fights the terrain
    scene.add(this.group);
    this.meshes = [];
    this.seams = [];
    this.marks = null;
    this.snapshot = null;
    this.strengths = [];
    this.hilite = null;
  }

  /** Outline what is hovered: the edges of a layer, or the seam of a boundary. Pass null to clear. */
  highlight(what) {
    if (this.hilite) { this.group.remove(this.hilite); this.hilite.geometry.dispose(); if (this.hilite.userData.ownMaterial) this.hilite.material.dispose(); this.hilite = null; }
    if (!what) return;
    if (what.kind === 'layer') {
      const mesh = this.meshes.find((m) => m.userData.layer === what.layer);
      if (!mesh) return;
      this.hilite = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), HILITE);
      this.hilite.position.copy(mesh.position);
      this.hilite.scale.setScalar(1.004);
    } else {
      // the boundary plane goes solid in its bond colour
      const plane = new THREE.PlaneGeometry(COLUMN_W * 1.002, COLUMN_W * 1.002);
      plane.rotateX(-Math.PI / 2);
      const pp = plane.attributes.position;
      for (let i = 0; i < pp.count; i++) pp.setY(i, pp.getY(i) - TAN * pp.getX(i));
      pp.needsUpdate = true;
      // transparent flag with full opacity: drawn in the transparent pass, last, so nothing mutes it
      const mat = new THREE.MeshBasicMaterial({ color: stabilityColour(what.bond.S), side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      this.hilite = new THREE.Mesh(plane, mat);
      this.hilite.position.set(0, what.y, 0);
      this.hilite.renderOrder = 3;
      this.hilite.userData.ownMaterial = true;
    }
    this.group.add(this.hilite);
  }

  /** Total height above the base at x = 0 (m, vertical). */
  get height() {
    return this.meshes.reduce((a, m) => Math.max(a, m.userData.top), 0);
  }

  /** Rebuild from a snapshot. Every layer has the same footprint; only height varies. */
  build(snapshot) {
    this.clear();
    this.snapshot = snapshot;
    this.bonds = layerBonds(snapshot);
    this.strengths = this.bonds.map((b) => b.strength);
    let y = 0; // vertical height of the layer bottom at x = 0
    const n = snapshot.layers.length;
    snapshot.layers.forEach((layer, i) => {
      const t = Math.max(layer.thick, MIN_VISUAL);
      const tv = vertical(t);
      const geo = layerGeometry(COLUMN_W, t);
      const side = layerMaterial(layer);
      // box faces: +x, −x, top, bottom, +z, −z. The snow surface is white; every other top/bottom face
      // is a boundary and carries the bond colour of that boundary, see-through.
      const topFace = i === n - 1 ? SNOW_TOP : faceMaterial(this.bonds[i + 1].S);
      const bottomFace = i === 0 ? side : faceMaterial(this.bonds[i].S); // the ground is not a boundary
      const mat = [side, side, topFace, bottomFace, side, side];
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, y + tv / 2, 0);
      mesh.renderOrder = 2;
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData = { layer, index: i, bottom: y, top: y + tv, thick: t, strength: this.strengths[i] };
      this.group.add(mesh);
      this.meshes.push(mesh);
      if (i > 0) { const l = seam(y, this.bonds[i].S); this.group.add(l); this.seams.push(l); }
      y += tv;
    });
    this.marks = new THREE.Group();
    this.marks.add(scaleMarks(y));
    this.topLabel = null;
    if (y > 0.05) { this.topLabel = topLabel(y); this.marks.add(this.topLabel); }
    this.group.add(this.marks);
  }



  clear() {
    this.highlight(null);
    for (const m of this.meshes) { this.group.remove(m); m.geometry.dispose(); } // materials are shared
    for (const l of this.seams) { this.group.remove(l); l.geometry.dispose(); }
    if (this.marks) { this.group.remove(this.marks); this.marks.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose?.(); }); this.marks = null; }
    this.meshes = []; this.seams = [];
  }

  /**
   * What is under a hit on the column: either a layer body, or a boundary between two layers when
   * the point is within `tol` (m, vertical) of a seam. Returns { kind: 'layer', mesh } or
   * { kind: 'boundary', upper, lower, strength }.
   */
  /** The boundary below layer index i (i ≥ 1) as a hover descriptor. */
  boundary(i) {
    const L = this.snapshot.layers;
    const m = this.meshes[i];
    return {
      kind: 'boundary', index: i, upper: L[i], lower: L[i - 1], y: m.userData.bottom, bond: this.bonds[i],
      slabAbove: { cm: (this.height - m.userData.bottom) * 100, kg: L.slice(i).reduce((a, l) => a + l.swe + l.lwc, 0) },
    };
  }

  /** Every boundary, ranked weakest first by stability index. */
  weakest() {
    const out = [];
    for (let i = 1; i < this.snapshot.layers.length; i++) out.push(this.boundary(i));
    return out.sort((a, b) => a.bond.S - b.bond.S);
  }

  probe(mesh, heightAboveBase, maxTol = 0.025) {
    const i = mesh.userData.index;
    const L = this.snapshot.layers;
    const dBottom = heightAboveBase - mesh.userData.bottom;
    const dTop = mesh.userData.top - heightAboveBase;
    // a generous band around each seam, but never more than a third of a thin layer
    const tol = Math.min(maxTol, (mesh.userData.top - mesh.userData.bottom) * 0.35);
    if (i > 0 && dBottom < tol && dBottom <= dTop) return this.boundary(i);
    if (i < L.length - 1 && dTop < tol) return this.boundary(i + 1);
    return { kind: 'layer', layer: L[i], bottom: mesh.userData.bottom, top: mesh.userData.top, strength: layerStrength(L[i], this.snapshot.t) };
  }
}

// ---- labels ---------------------------------------------------------------------------------

const fmtDate = (t, tz = 'Australia/Sydney') => new Date(t).toLocaleDateString('en-AU', { timeZone: tz, day: 'numeric', month: 'short' });

/** One-line condition of the snow. */
export function condition(layer) {
  if (layer.lwc > 0) return 'wet';
  if (layer.grain === 'IF') return 'frozen solid';
  if (layer.wetCount > 0) return 'refrozen';
  return 'dry';
}

/** Name for a layer as a kind of snow. */
export function snowName(layer) {
  if (layer.rime) return 'rime crust';
  if (layer.grain === 'MF') return layer.lwc > 0 ? 'wet melt-freeze snow' : isCrust(layer) ? 'melt-freeze crust' : 'refrozen melt-freeze snow';
  if (layer.grain === 'RG' && layer.windPacked) return 'wind slab';
  return GRAIN[layer.grain].name;
}

const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
const sClass = (S) => (S < MECH.unstableS ? 'weak' : S < MECH.stableS ? 'moderate' : 'strong');
const bondCell = (kPa) => `${strengthWord(kPa)} material, ${kPa.toFixed(2)} kPa`;
const stabilityCell = (S, shear) => `<span class="bond-${sClass(S)}">${stabilityWord(S)}</span> (S ${Number.isFinite(S) ? S.toFixed(1) : '∞'})${shear < 0.1 ? ', little load yet' : ''}`;
const cm = (m) => `${(m * 100).toFixed(m < 0.01 ? 1 : 0)} cm`;

/**
 * Panel for a bit of snow. `bottom`/`top` are its vertical heights above the ground (m), `kPa` the
 * strength of its bond to the snow below. Rows are always the same, in the same order.
 */
export function describeLayer(layer, bottom, top, kPa) {
  const notes = [];
  if (layer.storm.rain > 1) notes.push(`rained on (${layer.storm.rain.toFixed(0)} mm)`);
  if (layer.windPacked) notes.push('wind packed while at the surface');
  if (layer.wetCount > 0 && layer.lwc === 0) notes.push(layer.grain === 'IF' ? 'refrozen solid into ice' : `wetted and refrozen ${layer.wetCount}×`);
  if (layer.lwc > 0) notes.push('holding liquid water now');
  if (layer.grain === 'FC' || layer.grain === 'DH') notes.push('persistent weak grains: facets do not bond well');
  if (layer.grain === 'SH') notes.push('feathery crystals grown on a clear calm night, now buried');
  if (layer.observed) notes.push(`adjusted to the observers' report: ${layer.observed}`);
  return `<span class="kind">snow</span><h3>${snowName(layer)}</h3><table>`
    + row('height', `${cm(bottom)} – ${cm(top)}`)
    + row('thickness', cm(top - bottom))
    + row('hardness', hardnessLabel(hardness(layer)))
    + row('density', `${rho(layer).toFixed(0)} kg/m³`)
    + row('condition', condition(layer))
    + row('temperature', `${layer.temp.toFixed(1)} °C`)
    + row(layer.grain === 'SH' ? 'grew' : 'fell', fmtDate(layer.born))
    + (layer.storm.tempMean != null && layer.grain !== 'SH' ? row('fell at', `${layer.storm.tempMean.toFixed(0)} °C`) : '')
    + row('shear strength', `${kPa.toFixed(2)} kPa`)
    + `</table>${notes.length ? `<div class="notes">${notes.join('<br>')}</div>` : ''}`;
}

/**
 * Panel for the boundary where two kinds of snow meet, at vertical height `y` (m). `slabAbove` is
 * the snow sitting on it: { cm, kg } (vertical thickness and mass per m²).
 */
export function describeBoundary(upper, lower, y, bond, slabAbove) {
  const kPa = bond.strength;
  const notes = [];
  const hu = hardness(upper), hl = hardness(lower);
  if (Math.abs(hu - hl) >= MECH.contrastStep) notes.push(hu > hl ? 'harder snow sitting on softer snow' : 'soft snow on a hard bed');
  if (upper.lwc > 0 || lower.lwc > 0) notes.push('wet: bonds are weakest when the snow is holding water');
  if (lower.grain === 'SH' || lower.grain === 'FC' || lower.grain === 'DH') notes.push('a persistent weak layer sits directly below');
  if (lower.grain === 'MF' || lower.grain === 'IF') notes.push('a smooth crust makes a slippery bed surface');
  const exposedDays = Math.max(0, (upper.born - (lower.lastSnow ?? lower.born)) / 86_400_000);
  const ageDays = Math.max(0, (Date.now() - upper.born) / 86_400_000);
  return `<span class="kind">boundary</span><h3>${snowName(upper)} over ${snowName(lower)}</h3><table>`
    + row('height', cm(y))
    + row('stability', stabilityCell(bond.S, bond.shear))
    + row('bond strength', bondCell(kPa))
    + row('shear load', `${bond.shear.toFixed(2)} kPa on ${SLOPE_DEG}°`)
    + row('buried', fmtDate(upper.born))
    + row('exposed for', exposedDays < 1 ? 'under a day' : `${Math.round(exposedDays)} day${exposedDays >= 1.5 ? 's' : ''}`)
    + row('snow above', slabAbove ? `${slabAbove.cm.toFixed(0)} cm · ${slabAbove.kg.toFixed(0)} kg/m²`.replace(' · ', ', ') : '')
    + row('above', snowName(upper))
    + row('below', snowName(lower))
    + `</table>${notes.length ? `<div class="notes">${notes.join('<br>')}</div>` : ''}`;
}

function hardnessLabel(h) {
  const names = ['', 'fist', '4 finger', '1 finger', 'pencil', 'knife', 'ice'];
  return names[Math.max(1, Math.min(6, Math.round(h)))];
}
