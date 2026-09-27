from typing import Optional
from fastapi import APIRouter, Depends, Request, status
from pydantic import BaseModel
from psycopg import AsyncConnection

from app.db.database import get_db
from app.middleware.auth import APIException, get_optional_user
from app.middleware.rate_limiter import check_rate_limit

router = APIRouter(prefix="/projects/{project_id}/comments", tags=["comments"])

class PostCommentRequest(BaseModel):
    body: str
    author_display_name: Optional[str] = "Anonymous"

@router.get("")
async def list_comments(project_id: str, conn: AsyncConnection = Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT c.*, u.display_name as user_display_name
            FROM comments c
            LEFT JOIN users u ON c.user_id = u.id
            WHERE c.project_id = %s AND c.status = 'visible'
            ORDER BY c.created_at ASC
            """,
            (project_id,)
        )
        comments = await cur.fetchall()

    return {"data": comments, "meta": {"count": len(comments)}}

@router.post("", status_code=status.HTTP_201_CREATED)
async def post_comment(
    project_id: str,
    req: PostCommentRequest,
    request: Request,
    user: Optional[dict] = Depends(get_optional_user),
    conn: AsyncConnection = Depends(get_db)
):
    client_ip = request.client.host if request.client else "127.0.0.1"
    voter_key = f"user:{user['id']}" if user else f"ip:{client_ip}"
    check_rate_limit(f"comment:{voter_key}", max_requests=10, window_seconds=60)

    display_name = user["display_name"] if user else (req.author_display_name or "Anonymous")

    async with conn.cursor() as cur:
        await cur.execute("SELECT event_id FROM projects WHERE id = %s", (project_id,))
        project = await cur.fetchone()
        if not project:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", "Project not found.")

        await cur.execute(
            """
            INSERT INTO comments (project_id, user_id, author_display_name, body, status)
            VALUES (%s, %s, %s, %s, 'visible')
            RETURNING *;
            """,
            (project_id, user["id"] if user else None, display_name, req.body)
        )
        comment = await cur.fetchone()

        # Audit event
        await cur.execute(
            """
            INSERT INTO audit_events (event_id, actor_user_id, action, entity_type, entity_id)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (project["event_id"], user["id"] if user else None, "comment.created", "comment", str(comment["id"]))
        )

    return {"data": comment}
