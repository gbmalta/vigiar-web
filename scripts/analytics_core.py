"""Pure, tested estimators for the public manuscript companion. No source I/O."""
import math
import numpy as np
import pandas as pd

ALPHA = 0.5
SEED = 20260909


def week_start(values):
    dates = pd.to_datetime(values)
    return dates - pd.to_timedelta((dates.dt.dayofweek + 1) % 7, unit='D')


def future_burden(values, horizon=4):
    """Sum t+1 through t+horizon; incomplete horizons stay missing."""
    return pd.concat([values.shift(-i) for i in range(1, horizon + 1)], axis=1).sum(axis=1, min_count=horizon)


def split_masks(panel, evaluation_start, evaluation_end):
    start, end = pd.Timestamp(evaluation_start), pd.Timestamp(evaluation_end)
    complete = panel['burden'].notna()
    dev = complete & (panel['week'] + pd.Timedelta(days=34) < start)
    evaluation = complete & panel['week'].between(start, end)
    purged = complete & (panel['week'] < start) & ~dev
    return dev, evaluation, purged


def fit_targets(panel, dev):
    thresholds = panel.loc[dev].groupby('city')['burden'].quantile(0.8).to_dict()
    threshold = panel['city'].map(thresholds)
    y = (panel['burden'] >= threshold).astype(float)
    y[panel['burden'].isna() | threshold.isna()] = np.nan
    return thresholds, y


def bin_indices(x, cuts):
    a = np.asarray(x, dtype=float)
    bins = np.searchsorted(np.asarray(cuts, dtype=float), a, side='right')
    bins[~np.isfinite(a)] = len(cuts) + 1
    return bins


def fit_bins(x, y, max_bins=5, min_share=0.05, min_class=5):
    """Development-only quantiles; merge adjacent sparse numeric bins.

    Missingness always has a reserved separate bin and is never merged.
    Numeric intervals are left-closed, right-open, with infinite outer edges.
    """
    a, target = np.asarray(x, dtype=float), np.asarray(y, dtype=int)
    finite = np.isfinite(a)
    if finite.sum() == 0 or np.unique(a[finite]).size < 2:
        return [], 'constant' if finite.any() else 'missing'
    cuts = np.unique(np.quantile(a[finite], np.arange(1, max_bins) / max_bins)).tolist()
    cuts = [v for v in cuts if a[finite].min() < v < a[finite].max()]
    minimum = max(1, math.ceil(min_share * len(a)))
    while cuts:
        bins = bin_indices(a, cuts)
        sparse = []
        for j in range(len(cuts) + 1):
            mask = (bins == j) & finite
            if mask.sum() < minimum or ((target[mask] == 0).sum() < min_class) or ((target[mask] == 1).sum() < min_class):
                sparse.append(j)
        if not sparse:
            break
        j = sparse[0]
        # Deterministic: merge left, except the first bin, which merges right.
        del cuts[max(0, j - 1)]
    return cuts, 'ok' if cuts or not finite.all() else 'merged'


def counts_for(x, y, cuts):
    bins = bin_indices(x, cuts)
    target = np.asarray(y, dtype=int)
    j = len(cuts) + 2
    return np.stack([np.bincount(bins[target == c], minlength=j) for c in (0, 1)], axis=1)


def from_counts(counts, alpha=ALPHA):
    n = np.asarray(counts, dtype=float)
    totals = n.sum(axis=0)
    if (totals == 0).any():
        return {'iv': None, 'woe': [None] * len(n), 'contribution': [None] * len(n)}
    p = (n + alpha) / (totals + alpha * len(n))
    woe = np.log(p[:, 0] / p[:, 1])
    contributions = (p[:, 0] - p[:, 1]) * woe
    return {'iv': float(contributions.sum()), 'woe': woe.tolist(), 'contribution': contributions.tolist()}


def psi(dev_counts, evaluation_counts, alpha=ALPHA):
    a = np.asarray(dev_counts, dtype=float).sum(axis=1)
    b = np.asarray(evaluation_counts, dtype=float).sum(axis=1)
    if not a.sum() or not b.sum():
        return None
    p, q = (a + alpha) / (a.sum() + alpha * len(a)), (b + alpha) / (b.sum() + alpha * len(b))
    return float(((q - p) * np.log(q / p)).sum())


def cluster_interval(x, y, cuts, clusters, repetitions=500, seed=SEED):
    groups = np.asarray(clusters)
    unique = np.unique(groups)
    if len(unique) < 2:
        return {'low': None, 'high': None, 'valid': 0, 'clusters': len(unique)}
    x, y = np.asarray(x, dtype=float), np.asarray(y, dtype=int)
    matrices = np.stack([counts_for(x[groups == g], y[groups == g], cuts) for g in unique])
    rng = np.random.default_rng(seed)
    sampled = matrices[rng.integers(0, len(unique), size=(repetitions, len(unique)))].sum(axis=1)
    vals = [r['iv'] for r in (from_counts(m) for m in sampled) if r['iv'] is not None]
    lo, hi = np.quantile(vals, [0.025, 0.975]) if vals else (None, None)
    return {'low': float(lo) if lo is not None else None, 'high': float(hi) if hi is not None else None, 'valid': len(vals), 'clusters': len(unique)}


def weighted_quantile_hist(hist, probabilities=(0.25, 0.5, 0.75, 0.9, 0.95)):
    """Inverse empirical CDF (smallest value reaching q); integer weights."""
    pairs = sorted((float(k), int(v)) for k, v in hist.items() if int(v) > 0)
    if not pairs:
        return [None] * len(probabilities)
    values, weights = np.array(pairs).T
    cumulative = np.cumsum(weights)
    return [float(values[min(int(np.searchsorted(cumulative, q * cumulative[-1], side='left')), len(values) - 1)]) for q in probabilities]
