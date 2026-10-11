import unittest

import numpy as np

from icmp_detector.capture import Flow
from icmp_detector.detector import Baseline, BaselineDetector
from icmp_detector.evaluation import auc, bootstrap_rate, feature_comparison, roc_curve, run_windows, summarise_seeds
from icmp_detector.experiment import LabelledSet, build_baseline, evaluate, multi_seed_study, simulated_study
from icmp_detector.features import ks_distance, ks_pvalue, windows
from icmp_detector.metrics import confusion, decode_bits, decoding_accuracy, two_means_threshold
from icmp_detector.simulate import CONDITIONS, Condition, SenderModel, channel_run, network_delay, normal_run


class RocTests(unittest.TestCase):
    def test_perfect_and_random_auc(self):
        self.assertEqual(auc(roc_curve(np.array([0.1, 0.2]), np.array([0.5, 0.9]))), 1.0)
        self.assertAlmostEqual(auc(roc_curve(np.array([1.0, 2.0]), np.array([1.0, 2.0]))), 0.5)

    def test_auc_equals_mann_whitney_probability(self):
        rng = np.random.default_rng(0)
        neg, pos = rng.normal(0, 1, 40), rng.normal(0.8, 1, 50)
        prob = np.mean([(p > n) + 0.5 * (p == n) for p in pos for n in neg])
        self.assertAlmostEqual(auc(roc_curve(neg, pos)), prob, places=12)

    def test_curve_runs_from_origin_to_corner(self):
        pts = roc_curve(np.array([0.1, 0.4]), np.array([0.3, 0.5]))
        self.assertEqual((pts[0]["fpr"], pts[0]["tpr"]), (0.0, 0.0))
        self.assertEqual((pts[-1]["fpr"], pts[-1]["tpr"]), (1.0, 1.0))


class BootstrapTests(unittest.TestCase):
    def test_interval_contains_estimate_and_resamples_runs(self):
        rng = np.random.default_rng(2)
        flows = [normal_run(64, CONDITIONS[1], rng) for _ in range(8)]
        runs = run_windows(flows, 16)
        r = bootstrap_rate(runs, lambda w: w.std(ddof=1) > 0.02, n_boot=400, seed=1)
        self.assertLessEqual(r["lo"], r["estimate"])
        self.assertGreaterEqual(r["hi"], r["estimate"])
        self.assertEqual(r["runs"], 8)


class FeatureTests(unittest.TestCase):
    def test_ks_distance_matches_scipy(self):
        rng = np.random.default_rng(4)
        a, b = rng.normal(1, 0.01, 31), rng.normal(1.01, 0.02, 200)
        try:
            from scipy.stats import ks_2samp
        except ImportError:
            self.skipTest("scipy not installed")
        self.assertAlmostEqual(ks_distance(a, b), ks_2samp(a, b).statistic, places=12)
        self.assertIsNotNone(ks_pvalue(a, b))

    def test_baseline_ks_feature_and_scores(self):
        rng = np.random.default_rng(5)
        normal = [normal_run(64, CONDITIONS[1], rng) for _ in range(6)]
        b = build_baseline(normal, 32)
        self.assertIn("ks", b.upper)
        self.assertTrue(b.reference)
        det = BaselineDetector(b, ("std", "ks"))
        flow, _ = channel_run(64, CONDITIONS[1], rng)
        self.assertTrue(all(det.classify(w).suspicious for w in windows(flow.times, 32, seq=flow.seq)))
        self.assertGreaterEqual(b.score("mean", b.upper["mean"]), 0)
        self.assertAlmostEqual(b.score("mean", b.upper["mean"]), b.score_threshold("mean"))

    def test_old_baseline_files_still_load(self):
        old = {"percentile": 95.0, "window_size": 32, "n_windows": 2, "lower": {}, "upper": {"std": 0.01}, "summary": {}}
        b = Baseline(**old)
        self.assertEqual(b.reference, [])
        with self.assertRaises(ValueError):
            BaselineDetector(b, ("ks",))

    def test_feature_comparison_covers_every_feature(self):
        rng = np.random.default_rng(6)
        normal = [normal_run(64, CONDITIONS[0], rng) for _ in range(6)]
        b = build_baseline(normal[:3], 16)
        chan = [channel_run(64, CONDITIONS[0], rng, model=SenderModel(gap0=0.95, gap1=1.05))[0] for _ in range(3)]
        rows = feature_comparison(b, run_windows(normal[3:], 16), run_windows(chan, 16), n_boot=50)
        self.assertEqual(len(rows), 11)
        std = next(r for r in rows if r["feature"] == "std")
        self.assertGreater(std["auc"], 0.9)


