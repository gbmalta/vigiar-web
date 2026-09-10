import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = path.join(root, 'public/analytics');
const read = (name) => JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
const manifest = read('manifest.json');
assert.deepEqual(
  readdirSync(dir)
    .filter((n) => n !== 'manifest.json')
    .sort(),
  Object.keys(manifest.files).sort(),
);
for (const [name, expected] of Object.entries(manifest.files)) {
  const bytes = readFileSync(path.join(dir, name));
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    expected,
    name,
  );
}
const method = read('method.json'),
  quality = read('quality.json'),
  analysis = read('analysis.json'),
  panel = read('panel.json');
assert.equal(method.schemaVersion, 1);
assert.equal(method.runId, manifest.runId);
assert.equal(method.sources.length, 18);
assert.equal(method.totals.notifications, 12506888);
assert.equal(method.totals.rows, 12493876);
assert.equal(method.featureCount, analysis.features.length);
assert.equal(panel.length, method.panelRows);
assert.equal(
  new Set(panel.map((r) => `${r.city}|${r.week}`)).size,
  panel.length,
);
assert.equal(analysis.features.length, 45);
assert.equal(analysis.devRows, 1025);
assert.equal(analysis.evaluationRows, 260);
assert.equal(analysis.purgedRows, 20);
const eventCount = analysis.cities.reduce((n, c) => n + c.evaluationEvents, 0);
assert.equal(eventCount, 59);
const allowedColumns = new Set([
  'city',
  'week',
  'notifications',
  'burden',
  'threshold',
  'target',
  'split',
  'reporter_coverage',
  ...analysis.features.map((f) => f.id),
]);
const tolerance = (a, b, epsilon = 1e-6) =>
  assert(Math.abs(a - b) < epsilon, `${a} differs from ${b}`);
for (const city of analysis.cities) {
  const rows = panel.filter((r) => r.city === city.id);
  assert.equal(rows.length, 286);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    assert.equal(new Date(`${r.week}T00:00:00Z`).getUTCDay(), 0);
    assert(Number.isInteger(r.notifications) && r.notifications >= 0);
    for (const key of Object.keys(r))
      assert(allowedColumns.has(key), `Unapproved public field: ${key}`);
    if (i + 4 < rows.length) {
      assert.equal(
        r.burden,
        rows.slice(i + 1, i + 5).reduce((n, x) => n + x.notifications, 0),
      );
      assert.equal(r.target, Number(r.burden >= city.threshold));
    } else {
      assert.equal(r.burden, null);
      assert.equal(r.target, null);
    }
    if (r.split === 'development')
      assert(
        new Date(r.week).getTime() + 34 * 86400000 <
          new Date(analysis.evaluationStart).getTime(),
      );
  }
  const train = rows.filter((r) => r.split === 'development'),
    test = rows.filter((r) => r.split === 'evaluation');
  assert.equal(train.length, city.devRows);
  assert.equal(test.length, city.evaluationRows);
  assert.equal(
    test.reduce((n, r) => n + r.target, 0),
    city.evaluationEvents,
  );
  const burdens = train.map((r) => r.burden).sort((a, b) => a - b);
  const ix = (burdens.length - 1) * 0.8,
    lower = Math.floor(ix),
    fraction = ix - lower;
  tolerance(
    burdens[lower] * (1 - fraction) + burdens[Math.ceil(ix)] * fraction,
    city.threshold,
  );
}
for (const run of [analysis, analysis.secondary]) {
  for (const f of run.features) {
    assert.equal(f.bins.length, f.cuts.length + 2);
    assert(f.bins.at(-1).missing);
    assert(f.missingDev >= 0 && f.missingDev <= 1);
    assert(f.missingEvaluation >= 0 && f.missingEvaluation <= 1);
    for (const [period, total, field] of [
      ['dev', run.devRows, 'ivDev'],
      ['evaluation', run.evaluationRows, 'ivEvaluation'],
    ]) {
      const counts = f.bins.map((b) => b[period]);
      const n0 = counts.reduce((n, b) => n + b.nonEvent, 0),
        n1 = counts.reduce((n, b) => n + b.event, 0);
      assert.equal(n0 + n1, total);
      tolerance(
        (counts.at(-1).nonEvent + counts.at(-1).event) / total,
        period === 'dev' ? f.missingDev : f.missingEvaluation,
      );
      if (f[field] == null) continue;
      assert(n0 > 0 && n1 > 0);
      let iv = 0;
      for (const b of counts) {
        const p0 = (b.nonEvent + 0.5) / (n0 + 0.5 * counts.length),
          p1 = (b.event + 0.5) / (n1 + 0.5 * counts.length);
        const woe = Math.log(p0 / p1);
        tolerance(woe, b.woe);
        tolerance((p0 - p1) * woe, b.contribution);
        iv += (p0 - p1) * woe;
      }
      tolerance(iv, f[field]);
    }
  }
}
for (const row of quality.missingness) {
  if (row.nulls == null) assert.equal(row.completeness, null);
  else tolerance(1 - row.nulls / row.rows, row.completeness);
}
for (const c of quality.checks) {
  assert(c.numerator >= 0 && c.numerator <= c.denominator);
  if (c.denominator) tolerance(c.numerator / c.denominator, c.rate);
}
quality.funnel.forEach((s, i) => {
  tolerance(s.n / quality.funnel[0].n, s.retained);
  if (i) assert.equal(quality.funnel[i - 1].n - s.n, s.lossPrevious);
});
for (const t of quality.timeliness) {
  assert(t.open >= 0 && t.open <= t.total);
  assert.equal(t.notification.valid + t.delay_negative, t.delay_present);
  assert.equal(t.closure.valid + t.closure_negative, t.closure_present);
}
const text = JSON.stringify({ method, quality, analysis, panel });
assert(!/TBD|Infinity|NaN/.test(text));
const pdf = readFileSync(
  path.join(root, 'public/research/VIGIAR_Relatorio_Metricas_Artigo.pdf'),
);
assert(pdf.subarray(0, 5).toString() === '%PDF-');
assert(pdf.length > 10000);
const report = readFileSync(
  path.join(root, 'public/research/VIGIAR_Relatorio_Metricas_Artigo.md'),
  'utf8',
);
assert(
  report.includes('1.025') && report.includes('260') && report.includes('59'),
);
const result = {
  status: 'passed',
  files: Object.keys(manifest.files).length,
  features: analysis.features.length,
  panelRows: panel.length,
  development: analysis.devRows,
  evaluation: analysis.evaluationRows,
  events: eventCount,
  checks: [
    'input/output fingerprints',
    'four-week targets',
    'development-only quantiles',
    'temporal purge',
    'WOE/IV formulas',
    'denominators',
    'public aggregate schema',
    'report artifacts',
  ],
};
console.log(JSON.stringify(result, null, 2));
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### Métricas verificadas\n\n${result.features} variáveis; ${result.development} origens de desenvolvimento; ${result.evaluation} de avaliação; ${result.events} eventos. Fórmulas e agregados públicos conferidos.\n`,
  );
