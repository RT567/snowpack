// Wiring: load the season → simulate → one column on the slope; scrub time, pick a season, hover a layer.
import * as THREE from 'three';
import { THREDBO_TOP } from './weather/site.js';
import { loadSeason } from './data.js';
import { simulate, depth } from './snow/model.js';
import { firstSnowIndex, availableSeasons, seasonYearOf } from './snow/season.js';
import { createStage, frameColumn } from './scene/stage.js';
import { slopeY, heightAt } from './scene/geometry.js';
import { Column, describeLayer, describeBoundary, snowName, stabilityColour } from './scene/column.js';
import { TimeBar } from './ui/timebar.js';
import { createSeasonPicker } from './ui/season.js';

const hint = document.getElementById('hint');
const tip = document.getElementById('tip');   // snow card
const tip2 = document.getElementById('tip2'); // boundary card
const say = (s) => { hint.textContent = s; hint.style.opacity = s ? 1 : 0; };

const { scene, camera, renderer, controls } = createStage();
const column = new Column(scene);

const state = { year: seasonYearOf(), record: null, snaps: [], index: 0, framed: false };

const timebar = new TimeBar(document.getElementById('timebar'), (i) => setIndex(i));
createSeasonPicker(document.getElementById('season'), availableSeasons(), state.year, (y) => loadYear(y));

function setIndex(i) {
  state.index = i;
  column.build(state.snaps[i]);
  renderWeakList();
}

// ---- weakest boundaries, ranked ----------------------------------------------------------------

const weakEl = document.getElementById('weak');
function renderWeakList() {
  const items = column.weakest();
  weakEl.innerHTML = '';
  if (!items.length) return;
  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th></th><th>weakest boundaries</th><th class="num">height</th><th>buried</th><th class="num">S</th><th class="num">kPa</th></tr></thead>';
  const body = document.createElement('tbody');
  for (const b of items) {
    const tr = document.createElement('tr');
    tr.className = 'item';
    const buried = new Date(b.upper.born).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short' });
    tr.innerHTML = `<td><span class="dot" style="background:#${stabilityColour(b.bond.S).getHexString()}"></span></td>`
      + `<td class="what">${snowName(b.upper)} over ${snowName(b.lower)}</td>`
      + `<td class="num h">${(b.y * 100).toFixed(0)} cm</td>`
      + `<td class="h">${buried}</td>`
      + `<td class="num s">${b.bond.S.toFixed(1)}</td>`
      + `<td class="num s">${b.bond.strength.toFixed(2)}</td>`;
    tr.addEventListener('pointerenter', () => showBoundary(b));
    tr.addEventListener('pointerleave', () => { showCards(null); column.highlight(null); });
    body.appendChild(tr);
  }
  table.appendChild(body);
  weakEl.appendChild(table);
}

function showBoundary(b) {
  column.highlight(b);
  tip2.innerHTML = describeBoundary(b.upper, b.lower, b.y, b.bond, b.slabAbove);
  showCards('boundary');
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
  tip.innerHTML = ''; tip2.innerHTML = ''; showCards(null);
  setIndex(land);
  if (!state.framed) { frameColumn(camera, controls, column.height); state.framed = true; }
  say('');
}

// ---- hover labels ---------------------------------------------------------------------------

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function showCards(active) {
  // only the hovered kind is shown; the other card disappears
  tip.classList.toggle('on', active === 'layer');
  tip2.classList.toggle('on', active === 'boundary');
}
renderer.domElement.addEventListener('pointermove', (e) => {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(column.meshes, false)[0];
  if (!hit) { showCards(null); column.highlight(null); renderer.domElement.style.cursor = ''; return; }
  const what = column.probe(hit.object, heightAt(hit.point));
  column.highlight(what);
  if (what.kind === 'boundary') { showBoundary(what); }
  else { tip.innerHTML = describeLayer(what.layer, what.bottom, what.top, what.strength); showCards('layer'); }
  renderer.domElement.style.cursor = 'crosshair';
});
renderer.domElement.addEventListener('pointerleave', () => { showCards(null); column.highlight(null); });

// ---- frame loop ---------------------------------------------------------------------------

let frames = 0;
function frame() {
  frames++;
  controls.update();
  // never go underground: keep the eye above the slope surface
  const floor = slopeY(camera.position.x) + 0.12;
  if (camera.position.y < floor) { camera.position.y = floor; camera.lookAt(controls.target); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

loadYear(state.year);

// debug handle for driving the page from the console / tests
window.__snowpack = { state, column, camera, controls, timebar, setIndex, renderer, scene, frames: () => frames };
