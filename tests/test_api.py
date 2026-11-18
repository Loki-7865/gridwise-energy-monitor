"""
GridWise — API smoke tests
===========================
Run against a live server:
    python server/server.py &
    python -m pytest tests/test_api.py -v

The tests rely on the server being available at TEST_SERVER_URL
(default http://127.0.0.1:8000). Set the env-var to override.

They do NOT require the simulator to be running; they post their own payloads.
"""

import json
import os
import urllib.error
import urllib.request

import pytest

BASE_URL = os.getenv("TEST_SERVER_URL", "http://127.0.0.1:8000")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get(path: str, timeout: int = 5) -> tuple[int, dict]:
    url = BASE_URL + path
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read())


def _post(path: str, payload: dict, timeout: int = 5) -> tuple[int, dict | str]:
    url  = BASE_URL + path
    body = json.dumps(payload).encode("utf-8")
    req  = urllib.request.Request(url, data=body,
                                   headers={"Content-Type": "application/json"},
                                   method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, raw.decode()
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, raw.decode()


VALID_PAYLOAD = {
    "voltage":      230.1,
    "current":      0.44,
    "power":        92.5,
    "energy":       0.0184,
    "frequency":    50.0,
    "power_factor": 0.92,
    "source":       "synthetic",
    "is_simulated": True,
    "scenario":     "laptop",
}


# ---------------------------------------------------------------------------
# Health endpoint
# ---------------------------------------------------------------------------

class TestHealth:
    def test_health_returns_200(self):
        status, body = _get("/health")
        assert status == 200, f"Expected 200, got {status}: {body}"

    def test_health_ok_true(self):
        _, body = _get("/health")
        assert body.get("ok") is True

    def test_health_database_connected(self):
        _, body = _get("/health")
        assert body.get("database") == "connected", \
            f"Database not connected: {body}"

    def test_health_mode_present(self):
        _, body = _get("/health")
        assert body.get("mode") in ("demo", "hardware")


# ---------------------------------------------------------------------------
# POST /data — valid payload
# ---------------------------------------------------------------------------

class TestPostDataValid:
    def test_valid_post_returns_200(self):
        status, body = _post("/data", VALID_PAYLOAD)
        assert status == 200, f"Expected 200, got {status}: {body}"

    def test_valid_post_ok_true(self):
        _, body = _post("/data", VALID_PAYLOAD)
        assert body.get("ok") is True

    def test_post_updates_get_data(self):
        payload = {**VALID_PAYLOAD, "power": 999.1}
        _post("/data", payload)
        _, data = _get("/data")
        # The server uses a 5-sample rolling average; just ensure last_update is set
        assert data.get("last_update") is not None


# ---------------------------------------------------------------------------
# POST /data — invalid/malformed payloads
# ---------------------------------------------------------------------------

class TestPostDataInvalid:
    def test_missing_field_returns_400(self):
        bad = {k: v for k, v in VALID_PAYLOAD.items() if k != "voltage"}
        status, body = _post("/data", bad)
        assert status == 400, f"Expected 400, got {status}: {body}"

    def test_non_numeric_field_returns_400(self):
        bad = {**VALID_PAYLOAD, "power": "not-a-number"}
        status, body = _post("/data", bad)
        assert status == 400

    def test_negative_power_returns_400(self):
        bad = {**VALID_PAYLOAD, "power": -10.0}
        status, body = _post("/data", bad)
        assert status == 400

    def test_power_factor_above_1_returns_400(self):
        bad = {**VALID_PAYLOAD, "power_factor": 1.5}
        status, body = _post("/data", bad)
        assert status == 400

    def test_empty_body_returns_400(self):
        url  = BASE_URL + "/data"
        body = b""
        req  = urllib.request.Request(url, data=body,
                                       headers={"Content-Type": "application/json",
                                                "Content-Length": "0"},
                                       method="POST")
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                status = resp.status
        except urllib.error.HTTPError as exc:
            status = exc.code
        assert status == 400

    def test_invalid_json_returns_400(self):
        url  = BASE_URL + "/data"
        body = b"not json {"
        req  = urllib.request.Request(url, data=body,
                                       headers={"Content-Type": "application/json"},
                                       method="POST")
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                status = resp.status
        except urllib.error.HTTPError as exc:
            status = exc.code
        assert status == 400

    def test_out_of_range_voltage_returns_400(self):
        bad = {**VALID_PAYLOAD, "voltage": 999.0}  # > 300 V limit
        status, _ = _post("/data", bad)
        assert status == 400


# ---------------------------------------------------------------------------
# GET /data — source labelling
# ---------------------------------------------------------------------------

class TestGetDataSource:
    def test_data_has_source_field(self):
        _post("/data", VALID_PAYLOAD)
        _, data = _get("/data")
        assert "source" in data, f"'source' missing in /data response: {data}"

    def test_data_has_is_simulated_field(self):
        _post("/data", VALID_PAYLOAD)
        _, data = _get("/data")
        assert "is_simulated" in data

    def test_data_source_is_synthetic_in_demo_mode(self):
        """When server runs in demo mode, source posted as 'synthetic' should be preserved."""
        _post("/data", {**VALID_PAYLOAD, "source": "synthetic", "is_simulated": True})
        _, data = _get("/data")
        # In demo mode the server echoes whatever source the simulator sent
        assert data.get("source") == "synthetic"

    def test_data_no_negative_values(self):
        _, data = _get("/data")
        for field in ["voltage", "current", "power", "energy", "frequency", "power_factor"]:
            val = data.get(field, 0)
            assert val >= 0, f"Negative value for {field}: {val}"


# ---------------------------------------------------------------------------
# GET /history — ordering and structure
# ---------------------------------------------------------------------------

class TestHistory:
    def test_history_30m_returns_200(self):
        status, body = _get("/history?range=30m")
        assert status == 200

    def test_history_has_rows_key(self):
        _, body = _get("/history?range=30m")
        assert "rows" in body

    def test_history_rows_ascending_order(self):
        # Post a couple of samples to ensure there is data
        _post("/data", VALID_PAYLOAD)
        _post("/data", {**VALID_PAYLOAD, "power": 100.0})
        _, body = _get("/history?range=30m")
        rows = body.get("rows", [])
        timestamps = [r["measured_at"] for r in rows]
        assert timestamps == sorted(timestamps), \
            "History rows are not in ascending timestamp order"

    def test_history_has_count_field(self):
        _, body = _get("/history?range=30m")
        assert "count" in body
        assert isinstance(body["count"], int)

    def test_history_1h_range(self):
        status, body = _get("/history?range=1h")
        assert status == 200
        assert "rows" in body

    def test_history_invalid_range_falls_back_to_30m(self):
        """Unknown range should fall back gracefully (not error)."""
        status, body = _get("/history?range=99y")
        assert status == 200


# ---------------------------------------------------------------------------
# GET /demo/scenarios (demo mode only)
# ---------------------------------------------------------------------------

class TestDemoScenarios:
    def test_scenarios_endpoint_exists(self):
        status, body = _get("/demo/scenarios")
        # 200 in demo mode, 404 in hardware mode — both are acceptable
        assert status in (200, 404)

    def test_scenarios_returns_list(self):
        status, body = _get("/demo/scenarios")
        if status == 200:
            assert "scenarios" in body
            assert isinstance(body["scenarios"], list)
            assert len(body["scenarios"]) > 0


# ---------------------------------------------------------------------------
# 404 for unknown routes
# ---------------------------------------------------------------------------

class TestNotFound:
    def test_unknown_get_returns_404(self):
        status, body = _get("/nonexistent_route_xyz")
        assert status == 404

    def test_unknown_post_returns_404(self):
        status, body = _post("/nonexistent_route_xyz", {})
        assert status == 404
