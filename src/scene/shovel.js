// The shovel that appears over the top of the column: winds up while you hold, slaps on release.
import * as THREE from 'three';

export class Shovel {
  constructor(scene) {
    this.root = new THREE.Group(); // the hand: pivot for the wind-up
    this.arm = new THREE.Group();
    const handleMat = new THREE.MeshStandardMaterial({ color: '#3b3f45', roughness: 0.7 });
    const bladeMat = new THREE.MeshStandardMaterial({ color: '#c9cfd6', roughness: 0.35, metalness: 0.5 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 12), handleMat);
    handle.position.y = -0.31;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.17), bladeMat);
    blade.position.y = -0.63;
    const grip = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 8, 20), handleMat);
    grip.rotation.y = Math.PI / 2; grip.position.y = 0.03;
    for (const m of [handle, blade, grip]) { m.castShadow = true; this.arm.add(m); }
    this.root.add(this.arm);
    this.root.visible = false;
    scene.add(this.root);
    this.angle = 0;      // wind-up, radians (0 = blade flat on the snow)
    this.charge = 0;     // 0..1
    this.state = 'idle'; // idle | charging | slapping
    this.hover = 0.06;   // resting height of the blade above the snow
  }

  /** Place the hand above the column at (x, z) for a surface at height H. */
  place(x, z, H) {
    this.root.position.set(x, H + 0.63 + this.hover, z);
  }

  show(v) { this.root.visible = v; }

  startCharge() { this.state = 'charging'; this.t0 = performance.now(); }

  /** Release: returns the charge (0..1) and animates the slap. Resolves when the blade lands. */
  release() {
    const charge = this.charge;
    this.state = 'slapping';
    const from = this.angle;
    const ms = 90 + 60 * (1 - charge);
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / ms);
        this.angle = from * (1 - p * p);
        this.hover = 0.06 * (1 - p);
        if (p < 1) requestAnimationFrame(step);
        else { this.state = 'recover'; this.recoverT0 = now; resolve(charge); }
      };
      requestAnimationFrame(step);
    });
  }

  update(now) {
    if (this.state === 'charging') {
      const held = (now - this.t0) / 1000;
      this.charge = Math.min(1, held / 1.4);
      this.angle = (Math.PI / 2) * this.charge;
    } else if (this.state === 'recover') {
      const p = Math.min(1, (now - this.recoverT0) / 350);
      this.hover = 0.06 * p;
      if (p >= 1) { this.state = 'idle'; this.charge = 0; }
    } else if (this.state === 'idle') {
      this.angle *= 0.8;
    }
    // wind up: rotate the arm back about the hand, lifting the blade
    this.arm.rotation.x = -this.angle;
    this.root.position.y += 0; // (position set by place())
  }
}
