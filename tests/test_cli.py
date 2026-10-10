import contextlib
import io
import json
import tempfile
import unittest
from pathlib import Path

from icmp_detector.__main__ import main


def run_cli(*args) -> str:
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        main(list(map(str, args)))
    return buf.getvalue()


class CliTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.d = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def _captures(self):
        for i in range(3):
            run_cli("simulate", "normal", "--out", self.d / f"normal_{i}.csv", "--requests", 96, "--seed", i, "--jitter", 0.01)
        out = run_cli("simulate", "channel", "--out", self.d / "covert.csv", "--requests", 65, "--seed", 9,
                      "--gap0", 0.95, "--gap1", 1.05, "--bits", "01" * 32, "--delay-model", "netem")
        self.assertIn("simulated", out)

    def test_baseline_detect_evaluate_decode(self):
        self._captures()
        out = run_cli("baseline", *[self.d / f"normal_{i}.csv" for i in range(2)], "--window", 16, "--step", 8,
                      "--out", self.d / "b.json")
        self.assertIn("step 8", out)
        b = json.loads((self.d / "b.json").read_text())
        self.assertEqual(b["step"], 8)
        out = run_cli("detect", self.d / "covert.csv", "--baseline", self.d / "b.json", "--features", "std", "ks")
        self.assertIn("windows suspicious", out)
        out = run_cli("evaluate", "--baseline", self.d / "b.json", "--normal", self.d / "normal_2.csv",
                      "--channel", self.d / "covert.csv", "--bits", "01" * 32, "--bootstrap", 50,
                      "--compare-features", "--decode-threshold", "auto")
        result = json.loads(out)
        self.assertEqual(result["step"], 8)
        self.assertIn("ci", result["detectors"]["baseline"])
        self.assertEqual(len(result["feature_comparison"]), 11)
        out = run_cli("decode", self.d / "covert.csv", "--bits", "01" * 32, "--threshold", "auto")
        self.assertIn("adaptive threshold", out)

    def test_evaluate_without_baseline_exits(self):
        self._captures()
        with self.assertRaises(SystemExit):
            run_cli("evaluate", "--normal", self.d / "normal_0.csv", "--channel", self.d / "covert.csv")

    def test_generate_refuses_without_flag_and_dry_runs_with_it(self):
        with self.assertRaises(SystemExit):
            with contextlib.redirect_stderr(io.StringIO()):
                run_cli("generate", "covert", "--dst", "10.0.0.2", "--bits", "0101", "--manifest", self.d / "m.json")
        with self.assertRaises(SystemExit):
            with contextlib.redirect_stderr(io.StringIO()):
                run_cli("generate", "covert", "--dst", "8.8.8.8", "--bits", "0101", "--manifest", self.d / "m.json",
                        "--dry-run", "--i-am-on-the-lab-testbed")
        out = run_cli("generate", "covert", "--dst", "10.0.0.2", "--bits", "0101", "--manifest", self.d / "m.json",
                      "--dry-run", "--i-am-on-the-lab-testbed")
        self.assertIn("dry run", out)
        self.assertEqual(len(json.loads((self.d / "m.json").read_text())["packets"]), 5)

    def test_fieldcheck_cli(self):
        self._captures()
        out = run_cli("fieldcheck", "--normal", self.d / "normal_0.csv", "--covert", self.d / "covert.csv",
                      "--out", self.d / "fc.json")
        self.assertIn("| field |", out)
        self.assertTrue((self.d / "fc.json").exists())

    def test_study_with_seeds(self):
        out = run_cli("study", "--out", self.d / "r", "--runs", 2, "--windows", 32, "--seeds", 1, 2,
                      "--delay-model", "netem", "--bootstrap", 20)
        self.assertIn("multiseed.json", out)
        r = json.loads((self.d / "r" / "results.json").read_text())
        self.assertEqual(r["config"]["delay_model"], "netem")
        self.assertIn("ci", r["results"][0])


if __name__ == "__main__":
    unittest.main()
