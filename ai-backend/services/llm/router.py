"""Latency-aware, process-local model router for Life proposals.

No Redis, no mesh: a sliding window plus a small circuit breaker is enough for one box.
"""
from __future__ import annotations

import os
import threading
import time
from collections import deque
from dataclasses import dataclass

WINDOW = int(os.getenv("LIFE_ROUTER_WINDOW", "30"))
FAILURE_LIMIT = int(os.getenv("LIFE_ROUTER_FAILURE_LIMIT", "2"))
COOLDOWN_S = float(os.getenv("LIFE_ROUTER_COOLDOWN_S", "60"))


def _percentile(values: list[float], ratio: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, int(round((len(ordered) - 1) * ratio)))
    return round(ordered[index], 1)


@dataclass(frozen=True)
class ModelTarget:
    model: str
    effort: str
    tier: str
    role: str  # primary | fallback

    @property
    def key(self) -> str:
        return f"{self.tier}:{self.role}:{self.model}"

    @property
    def supports_reasoning(self) -> bool:
        name = self.model.lower()
        return name.startswith(("gpt-5", "gpt-6")) or "glm" in name

    def describe(self) -> dict:
        return {"model": self.model, "tier": self.tier, "role": self.role, "effort": self.effort}


class ModelHealth:
    """Short sliding window of outcomes; good enough to demote a sick model for a minute."""

    def __init__(self) -> None:
        self.window: deque[tuple[bool, float | None, float | None]] = deque(maxlen=WINDOW)
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
        if self.failures >= FAILURE_LIMIT:
            self.cooldown_until = time.time() + COOLDOWN_S

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


class LifeModelRouter:
    def __init__(self, tiers: dict[str, list[ModelTarget]]) -> None:
        self.tiers = tiers
        self.health: dict[str, ModelHealth] = {t.key: ModelHealth() for rows in tiers.values() for t in rows}
        self.lock = threading.Lock()

    @classmethod
    def from_env(cls, base_model: str | None = None) -> "LifeModelRouter":
        base = base_model or os.getenv("OPENAI_MODEL") or os.getenv("AUTODL_LLM_MODEL") or ""
        fast = os.getenv("LIFE_FAST_MODEL") or base
        planner = os.getenv("LIFE_PLANNER_MODEL") or base
        shared_fallback = os.getenv("LIFE_FALLBACK_MODEL") or ""
        fast_fallback = os.getenv("LIFE_FAST_FALLBACK_MODEL") or shared_fallback or (planner if planner != fast else "")
        planner_fallback = os.getenv("LIFE_PLANNER_FALLBACK_MODEL") or shared_fallback or (fast if planner != fast else "")
        fast_effort = os.getenv("LIFE_FAST_REASONING_EFFORT") or "low"
        planner_effort = os.getenv("LIFE_PLANNER_REASONING_EFFORT") or "medium"
        tiers = {
            "FAST": [ModelTarget(fast, fast_effort, "FAST", "primary")],
            "PLANNER": [ModelTarget(planner, planner_effort, "PLANNER", "primary")],
        }
        if fast_fallback:
            tiers["FAST"].append(ModelTarget(fast_fallback, planner_effort, "FAST", "fallback"))
        if planner_fallback:
            tiers["PLANNER"].append(ModelTarget(planner_fallback, fast_effort, "PLANNER", "fallback"))
        return cls({tier: [t for i, t in enumerate(rows) if t.model and t.model not in [r.model for r in rows[:i]]] for tier, rows in tiers.items()})

    def candidates(self, tier: str) -> list[ModelTarget]:
        rows = self.tiers.get(tier) or []
        healthy = [t for t in rows if self.health[t.key].ok()]
        cooling = [t for t in rows if not self.health[t.key].ok()]
        # Cooling models stay last in line so a total outage still returns something.
        return healthy + cooling

    def success(self, target: ModelTarget, ttft: float | None, total: float | None) -> None:
        with self.lock:
            self.health[target.key].success(ttft, total)

    def failure(self, target: ModelTarget, reason: str) -> None:
        with self.lock:
            self.health[target.key].failure(reason)

    def status(self) -> dict:
        tiers = {}
        for tier, rows in self.tiers.items():
            tiers[tier] = [
                {**row.describe(), "health": self.health[row.key].snapshot()}
                for row in rows
            ]
        return {"tiers": tiers, "window": WINDOW, "failure_limit": FAILURE_LIMIT, "cooldown_s": COOLDOWN_S}
