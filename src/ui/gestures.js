// Pointer → intents on the column: hover a layer, hover the top (shovel), push a side, tap the top.
import * as THREE from 'three';

export class Gestures {
  /**
   * handlers: { hoverLayer(mesh|null, event), hoverTop(point|null), pushStart(y), pushEnd(),
   *             tapStart(point), tapEnd(), cut() }
   */
  constructor(dom, camera, column, handlers) {
    this.dom = dom; this.camera = camera; this.column = column; this.h = handlers;
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.mode = 'intro'; // intro | idle | pushing | tapping
    this.enabled = false;
    dom.addEventListener('pointermove', (e) => this.onMove(e));
    dom.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    dom.addEventListener('pointerleave', () => { this.h.hoverLayer(null); this.h.hoverTop(null); });
  }

  hit(e) {
    this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hits = this.ray.intersectObjects(this.column.meshes, false);
    if (!hits.length) return null;
    const hit = hits[0];
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    return { mesh: hit.object, point: hit.point, top: n.y > 0.7 && Math.abs(hit.object.userData.top - this.column.height) < 1e-6 };
  }

  onMove(e) {
    if (!this.enabled || this.mode === 'intro') return;
    if (this.mode !== 'idle') return;
    const hit = this.hit(e);
    if (hit?.top) { this.h.hoverTop(hit.point); this.h.hoverLayer(null); this.dom.style.cursor = 'none'; }
    else if (hit) { this.h.hoverTop(null); this.h.hoverLayer(hit.mesh, e); this.dom.style.cursor = 'pointer'; }
    else { this.h.hoverTop(null); this.h.hoverLayer(null); this.dom.style.cursor = ''; }
  }

  onDown(e) {
    if (!this.enabled || e.button !== 0) return;
    if (this.mode === 'intro') { this.h.cut(); return; }
    if (this.mode !== 'idle') return;
    const hit = this.hit(e);
    if (!hit) return;
    e.preventDefault();
    if (hit.top) { this.mode = 'tapping'; this.h.tapStart(hit.point); }
    else { this.mode = 'pushing'; this.h.pushStart(hit.point.y, hit.point); }
  }

  async onUp() {
    if (this.mode === 'pushing') { this.mode = 'busy'; await this.h.pushEnd(); this.mode = 'idle'; }
    else if (this.mode === 'tapping') { this.mode = 'busy'; await this.h.tapEnd(); this.mode = 'idle'; }
  }
}
