"""Export the frozen v44 estimator for browser inference; never fit a model.

Run with scikit-learn==1.7.2, pandas, numpy, pyarrow and joblib installed.
Only learned scalar parameters and municipal weekly aggregates are published.
"""
import hashlib
import json
import sys
from datetime import timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn

ROOT = Path(__file__).resolve().parents[1]
RUN_ID = 'r20260913T164702_dbba0708'
RUN = ROOT.parent / 'vigiar/output/notification_experiment_registry/runs' / RUN_ID
registry = json.loads((RUN / 'run.json').read_text(encoding='utf-8'))
assert registry['status'] == 'completed'
assert sklearn.__version__ == '1.7.2', 'Use the original estimator version'
hashes = registry['artifacts_sha256']
provenance = []


def verified(name):
    path = RUN / name
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    assert digest == hashes[name], f'Artifact changed: {name}'
    provenance.append({'artifact': name, 'sha256': digest})
    return path


# Unpickling is restricted to our hash-verified frozen artifact and its code.
for name in hashes:
    if name.startswith('snapshot/experiments/') and name.endswith('.py'):
        verified(name)
sys.path.insert(0, str(RUN / 'snapshot'))
model = joblib.load(verified('artifacts/model.joblib'))
panel = pd.read_parquet(verified('artifacts/dataset.parquet'))
weekly = pd.read_csv(verified('snapshot/output/climate_features_2025_extension_20260912/weekly.csv'), dtype={'geocode': str})
pre = model.named_steps['preprocess']
numeric = pre.named_transformers_['numeric']
imputer, scaler = numeric.named_steps['impute'], numeric.named_steps['scale']
estimator = model.named_steps['regressor']
features = pre.transformers_[0][2]
categories = pre.named_transformers_['city'].categories_[0].tolist()
assert len(features) == 17 and len(categories) == 5
assert not model.preserve_growth_upward
parameters = dict(numericFeatures=features, medians=imputer.statistics_.tolist(),
                  missingIndicators=imputer.indicator_.features_.tolist(),
                  means=scaler.mean_.tolist(), scales=scaler.scale_.tolist(),
                  categories=categories, coefficients=estimator.coef_.tolist(),
                  intercept=float(estimator.intercept_), gamma=model.gamma,
                  activityThresholds=model.limits)
published = json.loads((ROOT / 'public/health-meeting/predictions.json').read_text(encoding='utf-8'))
dates = sorted({r['week'] for r in published['predictions']})
first = pd.Timestamp(pd.Timestamp(dates[0]).date() - timedelta(weeks=52))
last = pd.Timestamp(dates[-1])
history = {}
for city in categories:
    rows = panel.loc[(panel.city == city) & panel.week.between(first, last), ['week', 'notifications']].copy()
    rows['date'] = rows.week.dt.strftime('%Y-%m-%d')
    rows = rows.merge(weekly.loc[weekly.geocode == city, ['date', 'temperature_mean_c', 'precipitation_total_mm']], on='date', how='left').sort_values('date')
    assert len(rows) == 156 and rows.notifications.notna().all()
    history[city] = [dict(date=r.date, notifications=int(r.notifications),
                          temperature=None if pd.isna(r.temperature_mean_c) else r.temperature_mean_c,
                          precipitation=None if pd.isna(r.precipitation_total_mm) else r.precipitation_total_mm)
                     for r in rows.itertuples()]


def make_features(city, date, counts, climate):
    values = {f'log_lag{k}': np.log1p(counts[-1-k]) for k in [0, 1, 2, 3, 4, 8, 12, 52]}
    values.update({f'log_mean{k}': np.log1p(np.mean(counts[-k:])) for k in [4, 8, 13]})
    phase = 2 * np.pi * (pd.Timestamp(date).date() + timedelta(days=7)).timetuple().tm_yday / 365.2425
    values.update(season_sin=np.sin(phase), season_cos=np.cos(phase), city=city,
                  persistence_last_week=4 * counts[-1], persistence_4w=sum(counts[-4:]))
    for k in [4, 8]:
        t = [r['temperature'] for r in climate[-k:]]
        p = [r['precipitation'] for r in climate[-k:]]
        values[f'climate_temp_mean{k}'] = np.nan if None in t else np.mean(t)
        values[f'climate_rain_sum{k}'] = np.nan if None in p else sum(p)
    return values


def context(city, date):
    index = next(i for i, r in enumerate(history[city]) if r['date'] == date)
    return ([r['notifications'] for r in history[city][index-52:index+1]],
            [dict(r) for r in history[city][index-8:index]])


# Compare feature reconstruction and the original estimator for all saved origins.
reconstructed, expected = [], []
max_feature_delta = 0.
for row in published['predictions']:
    counts, climate = context(row['city'], row['week'])
    values = make_features(row['city'], row['week'], counts, climate)
    original = panel.loc[(panel.city == row['city']) & (panel.week == row['week'])].iloc[0]
    for feature in features:
        delta = abs(values[feature] - original[feature])
        if not np.isnan(delta):
            max_feature_delta = max(max_feature_delta, delta)
    reconstructed.append(values)
    expected.append(row['predicted'])
predictions = model.predict(pd.DataFrame(reconstructed))
max_delta = float(np.max(np.abs(predictions - expected)))
# Weekly CSV/feature CSV were independently rounded to ten significant digits.
assert max_feature_delta < 0.00001, max_feature_delta
assert max_delta < 0.001, max_delta

# Independent sklearn answers for edited inputs, including missing climate and
# zero notifications. These are inference parity checks, not model evaluation.
fixtures = []
for city in categories:
    date = '2024-06-30'
    for scenario in ['edited', 'zero', 'missing']:
        counts, climate = context(city, date)
        if scenario == 'edited':
            counts[-1] += 37
            counts[-5] += 11
            counts[0] += 19
            climate[-1]['temperature'] = 31.5
            climate[-1]['precipitation'] = 112.
        elif scenario == 'zero':
            counts = [0] * 53
            climate = [{**r, 'precipitation': 0., 'temperature': 0.} for r in climate]
        else:
            climate[-1]['temperature'] = None
            climate[-5]['precipitation'] = None
        values = make_features(city, date, counts, climate)
        result = float(model.predict(pd.DataFrame([values]))[0])
        fixtures.append(dict(city=city, date=date, scenario=scenario, counts=counts,
                             climate=climate, expected=result))

payload = dict(schemaVersion=1, sourceRun=RUN_ID, sourceVersion='v000044',
               parameters=parameters, dates=dates, cities=published['cities'], history=history,
               verification=dict(origins=520, maxPredictionDelta=max_delta,
                                 maxFeatureDelta=max_feature_delta, sklearnVersion=sklearn.__version__),
               provenance=[p for p in provenance if not p['artifact'].endswith('.py')])
out = ROOT / 'public/health-meeting/inference.json'
out.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(',', ':'))+'\n', encoding='utf-8', newline='\n')
fixture_path = ROOT / 'scripts/fixtures/inference.json'
fixture_path.parent.mkdir(exist_ok=True)
fixture_path.write_text(json.dumps(fixtures, ensure_ascii=False, allow_nan=False, separators=(',', ':'))+'\n', encoding='utf-8', newline='\n')
print(f'Exported frozen estimator; 520 origins, max prediction delta {max_delta:.10g}; {len(fixtures)} edited-input checks. No fitting.')
