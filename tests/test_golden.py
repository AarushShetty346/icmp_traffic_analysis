import json
import unittest
from pathlib import Path

from icmp_detector.golden import build

GOLDEN = Path(__file__).parent / "golden"


class GoldenTests(unittest.TestCase):
    def test_committed_fixtures_are_current(self):
        for name, data in build().items():
            committed = json.loads((GOLDEN / name).read_text())
            fresh = json.loads(json.dumps(data))
            self.assertEqual(committed, fresh, f"{name} is stale: run python -m icmp_detector golden")


if __name__ == "__main__":
    unittest.main()
