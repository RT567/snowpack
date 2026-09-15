// Scale references: a snow stake with 10 cm bands and a low-poly skier on the slope.
import * as THREE from 'three';
import { slopeY, SLOPE, COLUMN_W } from './geometry.js';

const matte = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0 });

/** A canvas-text sprite, height in metres. */
function label(text, heightM = 0.09) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, c.width, c.height);
  g.font = 'bold 84px ui-sans-serif, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.strokeText(text, 128, 64);
  g.fillStyle = '#2b3138'; g.fillText(text, 128, 64);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(heightM * 2, heightM, 1);
  return s;
}

/** A 2.5 m snow stake: alternating red and white 10 cm bands, a number every 50 cm. */
export function makeStake(x = COLUMN_W / 2 + 0.1, z = COLUMN_W / 2 + 0.1, height = 2.5) {
  const g = new THREE.Group();
  const base = slopeY(x);
  const red = matte('#c8323c'), white = matte('#f4f6f8');
  for (let i = 0; i < Math.round(height / 0.1); i++) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.1, 0.035), i % 2 ? red : white);
    band.position.set(x, base + i * 0.1 + 0.05, z);
    band.castShadow = true;
    g.add(band);
  }
  for (let cm = 50; cm <= height * 100; cm += 50) {
    const l = label(String(cm));
    l.position.set(x + 0.12, base + cm / 100, z);
    g.add(l);
  }
  return g;
}

/** A low-poly skier, ~1.75 m, standing on the slope at (x, z) facing across it. */
export function makeSkier(x = 1.3, z = 0.55) {
  const g = new THREE.Group();
  const jacket = matte('#d9542b'), pants = matte('#2b3a4a'), skin = matte('#e8c4a8'), dark = matte('#22262b'), ski = matte('#f2c14e');
  const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = true; g.add(m); return m; };
  // skis lie on the slope, pointing across it (along z), boots on top
  const skis = new THREE.Group();
  for (const dx of [-0.11, 0.11]) skis.add(add(new THREE.BoxGeometry(0.09, 0.02, 1.7), ski, dx, 0.01, 0));
  skis.rotation.z = -SLOPE;
  g.add(skis);
  const y0 = 0.03;
  for (const dx of [-0.11, 0.11]) {
    add(new THREE.BoxGeometry(0.12, 0.3, 0.3), dark, dx, y0 + 0.15, 0);                 // boot
    add(new THREE.CylinderGeometry(0.075, 0.09, 0.55, 8), pants, dx, y0 + 0.3 + 0.275, 0); // leg
  }
  add(new THREE.CylinderGeometry(0.17, 0.2, 0.55, 8), jacket, 0, y0 + 0.85 + 0.275, 0);     // torso
  add(new THREE.SphereGeometry(0.12, 12, 10), skin, 0, y0 + 1.4 + 0.12, 0);               // head
  add(new THREE.SphereGeometry(0.13, 12, 10), dark, 0, y0 + 1.4 + 0.17, 0).scale.set(1, 0.6, 1); // helmet
  for (const dx of [-0.26, 0.26]) {
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), jacket, dx, y0 + 0.85 + 0.35, 0.05).rotation.x = 0.3; // arm
    add(new THREE.CylinderGeometry(0.008, 0.008, 1.2, 6), dark, dx + Math.sign(dx) * 0.08, y0 + 0.6, 0.35);   // pole
  }
  g.position.set(x, slopeY(x), z);
  g.rotation.y = 0.35; // face the viewer, turned a little toward the column
  return g;
}
