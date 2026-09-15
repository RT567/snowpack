// Wiring: load the season → simulate → one column on the slope; scrub time, pick a season, hover a layer.
import * as THREE from 'three';
import { THREDBO_TOP } from './weather/site.js';
import { loadSeason } from './data.js';
import { simulate, depth } from './snow/model.js';
import { firstSnowIndex, availableSeasons, seasonYearOf } from './snow/season.js';
import { createStage, frameColumn } from './scene/stage.js';
import { slopeY, heightAt } from './scene/geometry.js';
import { Column, describeLayer, describeBoundary } from './scene/column.js';
import { TimeBar } from './ui/timebar.js';
import { createSeasonPicker } from './ui/season.js';

const hint = document.getElementById('hint');
const tip = document.getElementById('tip');
const say = (s) => { hint.textContent = s; hint.style.opacity = s ? 1 : 0; };

const { scene, camera, renderer, controls } = createStage();
const column = new Column(scene);

const state = { year: seasonYearOf(), record: null, snaps: [], index: 0, framed: false };

const timebar = new TimeBar(document.getElementById('timebar'), (i) => setIndex(i));
createSeasonPicker(document.getElementById('season'), availableSeasons(), state.year, (y) => loadYear(y));

function setIndex(i) {
  state.index = i;
  column.build(state.snaps[i]);
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
  try {
    state.record = await loadSeason(THREDBO_TOP, year);
  } catch (e) {
    console.error(e); say('could not fetch the weather record'); return;
  }
  state.snaps = simulate(state.record);
  const first = Math.max(0, firstSnowIndex(state.snaps));
  const land = landingIndex(state.snaps, first);
  timebar.configure(state.record.hours.map((h) => h.t), first, land);
  setIndex(land);
  if (!state.framed) { frameColumn(camera, controls, column.height); state.framed = true; }
  say('');
}

// ---- hover labels ---------------------------------------------------------------------------

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
renderer.domElement.addEventListener('pointermove', (e) => {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(column.meshes, false)[0];
  if (!hit) { tip.classList.remove('on'); column.highlight(null); renderer.domElement.style.cursor = ''; return; }
  const what = column.probe(hit.object, heightAt(hit.point));
  column.highlight(what);
  tip.innerHTML = what.kind === 'boundary'
    ? describeBoundary(what.upper, what.lower, what.y, what.strength)
    : describeLayer(what.layer, what.bottom, what.top, what.strength);
  tip.classList.add('on');
  renderer.domElement.style.cursor = 'crosshair';
});
renderer.domElement.addEventListener('pointerleave', () => { tip.classList.remove('on'); column.highlight(null); });

// ---- frame loop ---------------------------------------------------------------------------

let frames = 0;
function frame() {
  frames++;
  controls.update();
  // never go underground: keep the eye above the slope surface
  const floor = slopeY(camera.position.x) + 0.12;
  if (camera.position.y < floor) { camera.position.y = floor; camera.lookAt(controls.target); }
  column.faceLabel(camera);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

loadYear(state.year);

// debug handle for driving the page from the console / tests
window.__snowpack = { state, column, camera, controls, timebar, setIndex, renderer, scene, frames: () => frames };
