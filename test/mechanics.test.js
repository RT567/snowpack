import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../src/snow/model.js';
import { sidePush, topTap, tilt, interfaces, bondStrength, layerStrength } from '../src/snow/mechanics.js';
import { hours, record, solar, P1 } from './helpers.js';

// storm → clear nights (hoar) → storm → clear nights (hoar) → storm: two buried weak layers
function twoWeakLayers() {
  let t;
  const storm = (temp, wind = 3) => hours(14, () => ({ temp, rh: 95, dew: temp - 0.5, precip: 2.2, cloud: 100, wind }), t);
  const nights = () => hours(40, (i) => ({ temp: -7, rh: 93, dew: -8, wind: 1.5, cloud: 5, sw: solar(i, 100) }), t);
  const seq = [];
  const push = (hs) => { seq.push(...hs); t = hs.at(-1).t + 3600_000; };
  t = Date.UTC(2026, 6, 1);
  push(storm(-6)); push(nights()); push(storm(-5, 9)); push(nights()); push(storm(-4, 10));
  return simulate(record(seq), P1).at(-1);
}

test('the sequence buries two surface hoar layers', () => {
  const s = twoWeakLayers();
  const sh = s.layers.filter((l) => l.grain === 'SH');
  assert.equal(sh.length, 2, s.layers.map((l) => l.grain).join(','));
});

test('surface hoar interfaces are the weakest bonds', () => {
  const s = twoWeakLayers();
  const ifs = interfaces(s);
  const weakest = ifs.reduce((a, b) => (b.strength < a.strength ? b : a));
  assert.ok(weakest.upper.grain === 'SH' || weakest.lower.grain === 'SH');
});

test('pushing near the top fails the upper hoar; pushing below it fails the lower hoar', () => {
  const s = twoWeakLayers();
  const H = s.layers.reduce((a, l) => a + l.thick, 0);
  const sh = interfaces(s).filter((f) => f.upper.grain === 'SH' || f.lower.grain === 'SH').sort((a, b) => b.z - a.z);
  const upperZ = sh[0].z, lowerZ = sh[1].z;
  const hi = sidePush(s, H - 0.02, 3);
  assert.ok(hi.failed, 'something fails under a firm push at the top');
  assert.ok(Math.abs(hi.failed.z - upperZ) < 0.03, `top push fails upper hoar at ${upperZ}, got ${hi.failed.z}`);
  const mid = sidePush(s, (upperZ + lowerZ) / 2 - 0.01, 3);
  assert.ok(mid.failed);
  assert.ok(Math.abs(mid.failed.z - lowerZ) < 0.03, `mid push fails lower hoar at ${lowerZ}, got ${mid.failed.z}`);
});

test('a gentle push fails nothing; a hard one does', () => {
  const s = twoWeakLayers();
  const H = s.layers.reduce((a, l) => a + l.thick, 0);
  assert.equal(sidePush(s, H - 0.02, 0.05).failed, null);
  assert.ok(sidePush(s, H - 0.02, 5).failed);
});

test('a tap from the top reaches shallow layers before deep ones', () => {
  const s = twoWeakLayers();
  const light = topTap(s, 0.6);
  const heavy = topTap(s, 6);
  assert.ok(heavy.failed, 'heavy tap fails a layer');
  if (light.failed) assert.ok(light.failed.z >= heavy.failed.z - 1e-9);
});

test('tilting a flat-stable column steeply can release it, flat cannot', () => {
  const s = twoWeakLayers();
  assert.equal(tilt(s, 0).failed, null);
  const steep = tilt(s, 45);
  const flat = tilt(s, 20);
  assert.ok(steep.candidates[0].ratio > flat.candidates[0].ratio);
});

test('strength follows the measured density regressions; buried hoar gains with age', () => {
  const day = 86_400_000;
  const rg250 = { grain: 'RG', lwc: 0, thick: 0.1, swe: 25, born: 0 };
  const rg150 = { grain: 'RG', lwc: 0, thick: 0.1, swe: 15, born: 0 };
  const fc250 = { grain: 'FC', lwc: 0, thick: 0.1, swe: 25, born: 0 };
  const pp100 = { grain: 'PP', lwc: 0, thick: 0.1, swe: 10, born: 0 };
  const sh = { grain: 'SH', lwc: 0, thick: 0.01, swe: 0.8, born: 0, buried: 0 };
  // Jamieson & Johnston 2001 Table 8 worked values
  assert.ok(Math.abs(layerStrength(rg250, 0) - 1.66) < 0.05, `RG at 250 kg/m³ ≈ 1.66 kPa, got ${layerStrength(rg250, 0)}`);
  assert.ok(Math.abs(layerStrength(pp100, 0) - 0.27) < 0.03, `PP at 100 kg/m³ ≈ 0.27 kPa, got ${layerStrength(pp100, 0)}`);
  assert.ok(layerStrength(fc250, 0) < layerStrength(rg250, 0), 'facets weaker than rounded grains at the same density');
  assert.ok(layerStrength(rg250, 0) > layerStrength(rg150, 0), 'denser is stronger');
  assert.ok(Math.abs(layerStrength(sh, 0) - 0.35) < 1e-9);
  assert.ok(layerStrength(sh, 10 * day) > layerStrength(sh, 0), 'buried hoar strengthens');
  // the bond takes the weaker side and is halved when wet
  // the bond takes the weaker side (hoar, 0.35) and the hardness jump to rounded grains applies the 0.8 contrast factor
  assert.ok(Math.abs(bondStrength(rg250, sh, 0) - 0.35 * 0.8) < 1e-9);
  assert.ok(Math.abs(bondStrength({ ...rg250, lwc: 1 }, rg250, 0) - 0.5 * layerStrength(rg250, 0)) < 1e-9);
});
