"""Shared sliding-window health tracking for providers and models."""
from __future__ import annotations

import time
from collections import deque


def _percentile(values: list[float], ratio: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(round((len(ordered) - 1) * ratio)))
    return round(ordered[index], 1)


class ModelHealth:
    """Short window of outcomes; enough to demote a sick provider for a minute."""

    def __init__(self, window: int = 30, failure_limit: int = 2, cooldown_s: float = 60.0) -> None:
        self.window: deque[tuple[bool, float | None, float | None]] = deque(maxlen=window)
        self.failure_limit = failure_limit
        self.cooldown_s = cooldown_s
        self.failures = 0
        self.cooldown_until = 0.0
        self.last_failure_at = 0.0
        self.last_error = ""

    def ok(self) -> bool:
        return time.time() >= self.cooldown_until

    def success(self, ttft: float | None, total: float | None) -> None:
        self.window.append((True, ttft, total))
        self.failures = 0
        self.last_error = ""

    def failure(self, reason: str) -> None:
        self.window.append((False, None, None))
        self.failures += 1
        self.last_failure_at = time.time()
        self.last_error = reason[:120]
        if self.failures >= self.failure_limit:
            self.cooldown_until = time.time() + self.cooldown_s

    def snapshot(self) -> dict:
        rows = list(self.window)
        ttfts = [r[1] for r in rows if r[0] and r[1] is not None]
        totals = [r[2] for r in rows if r[0] and r[2] is not None]
        wins = sum(1 for r in rows if r[0])
        return {
            "recent_success_rate": round(wins / len(rows), 3) if rows else None,
            "recent_ttft_p50": _percentile(ttfts, 0.5),
            "recent_ttft_p90": _percentile(ttfts, 0.9),
            "recent_total_p50": _percentile(totals, 0.5),
            "recent_total_p90": _percentile(totals, 0.9),
            "consecutive_failures": self.failures,
            "last_failure_at": round(self.last_failure_at, 3) or None,
            "last_error": self.last_error or None,
            "cooldown_left_s": max(0, round(self.cooldown_until - time.time(), 1)),
            "available": self.ok(),
        }
