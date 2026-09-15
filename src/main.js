// Wiring: load the season → simulate → one column on the slope; scrub time, pick a season, hover a layer.
import * as THREE from 'three';
import { THREDBO_TOP } from './weather/site.js';
import { loadSeason, loadObservations, loadSensor, loadObservationFacts } from './data.js';
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

const state = { year: seasonYearOf(), record: null, snaps: [], index: 0, framed: false, obs: null, sensor: null, facts: null };
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
  obsEl.innerHTML = measuredHtml + factChips(key) + `<div class="who">Mountain Safety Collective, ${main.region}<b>${new Date(t).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short' })}</b>${dangerHtml}</div>`
    + `<div class="text">${main.snowpack || main.hazard || main.weather}</div>`
    + (primary ? `<div class="problem">${primary.hazard}${primary.elevation ? `, ${primary.elevation.toLowerCase()}` : ''}${primary.aspect && !/^\d+$/.test(primary.aspect) ? `, ${primary.aspect} aspects` : ''}${primary.summary ? `: ${primary.summary}` : ''}</div>` : '');
  obsEl.classList.add('on');
}

/**
 * The facts Claude extracted from the day's report, as chips. Hovering a chip shows where in the
 * column the model has the thing the observers described (or says it has nothing like it).
 */
const chipTargets = []; // rebuilt per day
function factChips(key) {
  chipTargets.length = 0;
  const f = state.facts?.[key];
  if (!f) return '';
  const L = state.snaps[state.index].layers;
  const t = state.record.hours[state.index].t;
  const isCrust = (l) => l.grain === 'IF' || l.rime || (l.grain === 'MF' && l.lwc === 0);
  const chips = [];
  const add = (label, target) => { chipTargets.push(target); chips.push(`<span class="chip ${target ? '' : 'nomatch'}" data-i="${chipTargets.length - 1}">${label}</span>`); };
  if (f.newSnowCm24h != null) add(`new snow ${f.newSnowCm24h} cm / 24 h`, { layers: L.filter((l) => t - l.born <= 24 * 3600_000 && !isCrust(l)) });
  if (f.stormSnowCm != null) add(`storm snow ${f.stormSnowCm} cm`, { layers: L.filter((l) => t - l.born <= 72 * 3600_000 && !isCrust(l)) });
  if (f.surface) add(`surface: ${f.surface}`, { layers: L.length ? [L[L.length - 1]] : [] });
  if (f.surfaceCrust === true) { let z = 0; const cr = []; for (let k = L.length - 1; k >= 0 && z < 0.06; k--) { if (isCrust(L[k])) cr.push(L[k]); z += L[k].thick; } add('crust at the surface', { layers: cr }); }
  for (const d of f.crustDepthsCm ?? []) add(`crust ${d} cm down`, { layers: column.layersAtDepth(d, 0.05).filter(isCrust) });
  for (const w of f.weakLayers ?? []) add(`${w.kind}${w.depthCm != null ? ` ${w.depthCm} cm down` : ''}`, w.depthCm != null ? { boundary: column.boundaryAtDepth(w.depthCm) } : { layers: L.filter((l) => (w.kind === 'surface hoar' && l.grain === 'SH') || (w.kind === 'facets' && (l.grain === 'FC' || l.grain === 'DH'))) });
  if (f.packState) add(`pack: ${f.packState}`, { layers: L.filter((l) => (f.packState === 'dry' ? l.lwc === 0 : l.lwc > 0)) });
  for (const d of f.depthsCm ?? []) add(`depth ${d} cm reported`, null);
  if (f.rainMentioned) add('rain', { layers: L.filter((l) => l.storm?.rain > 1) });
  if (f.avalancheActivity) add(`avalanches: ${f.avalancheActivity}`, null);
  // targets with nothing behind them read as no match
  chipTargets.forEach((tg, i) => { if (tg && ((tg.layers && !tg.layers.length) || (tg.boundary === null))) chipTargets[i] = null; });
  return chips.length ? `<div class="facts">${chips.map((c, i) => c.replace(/class="chip ( |nomatch)?"/, `class="chip ${chipTargets[i] ? '' : 'nomatch'}"`)).join('')}</div>` : '';
}
obsEl.addEventListener('pointerover', (e) => {
  const chip = e.target.closest('.chip'); if (!chip) return;
  const tg = chipTargets[Number(chip.dataset.i)];
  if (!tg) return;
  if (tg.boundary) showBoundary(tg.boundary);
  else if (tg.layers?.length) { column.highlightLayers(tg.layers); if (tg.layers.length === 1) { const m = column.meshes.find((x) => x.userData.layer === tg.layers[0]); if (m) { tip.innerHTML = describeLayer(tg.layers[0], m.userData.bottom, m.userData.top, m.userData.strength); showCards('layer'); } } }
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
  [state.obs, state.sensor, state.facts] = await Promise.all([loadObservations(year), loadSensor(year), loadObservationFacts(year)]);
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
