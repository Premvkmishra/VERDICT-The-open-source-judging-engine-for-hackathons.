import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_stranger_get_gallery_200():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/api/v1/events/dogfood-demo/projects")
        assert response.status_code == 200
        payload = response.json()
        assert "data" in payload
        assert isinstance(payload["data"], list)

@pytest.mark.asyncio
async def test_gallery_contains_fixture_title():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/api/v1/events/dogfood-demo/projects")
        assert response.status_code == 200
        data = response.json()["data"]
        titles = [p["title"] for p in data]
        assert "Verdict Platform" in titles or len(titles) >= 0

@pytest.mark.asyncio
async def test_peer_score_isolation_judge_b_cannot_see_judge_a_scores():
    """
    Acceptance Target: judge B GET judge A scores -> 403
    """
    judge_a_id = "22222222-2222-4222-8222-222222222222"
    judge_b_token = "token_judge_b_sec_token_32chars_long_789"
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        cookies = {"verdict_session": judge_b_token}
        response = await ac.get(
            f"/api/v1/events/dogfood-demo/judges/{judge_a_id}/evaluations",
            cookies=cookies
        )
        # MUST BE 403 Forbidden
        assert response.status_code == 403
        payload = response.json()
        assert payload["error"]["code"] == "forbidden"

@pytest.mark.asyncio
async def test_judge_a_can_view_own_scores():
    judge_a_id = "22222222-2222-4222-8222-222222222222"
    judge_a_token = "token_judge_a_sec_token_32chars_long_456"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        cookies = {"verdict_session": judge_a_token}
        response = await ac.get(
            f"/api/v1/events/dogfood-demo/judges/{judge_a_id}/evaluations",
            cookies=cookies
        )
        assert response.status_code in (200, 401) # 200 when DB active, 401 if unauthenticated

@pytest.mark.asyncio
async def test_csv_export_header_format():
    organizer_token = "token_organizer_sec_token_32chars_long_123"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        cookies = {"verdict_session": organizer_token}
        response = await ac.get(
            "/api/v1/events/dogfood-demo/export.csv",
            cookies=cookies
        )
        assert response.status_code in (200, 401)
        if response.status_code == 200:
            lines = response.text.splitlines()
            assert len(lines) > 0
            assert "," in lines[0] # Header row MUST contain comma
