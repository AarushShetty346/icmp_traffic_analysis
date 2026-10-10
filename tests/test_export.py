import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

from icmp_detector.benchmark import CHANNEL_GRID, CONDITION_GRID
from icmp_detector.capture import Flow, save_flow
from icmp_detector.export import build_bundle, validate, write_bundle
from icmp_detector.simulate import channel_run, normal_run

SMALL = dict(
    runs=3,
    n_boot=20,
    multi_seeds=(1, 2),
    window_sizes=(16, 32),
    channels={k: CHANNEL_GRID[k] for k in ("0.75/1.25 s", "0.98/1.02 s")},
    conditions=CONDITION_GRID[:2],
    example_runs=1,
)


class ExportTests(unittest.TestCase):
    def test_simulated_bundle_validates_and_is_labelled(self):
        b = build_bundle(**SMALL)
        validate(b)
        self.assertTrue(b["provenance"]["simulated"])
        self.assertTrue(all(r["source"] == "simulated" for r in b["runs"]))
        self.assertEqual({r["delayModel"] for r in b["matrix"]}, {"folded", "netem"})
        with tempfile.TemporaryDirectory() as d:
            paths = write_bundle(b, d)
            again = json.loads(paths[0].read_text())
        self.assertEqual(again["schemaVersion"], b["schemaVersion"])

    def test_bad_bundle_is_rejected(self):
        import jsonschema

        b = build_bundle(**SMALL)
        b["runs"][0]["source"] = "made up"
        with self.assertRaises(jsonschema.ValidationError):
            validate(b)

    def test_real_captures_are_marked_as_capture(self):
        rng = np.random.default_rng(3)
        with tempfile.TemporaryDirectory() as d:
            from icmp_detector.simulate import CONDITIONS

            for i in range(4):
                save_flow(normal_run(70, CONDITIONS[0], rng), Path(d) / f"normal_{i}.csv")
            for i in range(2):
                flow, bits = channel_run(70, CONDITIONS[0], rng)
                save_flow(flow, Path(d) / f"covert_{i}.csv")
                (Path(d) / f"covert_{i}.manifest.json").write_text(
                    json.dumps({"kind": "capture", "params": {"label": "covert", "bits": "".join(map(str, bits))}})
                )
            b = build_bundle(captures=d, **SMALL)
        validate(b)
        self.assertTrue(b["provenance"]["hasCapture"])
        self.assertFalse(b["provenance"]["simulated"])
        cap = [r for r in b["matrix"] if r["source"] == "capture"]
        self.assertTrue(cap)
        self.assertTrue(all(r["delayModel"] is None for r in cap))
        self.assertTrue(any(x["source"] == "capture" for x in b["decode"]))
        self.assertEqual(len(b["provenance"]["captureManifests"]), 2)
        self.assertTrue(b["fieldcheck"])


class FlowSmokeTests(unittest.TestCase):
    def test_flow(self):
        self.assertEqual(len(Flow(np.zeros(3))), 3)


if __name__ == "__main__":
    unittest.main()
