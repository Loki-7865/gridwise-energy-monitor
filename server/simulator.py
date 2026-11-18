"""
GridWise Energy Monitor — Synthetic Device Simulator
======================================================
Acts as a virtual ESP32 + PZEM-004T.
Posts one measurement to POST /data every --interval-seconds (default 2).

Usage
-----
  python server/simulator.py                              # laptop scenario, 2 s
  python server/simulator.py --scenario heater
  python server/simulator.py --scenario high_load_demo --interval-seconds 1
  python server/simulator.py --list-scenarios

Design
------
- Fixed seed → fully reproducible runs (DEMO_SEED from .env or --seed flag).
- Small bounded random variation so the dashboard looks alive.
- Physics-consistent: current = power / (voltage × power_factor).
- Cumulative energy_kwh only ever increases; never negative or jumping backwards.
- Never generates readings outside the PZEM-004T's physical measurement envelope.
"""

import argparse
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

# ---------------------------------------------------------------------------
# Load config (dotenv optional)
# ---------------------------------------------------------------------------
try:
    from dotenv import load_dotenv
    _ENV = Path(__file__).resolve().parent / ".env"
    if _ENV.exists():
        load_dotenv(_ENV)
except ImportError:
    pass

DEFAULT_SEED     = int(os.getenv("DEMO_SEED", "20261120"))
DEFAULT_URL      = "http://127.0.0.1:" + os.getenv("SERVER_PORT", "8000") + "/data"
DEFAULT_INTERVAL = 2.0

# ---------------------------------------------------------------------------
# Scenario definitions
# ---------------------------------------------------------------------------

SCENARIOS = {
    "idle": {
        "label":         "Idle / Standby",
        "power_range":   (25.0,   55.0),
        "pf_range":      (0.82,   0.92),
        "voltage_range": (229.0, 232.0),
    },
    "laptop": {
        "label":         "Laptop / Electronics",
        "power_range":   (65.0,  125.0),
        "pf_range":      (0.88,   0.96),
        "voltage_range": (228.0, 232.0),
    },
    "heater": {
        "label":         "Electric Heater",
        "power_range":   (1200.0, 1800.0),
        "pf_range":      (0.98,   1.00),
        "voltage_range": (226.0,  231.0),
    },
    "high_load_demo": {
        "label":         "High Load (Alert Demo)",
        "power_range":   (2050.0, 2300.0),
        "pf_range":      (0.92,   0.98),
        "voltage_range": (220.0,  228.0),
    },
}


def list_scenarios() -> None:
    print("Available scenarios:")
    for key, cfg in SCENARIOS.items():
        plo, phi = cfg["power_range"]
        print(f"  {key:<18}  {cfg['label']:<30}  Power: {plo:.0f}–{phi:.0f} W")


# ---------------------------------------------------------------------------
# Simulator state
# ---------------------------------------------------------------------------

