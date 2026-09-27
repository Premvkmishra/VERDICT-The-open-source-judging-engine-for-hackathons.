from typing import Optional
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from psycopg import AsyncConnection

from app.db.database import get_db
from app.middleware.auth import APIException, get_current_user, require_role, get_optional_user

router = APIRouter(prefix="/events", tags=["events"])

class CreateEventRequest(BaseModel):
    slug: str
    name: str
    tagline: Optional[str] = None
    description_md: Optional[str] = None
    submissions_open_at: Optional[str] = None
    submissions_close_at: Optional[str] = None
    judging_opens_at: Optional[str] = None
    judging_closes_at: Optional[str] = None
    voting_open_at: Optional[str] = None
    voting_close_at: Optional[str] = None
    min_reviews_per_project: Optional[int] = 3
    min_publish_coverage_pct: Optional[float] = 0.90

class UpdateEventRequest(BaseModel):
    name: Optional[str] = None
    tagline: Optional[str] = None
    description_md: Optional[str] = None
    status: Optional[str] = None
    submissions_open_at: Optional[str] = None
    submissions_close_at: Optional[str] = None
    judging_opens_at: Optional[str] = None
    judging_closes_at: Optional[str] = None
    voting_open_at: Optional[str] = None
    voting_close_at: Optional[str] = None
    min_reviews_per_project: Optional[int] = None
    min_publish_coverage_pct: Optional[float] = None

class PublishResultsRequest(BaseModel):
    run_id: Optional[str] = None
    force: bool = False
    reason: Optional[str] = None

@router.get("")
async def list_events(user: Optional[dict] = Depends(get_optional_user), conn: AsyncConnection = Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute("SELECT * FROM events ORDER BY created_at DESC")
        events = await cur.fetchall()
    return {"data": events, "meta": {"count": len(events)}}

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_event(req: CreateEventRequest, user: dict = Depends(get_current_user), conn: AsyncConnection = Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute("SELECT id FROM events WHERE slug = %s", (req.slug,))
        if await cur.fetchone():
            raise APIException(status.HTTP_409_CONFLICT, "conflict", f"An event with slug '{req.slug}' already exists.")

        await cur.execute(
            """
            INSERT INTO events (slug, name, tagline, description_md, submissions_open_at, submissions_close_at, judging_opens_at, judging_closes_at, voting_open_at, voting_close_at, min_reviews_per_project, min_publish_coverage_pct)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *;
            """,
            (
                req.slug, req.name, req.tagline, req.description_md,
                req.submissions_open_at, req.submissions_close_at,
                req.judging_opens_at, req.judging_closes_at,
                req.voting_open_at, req.voting_close_at,
                req.min_reviews_per_project, req.min_publish_coverage_pct
            )
        )
        event = await cur.fetchone()

        # Add organizer membership
        await cur.execute(
            "INSERT INTO event_memberships (event_id, user_id, role) VALUES (%s, %s, %s)",
            (event["id"], user["id"], "organizer")
        )
    return {"data": event}

@router.get("/{event_slug}")
async def get_event(event_slug: str, conn: AsyncConnection = Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute("SELECT * FROM events WHERE slug = %s", (event_slug,))
        event = await cur.fetchone()
        if not event:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", f"Event '{event_slug}' not found.")
    return {"data": event}

@router.patch("/{event_slug}")
async def update_event(
    event_slug: str,
    req: UpdateEventRequest,
    auth: tuple = Depends(require_role("event_slug", ["organizer"])),
    conn: AsyncConnection = Depends(get_db)
):
    _, event, _ = auth
    fields = []
    values = []
    for k, v in req.model_dump(exclude_unset=True).items():
        fields.append(f"{k} = %s")
        values.append(v)

    if not fields:
        return {"data": event}

    values.append(event["id"])
    query = f"UPDATE events SET {', '.join(fields)} WHERE id = %s RETURNING *;"

    async with conn.cursor() as cur:
        await cur.execute(query, values)
        updated_event = await cur.fetchone()

    return {"data": updated_event}

@router.post("/{event_slug}/publish-results")
async def publish_results(
    event_slug: str,
    req: PublishResultsRequest,
    auth: tuple = Depends(require_role("event_slug", ["organizer"])),
    conn: AsyncConnection = Depends(get_db)
):
    user, event, _ = auth
    event_id = event["id"]

    async with conn.cursor() as cur:
        # Get target normalization run
        if req.run_id:
            await cur.execute("SELECT * FROM normalization_runs WHERE id = %s AND event_id = %s", (req.run_id, event_id))
        else:
            await cur.execute("SELECT * FROM normalization_runs WHERE event_id = %s ORDER BY run_at DESC LIMIT 1", (event_id,))
        
        run = await cur.fetchone()
        if not run:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", "No normalization run found for this event.")

        run_id = run["id"]

        # Calculate coverage
        await cur.execute("SELECT COUNT(*) as cnt FROM projects WHERE event_id = %s AND status = 'submitted'", (event_id,))
        total_projects = (await cur.fetchone())["cnt"]

        await cur.execute("SELECT COUNT(*) as cnt FROM project_rankings WHERE run_id = %s AND is_rankable = TRUE", (run_id,))
        rankable_projects = (await cur.fetchone())["cnt"]

        coverage = (rankable_projects / total_projects) if total_projects > 0 else 1.0
        min_required = float(event["min_publish_coverage_pct"] or 0.90)

        if coverage < min_required and not req.force:
            raise APIException(
                status.HTTP_409_CONFLICT,
                "conflict",
                f"Publish coverage is {coverage*100:.1f}%, below required {min_required*100:.1f}%. Set force=true with reason to override."
            )

        if req.force and not req.reason:
            raise APIException(status.HTTP_400_BAD_REQUEST, "validation_error", "A reason is required when forcing publish below coverage threshold.")

        # Update event status
        await cur.execute(
            "UPDATE events SET published_normalization_run_id = %s, status = 'results_published' WHERE id = %s RETURNING *;",
            (run_id, event_id)
        )
        updated_event = await cur.fetchone()

        # Audit event
        action = "results.force_published" if (coverage < min_required or req.force) else "results.published"
        await cur.execute(
            """
            INSERT INTO audit_events (event_id, actor_user_id, action, entity_type, entity_id, metadata_json)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (event_id, user["id"], action, "normalization_run", str(run_id), {"coverage": coverage, "reason": req.reason})
        )

    return {"data": updated_event}
