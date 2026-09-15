import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonDates, firstSnowIndex, availableSeasons, localDate } from '../src/snow/season.js';
import { simulate } from '../src/snow/model.js';
import { hours, record, P1 } from './helpers.js';

test('season dates clamp to today for the current year', () => {
  const now = new Date(Date.UTC(2026, 8, 14, 20)); // 15 Sep 06:00 AEST
  assert.deepEqual(seasonDates(2026, now), { year: 2026, start: '2026-05-01', end: '2026-09-15', current: true });
  assert.deepEqual(seasonDates(2024, now), { year: 2024, start: '2024-05-01', end: '2024-10-31', current: false });
});

test('local date respects the Sydney offset', () => {
  assert.equal(localDate(new Date(Date.UTC(2026, 5, 30, 15)), 'Australia/Sydney'), '2026-07-01');
});

test('first snow index finds the first real cover', () => {
  const hs = hours(48, (i) => ({ temp: -4, rh: 95, dew: -4.5, precip: i >= 20 ? 1.5 : 0, cloud: 100 }));
  const i = firstSnowIndex(simulate(record(hs), P1));
  assert.ok(i >= 20 && i <= 23, `got ${i}`);
});

test('available seasons run from the current year back to 1990', () => {
  const ys = availableSeasons(new Date(Date.UTC(2026, 8, 14)));
  assert.equal(ys[0], 2026);
  assert.equal(ys.at(-1), 1990);
});