class Simulator:
    def __init__(self, scenario: str, seed: int, interval: float, server_url: str):
        if scenario not in SCENARIOS:
            print(f"[ERROR] Unknown scenario '{scenario}'. Use --list-scenarios.")
            sys.exit(1)

        self.scenario    = scenario
        self.interval    = interval
        self.server_url  = server_url
        self.control_url = self._control_url_from_data_url(server_url)
        self.rng         = random.Random(seed)
        self.energy_kwh  = 0.0          # cumulative; only ever increases
        self.sample_num  = 0
        self._cfg        = SCENARIOS[scenario]

        print(f"[SIM] Scenario : {scenario} — {self._cfg['label']}")
        print(f"[SIM] Seed     : {seed}")
        print(f"[SIM] Interval : {interval} s")
        print(f"[SIM] Target   : {server_url}")
        print()

    @staticmethod
    def _control_url_from_data_url(data_url: str) -> str:
        """Use the companion API route for the portal's live demo control."""
        parts = urlsplit(data_url)
        path = parts.path.rsplit("/data", 1)[0] + "/demo/scenarios"
        return urlunsplit((parts.scheme, parts.netloc, path, "", ""))

    def _sync_scenario_from_server(self) -> None:
        """Apply a profile selected in the dashboard before the next sample."""
        try:
            with urllib.request.urlopen(self.control_url, timeout=2) as response:
                body = json.loads(response.read())
            scenario = body.get("active")
            if scenario in SCENARIOS and scenario != self.scenario:
                self.scenario = scenario
                self._cfg = SCENARIOS[scenario]
                print(f"[SIM] Switched by dashboard → {scenario} — {self._cfg['label']}")
        except (urllib.error.URLError, urllib.error.HTTPError, OSError, ValueError, json.JSONDecodeError):
            # The data POST below reports connection failures. A missed control
            # poll must not stop a presentation that is otherwise running.
            pass

    # ------------------------------------------------------------------
    def _next_sample(self) -> dict:
        cfg = self._cfg

        voltage      = round(self.rng.uniform(*cfg["voltage_range"]), 2)
        power_factor = round(self.rng.uniform(*cfg["pf_range"]), 4)
        power        = round(self.rng.uniform(*cfg["power_range"]), 3)
        # Physics: I = P / (V × PF)
        current      = round(power / (voltage * power_factor), 4) if (voltage * power_factor) > 0 else 0.0
        frequency    = round(self.rng.uniform(49.8, 50.2), 2)

        # Cumulative energy in kWh (power[W] × interval[s] / 3,600,000)
        self.energy_kwh += power * self.interval / 3_600_000.0
        energy = round(self.energy_kwh, 6)

        self.sample_num += 1

        return {
            "voltage":      voltage,
            "current":      current,
            "power":        power,
            "energy":       energy,
            "frequency":    frequency,
            "power_factor": power_factor,
            "source":       "synthetic",
            "is_simulated": True,
            "scenario":     self.scenario,
        }

    # ------------------------------------------------------------------
    def _post(self, payload: dict) -> bool:
        body = json.dumps(payload).encode("utf-8")
        req  = urllib.request.Request(
            self.server_url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                ok = (resp.status == 200)
                return ok
        except urllib.error.HTTPError as exc:
            print(f"[SIM] HTTP {exc.code}: {exc.read().decode()}")
            return False
        except (urllib.error.URLError, OSError) as exc:
            print(f"[SIM] Connection error: {exc}")
            return False

    # ------------------------------------------------------------------
    def run(self) -> None:
        print("[SIM] Running — Ctrl+C to stop")
        consecutive_failures = 0

        while True:
            self._sync_scenario_from_server()
            sample = self._next_sample()
            ok     = self._post(sample)

            if ok:
                consecutive_failures = 0
                print(
                    f"[SIM #{self.sample_num:>5}]  "
                    f"P={sample['power']:7.1f} W  "
                    f"V={sample['voltage']:6.2f} V  "
                    f"I={sample['current']:6.4f} A  "
                    f"E={sample['energy']:.6f} kWh  "
                    f"PF={sample['power_factor']:.4f}  "
                    f"Hz={sample['frequency']:.2f}"
                )
            else:
                consecutive_failures += 1
                print(f"[SIM] POST failed (failure #{consecutive_failures}) — retrying in {self.interval} s")
                if consecutive_failures >= 5:
                    print(f"[SIM] 5 consecutive failures — is server.py running at {self.server_url}?")

            time.sleep(self.interval)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="GridWise synthetic device simulator (virtual ESP32 + PZEM-004T)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--scenario", "-s",
        default="laptop",
        choices=list(SCENARIOS.keys()),
        help="Load profile to simulate",
    )
    parser.add_argument(
        "--interval-seconds", "-i",
        type=float,
        default=DEFAULT_INTERVAL,
        dest="interval",
        help="Seconds between POST requests",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=DEFAULT_SEED,
        help="Random seed for reproducibility",
    )
    parser.add_argument(
        "--url",
        default=DEFAULT_URL,
        help="Server POST /data endpoint",
    )
    parser.add_argument(
        "--list-scenarios",
        action="store_true",
        dest="list_scenarios",
        help="Print available scenarios and exit",
    )

    args = parser.parse_args()

    if args.list_scenarios:
        list_scenarios()
        return

    sim = Simulator(
        scenario=args.scenario,
        seed=args.seed,
        interval=args.interval,
        server_url=args.url,
    )

    try:
        sim.run()
    except KeyboardInterrupt:
        print(f"\n[SIM] Stopped after {sim.sample_num} samples. "
              f"Total energy posted: {sim.energy_kwh:.6f} kWh")


if __name__ == "__main__":
    main()
