from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from psycopg import AsyncConnection

from app.db.database import get_db
from app.middleware.auth import require_role

router = APIRouter(prefix="/events/{event_slug}/audit", tags=["audit"])

@router.get("")
async def list_audit_events(
    event_slug: str,
    page: int = Query(1, ge=1),
    action: Optional[str] = Query(None),
    auth: tuple = Depends(require_role("event_slug", ["organizer"])),
    conn: AsyncConnection = Depends(get_db)
):
    _, event, _ = auth
    limit = 50
    offset = (page - 1) * limit

    async with conn.cursor() as cur:
        query = """
            SELECT a.*, u.display_name as actor_display_name
            FROM audit_events a
            LEFT JOIN users u ON a.actor_user_id = u.id
            WHERE a.event_id = %s
        """
        params = [event["id"]]

        if action:
            query += " AND a.action = %s"
            params.append(action)

        query += " ORDER BY a.created_at DESC LIMIT %s OFFSET %s;"
        params.extend([limit, offset])

        await cur.execute(query, params)
        events = await cur.fetchall()

    return {"data": events, "meta": {"page": page, "count": len(events)}}
