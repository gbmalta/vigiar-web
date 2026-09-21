import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { metrics, trend, change } from '../src/health-meeting/data.ts';
import {
  historyWindow,
  sparkline,
  placeCards,
  regionColor,
} from '../src/health-meeting/map-data.ts';

const read = (name) =>
  readFileSync(new URL(`../public/health-meeting/${name}`, import.meta.url));
const data = JSON.parse(read('predictions.json'));
const manifest = JSON.parse(read('manifest.json'));
assert.equal(
  createHash('sha256').update(read('predictions.json')).digest('hex'),
  manifest.sha256,
);
assert.equal(data.predictions.length, 520);
assert.equal(data.cities.length, 5);
assert.equal(new Set(data.predictions.map((r) => r.week)).size, 104);
assert.equal(
  new Set(data.predictions.map((r) => `${r.city}:${r.week}`)).size,
  520,
);
assert.equal(data.retrospective, true);
assert.equal(data.previouslyExplored, true);
assert.equal(data.intervalAvailable, false);
let regions = 0;
for (const city of data.cities) {
  const geo = JSON.parse(
    readFileSync(
      new URL(`../public/data/udh-${city.id}.geojson`, import.meta.url),
    ),
  );
  regions += geo.features.length;
  assert.equal(
    new Set(geo.features.map((f) => f.properties.id)).size,
    geo.features.length,
  );
  for (const { properties: r } of geo.features) {
    assert.equal(r.city, city.id);
    for (const key of ['ivs', 'idhm'])
      assert(
        r[key] === null ||
          (Number.isFinite(r[key]) && r[key] >= 0 && r[key] <= 1),
      );
    for (const key of ['income', 'cnes'])
      assert(r[key] === null || (Number.isFinite(r[key]) && r[key] >= 0));
    assert.equal(
      Object.hasOwn(r, 'predicted'),
      false,
      'Never derive predictions for UDHs',
    );
  }
}
assert.equal(regions, 1961);
assert.equal(regionColor({ ivs: null }, 'ivs'), '#c4c9c6');
assert.notEqual(
  regionColor({ cnes: 0 }, 'cnes'),
  regionColor({ cnes: null }, 'cnes'),
);
for (const city of data.cities) {
  for (const week of ['2024-01-07', '2024-06-30', '2025-12-28']) {
    const series = historyWindow(data.predictions, city.id, week);
    assert(series.length > 0 && series.length <= 26);
    assert(series.every((r) => r.city === city.id && r.week <= week));
    const shape = sparkline(series);
    assert(
      shape.max >=
        Math.max(...series.flatMap((r) => [r.observed, r.predicted])),
    );
    assert(!/NaN|Infinity/.test(shape.predicted + shape.observed));
    assert(shape.predictedEnd.y >= 3 && shape.predictedEnd.y <= 31);
  }
}
assert.equal(sparkline([]).predictedEnd, null);
assert.equal(sparkline([{ predicted: 0, observed: 0 }]).max, 1);
const placed = placeCards(
  [
    { id: 'manaus', x: 225, y: 133 },
    { id: 'recife', x: 369, y: 164 },
    { id: 'rio', x: 321, y: 252 },
    { id: 'poa', x: 277, y: 298 },
    { id: 'cuiaba', x: 250, y: 207 },
  ],
  593,
  430,
  137,
  83,
);
for (const [i, card] of placed.entries()) {
  assert(
    card.left >= 0 &&
      card.top >= 0 &&
      card.left + 137 <= 593 &&
      card.top + 83 <= 430,
  );
  for (const other of placed.slice(i + 1))
    assert(
      card.left + 137 <= other.left ||
        other.left + 137 <= card.left ||
        card.top + 83 <= other.top ||
        other.top + 83 <= card.top,
      'Map charts overlap',
    );
}
const DAY = 86400000;
for (const row of data.predictions) {
  assert(data.cities.some((c) => c.id === row.city));
  assert(row.week >= '2024-01-07' && row.week <= '2025-12-28');
  assert.equal((Date.parse(row.origin) - Date.parse(row.week)) / DAY, 6);
  assert.equal((Date.parse(row.start) - Date.parse(row.origin)) / DAY, 1);
  assert.equal((Date.parse(row.end) - Date.parse(row.start)) / DAY, 27);
  for (const key of ['observed', 'predicted', 'baseline'])
    assert(Number.isFinite(row[key]) && row[key] >= 0);
}
for (const city of data.cities)
  assert.equal(data.predictions.filter((r) => r.city === city.id).length, 104);
