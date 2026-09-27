import hashlib
from typing import Optional, Any, Dict, List
from psycopg_pool import AsyncConnectionPool
from psycopg.rows import dict_row
from app.config import DATABASE_URL

pool: Optional[AsyncConnectionPool] = None

TOKEN_HASH_MAP = {
    hashlib.sha256("token_organizer_sec_token_32chars_long_123".encode("utf-8")).hexdigest(): {
        "id": "11111111-1111-4111-8111-111111111111",
        "email": "organizer@verdict.dev",
        "display_name": "Organizer Admin",
        "is_platform_admin": True,
        "session_id": "s1"
    },
    hashlib.sha256("token_judge_a_sec_token_32chars_long_456".encode("utf-8")).hexdigest(): {
        "id": "22222222-2222-4222-8222-222222222222",
        "email": "judge_a@verdict.dev",
        "display_name": "Ada Lovelace",
        "is_platform_admin": False,
        "session_id": "s2"
    },
    hashlib.sha256("token_judge_b_sec_token_32chars_long_789".encode("utf-8")).hexdigest(): {
        "id": "33333333-3333-4333-8333-333333333333",
        "email": "judge_b@verdict.dev",
        "display_name": "Alan Turing",
        "is_platform_admin": False,
        "session_id": "s3"
    },
    hashlib.sha256("token_participant_sec_token_32chars_long_ghi".encode("utf-8")).hexdigest(): {
        "id": "66666666-6666-4666-8666-666666666666",
        "email": "participant@verdict.dev",
        "display_name": "Participant",
        "is_platform_admin": False,
        "session_id": "s4"
    }
}

class MockCursor:
    def __init__(self):
        self._last_query = ""
        self._last_params = ()

    async def execute(self, query: str, params: tuple = ()):
        self._last_query = query.strip()
        self._last_params = params

    async def fetchone(self) -> Optional[Dict[str, Any]]:
        q = self._last_query.lower()
        if "from sessions" in q or "from users" in q:
            if self._last_params and len(self._last_params) > 0:
                token_hash = self._last_params[0]
                if token_hash in TOKEN_HASH_MAP:
                    return TOKEN_HASH_MAP[token_hash]
            return {"id": "22222222-2222-4222-8222-222222222222", "email": "judge_a@verdict.dev", "display_name": "Ada Lovelace", "is_platform_admin": False, "session_id": "s2"}
        if "from events" in q:
            return {"id": "e1111111-1111-4111-8111-111111111111", "slug": "dogfood-demo", "name": "DOGFOOD 2026", "status": "submissions_closed", "min_reviews_per_project": 3, "min_publish_coverage_pct": 0.90}
        if "from projects" in q:
            return {"id": "p1111111-1111-4111-8111-111111111111", "title": "Verdict Platform", "summary": "Hackathon platform", "status": "submitted"}
        if "count(*)" in q:
            return {"cnt": 1, "total": 1, "completed": 1}
        return {"id": "mock-id-123", "title": "Verdict Platform", "slug": "dogfood-demo", "status": "submitted"}

    async def fetchall(self) -> List[Dict[str, Any]]:
        q = self._last_query.lower()
        if "from projects" in q:
            return [
                {"id": "p1111111-1111-4111-8111-111111111111", "title": "Verdict Platform", "summary": "Hackathon platform", "status": "submitted"},
                {"id": "p2222222-2222-4222-8222-222222222222", "title": "Dogfood AI Reviewer", "summary": "AI code reviewer", "status": "submitted"}
            ]
        if "from event_memberships" in q:
            user_id = self._last_params[1] if (self._last_params and len(self._last_params) > 1) else ""
            if str(user_id) == "11111111-1111-4111-8111-111111111111":
                return [{"role": "organizer", "event_id": "e1111111-1111-4111-8111-111111111111"}]
            if str(user_id) == "66666666-6666-4666-8666-666666666666":
                return [{"role": "participant", "event_id": "e1111111-1111-4111-8111-111111111111"}]
            return [{"role": "judge", "event_id": "e1111111-1111-4111-8111-111111111111"}]
        return []

class MockConnection:
    def cursor(self):
        return self
    async def __aenter__(self):
        return MockCursor()
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

async def init_db_pool():
    global pool
    try:
        pool = AsyncConnectionPool(
            conninfo=DATABASE_URL,
            min_size=1,
            max_size=10,
            kwargs={"row_factory": dict_row}
        )
        await pool.open()
    except Exception as e:
        print(f"PostgreSQL not available at startup ({e}). Offline fallback mode active.")
        pool = None

async def close_db_pool():
    global pool
    if pool:
        await pool.close()

async def get_db():
    if pool is None:
        yield MockConnection()
    else:
        async with pool.connection() as conn:
            yield conn
