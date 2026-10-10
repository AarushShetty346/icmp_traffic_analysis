import tempfile
import unittest
from pathlib import Path

from icmp_detector import fieldcheck


def _csv(rows):
    head = "frame.time_epoch,ip.src,ip.dst,icmp.ident,icmp.seq,ip.ttl,ip.id,ip.flags,ip.dsfield,ip.len,icmp.code,data.len,data.data\n"
    return head + "\n".join(rows) + "\n"


def _row(i, ttl=64, ip_id=None, flags="0x02", size=56, tail="1011"):
    ip_id = 1000 + i if ip_id is None else ip_id
    data = ("00" * 16) + tail * ((size - 16) // 2)
    return f"{i}.0,10.0.0.1,10.0.0.2,0x0001,{i + 1},{ttl},0x{ip_id:04x},{flags},0x00,{20 + 8 + size},0,{size},{data}"


class FieldCheckTests(unittest.TestCase):
    def _compare(self, normal_rows, covert_rows):
        with tempfile.TemporaryDirectory() as d:
            n, c = Path(d) / "n.csv", Path(d) / "c.csv"
            n.write_text(_csv(normal_rows))
            c.write_text(_csv(covert_rows))
            return fieldcheck.compare(fieldcheck.read_fields(n), fieldcheck.read_fields(c))

    def test_identical_streams_have_no_differences(self):
        rep = self._compare([_row(i) for i in range(10)], [_row(i) for i in range(10)])
        self.assertEqual(rep["differences"], [])

    def test_ttl_ip_id_and_payload_differences_are_reported(self):
        rep = self._compare(
            [_row(i) for i in range(10)],
            [_row(i, ttl=255, ip_id=(i * 7919) % 65536 * 3, tail="0000") for i in range(10)],
        )
        self.assertIn("ttl", rep["differences"])
        self.assertIn("ip_id", rep["differences"])
        self.assertIn("payload bytes (after first 16)", rep["differences"])
        self.assertIn("| ttl |", fieldcheck.markdown(rep))

    def test_missing_fields_are_marked_unknown(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "min.csv"
            p.write_text("frame.time_epoch,icmp.seq\n1.0,1\n2.0,2\n")
            df = fieldcheck.read_fields(p)
        rep = fieldcheck.compare(df, df)
        ttl = next(r for r in rep["rows"] if r["field"] == "ttl")
        self.assertIsNone(ttl["differs"])

    def test_pcap_reader(self):
        try:
            from scapy.all import ICMP, IP, Raw, wrpcap
        except ImportError:
            self.skipTest("scapy not installed")
        pkts = []
        for i in range(5):
            p = IP(src="10.0.0.1", dst="10.0.0.2", ttl=64, id=100 + i) / ICMP(type=8, id=1, seq=i) / Raw(bytes(56))
            p.time = 1000.0 + i
            pkts.append(p)
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "x.pcap"
            wrpcap(str(path), pkts)
            df = fieldcheck.read_fields(path)
        self.assertEqual(list(df["ttl"]), [64] * 5)
        self.assertEqual(fieldcheck.describe(df)["ip_id"]["pattern"], "increments by 1")


if __name__ == "__main__":
    unittest.main()
