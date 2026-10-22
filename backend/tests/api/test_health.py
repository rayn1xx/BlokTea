import pytest
from httpx import AsyncClient


async def test_health(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "db": "ok",
        "llm": "stub",
        "llm_models": {"text": None, "vision": None},
        "mocks": {"alfa_lk": "ok", "registry": "ok", "bki": "ok", "fns": "ok"},
        "demo_mode": True,
    }


async def test_degraded_when_mock_is_down(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MOCKS_DOWN", "bki")

    body = (await client.get("/api/v1/health")).json()

    assert body["status"] == "degraded"
    assert body["mocks"]["bki"] == "down"


async def test_unknown_route_is_404_in_unified_format(client: AsyncClient) -> None:
    response = await client.get("/api/v1/nope")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
