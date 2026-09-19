"""Export only allowlisted municipal aggregates from a verified, frozen run."""
import csv
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUN_ID = 'r20260913T164702_dbba0708'
SOURCE = ROOT.parent / 'vigiar/output/notification_experiment_registry/runs' / RUN_ID
run = json.loads((SOURCE / 'run.json').read_text(encoding='utf-8'))
assert run['status'] == 'completed'
for name in ['predictions.csv', 'protocol.json', 'metrics.json']:
    relative = 'artifacts/' + name
    assert hashlib.sha256((SOURCE / relative).read_bytes()).hexdigest() == run['artifacts_sha256'][relative], name
with (SOURCE / 'artifacts/predictions.csv').open(encoding='utf-8', newline='') as stream:
    rows = [r for r in csv.DictReader(stream) if r['split'] == 'test']
baseline = {(r['geocode'], r['week']): r for r in rows if r['model'] == 'persistence_4w'}
predictions = []
for r in rows:
    if r['model'] != 'poisson':
        continue
    b = baseline[(r['geocode'], r['week'])]
    assert float(b['y_true']) == float(r['y_true'])
    item = dict(city=r['geocode'], week=r['week'], origin=r['origin_date'], start=r['target_start'], end=r['target_end'], observed=float(r['y_true']), predicted=float(r['y_pred']), baseline=float(b['y_pred']))
    assert all(math.isfinite(item[k]) and item[k] >= 0 for k in ['observed', 'predicted', 'baseline'])
    predictions.append(item)
assert len(predictions) == 520
assert len({(r['city'], r['week']) for r in predictions}) == 520
city_ids = {r['city'] for r in predictions}
cities = [r for r in json.loads((ROOT / 'public/data/municipalities.json').read_text(encoding='utf-8')) if r['id'] in city_ids]
assert len(cities) == 5
metrics = next(m for m in run['summary']['metrics'] if m['model'] == 'poisson' and m['split'] == 'test')
mae = sum(abs(r['predicted'] - r['observed']) for r in predictions) / len(predictions)
assert math.isclose(mae, metrics['mae'], rel_tol=1e-10)
payload = dict(schemaVersion=1, sourceRun=RUN_ID, sourceVersion='v000044', evaluatedAt=run['finished_at_utc'], sourceHash=run['artifacts_sha256']['artifacts/predictions.csv'], model='Poisson · histórico + clima', horizonWeeks=4, retrospective=True, previouslyExplored=True, intervalAvailable=False, cities=cities, predictions=sorted(predictions, key=lambda r: (r['week'], r['city'])))
out = ROOT / 'public/health-meeting'
out.mkdir(exist_ok=True)
raw = (json.dumps(payload, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n').encode()
(out / 'predictions.json').write_bytes(raw)
(out / 'manifest.json').write_text(json.dumps(dict(sha256=hashlib.sha256(raw).hexdigest(), rows=520, cities=5, weeks=104, sourceRun=RUN_ID, sourceHash=payload['sourceHash']), indent=2) + '\n', encoding='utf-8')
with (out / 'predictions.csv').open('w', encoding='utf-8', newline='') as stream:
    writer = csv.DictWriter(stream, fieldnames=list(predictions[0]))
    writer.writeheader()
    writer.writerows(payload['predictions'])
print(f'Exported {len(predictions)} verified municipal predictions ({len(raw):,} bytes).')
