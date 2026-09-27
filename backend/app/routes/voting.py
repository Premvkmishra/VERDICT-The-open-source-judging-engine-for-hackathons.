import hashlib
from typing import Optional
from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel
from psycopg import AsyncConnection
from psycopg.errors import UniqueViolation

from app.db.database import get_db
from app.middleware.auth import APIException, get_optional_user
from app.middleware.rate_limiter import check_rate_limit

router = APIRouter(prefix="/events/{event_slug}", tags=["voting"])

class VoteInput(BaseModel):
    project_id: str
    voter_type: str  # 'email', 'link', 'account'
    email: Optional[str] = None

@router.get("/vote/ballot")
async def get_ballot(
    event_slug: str,
    conn: AsyncConnection = Depends(get_db)
):
    async with conn.cursor() as cur:
        await cur.execute("SELECT * FROM events WHERE slug = %s", (event_slug,))
        event = await cur.fetchone()
        if not event:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", f"Event '{event_slug}' not found.")

        if event["status"] == "results_published":
            raise APIException(status.HTTP_403_FORBIDDEN, "event_not_open", "Voting is closed because final results have been published.")

        await cur.execute("SELECT * FROM projects WHERE event_id = %s AND status = 'submitted' ORDER BY random()", (event["id"],))
        projects = await cur.fetchall()

    return {"data": projects, "meta": {"count": len(projects)}}

@router.post("/vote", status_code=status.HTTP_201_CREATED)
async def cast_vote(
    event_slug: str,
    req: VoteInput,
    request: Request,
    user: Optional[dict] = Depends(get_optional_user),
    conn: AsyncConnection = Depends(get_db)
):
    client_ip = request.client.host if request.client else "127.0.0.1"

    # Derive voter_key
    if req.voter_type == "email":
        if not req.email:
            raise APIException(status.HTTP_400_BAD_REQUEST, "validation_error", "Email is required for email voting.")
        voter_key = f"email:{hashlib.sha256(req.email.lower().strip().encode('utf-8')).hexdigest()}"
    elif req.voter_type == "account":
        if not user:
            raise APIException(status.HTTP_401_UNAUTHORIZED, "unauthenticated", "You must be logged in to vote with account.")
        voter_key = f"user:{user['id']}"
    else:
        voter_key = f"ip:{client_ip}"

    # Rate limiting
    check_rate_limit(f"vote:{voter_key}", max_requests=10, window_seconds=60)

    async with conn.cursor() as cur:
        await cur.execute("SELECT id FROM events WHERE slug = %s", (event_slug,))
        event = await cur.fetchone()
        if not event:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", f"Event '{event_slug}' not found.")

        event_id = event["id"]

        try:
            await cur.execute(
                """
                INSERT INTO votes (event_id, project_id, voter_key, voter_type, email)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id;
                """,
                (event_id, req.project_id, voter_key, req.voter_type, req.email)
            )
            vote_row = await cur.fetchone()
        except UniqueViolation:
            raise APIException(
                status.HTTP_409_CONFLICT,
                "conflict",
                "You have already cast a vote for this project."
            )

    return {"data": {"id": str(vote_row["id"])}}
