import os
import unittest
from unittest import mock

import numpy as np

from icmp_detector.generator import GeneratorConfig, GuardError, check_destination, payload, run, schedule
from icmp_detector.metrics import decode_bits


class GuardTests(unittest.TestCase):
    def test_private_addresses_pass(self):
        for ip in ("10.0.0.2", "172.16.4.9", "192.168.1.20", "fd00::5"):
            check_destination(ip)

    def test_public_and_special_addresses_refused(self):
        for ip in ("8.8.8.8", "1.1.1.1", "127.0.0.1", "224.0.0.1", "0.0.0.0", "10.0.0.255", "2001:db8::1", "lab-host"):
            with self.assertRaises(GuardError, msg=ip):
                check_destination(ip)

    def test_requires_lab_flag(self):
        with self.assertRaises(GuardError):
            run(GeneratorConfig("10.0.0.2", bits="01"), lab_confirmed=False, dry_run=True)

    def test_requires_root_to_send(self):
        if not hasattr(os, "geteuid"):
            self.skipTest("no euid on this platform")
        with mock.patch("os.geteuid", return_value=1000):
            with self.assertRaises(GuardError):
                run(GeneratorConfig("10.0.0.2", bits="01"), lab_confirmed=True, dry_run=False)

    def test_invalid_config(self):
        with self.assertRaises(ValueError):
            GeneratorConfig("10.0.0.2", bits="012").validate()
        with self.assertRaises(ValueError):
            GeneratorConfig("10.0.0.2", bits="01", gap0=1.2, gap1=0.8).validate()


class ScheduleTests(unittest.TestCase):
    def test_covert_schedule_matches_decoder(self):
        cfg = GeneratorConfig("10.0.0.2", bits="0110", gap0=0.95, gap1=1.05)
        offsets, carried = schedule(cfg)
        np.testing.assert_allclose(offsets, [0, 0.95, 2.0, 3.05, 4.0])
        self.assertEqual(carried, [0, 1, 1, 0, None])
        self.assertEqual(decode_bits(offsets, np.arange(5)), {0: 0, 1: 1, 2: 1, 3: 0})

    def test_normal_schedule(self):
        offsets, _ = schedule(GeneratorConfig("10.0.0.2", mode="normal", count=4))
        np.testing.assert_allclose(offsets, [0, 1, 2, 3])

    def test_payload_constant_size_and_ping_layout(self):
        cfg = GeneratorConfig("10.0.0.2", bits="0")
        a, b = payload(cfg, 1000.25), payload(cfg, 2000.5)
        self.assertEqual(len(a), 56)
        self.assertEqual(a[16:], b[16:])
        self.assertEqual(a[16], 0x10)
        self.assertEqual(payload(GeneratorConfig("10.0.0.2", bits="0", payload_kind="zeros"), 1.0), bytes(56))


class RunTests(unittest.TestCase):
    def test_dry_run_manifest(self):
        m = run(GeneratorConfig("10.0.0.2", bits="10"), lab_confirmed=True, dry_run=True)
        self.assertTrue(m["dry_run"])
        self.assertFalse(m["simulated"])
        self.assertEqual([p["seq"] for p in m["packets"]], [1, 2, 3])
        self.assertEqual([p["bit"] for p in m["packets"]], [1, 0, None])

    def test_send_loop_uses_injected_sender_and_clock(self):
        sent = []
        now = [0.0]

        def clock():
            now[0] += 0.0005
            return now[0]

        with mock.patch("os.geteuid", return_value=0):
            m = run(
                GeneratorConfig("10.0.0.2", bits="01", ident=7),
                lab_confirmed=True,
                sender=lambda seq, data: sent.append((seq, len(data))),
                clock=clock,
                wall=lambda: 1000.0 + now[0],
                sleep=lambda s: now.__setitem__(0, now[0] + s),
            )
        self.assertEqual(sent, [(1, 56), (2, 56), (3, 56)])
        gaps = np.diff([p["sent_epoch"] for p in m["packets"]])
        np.testing.assert_allclose(gaps, [0.75, 1.25], atol=0.002)


if __name__ == "__main__":
    unittest.main()
