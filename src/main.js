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
  const facts = buildFacts(key);
  const marked = markFacts(main.snowpack || main.hazard || main.weather || '', facts);
  const extra = marked.leftover.length ? `<div class="extra">${marked.leftover.map((fct) => `<span class="chip" data-i="${fct.i}">${fct.label}</span>`).join('')}</div>` : '';
  obsEl.innerHTML = measuredHtml + `<div class="who">Mountain Safety Collective, ${main.region}<b>${new Date(t).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short' })}</b>${dangerHtml}</div>`
    + `<div class="text">${marked.html}</div>` + extra
    + (primary ? `<div class="problem">${primary.hazard}${primary.elevation ? `, ${primary.elevation.toLowerCase()}` : ''}${primary.aspect && !/^\d+$/.test(primary.aspect) ? `, ${primary.aspect} aspects` : ''}${primary.summary ? `: ${primary.summary}` : ''}</div>` : '');
  obsEl.classList.add('on');
}

/**
 * The facts Claude extracted from the day's report become hover targets inside the report text
 * itself: each fact is anchored to the phrase that states it, and hovering the phrase outlines what
 * the model has for it in the column (dotted grey when the model has nothing like it). Facts with no
 * phrase to anchor to are listed after the text.
 */
const chipTargets = []; // rebuilt per day
const chipLabels = [];
function buildFacts(key) {
  chipTargets.length = 0; chipLabels.length = 0;
  const f = state.facts?.[key];
  if (!f) return [];
  const L = state.snaps[state.index].layers;
  const t = state.record.hours[state.index].t;
  const isCrust = (l) => l.grain === 'IF' || l.rime || (l.grain === 'MF' && l.lwc === 0);
  const out = [];
  const add = (label, patterns, target) => { chipTargets.push(target); chipLabels.push(label); out.push({ i: chipTargets.length - 1, label, patterns }); };
  if (f.newSnowCm24h != null) add(`new snow ${f.newSnowCm24h} cm / 24 h`, [/\d+\s*-?\s*\d*\s*cm\s+of\s+(new|fresh|overnight)\s+snow/i, /(new|fresh|overnight)\s+snow[^.]{0,40}?\d+\s*cm/i, /dusting[^.]{0,30}snow/i, /(new|fresh|overnight) snow/i], { layers: L.filter((l) => t - l.born <= 24 * 3600_000 && !isCrust(l)) });
  if (f.stormSnowCm != null) add(`storm snow ${f.stormSnowCm} cm`, [/\d+\s*cm[^.]{0,30}storm snow/i, /storm snow[^.]{0,30}\d+\s*cm/i, /storm snow/i, /recent snow/i], { layers: L.filter((l) => t - l.born <= 72 * 3600_000 && !isCrust(l)) });
  if (f.surfaceCrust === true) { let z = 0; const cr = []; for (let k = L.length - 1; k >= 0 && z < 0.06; k--) { if (isCrust(L[k])) cr.push(L[k]); z += L[k].thick; } add('crust at the surface', [/(widespread|breakable|non-?breakable|supportive|rain|melt[- ]?freeze|surface|rime)[\w\s-]{0,25}?(crust|ice)/i, /crust/i, /rime ice/i], { layers: cr }); }
  else if (f.surface) add(`surface: ${f.surface}`, [/wind ?slab/i, /rime ice/i, /surface/i], { layers: L.length ? [L[L.length - 1]] : [] });
  for (const d of f.crustDepthsCm ?? []) add(`crust ${d} cm down`, [new RegExp(`${Math.round(d)}\\s*-?\\s*\\d*\\s*cm[^.]{0,40}(crust|ice)`, 'i'), new RegExp(`(crust|ice)[^.]{0,40}${Math.round(d)}\\s*cm`, 'i')], { layers: column.layersAtDepth(d, 0.05).filter(isCrust) });
  for (const w of f.weakLayers ?? []) {
    const kindRe = {
      'surface hoar': [/surface hoar/i],
      facets: [/facet(s|ed)?|sugar(y)?/i],
      graupel: [/graupel/i],
      'new snow interface': [/rests? on [^.]*/i, /(may not be|not|poorly|isn'?t) bond(ing|ed)[^.]*/i, /interface[^.]*/i, /bond(ing)?[^.]*/i],
      'crust interface': [/rests? on (an? )?(icy|ice|crust)[^.]*/i, /(may not be|not|poorly) bond(ing|ed)[^.]*/i, /(over|on|atop|overl(ies|ying))[^.]{0,25}crust[^.]*/i, /icy (surface|layer|bed)[^.]*/i],
      'wet layer': [/(wet|saturated|moist) layer/i],
      other: [/weak layer/i],
    }[w.kind] ?? [/weak/i];
    let target;
    if (w.depthCm != null) target = { boundary: column.boundaryAtDepth(w.depthCm) };
    else if (w.kind === 'crust interface' || w.kind === 'new snow interface') target = { boundary: newSnowBase(L, t, isCrust) };
    else target = { layers: L.filter((l) => (w.kind === 'surface hoar' && l.grain === 'SH') || (w.kind === 'facets' && (l.grain === 'FC' || l.grain === 'DH')) || (w.kind === 'wet layer' && l.lwc > 0)) };
    add(`${w.kind}${w.depthCm != null ? ` ${w.depthCm} cm down` : ''}`, kindRe, target);
  }
  if (f.surface === 'wind slab' || f.windLoadedAspects) {
    let z = 0; const slabs = [];
    for (let k = L.length - 1; k >= 0 && z < 0.4; k--) { if (L[k].windPacked && !isCrust(L[k])) slabs.push(L[k]); z += L[k].thick; }
    add('wind slab', [/wind ?slabs?[^.]{0,30}/i, /wind[- ]loaded[^.]{0,20}/i, /deposited[^.]*by the wind/i], { layers: slabs });
  }
  if (f.packState) {
    const byState = { isothermal: [/isothermal/i, /saturated/i, /\bwet\b/i], wet: [/saturated/i, /\bwet\b/i, /isothermal/i], moist: [/moist(\/wet)?/i, /damp/i], mixed: [/moist\/wet/i, /moist/i, /\bwet\b/i], dry: [/\bdry\b/i] }[f.packState] ?? [/\bwet\b/i];
    add(`pack: ${f.packState}`, byState, { layers: L.filter((l) => (f.packState === 'dry' ? l.lwc === 0 : l.lwc > 0)) });
  }
  if (f.rainMentioned) add('rain', [/rain(fall|ed)?/i], { layers: L.filter((l) => l.storm?.rain > 1) });
  if (f.avalancheActivity) add(`avalanches: ${f.avalancheActivity}`, [/avalanche|whumpf|cracking|slide/i], null);
  chipTargets.forEach((tg, i) => { if (tg && ((tg.layers && !tg.layers.length) || (tg.boundary === null))) chipTargets[i] = null; });
  return out.filter((fct) => chipTargets[fct.i]); // a fact the model has nothing for stays plain text
}

/** The boundary at the base of the newest snow (younger than 3 days), the interface reports mean by "rests on". */
function newSnowBase(L, t, isCrust) {
  for (let i = L.length - 1; i >= 1; i--) {
    const l = L[i], below = L[i - 1];
    const fresh = t - l.born <= 72 * 3600_000 && !isCrust(l);
    const belowFresh = t - below.born <= 72 * 3600_000 && !isCrust(below);
    if (fresh && !belowFresh) return column.boundary(i);
  }
  return null;
}

/** Wrap each fact's anchoring phrase in the text; return the marked text and the facts left over. */
function markFacts(text, facts) {
  const spans = []; // [start, end, i]
  const taken = [];
  const free = (a, b) => taken.every(([x, y]) => b <= x || a >= y);
  const leftover = [];
  // boundary facts first: they claim whole clauses ("rests on an icy surface and may not be bonding well")
  const ordered = [...facts].sort((a, b) => Number(!(chipTargets[a.i]?.boundary)) - Number(!(chipTargets[b.i]?.boundary)));
  for (const fct of ordered) {
    let placed = false;
    for (const re of fct.patterns) {
      const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
      let m;
      while ((m = g.exec(text)) && !placed) {
        const a = m.index, b = m.index + m[0].length;
        // the sentence around the match must be about our site, not the subalpine or lower elevations
        const sStart = text.lastIndexOf('.', a) + 1, sEnd = text.indexOf('.', b);
        const sentence = text.slice(sStart, sEnd < 0 ? text.length : sEnd);
        const elsewhere = /lower elevation|subalpine|sub-alpine|valley|below the tree ?line|resort/i.test(sentence);
        if (m[0].length && !elsewhere && free(a, b)) { spans.push([a, b, fct.i]); taken.push([a, b]); placed = true; }
        if (!m[0].length) g.lastIndex++;
      }
      if (placed) break;
    }
    if (!placed) leftover.push(fct);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let html = '', pos = 0;
  const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  for (const [a, b, i] of spans) { html += esc(text.slice(pos, a)) + `<span class="chip ${chipTargets[i] ? '' : 'nomatch'}" data-i="${i}" title="${chipTargets[i] ? 'hover: where the model has this' : 'the model has nothing like this'}">${esc(text.slice(a, b))}</span>`; pos = b; }
  html += esc(text.slice(pos));
  return { html, leftover };
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
