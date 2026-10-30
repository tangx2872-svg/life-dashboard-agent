"""Latency-aware, process-local model router for Life proposals.

No Redis, no mesh: a sliding window plus a small circuit breaker is enough for one box.
Each tier is an ordered failover chain, e.g. DeepSeek -> Luna -> GLM.
"""
from __future__ import annotations

import os
import threading
from dataclasses import dataclass

from services.health import ModelHealth

WINDOW = int(os.getenv("LIFE_ROUTER_WINDOW", "30"))
FAILURE_LIMIT = int(os.getenv("LIFE_ROUTER_FAILURE_LIMIT", "2"))
COOLDOWN_S = float(os.getenv("LIFE_ROUTER_COOLDOWN_S", "60"))


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
        return name.startswith(("gpt-5", "gpt-6")) or "glm" in name or "deepseek" in name

    def describe(self) -> dict:
        return {"model": self.model, "tier": self.tier, "role": self.role, "effort": self.effort}


def _models(value: str | None) -> list[str]:
    """Ordered, de-duplicated model list from a comma-separated env value."""
    names: list[str] = []
    for item in (value or "").split(","):
        name = item.strip()
        if name and name not in names:
            names.append(name)
    return names


class LifeModelRouter:
    def __init__(self, tiers: dict[str, list[ModelTarget]]) -> None:
        self.tiers = tiers
        self.health: dict[str, ModelHealth] = {t.key: ModelHealth(window=WINDOW, failure_limit=FAILURE_LIMIT, cooldown_s=COOLDOWN_S) for rows in tiers.values() for t in rows}
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
        # Fallbacks are an ordered chain (DeepSeek -> Luna -> GLM), not a single spare.
        for model in _models(fast_fallback):
            if model != fast:
                tiers["FAST"].append(ModelTarget(model, fast_effort, "FAST", "fallback"))
        for model in _models(planner_fallback):
            if model != planner:
                tiers["PLANNER"].append(ModelTarget(model, planner_effort, "PLANNER", "fallback"))
        return cls({tier: [t for t in rows if t.model] for tier, rows in tiers.items()})

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
