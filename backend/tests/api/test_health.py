from httpx import AsyncClient


async def test_health(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok", "redis": "ok"}


async def test_unknown_route_is_404(client: AsyncClient) -> None:
    assert (await client.get("/")).status_code == 404
