from typing import List
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from psycopg import AsyncConnection

from app.db.database import get_db
from app.middleware.auth import APIException, get_current_user, require_role

router = APIRouter(tags=["assignments"])

class AssignmentInput(BaseModel):
    project_id: str
    judge_user_id: str

class BulkAssignmentsRequest(BaseModel):
    assignments: List[AssignmentInput]

@router.get("/events/{event_slug}/assignments")
async def list_assignments(
    event_slug: str,
    auth: tuple = Depends(require_role("event_slug", ["organizer"])),
    conn: AsyncConnection = Depends(get_db)
):
    _, event, _ = auth
    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT ja.*, u.display_name as judge_display_name, p.title as project_title
            FROM judge_assignments ja
            JOIN users u ON ja.judge_user_id = u.id
            JOIN projects p ON ja.project_id = p.id
            WHERE ja.event_id = %s
            ORDER BY ja.created_at DESC
            """,
            (event["id"],)
        )
        assignments = await cur.fetchall()
    return {"data": assignments, "meta": {"count": len(assignments)}}

@router.post("/events/{event_slug}/assignments", status_code=status.HTTP_201_CREATED)
async def create_assignments(
    event_slug: str,
    req: BulkAssignmentsRequest,
    auth: tuple = Depends(require_role("event_slug", ["organizer"])),
    conn: AsyncConnection = Depends(get_db)
):
    _, event, _ = auth
    event_id = event["id"]
    created = []

    async with conn.cursor() as cur:
        for item in req.assignments:
            await cur.execute(
                """
                INSERT INTO judge_assignments (event_id, project_id, judge_user_id, status)
                VALUES (%s, %s, %s, 'pending')
                ON CONFLICT (project_id, judge_user_id) DO UPDATE SET status = EXCLUDED.status
                RETURNING *;
                """,
                (event_id, item.project_id, item.judge_user_id)
            )
            created.append(await cur.fetchone())

            # Ensure judge membership exists
            await cur.execute(
                """
                INSERT INTO event_memberships (event_id, user_id, role)
                VALUES (%s, %s, 'judge')
                ON CONFLICT (event_id, user_id, role) DO NOTHING;
                """,
                (event_id, item.judge_user_id)
            )

    return {"data": created}

@router.get("/events/{event_slug}/assignments/mine")
async def get_my_assignments(
    event_slug: str,
    auth: tuple = Depends(require_role("event_slug", ["judge", "organizer"])),
    conn: AsyncConnection = Depends(get_db)
):
    user, event, _ = auth
    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT ja.*, p.title as project_title, p.summary as project_summary
            FROM judge_assignments ja
            JOIN projects p ON ja.project_id = p.id
            WHERE ja.event_id = %s AND ja.judge_user_id = %s
            ORDER BY ja.created_at ASC
            """,
            (event["id"], user["id"])
        )
        assignments = await cur.fetchall()
    return {"data": assignments, "meta": {"count": len(assignments)}}
