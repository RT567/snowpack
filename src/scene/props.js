// Scale reference: a snow stake with 10 cm bands beside the column.
import * as THREE from 'three';
import { slopeY, COLUMN_W } from './geometry.js';

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
export function makeStake(x = 0, z = COLUMN_W / 2 + 0.12, height = 2.5) {
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