class OverlapTests(unittest.TestCase):
    def test_step_gives_overlapping_windows(self):
        times = np.arange(64, dtype=float)
        self.assertEqual(len(windows(times, 32)), 2)
        self.assertEqual(len(windows(times, 32, 8)), 5)

    def test_evaluate_reports_step_and_cis(self):
        rng = np.random.default_rng(7)
        normal = [normal_run(64, CONDITIONS[0], rng) for _ in range(4)]
        chan = [channel_run(64, CONDITIONS[0], rng)[0] for _ in range(4)]
        b = build_baseline(normal[:2], 16, step=8)
        r = evaluate(LabelledSet(normal[2:], chan), 16, {"b": BaselineDetector(b)}, step=8, n_boot=50)
        self.assertEqual(r["step"], 8)
        self.assertIn("ci", r["detectors"]["b"])
        self.assertIn("precision", r["detectors"]["b"])


class DecodeTests(unittest.TestCase):
    def test_two_means_finds_shifted_gap_pair(self):
        gaps = np.array([1.40, 1.60, 1.41, 1.62, 1.39])  # 0.2 s constant offset breaks the 1.0 s threshold
        thr = two_means_threshold(gaps)
        self.assertTrue(1.41 < thr < 1.60)
        times = np.concatenate([[0], np.cumsum(gaps)])
        self.assertEqual(decoding_accuracy([0, 1, 0, 1, 0], decode_bits(times, threshold="auto")), 1.0)
        self.assertEqual(decoding_accuracy([0, 1, 0, 1, 0], decode_bits(times, threshold=1.0)), 0.4)

    def test_constant_gaps(self):
        self.assertEqual(two_means_threshold(np.array([1.0, 1.0])), 1.0)

    def test_precision_recall(self):
        m = confusion([True, True, False, False], [True, False, True, False])
        self.assertEqual((m["precision"], m["recall"], m["f1"]), (0.5, 0.5, 0.5))


class DelayModelTests(unittest.TestCase):
    def test_folded_model_reproduces_original_draws(self):
        cond = Condition("j", net_jitter=0.05)
        a = network_delay(1000, cond, np.random.default_rng(1))
        b = 0.001 + np.abs(np.random.default_rng(1).normal(0.0, 0.05, 1000))
        np.testing.assert_array_equal(a, b)

    def test_netem_model_is_centred_and_truncated(self):
        cond = Condition("j", net_jitter=0.02, net_delay=0.1, delay_model="netem")
        d = network_delay(20000, cond, np.random.default_rng(1))
        self.assertAlmostEqual(d.mean(), 0.1, places=2)
        low = network_delay(2000, Condition("j", net_jitter=0.05, delay_model="netem"), np.random.default_rng(2))
        self.assertGreaterEqual(low.min(), 0.0)

    def test_netem_correlation_smooths_consecutive_draws(self):
        base = Condition("j", net_jitter=0.02, net_delay=0.5, delay_model="netem")
        d0 = network_delay(5000, base, np.random.default_rng(3))
        d1 = network_delay(5000, base.__class__(**{**base.__dict__, "net_corr": 0.75}), np.random.default_rng(3))
        self.assertGreater(np.corrcoef(d1[:-1], d1[1:])[0, 1], np.corrcoef(d0[:-1], d0[1:])[0, 1] + 0.3)

    def test_unknown_model(self):
        with self.assertRaises(ValueError):
            Condition("x").with_model("pareto")

    def test_study_labels_delay_model(self):
        r = simulated_study(runs=2, window_sizes=(32,), delay_model="netem")
        self.assertEqual(r["config"]["delay_model"], "netem")
        self.assertTrue(all(row["delay_model"] == "netem" for row in r["results"]))


class SeedTests(unittest.TestCase):
    def test_multi_seed_summary(self):
        ms = multi_seed_study((1, 2, 3), runs=2, window_sizes=(32,))
        row = ms["summary"][0]
        self.assertEqual(row["detection_rate"]["seeds"], 3)
        self.assertLessEqual(row["false_positive_rate"]["min"], row["false_positive_rate"]["max"])

    def test_summarise_needs_rows(self):
        out = summarise_seeds({1: [{"channel": "c", "condition": "x", "window": 1, "detector": "d", "detection_rate": 1.0, "false_positive_rate": 0.0}]})
        self.assertEqual(out[0]["detection_rate"]["seeds"], 1)


class CaptureFlowTests(unittest.TestCase):
    def test_flow_dataclass(self):
        self.assertEqual(len(Flow(np.array([0.0, 1.0]))), 2)


if __name__ == "__main__":
    unittest.main()
