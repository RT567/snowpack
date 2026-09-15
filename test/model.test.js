import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate, depth, rho, newSnowDensity, snowFraction } from '../src/snow/model.js';
import { hours, record, solar, P1 } from './helpers.js';

test('snow fraction: cold and saturated is snow, warm is rain', () => {
  assert.equal(snowFraction(-3, 90), 1);
  assert.equal(snowFraction(4, 90), 0);
  assert.ok(snowFraction(1.5, 60) > 0.5, 'dry air at +1.5 still mostly snow via wet-bulb');
});

test('new snow density rises with temperature and wind', () => {
  assert.ok(newSnowDensity(-15, 1) < newSnowDensity(-1, 1));
  assert.ok(newSnowDensity(-5, 12) > newSnowDensity(-5, 2));
});

test('a cold storm builds one layer of new snow with plausible depth', () => {
  const hs = hours(24, () => ({ temp: -4, rh: 95, dew: -4.5, precip: 1.5, wind: 3, cloud: 100 }));
  const snaps = simulate(record(hs), P1);
  const s = snaps.at(-1);
  assert.equal(s.layers.length, 1, 'one storm, one layer');
  assert.equal(s.layers[0].grain, 'PP');
  const d = depth(s);
  assert.ok(d > 0.25 && d < 0.5, `36 mm at ~100 kg/m³ is ~35 cm, got ${d}`);
});

test('new snow settles and ages into decomposing then rounded grains', () => {
  const storm = hours(12, () => ({ temp: -6, rh: 95, dew: -6.5, precip: 4, cloud: 100 }));
  const calm = hours(24 * 6, (i) => ({ temp: -2, rh: 70, dew: -7, sw: solar(i, 150), cloud: 80, wind: 2 }), storm.at(-1).t + 3600_000);
  const snaps = simulate(record([...storm, ...calm]), P1);
  const afterStorm = depth(snaps[11]);
  const later = depth(snaps.at(-1));
  assert.ok(later < afterStorm * 0.85, `settled: ${afterStorm} -> ${later}`);
  assert.equal(snaps.at(-1).layers[0].grain, 'RG');
  assert.ok(rho(snaps.at(-1).layers[0]) > 150);
});

test('rain on snow wets the top and refreezing makes a melt-freeze crust', () => {
  const storm = hours(12, () => ({ temp: -6, rh: 95, dew: -6.5, precip: 2, cloud: 100 }));
  const rain = hours(6, () => ({ temp: 4, rh: 98, dew: 3.5, precip: 3, cloud: 100, wind: 8 }), storm.at(-1).t + 3600_000);
  const freeze = hours(24, () => ({ temp: -8, rh: 60, dew: -14, cloud: 0, wind: 2 }), rain.at(-1).t + 3600_000);
  const snaps = simulate(record([...storm, ...rain, ...freeze]), P1);
  const wet = snaps[17].layers.at(-1);
  assert.equal(wet.grain, 'MF');
  assert.ok(wet.lwc > 0, 'holding liquid during rain');
  const crust = snaps.at(-1).layers.at(-1);
  assert.equal(crust.grain, 'MF');
  assert.equal(crust.lwc, 0, 'refrozen');
  assert.ok(crust.wetCount >= 1);
  assert.ok(rho(crust) > 250, `crust densified: ${rho(crust)}`);
});

test('clear calm humid nights grow surface hoar, which the next storm buries', () => {
  const storm = hours(12, () => ({ temp: -6, rh: 95, dew: -6.5, precip: 2, cloud: 100 }));
  const nights = hours(48, (i) => ({ temp: -6, rh: 92, dew: -7, wind: 1.5, cloud: 5, sw: solar(i, 120) }), storm.at(-1).t + 3600_000);
  const snaps1 = simulate(record([...storm, ...nights]), P1);
  assert.equal(snaps1.at(-1).layers.at(-1).grain, 'SH', 'hoar on the surface after clear nights');
  const storm2 = hours(12, () => ({ temp: -5, rh: 95, dew: -5.5, precip: 2, cloud: 100, wind: 3 }), nights.at(-1).t + 3600_000);
  const snaps2 = simulate(record([...storm, ...nights, ...storm2]), P1);
  const L = snaps2.at(-1).layers;
  assert.equal(L.at(-1).grain, 'PP');
  assert.equal(L.at(-2).grain, 'SH', 'buried hoar layer persists');
});

test('strong wind on new snow makes a dense wind slab', () => {
  const calmStorm = hours(12, () => ({ temp: -6, rh: 95, dew: -6.5, precip: 2, cloud: 100, wind: 2 }));
  const windyStorm = hours(12, () => ({ temp: -6, rh: 95, dew: -6.5, precip: 2, cloud: 100, wind: 14, gust: 22 }));
  const a = simulate(record(calmStorm), P1).at(-1).layers[0];
  const b = simulate(record(windyStorm), P1).at(-1).layers[0];
  assert.ok(rho(b) > rho(a) * 1.8, `wind slab denser: ${rho(a)} vs ${rho(b)}`);
  assert.ok(b.windPacked);
});

test('a thin pack under a long cold clear spell facets', () => {
  const storm = hours(8, () => ({ temp: -6, rh: 95, dew: -6.5, precip: 1.5, cloud: 100 }));
  const cold = hours(24 * 6, (i) => ({ temp: -12, rh: 60, dew: -18, wind: 2, cloud: 10, sw: solar(i, 150) }), storm.at(-1).t + 3600_000);
  const snaps = simulate(record([...storm, ...cold]), P1);
  const grains = snaps.at(-1).layers.map((l) => l.grain);
  assert.ok(grains.some((g) => g === 'FC' || g === 'DH'), `expected facets, got ${grains}`);
});

test('a warm humid overcast spell melts snow away', () => {
  const storm = hours(12, () => ({ temp: -3, rh: 95, dew: -3.5, precip: 1, cloud: 100 }));
  const warm = hours(24 * 4, () => ({ temp: 5, rh: 95, dew: 4.2, wind: 6, cloud: 100, sw: 80 }), storm.at(-1).t + 3600_000);
  const snaps = simulate(record([...storm, ...warm]), P1);
  assert.ok(depth(snaps.at(-1)) < depth(snaps[11]) * 0.3, 'most of a 12 mm storm gone after four warm days');
});

test('snapshots are independent: stepping does not mutate earlier snapshots', () => {
  const hs = hours(30, (i) => ({ temp: -4, rh: 95, dew: -4.5, precip: i < 10 ? 1 : 0, cloud: 100 }));
  const snaps = simulate(record(hs), P1);
  const d10 = depth(snaps[9]);
  assert.ok(depth(snaps[29]) < d10, 'settling later');
  assert.equal(depth(snaps[9]), d10, 'earlier snapshot unchanged');
});
