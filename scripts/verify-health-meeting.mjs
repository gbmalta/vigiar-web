import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { metrics, trend, change } from '../src/health-meeting/data.ts';

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
