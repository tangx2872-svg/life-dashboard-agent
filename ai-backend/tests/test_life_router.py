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
    monkeypatch.delenv("LIFE_FAST_FALLBACK_MODEL", raising=False)
    monkeypatch.delenv("LIFE_PLANNER_FALLBACK_MODEL", raising=False)
    router = LifeModelRouter.from_env("only-model")
    assert [t.model for t in router.tiers["FAST"]] == ["only-model"]
    assert router.candidates("FAST")[0].model == "only-model"


def test_three_stage_fallback_chain(monkeypatch):
    monkeypatch.setenv("LIFE_FAST_MODEL", "deepseek-test")
    monkeypatch.setenv("LIFE_PLANNER_MODEL", "luna-test")
    monkeypatch.setenv("LIFE_FAST_FALLBACK_MODEL", "luna-test, glm-test ,luna-test")
    monkeypatch.delenv("LIFE_FALLBACK_MODEL", raising=False)
    monkeypatch.delenv("LIFE_PLANNER_FALLBACK_MODEL", raising=False)
    router = LifeModelRouter.from_env("base-test")
    assert [t.model for t in router.tiers["FAST"]] == ["deepseek-test", "luna-test", "glm-test"]
    assert [t.model for t in router.candidates("FAST")] == ["deepseek-test", "luna-test", "glm-test"]
    # A dead primary must not drop the rest of the chain.
    router.failure(router.tiers["FAST"][0], "TimeoutError")
    router.failure(router.tiers["FAST"][0], "TimeoutError")
    assert [t.model for t in router.candidates("FAST")][:2] == ["luna-test", "glm-test"]


def test_health_demotes_after_failures(monkeypatch):
    monkeypatch.setenv("LIFE_FAST_MODEL", "primary-test")
    monkeypatch.setenv("LIFE_PLANNER_MODEL", "planner-test")
    monkeypatch.delenv("LIFE_FALLBACK_MODEL", raising=False)
    monkeypatch.delenv("LIFE_FAST_FALLBACK_MODEL", raising=False)
    monkeypatch.delenv("LIFE_PLANNER_FALLBACK_MODEL", raising=False)
    router = LifeModelRouter.from_env("base-test")
    fast = router.tiers["FAST"]
    assert len(fast) > 1, "this test needs a fallback"
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
