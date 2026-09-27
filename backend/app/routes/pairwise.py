from typing import Optional
from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel
from psycopg import AsyncConnection

from app.db.database import get_db
from app.middleware.auth import APIException, require_role

router = APIRouter(prefix="/events/{event_slug}", tags=["pairwise"])

class PairwiseComparisonInput(BaseModel):
    project_a_id: str
    project_b_id: str
    winner_project_id: str

@router.get("/pairwise/next")
async def get_next_pairwise_pair(
    event_slug: str,
    auth: tuple = Depends(require_role("event_slug", ["judge", "organizer"])),
    conn: AsyncConnection = Depends(get_db)
):
    _, event, _ = auth
    async with conn.cursor() as cur:
        await cur.execute("SELECT * FROM projects WHERE event_id = %s AND status = 'submitted' ORDER BY random() LIMIT 2", (event["id"],))
        projects = await cur.fetchall()
        if len(projects) < 2:
            return Response(status_code=status.HTTP_204_NO_CONTENT)

    return {
        "data": {
            "project_a": projects[0],
            "project_b": projects[1]
        }
    }

@router.post("/pairwise", status_code=status.HTTP_201_CREATED)
async def submit_pairwise_comparison(
    event_slug: str,
    req: PairwiseComparisonInput,
    auth: tuple = Depends(require_role("event_slug", ["judge", "organizer"])),
    conn: AsyncConnection = Depends(get_db)
):
    user, event, _ = auth
    async with conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO pairwise_comparisons (event_id, judge_user_id, project_a_id, project_b_id, winner_project_id)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING *;
            """,
            (event["id"], user["id"], req.project_a_id, req.project_b_id, req.winner_project_id)
        )
        comp = await cur.fetchone()

    return {"data": comp}
