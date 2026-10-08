import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

from icmp_detector.capture import Flow, load_flow, save_flow
from icmp_detector.detector import Baseline, BaselineDetector, FixedRuleDetector
from icmp_detector.experiment import build_baseline, simulated_study
from icmp_detector.features import inter_packet_delays, window_features, windows
from icmp_detector.metrics import confusion, decode_bits, decoding_accuracy
from icmp_detector.simulate import CONDITIONS, Condition, channel_run, normal_run


class FeatureTests(unittest.TestCase):
    def test_ipd(self):
        np.testing.assert_allclose(inter_packet_delays([0, 1, 2.5]), [1, 1.5])

    def test_windows_are_non_overlapping_and_drop_partial(self):
        times = np.arange(70, dtype=float)
        wins = windows(times, 32)
        self.assertEqual(len(wins), 2)
        self.assertEqual(len(wins[0]), 31)

    def test_windows_skip_gaps_across_lost_packets(self):
        times = np.array([0, 1, 3, 4, 5], dtype=float)  # request 2 lost
        seq = np.array([0, 1, 3, 4, 5])
        (w,) = windows(times, 5, seq=seq)
        np.testing.assert_allclose(w, [1, 1, 1])

    def test_features(self):
        f = window_features(np.array([0.75, 1.25, 0.75, 1.25]))
        self.assertAlmostEqual(f["mean"], 1.0)
        self.assertGreater(f["std"], 0.25)
        self.assertEqual(f["off_nominal"], 1.0)


class DetectorTests(unittest.TestCase):
    def setUp(self):
        self.rng = np.random.default_rng(1)
        self.normal = [normal_run(64, CONDITIONS[0], self.rng) for _ in range(10)]

    def test_baseline_flags_planned_channel_not_normal(self):
        det = BaselineDetector(build_baseline(self.normal, 32))
        flow, _ = channel_run(64, CONDITIONS[0], self.rng)
        self.assertTrue(all(det.classify(w).suspicious for w in windows(flow.times, 32)))
        self.assertFalse(det.classify(np.full(31, 1.0)).suspicious)

    def test_fixed_rule(self):
        det = FixedRuleDetector()
        self.assertFalse(det.classify(np.full(31, 1.0)).suspicious)
        self.assertTrue(det.classify(np.resize([0.75, 1.25], 31)).suspicious)
        self.assertTrue(det.classify(np.full(31, 1.3)).suspicious)  # mean drift

    def test_baseline_roundtrip(self):
        b = build_baseline(self.normal, 32)
        with tempfile.TemporaryDirectory() as d:
            b.save(Path(d) / "b.json")
            self.assertEqual(Baseline.load(Path(d) / "b.json"), b)


class MetricTests(unittest.TestCase):
    def test_confusion(self):
        m = confusion([True, True, False, False], [True, False, True, False])
        self.assertEqual(m["detection_rate"], 0.5)
        self.assertEqual(m["false_positive_rate"], 0.5)

    def test_decode_round_trip(self):
        rng = np.random.default_rng(3)
        bits = np.array([0, 1, 1, 0, 1, 0, 0, 1])
        flow, sent = channel_run(9, CONDITIONS[0], rng, bits)
        self.assertEqual(decoding_accuracy(list(sent), decode_bits(flow.times, flow.seq)), 1.0)

    def test_lost_packet_only_costs_nearby_bits(self):
        times = np.array([0, 0.75, 2.75, 3.5])  # request 2 lost
        seq = np.array([0, 1, 3, 4])
        decoded = decode_bits(times, seq)
        self.assertEqual(decoded, {0: 0, 3: 0})
        self.assertEqual(decoding_accuracy([0, 1, 1, 0], decoded), 0.5)


class CaptureTests(unittest.TestCase):
    def test_tshark_csv_with_filtering(self):
        csv = (
            "frame.time_epoch,ip.src,ip.dst,icmp.ident,icmp.seq\n"
            "10.0,10.0.0.1,10.0.0.2,0x0001,1/256\n"
            "10.5,10.0.0.9,10.0.0.2,0x0001,7/1792\n"
            "11.0,10.0.0.1,10.0.0.2,0x0001,2/512\n"
            "12.0,10.0.0.1,10.0.0.2,0x0001,3/768\n"
        )
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "cap.csv"
            p.write_text(csv)
            flow = load_flow(p, src="10.0.0.1")
        np.testing.assert_allclose(flow.times, [10, 11, 12])
        np.testing.assert_allclose(flow.seq, [1, 2, 3])

    def test_save_load(self):
        flow = normal_run(10, Condition("c", 0.01, 0.0), np.random.default_rng(0))
        with tempfile.TemporaryDirectory() as d:
            save_flow(flow, Path(d) / "f.csv")
            again = load_flow(Path(d) / "f.csv")
        np.testing.assert_allclose(again.times, flow.times, atol=1e-6)


class StudyTests(unittest.TestCase):
    def test_study_runs_and_is_json_serialisable(self):
        r = simulated_study(runs=3, window_sizes=(16, 32))
        json.dumps(r)
        self.assertTrue(r["simulated"])
        planned = [x for x in r["results"] if x["condition"] == "clean" and x["channel"].startswith("0.75")]
        self.assertTrue(all(x["detection_rate"] == 1.0 for x in planned))


if __name__ == "__main__":
    unittest.main()
