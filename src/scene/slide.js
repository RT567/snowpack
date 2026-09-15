// The release: the slab above a failed interface breaks into chunks and slides off the column.
import * as THREE from 'three';
import { COLUMN_W, COLUMN_D } from './stage.js';

const G = 9.81;

/**
 * Animate the slab (meshes from a failed interface upward) leaving the column in `dir` (unit xz vector).
 * `mode` 'push' shears the slab away; 'tap' collapses it a little first, then it slides out.
 * Returns a promise resolving when all chunks are gone. The original meshes are hidden immediately.
 */
export function releaseSlab(scene, slabMeshes, dir, mode = 'push') {
  if (!slabMeshes.length) return Promise.resolve();
  const group = new THREE.Group();
  scene.add(group);
  for (const m of slabMeshes) m.visible = false;

  const bottom = Math.min(...slabMeshes.map((m) => m.userData.bottom));
  const top = Math.max(...slabMeshes.map((m) => m.userData.top));
  const n = 2 + Math.floor(Math.random() * 3);
  const cuts = [-COLUMN_W / 2];
  for (let i = 1; i < n; i++) cuts.push(-COLUMN_W / 2 + (COLUMN_W * i) / n + (Math.random() - 0.5) * (COLUMN_W / n) * 0.5);
  cuts.push(COLUMN_W / 2);

  const across = new THREE.Vector3(-dir.z, 0, dir.x); // tumble axis, perpendicular to travel
  const chunks = [];
  for (let c = 0; c < n; c++) {
    const x0 = cuts[c], x1 = cuts[c + 1];
    const pivot = new THREE.Group();
    // pivot at the bottom leading edge of the chunk so it can tip over the edge
    pivot.position.set((x0 + x1) / 2, bottom, 0);
    for (const m of slabMeshes) {
      const geo = new THREE.BoxGeometry(x1 - x0, m.geometry.parameters.height, m.geometry.parameters.depth);
      const piece = new THREE.Mesh(geo, (Array.isArray(m.material) ? m.material[0] : m.material).clone());
      piece.castShadow = true;
      piece.position.set(0, m.position.y - bottom, m.position.z);
      pivot.add(piece);
    }
    group.add(pivot);
    chunks.push({ pivot, delay: Math.random() * 0.12, v: 0, s: 0, ang: 0, vy: 0, y: 0, done: false, drop: 0, landed: null });
  }

  const slabH = top - bottom;
  const edge = mode === 'tap' ? COLUMN_D * 0.45 : COLUMN_D * 0.55; // travel before the chunk clears the column
  const accel = mode === 'tap' ? 0.55 : 0.8; // gentle: the point is to watch it go
  const restSeconds = 2.5; // how long the debris lies there before fading
  const fadeSeconds = 1.2;

  return new Promise((resolve) => {
    let last = performance.now();
    let collapsed = mode !== 'tap' ? 1 : 0;
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      let alive = 0;
      for (const ch of chunks) {
        if (ch.done) continue;
        ch.delay -= dt;
        if (ch.delay > 0) { alive++; continue; }
        if (ch.landed == null) {
          if (collapsed < 1) { collapsed = Math.min(1, collapsed + dt * 6); ch.drop = -0.012 * collapsed; }
          ch.v += accel * dt; ch.s += ch.v * dt;
          if (ch.s > edge) {
            // past the edge: tip forward and fall
            const over = ch.s - edge;
            ch.ang = Math.min(Math.PI / 2, ch.ang + (1.4 + over * 3) * dt);
            ch.vy += G * dt * 0.5; ch.y -= ch.vy * dt;
          }
          // the leading bottom edge reaches the ground: land, keep the tilt, come to rest
          const lowest = bottom + ch.y + ch.drop - Math.sin(ch.ang) * Math.min(slabH, COLUMN_D);
          if (lowest <= 0.002 && ch.s > edge) { ch.landed = now; ch.y -= lowest - 0.002; }
        } else {
          ch.v *= 0.85; ch.s += ch.v * dt; // skid to a stop
        }
        ch.pivot.position.set(ch.pivot.userData.x0 ?? (ch.pivot.userData.x0 = ch.pivot.position.x), bottom + ch.y + ch.drop, 0);
        ch.pivot.position.addScaledVector(dir, ch.s);
        ch.pivot.quaternion.setFromAxisAngle(across, mode === 'tap' ? ch.ang : -ch.ang);
        if (ch.landed != null) {
          const rest = (now - ch.landed) / 1000;
          const fade = Math.max(0, Math.min(1, 1 - (rest - restSeconds) / fadeSeconds));
          for (const p of ch.pivot.children) { p.material.transparent = fade < 1; p.material.opacity = fade; }
          if (fade <= 0) { ch.done = true; ch.pivot.visible = false; continue; }
        }
        alive++;
      }
      if (alive > 0) requestAnimationFrame(tick);
      else { scene.remove(group); group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); resolve(); }
    };
    requestAnimationFrame(tick);
  });
}
