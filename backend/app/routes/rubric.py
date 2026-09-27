from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from psycopg import AsyncConnection

from app.db.database import get_db
from app.middleware.auth import APIException, require_role

router = APIRouter(tags=["rubric"])

class RubricCriterionInput(BaseModel):
    key: str
    label: str
    description: Optional[str] = None
    weight: float = 1.0
    scale_min: int = 1
    scale_max: int = 5
    option_labels: Optional[Dict[str, str]] = None
    sort_order: Optional[int] = 0

class PutRubricRequest(BaseModel):
    name: str
    criteria: List[RubricCriterionInput]

@router.get("/events/{event_slug}/rubric")
async def get_rubric(event_slug: str, conn: AsyncConnection = Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute("SELECT id FROM events WHERE slug = %s", (event_slug,))
        event = await cur.fetchone()
        if not event:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", f"Event '{event_slug}' not found.")

        await cur.execute("SELECT * FROM rubrics WHERE event_id = %s AND is_active = TRUE ORDER BY created_at DESC LIMIT 1", (event["id"],))
        rubric = await cur.fetchone()
        if not rubric:
            return {"data": None}

        await cur.execute("SELECT * FROM rubric_criteria WHERE rubric_id = %s ORDER BY sort_order ASC, key ASC", (rubric["id"],))
        rubric["criteria"] = await cur.fetchall()

    return {"data": rubric}

@router.put("/events/{event_slug}/rubric")
async def put_rubric(
    event_slug: str,
    req: PutRubricRequest,
    auth: tuple = Depends(require_role("event_slug", ["organizer"])),
    conn: AsyncConnection = Depends(get_db)
):
    user, event, _ = auth
    event_id = event["id"]

    async with conn.cursor() as cur:
        # Deactivate existing rubrics
        await cur.execute("UPDATE rubrics SET is_active = FALSE WHERE event_id = %s", (event_id,))

        # Insert new rubric
        await cur.execute(
            "INSERT INTO rubrics (event_id, name, is_active) VALUES (%s, %s, TRUE) RETURNING *;",
            (event_id, req.name)
        )
        rubric = await cur.fetchone()
        rubric_id = rubric["id"]

        criteria_list = []
        for idx, crit in enumerate(req.criteria):
            await cur.execute(
                """
                INSERT INTO rubric_criteria (rubric_id, key, label, description, weight, scale_min, scale_max, sort_order)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *;
                """,
                (
                    rubric_id, crit.key, crit.label, crit.description,
                    crit.weight, crit.scale_min, crit.scale_max,
                    crit.sort_order or idx
                )
            )
            criteria_list.append(await cur.fetchone())

        rubric["criteria"] = criteria_list

        # Audit event
        await cur.execute(
            """
            INSERT INTO audit_events (event_id, actor_user_id, action, entity_type, entity_id, metadata_json)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (event_id, user["id"], "rubric.updated", "rubric", str(rubric_id), {"name": req.name})
        )

    return {"data": rubric}
