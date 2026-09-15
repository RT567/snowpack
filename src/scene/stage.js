// Renderer, camera, lights, orbit, and the white snow surface the column is cut out of.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { tween, ease } from './tween.js';

export const COLUMN_W = 0.9;  // m, across (x)
export const COLUMN_D = 0.3;  // m, front to back (z)
const FIELD = 12;             // m, extent of the surrounding snow surface

export function createStage(canvasParent = document.body) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvasParent.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#eef1f4');
  scene.fog = new THREE.Fog('#eef1f4', 4, 12);

  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 60);
  camera.position.set(0, 4.5, 0.6);
  camera.lookAt(0, 0, 0);

  const hemi = new THREE.HemisphereLight('#ffffff', '#c9d2dc', 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e6', 2.2);
  sun.position.set(2.5, 4, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 12;
  sun.shadow.camera.left = -2; sun.shadow.camera.right = 2; sun.shadow.camera.top = 2; sun.shadow.camera.bottom = -2;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  // ground beneath the column (visible once the surroundings are cut away)
  // the stage floor is the background colour (unlit) so there is no horizon; shadows land on a
  // separate shadow-only plane
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(FIELD * 3, FIELD * 3), new THREE.MeshBasicMaterial({ color: '#eef1f4' }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.002;
  scene.add(ground);
  const shadows = new THREE.Mesh(new THREE.PlaneGeometry(FIELD, FIELD), new THREE.ShadowMaterial({ opacity: 0.14 }));
  shadows.rotation.x = -Math.PI / 2; shadows.position.y = -0.001; shadows.receiveShadow = true;
  scene.add(shadows);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.enablePan = false; controls.enabled = false;
  controls.minDistance = 0.6; controls.maxDistance = 6;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, controls, sun };
}

/**
 * The four blocks of undisturbed snow around the column footprint, at height H. Clicking cuts them
 * away one by one (front, right, back, left).
 */
export function createSurroundings(scene, H) {
  const mat = () => new THREE.MeshStandardMaterial({ color: '#fbfcfd', roughness: 1, transparent: true });
  const h = Math.max(H, 0.02);
  const half = FIELD / 2;
  const defs = [
    { name: 'front', size: [FIELD, h, half - COLUMN_D / 2], pos: [0, h / 2, COLUMN_D / 2 + (half - COLUMN_D / 2) / 2], edge: { from: [-COLUMN_W / 2, COLUMN_D / 2], to: [COLUMN_W / 2, COLUMN_D / 2] }, away: [0, 0, 1] },
    { name: 'right', size: [half - COLUMN_W / 2, h, COLUMN_D], pos: [COLUMN_W / 2 + (half - COLUMN_W / 2) / 2, h / 2, 0], edge: { from: [COLUMN_W / 2, COLUMN_D / 2], to: [COLUMN_W / 2, -COLUMN_D / 2] }, away: [1, 0, 0] },
    { name: 'back', size: [FIELD, h, half - COLUMN_D / 2], pos: [0, h / 2, -COLUMN_D / 2 - (half - COLUMN_D / 2) / 2], edge: { from: [COLUMN_W / 2, -COLUMN_D / 2], to: [-COLUMN_W / 2, -COLUMN_D / 2] }, away: [0, 0, -1] },
    { name: 'left', size: [half - COLUMN_W / 2, h, COLUMN_D], pos: [-COLUMN_W / 2 - (half - COLUMN_W / 2) / 2, h / 2, 0], edge: { from: [-COLUMN_W / 2, -COLUMN_D / 2], to: [-COLUMN_W / 2, COLUMN_D / 2] }, away: [-1, 0, 0] },
  ];
  const group = new THREE.Group();
  const blocks = defs.map((d) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...d.size), mat());
    m.position.set(...d.pos); m.receiveShadow = true; m.castShadow = false; m.userData = d;
    group.add(m);
    return m;
  });
  scene.add(group);
  let next = 0;
  return {
    group,
    remaining: () => blocks.length - next,
    /** Cut the next wall: a dark cut line appears, then the block drops away. */
    async cut() {
      if (next >= blocks.length) return false;
      const m = blocks[next++];
      const d = m.userData;
      const line = cutLine(d.edge, h);
      group.add(line);
      await tween(180, (p) => { line.scale.set(1, 1, 1); line.material.opacity = p; }, ease.out);
      const start = m.position.clone();
      await tween(650, (p) => {
        m.position.y = start.y - p * (h + 0.4);
        m.position.x = start.x + d.away[0] * p * 0.35;
        m.position.z = start.z + d.away[2] * p * 0.35;
        m.material.opacity = 1 - p;
        line.material.opacity = 1 - p;
      }, ease.in);
      group.remove(m); group.remove(line);
      return next >= blocks.length;
    },
    dispose() { scene.remove(group); },
  };
}

function cutLine(edge, h) {
  const [x0, z0] = edge.from, [x1, z1] = edge.to;
  const len = Math.hypot(x1 - x0, z1 - z0);
  const g = new THREE.PlaneGeometry(len, 0.012);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#59616b', transparent: true, opacity: 0 }));
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = -Math.atan2(z1 - z0, x1 - x0);
  m.position.set((x0 + x1) / 2, h + 0.002, (z0 + z1) / 2);
  return m;
}

/** Fly the camera to the standard viewing position for a column of height H. */
export function flyToColumn(camera, controls, H, ms = 1400) {
  const from = camera.position.clone();
  const target0 = controls.target.clone();
  // oblique from the front-right so a slab pushed away is seen leaving past the column's far end
  const to = new THREE.Vector3(1.75 + H * 1.1, Math.max(0.3, H * 0.6 + 0.25), 0.7 + H * 0.7);
  const target1 = new THREE.Vector3(0, Math.max(0.1, H / 2), 0);
  return tween(ms, (p) => {
    camera.position.lerpVectors(from, to, p);
    controls.target.lerpVectors(target0, target1, p);
    camera.lookAt(controls.target);
  }).then(() => { controls.enabled = true; controls.update(); });
}
