// Renderer, camera, lights, orbit, and the low-poly alpine slope the column stands on.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { slopeY, COLUMN_W } from './geometry.js';

const SKY = '#dfe6ec';
const FIELD = 400; // m, extent of the terrain (fog hides the edge, so it reads as endless)

export function createStage(canvasParent = document.body) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvasParent.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 25, 140);

  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 600);

  const hemi = new THREE.HemisphereLight('#ffffff', '#b9bfb4', 2.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff6e8', 1.8);
  sun.position.set(-2.5, 5, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 16;
  sun.shadow.camera.left = -3; sun.shadow.camera.right = 3; sun.shadow.camera.top = 3; sun.shadow.camera.bottom = -3;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  scene.add(makeTerrain());

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 0.5; controls.maxDistance = 8;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, controls, sun };
}

/** Place the camera for a column of height H (vertical, m), looking slightly up the slope. */
export function frameColumn(camera, controls, H) {
  // look across the slope (along z) so the tilt of the layers reads in profile
  const h = Math.max(0.3, H);
  camera.position.set(1.0 + h * 0.3, h * 0.6 + 0.6, 2.9 + h * 1.1);
  controls.target.set(0.25, Math.max(0.6, h / 2), 0);
  controls.update();
}

// ---- terrain ------------------------------------------------------------------------------

/** Cheap deterministic value noise. */
function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z) {
  return 0.6 * noise(x, z) + 0.3 * noise(x * 2.1 + 5, z * 2.1 + 3) + 0.1 * noise(x * 4.3 + 9, z * 4.3 + 7);
}

/**
 * A flat alpine slope, coloured per face in grass greens with the odd grey rock facet for a low-poly
 * look. Large enough that the fog swallows its edge.
 */
function makeTerrain() {
  const seg = 160; // 2.5 m facets
  const geo = new THREE.PlaneGeometry(FIELD, FIELD, seg, seg).toNonIndexed();
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.y = slopeY(v.x); // a flat slope: the facets are only in the colouring
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  const colours = new Float32Array(pos.count * 3);
  const grass = [new THREE.Color('#6f9a58'), new THREE.Color('#7ba362'), new THREE.Color('#658f52'), new THREE.Color('#86a86a')];
  const rock = [new THREE.Color('#8b9096'), new THREE.Color('#999fa5'), new THREE.Color('#7a8085')];
  for (let f = 0; f < pos.count; f += 3) {
    const cx = (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3, cz = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3;
    const patch = fbm(cx * 0.05 + 40, cz * 0.05 + 40);
    const rocky = patch > 0.66 && hash(f, 1) > 0.35;
    const pal = rocky ? rock : grass;
    const col = pal[Math.floor(hash(f, 2) * pal.length)].clone();
    col.offsetHSL(0, 0, (hash(f, 3) - 0.5) * 0.05);
    for (let k = 0; k < 3; k++) colours.set([col.r, col.g, col.b], (f + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}
