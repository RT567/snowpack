// Build the 3D column from a snapshot: one box per layer, coloured by grain, soft layers recessed
// the way a brushed pit wall reveals hardness.
import * as THREE from 'three';
import { GRAIN, hardness } from '../snow/grains.js';
import { rho } from '../snow/model.js';
import { COLUMN_W, COLUMN_D } from './stage.js';

const MIN_VISUAL = 0.004; // m, so ice lenses and hoar stay visible

const white = new THREE.Color('#fbfcfd');
const SNOW_TOP = new THREE.MeshStandardMaterial({ color: '#fbfcfd', roughness: 1 });
const colourCache = new Map();

/** Grain colour softened toward snow white; wet snow a touch darker/greyer. */
export function layerColour(layer) {
  const crust = layer.grain === 'MF' && layer.lwc === 0 && rho(layer) > 400;
  const key = `${layer.grain}:${layer.lwc > 0 ? 'w' : 'd'}:${layer.windPacked ? 'p' : ''}:${crust ? 'c' : ''}`;
  if (colourCache.has(key)) return colourCache.get(key);
  const c = new THREE.Color(GRAIN[layer.grain].colour);
  const mixWhite = layer.grain === 'IF' ? 0.35 : layer.grain === 'SH' ? 0.45 : crust ? 0.45 : layer.grain === 'MF' ? 0.7 : 0.6;
  c.lerp(white, mixWhite);
  if (layer.lwc > 0) c.multiplyScalar(0.86);
  if (layer.windPacked) c.multiplyScalar(0.95);
  colourCache.set(key, c);
  return c;
}

/** How far (0..1 of depth) a layer's front face is recessed: fist-hard snow brushes back the most. */
export function recess(layer) {
  const h = hardness(layer);
  return 0.22 * (1 - (h - 1) / 5);
}

export class Column {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.meshes = [];
    this.snapshot = null;
    this.cutIndex = Infinity; // layers at or above this index have been released
  }

  /** Total visible height (m). */
  get height() {
    return this.meshes.reduce((a, m) => Math.max(a, m.userData.top), 0);
  }

  /**
   * Rebuild from a snapshot; `cutIndex` hides released layers. `brushed` recesses soft layers
   * (off while the column is still buried in the surroundings, so no gaps show from above).
   */
  build(snapshot, cutIndex = Infinity, brushed = true) {
    this.clear();
    this.snapshot = snapshot;
    this.cutIndex = cutIndex;
    this.brushed = brushed;
    let y = 0;
    const visible = snapshot.layers.length ? Math.min(cutIndex, snapshot.layers.length) : 0;
    snapshot.layers.forEach((layer, i) => {
      if (i >= cutIndex) return;
      const t = Math.max(layer.thick, MIN_VISUAL);
      const r = brushed ? recess(layer) : 0;
      const depth = COLUMN_D * (1 - r);
      const geo = new THREE.BoxGeometry(COLUMN_W, t, depth);
      const side = new THREE.MeshStandardMaterial({ color: layerColour(layer), roughness: 0.95, metalness: 0 });
      // the snow surface itself is white: the top face of the top layer (or of an exposed bed surface) is snow, not a colour code
      const mat = i === visible - 1 && i === snapshot.layers.length - 1 ? [side, side, SNOW_TOP, side, side, side] : side;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(0, y + t / 2, -COLUMN_D * r / 2); // back face flush, front recessed
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData = { layer, index: i, bottom: y, top: y + t };
      this.group.add(mesh);
      this.meshes.push(mesh);
      y += t;
    });
  }

  clear() {
    for (const m of this.meshes) { this.group.remove(m); m.geometry.dispose(); (Array.isArray(m.material) ? m.material[0] : m.material).dispose(); }
    this.meshes = [];
  }

  /** Meshes of the layers from `index` upward (the slab that would slide). */
  slabMeshes(index) {
    return this.meshes.filter((m) => m.userData.index >= index);
  }

  /** Height (m) of the interface at layer index (bottom of that layer), on the visual scale. */
  interfaceY(index) {
    const m = this.meshes.find((x) => x.userData.index === index);
    return m ? m.userData.bottom : this.height;
  }
}

/** Tooltip text for a layer at time t. */
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