const measured = metrics(data.predictions);
const modelDetails = JSON.parse(read('model-details.json'));
assert.equal(modelDetails.sourceRun, data.sourceRun);
assert.equal(modelDetails.sourceVersion, data.sourceVersion);
assert.equal(modelDetails.features.length, 18);
assert.equal(new Set(modelDetails.features).size, 18);
assert(modelDetails.features.includes('city'));
assert.equal(modelDetails.test.n, data.predictions.length);
assert.equal(
  modelDetails.test.first_week,
  data.predictions.map((r) => r.week).sort()[0],
);
assert.equal(
  modelDetails.test.last_week,
  data.predictions
    .map((r) => r.week)
    .sort()
    .at(-1),
);
assert(modelDetails.train.last_target_end < modelDetails.test.first_week);
assert.equal(modelDetails.innerFolds.length, 3);
for (const fold of modelDetails.innerFolds) {
  assert(fold.training_last_label_ready_date < fold.validation_first_week);
  assert(fold.validation_last_week <= modelDetails.train.last_week);
  assert(fold.n_train < modelDetails.train.n);
}
assert.deepEqual(
  Object.keys(modelDetails.activityThresholds).sort(),
  data.cities.map((c) => c.id).sort(),
);
assert.equal(modelDetails.variants.length, 5);
const shownModel = modelDetails.variants.find(
  (v) => v.version === data.sourceVersion,
);
assert(Math.abs(shownModel.mae - measured.mae) < 1e-8);
assert(Math.abs(shownModel.wape * 100 - measured.wape) < 1e-8);
const bias =
  data.predictions.reduce((sum, r) => sum + r.predicted - r.observed, 0) /
  data.predictions.length;
assert(Math.abs(shownModel.bias - bias) < 1e-8);
const baselineMAE =
  data.predictions.reduce(
    (sum, r) => sum + Math.abs(r.baseline - r.observed),
    0,
  ) / data.predictions.length;
assert(
  Math.abs(
    modelDetails.baselines.find((b) => b.model === 'persistence_4w').mae -
      baselineMAE,
  ) < 1e-8,
);
for (const result of [...modelDetails.variants, ...modelDetails.baselines]) {
  assert.equal(result.n, data.predictions.length);
  assert(Number.isFinite(result.mae) && result.mae >= 0);
  assert(Number.isFinite(result.wape) && result.wape >= 0);
}
for (const source of modelDetails.provenance)
  assert.match(source.sha256, /^[a-f0-9]{64}$/);
assert(Math.abs(measured.mae - 667.813028689871) < 1e-8);
assert(Math.abs(measured.wape - 40.49957255935438) < 1e-8);
assert.equal(metrics([]).wape, null);
assert.equal(metrics([]).mae, null);
assert.equal(change({ baseline: 0, predicted: 15 }), null);
assert.equal(trend({ baseline: 0, predicted: 0 }), 'Sem base');
assert.equal(trend({ baseline: 100, predicted: 120 }), 'Estável');
assert.equal(trend({ baseline: 100, predicted: 121 }), 'Alta');
assert.equal(trend({ baseline: 100, predicted: 80 }), 'Estável');
assert.equal(trend({ baseline: 100, predicted: 79 }), 'Queda');
const worse = metrics([{ observed: 10, predicted: 20, baseline: 12 }]);
assert.equal(worse.gain, -400);
const csv = read('predictions.csv').toString().trim().split(/\r?\n/);
assert.equal(csv.length, 521);
assert.deepEqual(csv[0].split(','), Object.keys(data.predictions[0]));
for (let i = 0; i < data.predictions.length; i++) {
  const values = csv[i + 1].split(',');
  Object.entries(data.predictions[i]).forEach(([key, value], index) =>
    assert.equal(
      typeof value === 'number' ? Number(values[index]) : values[index],
      value,
      `CSV row ${i}, ${key}`,
    ),
  );
}
assert(
  !/local-benchmarks|api_key|access_token|password|C:\\\\Users/i.test(
    read('predictions.json').toString(),
  ),
);
console.log(
  'Health Meeting: hashes, CSV, 520 predictions, dates, city coverage, published metrics and edge cases verified.',
);
