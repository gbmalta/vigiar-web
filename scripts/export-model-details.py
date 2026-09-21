"""Publish allowlisted model metadata from frozen runs; never load fitted models."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUNS = ROOT.parent / 'vigiar/output/notification_experiment_registry/runs'
SOURCES = [
    ('v000044', 'r20260913T164702_dbba0708', 'Poisson com ajuste de baixa atividade'),
    ('v000051', 'r20260913T164710_1c2162a3', 'Poisson com correção para cima preservada'),
    ('v000022', 'r20260913T164717_f54a72d4', 'Poisson com correção da persistência'),
    ('v000031', 'r20260913T164726_26eee747', 'Poisson com seleção aninhada de atributos'),
    ('v000019', 'r20260913T164737_3a824a46', 'Poisson direto'),
]
provenance = []


def verified(run_id, name):
    folder = RUNS / run_id
    run = json.loads((folder / 'run.json').read_text(encoding='utf-8'))
    assert run['status'] == 'completed'
    raw = (folder / name).read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    assert digest == run['artifacts_sha256'][name], name
    provenance.append(dict(run=run_id, artifact=name, sha256=digest))
    return json.loads(raw)


run_id = SOURCES[0][1]
schema = verified(run_id, 'artifacts/feature_schema.json')
selection = verified(run_id, 'artifacts/nested_selection_holdout.json')
training = verified(run_id, 'artifacts/training_summary.json')
protocol = verified(run_id, 'artifacts/protocol.json')
variants = []
for version, source, label in SOURCES:
    summary = training if source == run_id else verified(source, 'artifacts/training_summary.json')
    score = next(m for m in summary['metrics'] if m['split'] == 'test' and m['model'] == 'poisson')
    assert score['n'] == 520
    assert summary['evaluation_hash'] == training['evaluation_hash']
    original = next(v for v in protocol['selected_before_test'] if v['state'] == version)
    variants.append(dict(version=version, run=source, label=label,
                         validationMAE=original['validation_macro_mae'],
                         mae=score['mae'], wape=score['wape'], bias=score['bias'], n=score['n']))

payload = dict(
    schemaVersion=1, sourceRun=run_id, sourceVersion='v000044',
    features=[f['name'] for f in schema['features']],
    parameters=selection['model_config']['params'],
    selectedQuantile=selection['chosen_quantile'], selectedGamma=selection['chosen_gamma'],
    activityThresholds=selection['activity_thresholds'],
    estimatorFits=selection['n_estimator_fits'],
    candidateCount=len(selection['candidate_scores']),
    train={k: training['split_summary']['train'][k] for k in ['n', 'first_week', 'last_week', 'last_target_end']},
    test={k: training['split_summary']['test'][k] for k in ['n', 'first_week', 'last_week', 'last_target_end']},
    innerFolds=[{k: f[k] for k in ['inner_fold', 'n_train', 'n_validation', 'training_last_label_ready_date',
                                  'validation_first_week', 'validation_last_week']} for f in selection['inner_folds']],
    variants=variants,
    baselines=[{k: m[k] for k in ['model', 'n', 'mae', 'wape']} for m in training['metrics']
               if m['split'] == 'test' and m['model'] != 'poisson'],
    provenance=provenance,
)
assert len(payload['features']) == 18
out = ROOT / 'public/health-meeting/model-details.json'
out.write_text(json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8', newline='\n')
print(f'Exported verified model metadata: {len(variants)} configurations, 18 features.')
