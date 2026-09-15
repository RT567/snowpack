// Build the 3D column from a snapshot: one sheared box per layer, coloured by grain, soft layers
// inset the way a brushed pit wall reveals hardness.
import * as THREE from 'three';
import { GRAIN, hardness } from '../snow/grains.js';
import { rho } from '../snow/model.js';
import { COLUMN_W, layerGeometry, vertical, TAN } from './geometry.js';

const SEAM = new THREE.LineBasicMaterial({ color: '#c8323c' });

/** A thin line around the column at the tilted boundary whose height at x = 0 is `y`. */
function seam(y) {
  const h = COLUMN_W / 2 * 1.003; // a hair outside the walls so it is not swallowed
  const pts = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, z]) => new THREE.Vector3(x, y - TAN * x + 0.0005, z));
  return new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), SEAM);
}

const MIN_VISUAL = 0.004; // m, so ice lenses and hoar stay visible

const SNOW_TOP = new THREE.MeshStandardMaterial({ color: '#f7f8f9', roughness: 1 });

// Snow looks like snow: whites and greys. New snow is brightest, old rounded snow a little grey,
// facets and hoar a touch cooler, wet snow darker, and refrozen crusts and ice a greyer, see-through blue.
const LOOK = {
  PP: { colour: '#ffffff', roughness: 1.0 },
  DF: { colour: '#fafbfc', roughness: 1.0 },
  RG: { colour: '#f1f3f5', roughness: 0.95 },
  FC: { colour: '#eceff2', roughness: 0.85 },
  DH: { colour: '#e4e9ee', roughness: 0.8 },
  SH: { colour: '#f5f8fb', roughness: 0.6 },
  MF: { colour: '#eef1f4', roughness: 0.7 },
  MFcrust: { colour: '#d3e0ea', roughness: 0.45, opacity: 0.85 },
  MFwet: { colour: '#e6ebef', roughness: 0.5 },
  IF: { colour: '#bcd3e6', roughness: 0.25, opacity: 0.6 },
};

const materialCache = new Map();

/** Material for a layer: its look plus a small per-layer tone shift so neighbouring layers read apart. */
export function layerMaterial(layer) {
  let key = layer.grain;
  if (layer.grain === 'MF') key = layer.lwc > 0 ? 'MFwet' : rho(layer) > 400 ? 'MFcrust' : 'MF';
  if (layer.windPacked && (key === 'PP' || key === 'DF')) key = 'RG';
  const tone = ((layer.id * 0.618) % 1) - 0.5; // deterministic per layer, −0.5..0.5
  const cacheKey = `${key}:${layer.id}`;
  if (materialCache.has(cacheKey)) return materialCache.get(cacheKey);
  const l = LOOK[key];
  const colour = new THREE.Color(l.colour).offsetHSL(0, 0, tone * 0.05);
  const m = new THREE.MeshStandardMaterial({ color: colour, roughness: l.roughness, metalness: 0 });
  if (l.opacity != null) { m.transparent = true; m.opacity = l.opacity; }
  materialCache.set(cacheKey, m);
  return m;
}

export class Column {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.meshes = [];
    this.seams = [];
    this.snapshot = null;
    this.cutIndex = Infinity; // layers at or above this index have been released
  }

  /** Total height above the base at x = 0 (m, vertical). */
  get height() {
    return this.meshes.reduce((a, m) => Math.max(a, m.userData.top), 0);
  }

  /** Rebuild from a snapshot; `cutIndex` hides released layers. Every layer has the same footprint. */
  build(snapshot, cutIndex = Infinity) {
    this.clear();
    this.snapshot = snapshot;
    this.cutIndex = cutIndex;
    let y = 0; // vertical height of the layer bottom at x = 0
    const visible = snapshot.layers.length ? Math.min(cutIndex, snapshot.layers.length) : 0;
    snapshot.layers.forEach((layer, i) => {
      if (i >= cutIndex) return;
      const t = Math.max(layer.thick, MIN_VISUAL);
      const tv = vertical(t);
      const geo = layerGeometry(COLUMN_W, t);
      const side = layerMaterial(layer);
      // the snow surface itself is white: the top face of the top layer is snow, not a colour code
      const mat = i === visible - 1 && i === snapshot.layers.length - 1 ? [side, side, SNOW_TOP, side, side, side] : side;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, y + tv / 2, 0);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData = { layer, index: i, bottom: y, top: y + tv, thick: t };
      this.group.add(mesh);
      this.meshes.push(mesh);
      if (i > 0) { const l = seam(y); this.group.add(l); this.seams.push(l); }
      y += tv;
    });
  }

  clear() {
    for (const m of this.meshes) { this.group.remove(m); m.geometry.dispose(); } // materials are shared
    for (const l of this.seams) { this.group.remove(l); l.geometry.dispose(); }
    this.meshes = []; this.seams = [];
  }

  /** Meshes of the layers from `index` upward (the slab that would slide). */
  slabMeshes(index) {
    return this.meshes.filter((m) => m.userData.index >= index);
  }

  /** Height (m, vertical at x = 0) of the interface at layer index (bottom of that layer). */
  interfaceY(index) {
    const m = this.meshes.find((x) => x.userData.index === index);
    return m ? m.userData.bottom : this.height;
  }
}

/** Tooltip text for a layer. */
export function describeLayer(layer, tz = 'Australia/Sydney') {
  const fmt = (t) => new Date(t).toLocaleDateString('en-AU', { timeZone: tz, day: 'numeric', month: 'short' });
  const parts = [];
  parts.push(`<b>${GRAIN[layer.grain].name}</b>`);
  parts.push(`${(layer.thick * 100).toFixed(layer.thick < 0.01 ? 1 : 0)} cm`);
  parts.push(hardnessLabel(hardness(layer)));
  parts.push(`${rho(layer).toFixed(0)} kg/m³`);
  const notes = [];
  if (layer.grain === 'SH') notes.push(`hoar grew ${fmt(layer.born)}`);
  else notes.push(`fell ${fmt(layer.born)}`);
  if (layer.storm.rain > 1) notes.push(`rained on (${layer.storm.rain.toFixed(0)} mm)`);
  if (layer.windPacked) notes.push('wind packed');
  if (layer.wetCount > 0 && layer.lwc === 0) notes.push(layer.grain === 'IF' ? 'ice lens' : `refrozen ×${layer.wetCount}`);
  if (layer.lwc > 0) notes.push('wet');
  if (layer.grain === 'FC' || layer.grain === 'DH') notes.push('weak, persistent');
  return `${parts.join(' · ')}<br>${notes.join(' · ')}`;
}

function hardnessLabel(h) {
  const names = ['', 'fist', '4 finger', '1 finger', 'pencil', 'knife', 'ice'];
  return names[Math.max(1, Math.min(6, Math.round(h)))];
}
