from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from psycopg import AsyncConnection

from app.db.database import get_db
from app.middleware.auth import APIException, get_current_user, require_role, get_optional_user

router = APIRouter(tags=["projects"])

class CreateProjectRequest(BaseModel):
    title: str
    summary: str
    description_md: Optional[str] = None
    repo_url: Optional[str] = None
    demo_url: Optional[str] = None
    video_url: Optional[str] = None
    cover_image_url: Optional[str] = None
    track_id: Optional[str] = None

class UpdateProjectRequest(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    description_md: Optional[str] = None
    repo_url: Optional[str] = None
    demo_url: Optional[str] = None
    video_url: Optional[str] = None
    cover_image_url: Optional[str] = None
    track_id: Optional[str] = None

def check_deadline(event: dict):
    submissions_close_at = event.get("submissions_close_at")
    if submissions_close_at:
        now = datetime.now(timezone.utc)
        if isinstance(submissions_close_at, str):
            close_dt = datetime.fromisoformat(submissions_close_at.replace("Z", "+00:00"))
        else:
            close_dt = submissions_close_at
        
        if now > close_dt:
            raise APIException(
                status.HTTP_409_CONFLICT,
                "deadline_passed",
                "Submissions for this event are closed. The submission deadline has passed."
            )

@router.get("/events/{event_slug}/projects")
async def list_projects(
    event_slug: str,
    q: Optional[str] = Query(None),
    track_id: Optional[str] = Query(None),
    sort: Optional[str] = Query("newest"),
    page: int = Query(1, ge=1),
    conn: AsyncConnection = Depends(get_db)
):
    async with conn.cursor() as cur:
        await cur.execute("SELECT id FROM events WHERE slug = %s", (event_slug,))
        event = await cur.fetchone()
        if not event:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", f"Event '{event_slug}' not found.")

        query = "SELECT * FROM projects WHERE event_id = %s"
        params = [event["id"]]

        if q:
            query += " AND (title ILIKE %s OR summary ILIKE %s)"
            params.extend([f"%{q}%", f"%{q}%"])

        if track_id:
            query += " AND track_id = %s"
            params.append(track_id)

        if sort == "title":
            query += " ORDER BY title ASC"
        else:
            query += " ORDER BY created_at DESC"

        limit = 50
        offset = (page - 1) * limit
        query += " LIMIT %s OFFSET %s;"
        params.extend([limit, offset])

        await cur.execute(query, params)
        projects = await cur.fetchall()

    return {"data": projects, "meta": {"page": page, "count": len(projects)}}

@router.post("/events/{event_slug}/projects", status_code=status.HTTP_201_CREATED)
async def create_project(
    event_slug: str,
    req: CreateProjectRequest,
    user: dict = Depends(get_current_user),
    conn: AsyncConnection = Depends(get_db)
):
    async with conn.cursor() as cur:
        await cur.execute("SELECT * FROM events WHERE slug = %s", (event_slug,))
        event = await cur.fetchone()
        if not event:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", f"Event '{event_slug}' not found.")

        # SERVER-SIDE DEADLINE ENFORCEMENT
        check_deadline(event)

        # Get user's team for this event
        await cur.execute(
            """
            SELECT t.id FROM teams t
            JOIN team_members tm ON t.id = tm.team_id
            WHERE t.event_id = %s AND tm.user_id = %s
            """,
            (event["id"], user["id"])
        )
        team = await cur.fetchone()
        if not team:
            raise APIException(status.HTTP_403_FORBIDDEN, "forbidden", "You must create or join a team before submitting a project.")

        team_id = team["id"]

        # Insert project
        await cur.execute(
            """
            INSERT INTO projects (event_id, team_id, track_id, title, summary, description_md, repo_url, demo_url, video_url, cover_image_url, status, submitted_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'submitted', now())
            RETURNING *;
            """,
            (
                event["id"], team_id, req.track_id, req.title, req.summary,
                req.description_md, req.repo_url, req.demo_url, req.video_url, req.cover_image_url
            )
        )
        project = await cur.fetchone()

        # Audit event
        await cur.execute(
            """
            INSERT INTO audit_events (event_id, actor_user_id, action, entity_type, entity_id, metadata_json)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (event["id"], user["id"], "project.created", "project", str(project["id"]), {"title": req.title})
        )

    return {"data": project}

@router.get("/projects/{project_id}")
async def get_project(project_id: str, conn: AsyncConnection = Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute("SELECT * FROM projects WHERE id = %s", (project_id,))
        project = await cur.fetchone()
        if not project:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", "Project not found.")
    return {"data": project}

@router.patch("/projects/{project_id}")
async def update_project(
    project_id: str,
    req: UpdateProjectRequest,
    user: dict = Depends(get_current_user),
    conn: AsyncConnection = Depends(get_db)
):
    async with conn.cursor() as cur:
        await cur.execute("SELECT p.*, e.submissions_close_at FROM projects p JOIN events e ON p.event_id = e.id WHERE p.id = %s", (project_id,))
        project = await cur.fetchone()
        if not project:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", "Project not found.")

        # Check deadline
        check_deadline(project)

        # Check membership in project's team
        await cur.execute("SELECT 1 FROM team_members WHERE team_id = %s AND user_id = %s", (project["team_id"], user["id"]))
        if not await cur.fetchone() and not user.get("is_platform_admin"):
            raise APIException(status.HTTP_403_FORBIDDEN, "forbidden", "You can only edit projects belonging to your team.")

        fields = []
        values = []
        for k, v in req.model_dump(exclude_unset=True).items():
            fields.append(f"{k} = %s")
            values.append(v)

        if not fields:
            return {"data": project}

        values.append(project_id)
        query = f"UPDATE projects SET {', '.join(fields)} WHERE id = %s RETURNING *;"
        await cur.execute(query, values)
        updated = await cur.fetchone()

    return {"data": updated}

@router.post("/projects/{project_id}/submit")
async def submit_project(
    project_id: str,
    user: dict = Depends(get_current_user),
    conn: AsyncConnection = Depends(get_db)
):
    async with conn.cursor() as cur:
        await cur.execute("SELECT p.*, e.submissions_close_at FROM projects p JOIN events e ON p.event_id = e.id WHERE p.id = %s", (project_id,))
        project = await cur.fetchone()
        if not project:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", "Project not found.")

        check_deadline(project)

        await cur.execute(
            "UPDATE projects SET status = 'submitted', submitted_at = now() WHERE id = %s RETURNING *;",
            (project_id,)
        )
        updated = await cur.fetchone()

    return {"data": updated}
