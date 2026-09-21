import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  historicalInput,
  predict,
  addDays,
} from '../src/health-meeting/inference.ts';
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const bundle = read('../public/health-meeting/inference.json');
const published = read('../public/health-meeting/predictions.json');
const fixtures = read('./fixtures/inference.json');
assert.equal(bundle.sourceRun, published.sourceRun);
assert.equal(bundle.sourceVersion, published.sourceVersion);
assert.equal(bundle.parameters.numericFeatures.length, 17);
assert.equal(
  bundle.parameters.coefficients.length,
  bundle.parameters.means.length + 5,
);
let maxDelta = 0;
for (const row of published.predictions) {
  const input = historicalInput(bundle, row.city, row.week);
  const actual = predict(
    bundle,
    row.city,
    row.week,
    input.counts,
    input.climate,
  );
  maxDelta = Math.max(maxDelta, Math.abs(actual.prediction - row.predicted));
  assert(
    Math.abs(actual.prediction - row.predicted) < 0.001,
    `${row.city}:${row.week}`,
  );
  assert.equal(actual.start, row.start);
  assert.equal(actual.end, row.end);
  assert.equal(actual.activity, row.baseline);
}
for (const fixture of fixtures) {
  const result = predict(
    bundle,
    fixture.city,
    fixture.date,
    fixture.counts,
    fixture.climate,
  );
  assert(
    Math.abs(result.prediction - fixture.expected) <
      Math.max(1e-8, fixture.expected * 1e-12),
    `${fixture.city}:${fixture.scenario} sklearn parity`,
  );
  assert.equal(result.lowActivity, result.activity <= result.threshold);
}
const input = historicalInput(bundle, '3304557', '2024-06-30');
const run = (
  counts = input.counts,
  climate = input.climate,
  city = '3304557',
  date = '2024-06-30',
) => predict(bundle, city, date, counts, climate);
for (const bad of [-1, NaN, Infinity, 1.5]) {
  const counts = [...input.counts];
  counts[52] = bad;
  assert.throws(() => run(counts));
}
assert.throws(() => run(input.counts.slice(1)));
assert.throws(() => run(undefined, undefined, 'unknown'));
assert.throws(() => run(undefined, undefined, undefined, '2024-07-01'));
assert.throws(() => run(undefined, undefined, undefined, 'invalid'));
assert.throws(() => historicalInput(bundle, '3304557', '2026-09-20'));
assert.throws(() => run(undefined, input.climate.slice(1)));
assert.throws(() =>
  run(
    undefined,
    input.climate.map((r, i) =>
      i === 0 ? { ...r, date: addDays(r.date, 7) } : r,
    ),
  ),
);
assert.throws(() =>
  run(
    undefined,
    input.climate.map((r) => ({ ...r, precipitation: -1 })),
  ),
);
assert.throws(() =>
  run(
    undefined,
    input.climate.map((r) => ({ ...r, temperature: Infinity })),
  ),
);
// The learned gate is inclusive, and lag 52 must affect the result.
const counts = Array(53).fill(0);
counts[52] = bundle.parameters.activityThresholds['3304557'];
assert.equal(run(counts).gamma, 0.5);
counts[52]++;
assert.equal(run(counts).gamma, 1);
const changed = [...input.counts];
changed[0] += 100;
assert.notEqual(run(changed).prediction, run().prediction);
assert.equal(run().features.log_lag52, Math.log1p(input.counts[0]));
const missing = input.climate.map((r, i) =>
  i === 7 ? { ...r, temperature: null } : r,
);
assert.deepEqual(run(undefined, missing).imputedFeatures, [
  'climate_temp_mean4',
  'climate_temp_mean8',
]);
console.log(
  `Inference: 520 saved predictions (max delta ${maxDelta}), 15 sklearn scenarios, missing data, zero inputs, temporal alignment and invalid inputs verified.`,
);
