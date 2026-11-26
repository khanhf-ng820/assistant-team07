"""Unit tests for scripts/measure_capture_latency.py (issue #53). No network."""

import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[3] / "scripts" / "measure_capture_latency.py"
spec = importlib.util.spec_from_file_location("measure_capture_latency", SCRIPT)
latency = importlib.util.module_from_spec(spec)
spec.loader.exec_module(latency)


def test_summarize_reports_percentiles_and_passes_under_limit():
    result = latency.summarize([0.1, 0.2, 0.3, 0.4, 0.5])
    assert result["min"] == 0.1
    assert result["median"] == 0.3
    assert result["max"] == 0.5
    assert result["runs"] == 5
    assert result["passed"] is True


def test_summarize_boundary_exactly_at_limit_passes():
    assert latency.summarize([5.0])["passed"] is True


def test_summarize_fails_when_slowest_run_exceeds_limit():
    result = latency.summarize([0.2, 0.3, 5.01])
    assert result["max"] == 5.01
    assert result["passed"] is False


def test_summarize_single_sample_and_empty_input():
    assert latency.summarize([1.5])["p95"] == 1.5
    with pytest.raises(ValueError):
        latency.summarize([])


def test_summarize_30_samples_uses_ceil_for_p95():
    # 0.95 * 30 = 28.5 -> ceil = 29 -> 0-based index 28 (value 29), never understated via round()
    samples = [float(i) for i in range(1, 31)]
    result = latency.summarize(samples)
    assert result["runs"] == 30
    assert result["p95"] == 29.0
    assert result["max"] == 30.0
    assert result["passed"] is False


def test_main_rejects_non_positive_runs():
    with pytest.raises(SystemExit):
        latency.main(["--runs", "0"])


def test_main_reports_connection_failure_with_exit_code_2(capsys):
    # Port 1 is reserved and nothing listens there.
    assert latency.main(["--base-url", "http://127.0.0.1:1", "--runs", "1", "--timeout", "1"]) == 2
    assert "FAILED" in capsys.readouterr().err
