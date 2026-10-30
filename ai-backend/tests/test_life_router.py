"""Router: tier targets, health window and the tiny circuit breaker."""
from services.llm.router import LifeModelRouter, ModelHealth


def test_targets_follow_env(monkeypatch):
    monkeypatch.setenv("LIFE_FAST_MODEL", "glm-test")
    monkeypatch.setenv("LIFE_PLANNER_MODEL", "gpt-test")
    monkeypatch.setenv("LIFE_FAST_REASONING_EFFORT", "low")
    monkeypatch.setenv("LIFE_PLANNER_REASONING_EFFORT", "medium")
    monkeypatch.delenv("LIFE_FALLBACK_MODEL", raising=False)
    monkeypatch.delenv("LIFE_FAST_FALLBACK_MODEL", raising=False)
    monkeypatch.delenv("LIFE_PLANNER_FALLBACK_MODEL", raising=False)
    router = LifeModelRouter.from_env("base-test")
    fast = [t.model for t in router.tiers["FAST"]]
    planner = [t.model for t in router.tiers["PLANNER"]]
    assert fast == ["glm-test", "gpt-test"]
    assert planner == ["gpt-test", "glm-test"]
    assert router.tiers["FAST"][0].effort == "low"
    assert router.tiers["PLANNER"][0].effort == "medium"


def test_single_model_has_no_fallback(monkeypatch):
    monkeypatch.setenv("LIFE_FAST_MODEL", "only-model")
    monkeypatch.setenv("LIFE_PLANNER_MODEL", "only-model")
    monkeypatch.delenv("LIFE_FALLBACK_MODEL", raising=False)
    router = LifeModelRouter.from_env("only-model")
    assert [t.model for t in router.tiers["FAST"]] == ["only-model"]
    assert router.candidates("FAST")[0].model == "only-model"


def test_health_demotes_after_failures():
    router = LifeModelRouter.from_env("base-test")
    fast = router.tiers["FAST"]
    # Make the primary temporarily unavailable.
    router.failure(fast[0], "TimeoutError")
    assert [t.model for t in router.candidates("FAST")][0] == fast[0].model
    router.failure(fast[0], "TimeoutError")
    order = [t.model for t in router.candidates("FAST")]
    assert order[0] == fast[1].model, "a cooling model should move behind the fallback"
    assert order[-1] == fast[0].model, "cooling models stay as a last resort"
    health = router.status()["tiers"]["FAST"][0]["health"]
    assert health["consecutive_failures"] == 2
    assert health["cooldown_left_s"] > 0
    assert health["available"] is False


def test_success_clears_failures_and_reports_percentiles():
    health = ModelHealth()
    health.failure("HTTP 500")
    health.success(1200.0, 4000.0)
    health.success(1600.0, 4600.0)
    snapshot = health.snapshot()
    assert snapshot["consecutive_failures"] == 0
    assert snapshot["recent_ttft_p50"] in (1200.0, 1600.0)
    assert snapshot["recent_ttft_p90"] is not None
    assert 0 < snapshot["recent_success_rate"] <= 1
