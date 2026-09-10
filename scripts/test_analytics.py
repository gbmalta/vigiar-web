import unittest
import numpy as np
import pandas as pd
from analytics_core import (future_burden, week_start, split_masks, fit_targets, fit_bins,
                            counts_for, from_counts, psi, cluster_interval, weighted_quantile_hist)


class ScientificContract(unittest.TestCase):
    def test_horizon_excludes_origin_and_keeps_incomplete_missing(self):
        result = future_burden(pd.Series([100, 1, 2, 3, 4, 5]))
        self.assertEqual(result.iloc[0], 10)
        self.assertEqual(result.iloc[1], 14)
        self.assertTrue(result.iloc[2:].isna().all())

    def test_sunday_week_alignment(self):
        values = pd.Series(['2024-12-29', '2025-01-01', '2025-01-04', '2025-01-05'])
        self.assertEqual(week_start(values).dt.strftime('%Y-%m-%d').tolist(), ['2024-12-29'] * 3 + ['2025-01-05'])

    def test_purge_future_labels_at_boundary(self):
        panel = pd.DataFrame({'week': pd.date_range('2024-12-01', periods=6, freq='W-SUN'), 'burden': 10})
        dev, evaluation, purged = split_masks(panel, '2025-01-05', '2025-12-28')
        self.assertEqual(dev.sum(), 1)
        self.assertEqual(purged.sum(), 4)
        self.assertEqual(evaluation.sum(), 1)

    def test_holdout_cannot_change_training_thresholds_or_bins(self):
        p = pd.DataFrame({'city': ['a'] * 100, 'burden': np.arange(100), 'x': np.arange(100)})
        dev = p.index < 80
        thresholds, y = fit_targets(p, dev)
        bins, _ = fit_bins(p.loc[dev, 'x'], y[dev])
        p.loc[~dev, ['burden', 'x']] = 999999
        changed, y2 = fit_targets(p, dev)
        self.assertEqual(thresholds, changed)
        self.assertEqual(bins, fit_bins(p.loc[dev, 'x'], y2[dev])[0])

    def test_known_woe_and_iv_with_smoothing(self):
        result = from_counts(np.array([[30, 10], [10, 30]]))
        w = np.log(30.5 / 10.5)
        self.assertAlmostEqual(result['woe'][0], w)
        self.assertAlmostEqual(result['woe'][1], -w)
        self.assertAlmostEqual(result['iv'], 2 * (20 / 41) * w)

    def test_zero_cells_are_finite_but_absent_class_is_undefined(self):
        self.assertTrue(np.isfinite(from_counts([[10, 0], [0, 10]])['iv']))
        self.assertIsNone(from_counts([[10, 0], [5, 0]])['iv'])

    def test_explicit_missing_bin_and_frozen_boundaries(self):
        result = counts_for([0, 10, float('nan')], [0, 1, 1], [5])
        np.testing.assert_array_equal(result, [[1, 0], [0, 1], [0, 1]])

    def test_psi_identity(self):
        self.assertAlmostEqual(psi([[10, 2], [5, 3]], [[10, 2], [5, 3]]), 0)

    def test_cluster_bootstrap_is_reproducible(self):
        x, y = np.arange(40), np.tile([0, 1], 20)
        clusters = np.repeat(['a', 'b', 'c', 'd'], 10)
        a = cluster_interval(x, y, [10, 20, 30], clusters, repetitions=50)
        b = cluster_interval(x, y, [10, 20, 30], clusters, repetitions=50)
        self.assertEqual(a, b)
        self.assertEqual(a['clusters'], 4)
        self.assertEqual(a['valid'], 50)

    def test_weighted_quantile_is_not_grouped_row_median(self):
        self.assertEqual(weighted_quantile_hist({1: 100, 20: 1, 30: 1})[1], 1)


if __name__ == '__main__':
    unittest.main()
