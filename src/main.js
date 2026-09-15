// Wiring: load the season → simulate → intro cuts → column you can scrub, push and tap.
import * as THREE from 'three';
import { THREDBO_TOP } from './weather/site.js';
import { loadSeason } from './data.js';
import { simulate, depth } from './snow/model.js';
import { sidePush, topTap } from './snow/mechanics.js';
import { firstSnowIndex, availableSeasons, seasonYearOf } from './snow/season.js';
import { createStage, createSurroundings, flyToColumn } from './scene/stage.js';
import { Column, describeLayer } from './scene/column.js';
import { releaseSlab } from './scene/slide.js';
import { Shovel } from './scene/shovel.js';
import { updateTweens } from './scene/tween.js';
import { TimeBar } from './ui/timebar.js';
import { createSeasonPicker } from './ui/season.js';
import { Gestures } from './ui/gestures.js';
import { GRAIN } from './snow/grains.js';

const PUSH_MAX_KPA = 8;     // pressure after holding for pushSeconds
const PUSH_SECONDS = 2.2;
const TAP_MIN_KPA = 0.4;
const TAP_MAX_KPA = 8;

const hint = document.getElementById('hint');
const tip = document.getElementById('tip');
const say = (s) => { hint.textContent = s; hint.style.opacity = s ? 1 : 0; };

const stage = createStage();
const { scene, camera, renderer, controls } = stage;
const column = new Column(scene);
const shovel = new Shovel(scene);

const state = {
  year: seasonYearOf(),
  record: null,
  snaps: [],
  index: 0,
  cutIndex: Infinity,
  intro: true,
  surroundings: null,
  pushing: null, // { y, point, t0, ring }
};

const timebar = new TimeBar(document.getElementById('timebar'), (i) => setIndex(i));
createSeasonPicker(document.getElementById('season'), availableSeasons(), state.year, (y) => loadYear(y));

function setIndex(i, keepCut = false) {
  state.index = i;
  if (!keepCut) state.cutIndex = Infinity;
  column.build(state.snaps[i], state.cutIndex);
  if (state.surroundings) state.surroundings.dispose(), (state.surroundings = null);
}

/** Where to land in a season: now if there is snow now, else the deepest hour. */
function landingIndex(snaps, first) {
  const last = snaps.length - 1;
  if (depth(snaps[last]) >= 0.05) return last;
  let best = first, d = 0;
  for (let i = first; i <= last; i++) { const x = depth(snaps[i]); if (x > d) { d = x; best = i; } }
  return best;
}

async function loadYear(year) {
  state.year = year;
  say('fetching the winter…');
  gestures.enabled = false;
  try {
    state.record = await loadSeason(THREDBO_TOP, year);
  } catch (e) {
    console.error(e); say('could not fetch the weather record'); return;
  }
  state.snaps = simulate(state.record);
  const first = Math.max(0, firstSnowIndex(state.snaps));
  const land = landingIndex(state.snaps, first);
  timebar.configure(state.record.hours.map((h) => h.t), first, land);
  state.cutIndex = Infinity;
  if (state.intro) {
    // build the column but keep it buried under the surroundings until the four cuts
    state.index = land;
    column.build(state.snaps[land], Infinity, false);
    state.surroundings = createSurroundings(scene, column.height);
    document.getElementById('timebar').classList.remove('on');
    say('');
    gestures.mode = 'intro';
  } else {
    setIndex(land);
    say('');
    gestures.mode = 'idle';
  }
  gestures.enabled = true;
}

// ---- interactions -------------------------------------------------------------------------

const ringGeo = new THREE.RingGeometry(0.01, 0.014, 32);
const ringMat = new THREE.MeshBasicMaterial({ color: '#3a4048', transparent: true, opacity: 0.7, side: THREE.DoubleSide });

