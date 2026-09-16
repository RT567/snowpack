// Wiring: load the season → simulate → one column on the slope; scrub time, pick a season, hover a layer.
import * as THREE from 'three';
import { THREDBO_TOP } from './weather/site.js';
import { loadSeason, loadObservations, loadSensor, loadObservationFacts } from './data.js';
import { simulate, depth, rho } from './snow/model.js';
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
  obsEl.innerHTML = measuredHtml + `<div class="who">Mountain Safety Collective, ${main.region}<b>${new Date(t).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short' })}</b>${dangerHtml}</div>`
    + `<div class="text">${markText(main.snowpack || main.hazard || main.weather || '')}</div>`
    + (primary ? `<div class="problem">${primary.hazard}${primary.elevation ? `, ${primary.elevation.toLowerCase()}` : ''}${primary.aspect && !/^\d+$/.test(primary.aspect) ? `, ${primary.aspect} aspects` : ''}${primary.summary ? `: ${primary.summary}` : ''}</div>` : '');
  obsEl.classList.add('on');
}

/**
 * Words in the report text become hover targets. Each rule maps a phrase to what the model has for it
 * in the column: fresh layers, the crust under them, the bond beneath the new snow, wind-packed layers,
 * wet layers, hoar, facets. A phrase with nothing to point at stays plain text. Sentences about the
 * subalpine or lower elevations are not about the station and are left alone.
 */
const chipTargets = []; // rebuilt per day
const isCrustLayer = (l) => l.grain === 'IF' || l.rime || (l.grain === 'MF' && l.lwc === 0);

/** The boundary at the base of the newest snow (younger than 3 days): what "rests on" means. */
function newSnowBase(L, t) {
  for (let i = L.length - 1; i >= 1; i--) {
    const fresh = (l) => t - l.born <= 72 * 3600_000 && !isCrustLayer(l);
    if (fresh(L[i]) && !fresh(L[i - 1])) return column.boundary(i);
  }
  return null;
}

/** The first crust below the newest snow, else the topmost crust. */
function crustBelowNewSnow(L, t) {
  for (let i = L.length - 1; i >= 0; i--) {
    const l = L[i];
    if (isCrustLayer(l)) return [l];
    if (t - l.born > 72 * 3600_000) break;
  }
  const any = [...L].reverse().find(isCrustLayer);
  return any ? [any] : [];
}

function chipRules(L, t) {
  const fresh = (h) => L.filter((l) => t - l.born <= h * 3600_000 && !isCrustLayer(l));
  const top40 = []; let z = 0;
  for (let k = L.length - 1; k >= 0 && z < 0.4; k--) { top40.push(L[k]); z += L[k].thick; }
  return [
    { re: /(may not be|not|poorly|isn'?t)\s+bond(ing|ed)( well)?/gi, target: () => ({ boundary: newSnowBase(L, t) }) },
    { re: /new snow interface|interface/gi, target: () => ({ boundary: newSnowBase(L, t) }) },
    { re: /(overnight|fresh|new|recent|storm) snow/gi, target: () => ({ layers: fresh(72) }) },
    { re: /\d+\s*-?\s*\d*\s*cm of (new|fresh) snow|dusting/gi, target: () => ({ layers: fresh(24) }) },
    { re: /wind ?slabs?|wind[- ]loaded|windblown snow|wind blown snow/gi, target: () => ({ layers: top40.filter((l) => l.windPacked && !isCrustLayer(l)) }) },
    { re: /rime ice|rime crust|\brime\b/gi, target: () => { const r = top40.filter((l) => l.rime); return { layers: r.length ? r : crustBelowNewSnow(L, t) }; } },
    { re: /(\d+)\s*-?\s*(\d*)\s*cm/gi, target: (m) => { const d = Number(m[2] || m[1]); return d > 0 && d <= 300 ? { layers: column.layersAtDepth(d, 0.04) } : null; } },
    { re: /icy surface|icy bed|ice surface|melt[- ]?freeze crust|rain crust|breakable crust|non-?breakable crust|supportive crust|surface crust|widespread ice|\bcrusts?\b|\bice\b/gi, target: () => ({ layers: crustBelowNewSnow(L, t) }) },
    { re: /refr(oze|eeze|ozen)|melt[- ]?freeze cycle|frozen/gi, target: () => ({ layers: top40.filter((l) => l.wetCount > 0 && l.lwc === 0) }) },
    { re: /surface hoar/gi, target: () => ({ layers: L.filter((l) => l.grain === 'SH') }) },
    { re: /facet(s|ed)?|sugar(y)?/gi, target: () => ({ layers: L.filter((l) => l.grain === 'FC' || l.grain === 'DH') }) },
    { re: /isothermal|saturated|moist\/wet|moist|\bwet\b|water/gi, target: () => ({ layers: L.filter((l) => l.lwc > 0) }) },
    { re: /rain(fall|ed|ing)?/gi, target: () => ({ layers: L.filter((l) => l.storm?.rain > 1) }) },
    { re: /\bdry\b|dry snow/gi, target: () => ({ layers: top40.filter((l) => l.lwc === 0 && !isCrustLayer(l)) }) },
    { re: /dense|settled|consolidated|well[- ]bonded/gi, target: () => ({ layers: L.filter((l) => !isCrustLayer(l) && t - l.born > 72 * 3600_000 && rho(l) > 300) }) },
  ];
}

/** Wrap matching phrases in the text with chips whose targets exist in the model. */
function markText(text) {
  chipTargets.length = 0;
  const L = state.snaps[state.index].layers;
  const t = state.record.hours[state.index].t;
  const spans = [];
  const free = (a, b) => spans.every(([x, y]) => b <= x || a >= y);
  for (const rule of chipRules(L, t)) {
    rule.re.lastIndex = 0;
    let m;
    while ((m = rule.re.exec(text))) {
      const a = m.index, b = a + m[0].length;
      if (!m[0].length) { rule.re.lastIndex++; continue; }
      const sStart = text.lastIndexOf('.', a) + 1, sEnd = text.indexOf('.', b);
      const sentence = text.slice(sStart, sEnd < 0 ? text.length : sEnd);
      // a sentence about the subalpine or lower elevations is not about the station, unless it also
      // speaks of the alpine ("rime ice in the alpine and a crust in the subalpine")
      if (/lower elevation|subalpine|sub-alpine|valley|below the tree ?line|resort/i.test(sentence) && !/\balpine\b/i.test(sentence)) continue;
      if (!free(a, b)) continue;
      const tg = rule.target(m);
      if (!tg || (tg.layers && !tg.layers.length) || (tg.boundary === null)) continue;
      chipTargets.push(tg);
      spans.push([a, b, chipTargets.length - 1]);
    }
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
  if (tg.boundary) { showBoundary(tg.boundary); return; }
  column.highlightLayers(tg.layers);
  // the usual snow card, for the topmost of the matched layers
  const ms = tg.layers.map((l) => column.meshes.find((x) => x.userData.layer === l)).filter(Boolean);
  const m = ms.reduce((a, x) => (x.userData.top > a.userData.top ? x : a), ms[0]);
  if (m) { tip.innerHTML = describeLayer(m.userData.layer, m.userData.bottom, m.userData.top, m.userData.strength); showCards('layer'); }
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
