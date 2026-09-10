import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => readFileSync(path.join(root, file));
const json = (file) => JSON.parse(read(file));
const data = (file) => json(`public/data/${file}`);
const evidence = json('docs/map-validation.json');
const meta = data('metadata.json');
const cities = data('municipalities.json');
const codes = new Set(cities.map((city) => city.id));
const series = data('series.json');
const sum = (values) => values.reduce((a, b) => a + b, 0);
const keys = (value) => Object.keys(value).sort();

assert.equal(codes.size, 5570, 'Municipal coverage');
for (const city of cities) {
  assert.deepEqual(keys(city), ['id', 'lat', 'lng', 'name', 'uf']);
  assert(city.lat >= -34 && city.lat <= 6 && city.lng >= -74 && city.lng <= -28);
}
assert.deepEqual(readdirSync(path.join(root, 'public/data')).sort(), keys(evidence.assets));
for (const [name, expected] of Object.entries(evidence.assets)) {
  const bytes = read(`public/data/${name}`);
  assert.equal(bytes.length, expected.bytes, `${name}: size`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256, `${name}: hash`);
}
for (const [index, year] of meta.years.entries()) {
  const values = data(`notifications-${year}.json`);
  const annual = meta.annual[year];
  assert.equal(sum(Object.values(values)), annual.mapped, `${year}: mapped total`);
  assert.equal(annual.mapped + annual.unmapped, annual.total, `${year}: national total`);
  for (const [id, value] of Object.entries(values)) {
    assert(codes.has(id) && Number.isInteger(value) && value > 0);
    assert.equal(series[id][index], value, `${year}/${id}: time series`);
  }
  for (const [id, values] of Object.entries(data(`climate-${year}.json`))) {
    assert(codes.has(id) && values.length === 5 && values[2] >= 0 && values[3] >= 0);
  }
}
let totalFacilities = 0;
for (const id of meta.study) {
  const areas = data(`udh-${id}.geojson`);
  const facilities = data(`facilities-${id}.json`);
  assert.equal(areas.features.length, meta.udhCounts[id]);
  assert.equal(sum(areas.features.map((f) => f.properties.cnes)), facilities.length);
  for (const feature of areas.features) {
    assert.deepEqual(keys(feature.properties), ['city', 'cnes', 'id', 'idhm', 'income', 'ivs', 'name']);
  }
  for (const row of facilities) {
    assert(row.length === 5 && row[2] >= -34 && row[2] <= 6 && row[3] >= -74 && row[3] <= -28);
  }
  totalFacilities += facilities.length;
}
assert.equal(totalFacilities, meta.cnes.linked);
const dag = json('docs/dag-evidence.json');
const svg = read('public/diagrams/vigiar-airflow-dag.svg').toString();
assert.equal(dag.taskCount, 11);
assert.equal(dag.edgeCount, 12);
for (const edge of dag.edges) {
  assert(svg.includes(`data-source="${edge.source}" data-target="${edge.target}"`));
}
const reports = readdirSync(path.join(root, 'public/reports'));
assert.equal(reports.length, 2);
const publicEdition = json('docs/public-edition.json');
for (const file of reports) {
  const bytes = read(`public/reports/${file}`);
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), publicEdition.reports[file].sha256, `${file}: public edition hash`);
}
console.log(`Verified ${Object.keys(evidence.assets).length} data files, ${codes.size} municipalities, ${meta.years.length} annual totals, ${totalFacilities} CNES links, the DAG and 2 PDFs.`);
