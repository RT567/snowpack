// Wiring: load the season → simulate → one column on the slope; scrub time, pick a season, hover a layer.
import * as THREE from 'three';
import { THREDBO_TOP } from './weather/site.js';
import { loadSeason } from './data.js';
import { simulate, depth } from './snow/model.js';
import { DEFAULT_PARAMS } from './snow/params.js';
import { firstSnowIndex, availableSeasons, seasonYearOf } from './snow/season.js';
import { createStage, frameColumn } from './scene/stage.js';
import { slopeY, heightAt } from './scene/geometry.js';
import { Column, describeLayer, describeBoundary, stabilityColour } from './scene/column.js';
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
  if (lastPointer) hoverAt(lastPointer.x, lastPointer.y); // arrow keys: re-read what is under the mouse
}

// ---- weakest boundaries, ranked ----------------------------------------------------------------

const weakEl = document.getElementById('weak');
function renderWeakList() {
  const items = column.weakest();
  weakEl.innerHTML = '';
  if (!items.length) return;
  weakEl.innerHTML = '<div class="title">boundaries, weakest first</div>'
    + '<div class="head"><span></span><span></span><span class="h">height</span><span>buried</span><span class="h">S</span><span class="h">kPa</span></div>';
  items.forEach((b, k) => {
    const el = document.createElement('div');
    el.className = 'item';
    const col = stabilityColour(b.bond.S).getHexString();
    const buried = new Date(b.upper.born).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short' });
    el.innerHTML = `<span class="rank">${k + 1}</span>`
      + `<span class="dot" style="background:#${col}"></span>`
      + `<span class="h">${(b.y * 100).toFixed(0)} cm</span>`
      + `<span class="d">${buried}</span>`
      + `<span class="s" style="color:#${col}">${b.bond.S.toFixed(1)}</span>`
      + `<span class="s" style="color:#${col}">${b.bond.strength.toFixed(2)}</span>`;
    el.addEventListener('pointerenter', () => showBoundary(b));
    el.addEventListener('pointerleave', () => { showCards(null); column.highlight(null); });
    weakEl.appendChild(el);
  });
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
  // a station-corrected record already carries real precipitation: no reanalysis factor on top
  state.snaps = simulate(state.record, state.record.correctedWindows ? { ...DEFAULT_PARAMS, precipFactor: 1 } : DEFAULT_PARAMS);
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
  // the hovered kind is bright; whatever was last shown stays, dimmed
  for (const [el, kind] of [[tip, 'layer'], [tip2, 'boundary']]) {
    if (!el.innerHTML) continue;
    el.classList.toggle('on', active === kind);
    el.classList.toggle('dim', active !== kind);
  }
}
let lastPointer = null;
renderer.domElement.addEventListener('pointermove', (e) => { lastPointer = { x: e.clientX, y: e.clientY }; hoverAt(e.clientX, e.clientY); });
function hoverAt(x, y) {
  ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(column.meshes, false)[0];
  if (!hit) { showCards(null); column.highlight(null); renderer.domElement.style.cursor = ''; return; }
  const what = column.probe(hit.object, heightAt(hit.point));
  column.highlight(what);
  if (what.kind === 'boundary') { showBoundary(what); }
  else { tip.innerHTML = describeLayer(what.layer, what.bottom, what.top, what.strength); showCards('layer'); }
  renderer.domElement.style.cursor = 'crosshair';
}
renderer.domElement.addEventListener('pointerleave', () => { lastPointer = null; showCards(null); column.highlight(null); });

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