const gestures = new Gestures(renderer.domElement, camera, column, {
  async cut() {
    if (!state.surroundings) return;
    const done = await state.surroundings.cut();
    if (done) {
      state.surroundings.dispose(); state.surroundings = null;
      column.build(state.snaps[state.index], Infinity, true); // brush the walls: soft layers recede
      await flyToColumn(camera, controls, column.height);
      state.intro = false;
      gestures.mode = 'idle';
      document.getElementById('timebar').classList.add('on');
    }
  },
  hoverLayer(mesh, e) {
    if (!mesh) { tip.style.display = 'none'; return; }
    tip.innerHTML = describeLayer(mesh.userData.layer);
    tip.style.display = 'block';
    tip.style.left = `${e.clientX + 14}px`; tip.style.top = `${e.clientY + 12}px`;
  },
  hoverTop(point) {
    if (!point) { shovel.show(false); return; }
    shovel.place(point.x, point.z, column.height); shovel.show(true);
  },
  pushStart(y, point) {
    controls.enabled = false;
    const ring = new THREE.Mesh(ringGeo, ringMat.clone());
    ring.position.copy(point).add(point.clone().sub(camera.position).normalize().multiplyScalar(-0.004));
    ring.lookAt(camera.position);
    scene.add(ring);
    state.pushing = { y, point: point.clone(), t0: performance.now(), ring, released: false };
    tip.style.display = 'none';
  },
  async pushEnd() {
    const p = state.pushing; state.pushing = null;
    controls.enabled = true;
    if (!p) return;
    scene.remove(p.ring);
    if (p.released) await p.released;
  },
  tapStart(point) {
    controls.enabled = false;
    shovel.place(point.x, point.z, column.height); shovel.show(true);
    shovel.startCharge();
  },
  async tapEnd() {
    const charge = await shovel.release();
    controls.enabled = true;
    const kPa = TAP_MIN_KPA + (TAP_MAX_KPA - TAP_MIN_KPA) * charge * charge;
    const snap = visibleSnapshot();
    const { failed } = topTap(snap, kPa);
    if (failed) await release(failed, 'tap');
    else nudge(0.004 + 0.01 * charge);
  },
});

/** The snapshot as currently shown (released layers removed). */
function visibleSnapshot() {
  const s = state.snaps[state.index];
  if (state.cutIndex === Infinity) return s;
  return { ...s, layers: s.layers.slice(0, state.cutIndex) };
}

/** Release the slab above a failed interface. */
async function release(failed, mode) {
  const toCamera = camera.position.clone().sub(controls.target); toCamera.y = 0; toCamera.normalize();
  const dir = mode === 'tap' ? toCamera : toCamera.negate();
  const slab = column.slabMeshes(failed.index);
  shovel.show(false);
  const what = failed.upper.grain === 'SH' || failed.lower.grain === 'SH' ? 'surface hoar'
    : GRAIN[failed.lower.grain].name;
  const depthCm = ((column.height - column.interfaceY(failed.index)) * 100).toFixed(0);
  say(`let go on ${what}, ${depthCm} cm down`);
  const anim = releaseSlab(scene, slab, dir, mode);
  state.cutIndex = Math.min(state.cutIndex, failed.index);
  await anim;
  column.build(state.snaps[state.index], state.cutIndex);
  setTimeout(() => say(''), 2500);
}

/** A tiny shake when nothing fails. */
function nudge(amount) {
  const g = column.group;
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / 220);
    g.position.y = -amount * Math.sin(p * Math.PI) ;
    if (p < 1) requestAnimationFrame(step); else g.position.y = 0;
  };
  requestAnimationFrame(step);
}

// ---- frame loop ---------------------------------------------------------------------------

let frames = 0;
function frame(now) {
  frames++;
  updateTweens(now);
  shovel.update(now);
  if (state.pushing && !state.pushing.released) {
    const p = state.pushing;
    const held = (now - p.t0) / 1000;
    const f = Math.min(1, held / PUSH_SECONDS);
    const kPa = PUSH_MAX_KPA * f * f; // eases in, so a quick poke stays a poke
    const s = 1 + 6 * f;
    p.ring.scale.set(s, s, s);
    const { failed } = sidePush(visibleSnapshot(), p.y, kPa);
    if (failed) p.released = release(failed, 'push');
  }
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

loadYear(state.year);

// debug handle for driving the page from the console / tests
window.__snowpack = { state, column, camera, controls, shovel, timebar, setIndex, renderer, scene, frames: () => frames };
