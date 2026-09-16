// Wiring: load the season → simulate → one column on the slope; scrub time, pick a season, hover a layer.
import * as THREE from 'three';
import { THREDBO_TOP } from './weather/site.js';
import { loadSeason, loadObservations, loadSensor, loadObservationFacts, loadObservationChips } from './data.js';
import { simulate, depth, rho } from './snow/model.js';
import { DEFAULT_PARAMS, ASSIMILATION } from './snow/params.js';
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

const state = { year: seasonYearOf(), record: null, snaps: [], index: 0, framed: false, obs: null, sensor: null, facts: null, chips: null };
const obsEl = document.getElementById('obs');

const timebar = new TimeBar(document.getElementById('timebar'), (i) => setIndex(i));
createSeasonPicker(document.getElementById('season'), availableSeasons(), state.year, (y) => loadYear(y));

function setIndex(i) {
  state.index = i;
  column.build(state.snaps[i]);
  renderWeakList();
  showObservation(i);
  if (lastPointer) hoverAt(lastPointer.x, lastPointer.y); // arrow keys: re-read what is under the mouse
}

// ---- what the observers said that day -----------------------------------------------------------

const DANGER_COLOURS = ['#3fc276', '#e6c144', '#e8862e', '#e0453f', '#000000'];
function showObservation(i) {
  const t = state.record.hours[i].t;
  const key = new Date(t).toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
  const measured = state.sensor?.[key];
  const reports = state.obs?.[key];
  const main = reports?.find((r) => /main/i.test(r.region)) ?? reports?.[0];
  if (!main && measured == null) { obsEl.classList.remove('on'); return; }
  const modelCm = Math.round(depth(state.snaps[i]) * 100);
  const measuredHtml = measured != null ? `<div class="measured">Snowy Hydro sensor near Spencers Creek (1830 m): <b>${measured.toFixed(0)} cm</b> · model here: <b>${modelCm} cm</b></div>` : '';
  if (!main) { obsEl.innerHTML = measuredHtml; obsEl.classList.add('on'); return; }
  const dangerHtml = main.danger ? `<span class="danger" style="background:${DANGER_COLOURS[Math.min(4, main.danger.rating)] ?? '#8a929b'}">${main.danger.name.replace(/ avalanche danger/i, '')}</span>` : '';
  const primary = main.problems.find((p) => p.type === 'Primary') ?? main.problems[0];
  obsEl.innerHTML = measuredHtml + `<div class="who">Mountain Safety Collective, ${main.region}<b>${new Date(t).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short' })}</b>${dangerHtml}</div>`
    + `<div class="text">${markText(main.snowpack || main.hazard || main.weather || '', key)}</div>`
    + (primary ? `<div class="problem">${primary.hazard}${primary.elevation ? `, ${primary.elevation.toLowerCase()}` : ''}${primary.aspect && !/^\d+$/.test(primary.aspect) ? `, ${primary.aspect} aspects` : ''}${primary.summary ? `: ${primary.summary}` : ''}</div>` : '');
  obsEl.classList.add('on');
}

/**
 * Phrases in the report text become hover targets. Which phrase points at which modelled layer or
 * boundary was decided by the mark-up pass (scripts/chip-msc.mjs): it read each report alongside the
 * model's column for that morning, so "the crust the storm snow overlies" is the crust under the storm
 * snow, not a refrozen skin above it. Each chip points at exactly one thing. A chip whose layer does
 * not exist at the hour on show (not fallen yet, melted, merged away) stays plain text.
 */
const chipTargets = []; // rebuilt per day

function resolveChip(chip, L) {
  if (chip.layer != null) { const layer = L.find((l) => l.id === chip.layer); return layer ? { kind: 'layer', layer } : null; }
  const i = L.findIndex((l) => l.id === chip.boundaryBelow);
  return i >= 1 ? column.boundary(i) : null;
}

/** This day's chips, if the mark-up was made against the same model run (same layer ids at the report hour). */
function chipsFor(date) {
  const day = state.chips?.[date];
  if (!day?.chips) return [];
  const i = state.record.hours.findIndex((h) => {
    const d = new Date(h.t);
    return d.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' }) === date && Number(d.toLocaleString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', hour12: false }).slice(0, 2)) % 24 === ASSIMILATION.reportHour;
  });
  if (i < 0) return [];
  const ids = state.snaps[i].layers.map((l) => l.id).join(',');
  return ids === day.ids ? day.chips : [];
}

/** Wrap the marked-up phrases of this day's report in chips whose targets exist in the model now. */
function markText(text, date) {
  chipTargets.length = 0;
  const L = state.snaps[state.index].layers;
  const spans = [];
  const free = (a, b) => spans.every(([x, y]) => b <= x || a >= y);
  for (const chip of chipsFor(date)) {
    let a = text.indexOf(chip.text);
    while (a >= 0 && !free(a, a + chip.text.length)) a = text.indexOf(chip.text, a + 1);
    if (a < 0) continue;
    const tg = resolveChip(chip, L);
    if (!tg) continue;
    chipTargets.push(tg);
    spans.push([a, a + chip.text.length, chipTargets.length - 1]);
  }
  spans.sort((p, q) => p[0] - q[0]);
  const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  let html = '', pos = 0;
  for (const [a, b, i] of spans) { html += esc(text.slice(pos, a)) + `<span class="chip" data-i="${i}">${esc(text.slice(a, b))}</span>`; pos = b; }
  return html + esc(text.slice(pos));
}

obsEl.addEventListener('pointerover', (e) => {
  const chip = e.target.closest('.chip'); if (!chip) return;
  const i = Number(chip.dataset.i);
  const tg = chipTargets[i];
  if (!tg) return;
  if (tg.kind === 'boundary') { showBoundary(tg); return; }
  // the usual snow card for the one layer
  const m = column.meshes.find((x) => x.userData.layer === tg.layer);
  if (!m) return;
  column.highlight({ kind: 'layer', layer: tg.layer });
  tip.innerHTML = describeLayer(m.userData.layer, m.userData.bottom, m.userData.top, m.userData.strength); showCards('layer');
});
obsEl.addEventListener('pointerout', (e) => { if (e.target.closest('.chip')) { column.highlight(null); showCards(null); } });

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
  [state.obs, state.sensor, state.facts, state.chips] = await Promise.all([loadObservations(year), loadSensor(year), loadObservationFacts(year), loadObservationChips(year)]);
  // a station-corrected record already carries real precipitation: no reanalysis factor on top;
  // observers' facts (new snow, surface crust) nudge the model at 9 am on report days
  state.snaps = simulate(state.record, state.record.correctedWindows ? { ...DEFAULT_PARAMS, precipFactor: 1 } : DEFAULT_PARAMS, state.facts);
  const first = Math.max(0, firstSnowIndex(state.snaps));
  const land = landingIndex(state.snaps, first);
  timebar.configure(state.record.hours.map((h) => h.t), first, land);
  if (state.obs) timebar.markDays(Object.keys(state.obs));
  showObservation(state.index);
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
