from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from psycopg import AsyncConnection

from app.db.database import get_db
from app.middleware.auth import APIException, get_current_user, require_role

router = APIRouter(tags=["judging"])

class EvaluationScoreInput(BaseModel):
    criterion_id: str
    value: int

class SaveEvaluationRequest(BaseModel):
    reaction: Optional[str] = None
    final_preference: Optional[str] = None
    tags: Optional[List[str]] = None
    comment: Optional[str] = None
    scores: Optional[List[EvaluationScoreInput]] = None

@router.get("/events/{event_slug}/judge/feed")
async def get_judge_feed(
    event_slug: str,
    auth: tuple = Depends(require_role("event_slug", ["judge", "organizer"])),
    conn: AsyncConnection = Depends(get_db)
):
    user, event, _ = auth
    event_id = event["id"]
    user_id = user["id"]

    async with conn.cursor() as cur:
        # Count progress
        await cur.execute(
            "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'completed') as completed FROM judge_assignments WHERE event_id = %s AND judge_user_id = %s",
            (event_id, user_id)
        )
        counts = await cur.fetchone()
        completed_count = counts["completed"] if counts else 0
        total_count = counts["total"] if counts else 0
        remaining_count = total_count - completed_count

        # Get next unfinished assignment
        await cur.execute(
            """
            SELECT * FROM judge_assignments
            WHERE event_id = %s AND judge_user_id = %s AND status != 'completed'
            ORDER BY created_at ASC
            LIMIT 1
            """,
            (event_id, user_id)
        )
        assignment = await cur.fetchone()

        if not assignment:
            return {
                "data": None,
                "meta": {"completed": completed_count, "remaining": 0, "total": total_count}
            }

        # Fetch project
        await cur.execute("SELECT * FROM projects WHERE id = %s", (assignment["project_id"],))
        project = await cur.fetchone()

        # Fetch active rubric
        await cur.execute("SELECT * FROM rubrics WHERE event_id = %s AND is_active = TRUE ORDER BY created_at DESC LIMIT 1", (event_id,))
        rubric = await cur.fetchone()
        if rubric:
            await cur.execute("SELECT * FROM rubric_criteria WHERE rubric_id = %s ORDER BY sort_order ASC, key ASC", (rubric["id"],))
            rubric["criteria"] = await cur.fetchall()

        # Fetch existing draft evaluation if any
        await cur.execute("SELECT * FROM evaluations WHERE assignment_id = %s", (assignment["id"],))
        evaluation = await cur.fetchone()
        if evaluation:
            await cur.execute("SELECT criterion_id, value FROM evaluation_scores WHERE evaluation_id = %s", (evaluation["id"],))
            evaluation["scores"] = await cur.fetchall()

    return {
        "data": {
            "assignment": assignment,
            "project": project,
            "rubric": rubric,
            "evaluation": evaluation,
            "completed": completed_count,
            "remaining": remaining_count,
        }
    }

@router.post("/assignments/{assignment_id}/evaluation")
async def save_evaluation(
    assignment_id: str,
    req: SaveEvaluationRequest,
    user: dict = Depends(get_current_user),
    conn: AsyncConnection = Depends(get_db)
):
    async with conn.cursor() as cur:
        await cur.execute("SELECT * FROM judge_assignments WHERE id = %s", (assignment_id,))
        assignment = await cur.fetchone()
        if not assignment:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", "Assignment not found.")

        if str(assignment["judge_user_id"]) != str(user["id"]) and not user.get("is_platform_admin"):
            raise APIException(status.HTTP_403_FORBIDDEN, "forbidden", "You can only submit evaluations for your own assignments.")

        # Create or update evaluation
        await cur.execute(
            """
            INSERT INTO evaluations (assignment_id, project_id, judge_user_id, event_id, reaction, final_preference, tags_json, comment, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'in_progress')
            ON CONFLICT (assignment_id) DO UPDATE SET
                reaction = COALESCE(EXCLUDED.reaction, evaluations.reaction),
                final_preference = COALESCE(EXCLUDED.final_preference, evaluations.final_preference),
                tags_json = COALESCE(EXCLUDED.tags_json, evaluations.tags_json),
                comment = COALESCE(EXCLUDED.comment, evaluations.comment)
            RETURNING *;
            """,
            (
                assignment_id, assignment["project_id"], assignment["judge_user_id"], assignment["event_id"],
                req.reaction, req.final_preference,
                dumps_tags(req.tags), req.comment
            )
        )
        evaluation = await cur.fetchone()
        eval_id = evaluation["id"]

        # Update assignment status to in_progress
        if assignment["status"] == "pending":
            await cur.execute("UPDATE judge_assignments SET status = 'in_progress' WHERE id = %s", (assignment_id,))

        # Save scores if provided
        if req.scores:
            for s in req.scores:
                await cur.execute(
                    """
                    INSERT INTO evaluation_scores (evaluation_id, criterion_id, value)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (evaluation_id, criterion_id) DO UPDATE SET value = EXCLUDED.value;
                    """,
                    (eval_id, s.criterion_id, s.value)
                )

        await cur.execute("SELECT criterion_id, value FROM evaluation_scores WHERE evaluation_id = %s", (eval_id,))
        evaluation["scores"] = await cur.fetchall()

    return {"data": evaluation}

def dumps_tags(tags: Optional[List[str]]) -> str:
    import json
    return json.dumps(tags if tags is not None else [])

@router.post("/assignments/{assignment_id}/evaluation/submit")
async def submit_evaluation(
    assignment_id: str,
    user: dict = Depends(get_current_user),
    conn: AsyncConnection = Depends(get_db)
):
    async with conn.cursor() as cur:
        await cur.execute("SELECT * FROM judge_assignments WHERE id = %s", (assignment_id,))
        assignment = await cur.fetchone()
        if not assignment:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", "Assignment not found.")

        if str(assignment["judge_user_id"]) != str(user["id"]) and not user.get("is_platform_admin"):
            raise APIException(status.HTTP_403_FORBIDDEN, "forbidden", "You can only submit evaluations for your own assignments.")

        await cur.execute("SELECT * FROM evaluations WHERE assignment_id = %s", (assignment_id,))
        evaluation = await cur.fetchone()
        if not evaluation:
            raise APIException(status.HTTP_422_UNPROCESSABLE_ENTITY, "validation_error", "No evaluation draft found. Please enter scores first.")

        # Check all rubric criteria are answered
        await cur.execute("SELECT * FROM rubrics WHERE event_id = %s AND is_active = TRUE LIMIT 1", (assignment["event_id"],))
        rubric = await cur.fetchone()
        if rubric:
            await cur.execute("SELECT COUNT(*) as cnt FROM rubric_criteria WHERE rubric_id = %s", (rubric["id"],))
            total_criteria = (await cur.fetchone())["cnt"]

            await cur.execute("SELECT COUNT(*) as cnt FROM evaluation_scores WHERE evaluation_id = %s", (evaluation["id"],))
            answered_criteria = (await cur.fetchone())["cnt"]

            if answered_criteria < total_criteria:
                raise APIException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "validation_error",
                    f"Incomplete evaluation: {answered_criteria}/{total_criteria} criteria answered."
                )

        # Mark submitted
        await cur.execute(
            "UPDATE evaluations SET status = 'submitted', submitted_at = now() WHERE id = %s RETURNING *;",
            (evaluation["id"],)
        )
        updated_eval = await cur.fetchone()

        await cur.execute("UPDATE judge_assignments SET status = 'completed' WHERE id = %s;", (assignment_id,))

        # Audit event
        await cur.execute(
            """
            INSERT INTO audit_events (event_id, actor_user_id, action, entity_type, entity_id)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (assignment["event_id"], user["id"], "evaluation.submitted", "evaluation", str(updated_eval["id"]))
        )

    return {"data": updated_eval}

@router.get("/events/{event_slug}/evaluations/mine")
async def get_my_evaluations(
    event_slug: str,
    auth: tuple = Depends(require_role("event_slug", ["judge", "organizer", "participant"])),
    conn: AsyncConnection = Depends(get_db)
):
    user, event, memberships = auth
    user_id = user["id"]
    event_id = event["id"]

    roles = [m["role"] for m in memberships]
    if not (user.get("is_platform_admin") or "judge" in roles or "organizer" in roles):
        raise APIException(status.HTTP_403_FORBIDDEN, "forbidden", "Only judges or organizers can view evaluation history.")

    async with conn.cursor() as cur:
        await cur.execute("SELECT * FROM evaluations WHERE event_id = %s AND judge_user_id = %s ORDER BY created_at DESC", (event_id, user_id))
        evaluations = await cur.fetchall()
        for ev in evaluations:
            await cur.execute("SELECT criterion_id, value FROM evaluation_scores WHERE evaluation_id = %s", (ev["id"],))
            ev["scores"] = await cur.fetchall()

    return {"data": evaluations, "meta": {"count": len(evaluations)}}

# CANONICAL ROLE ISOLATION ENDPOINT
@router.get("/events/{event_slug}/judges/{judge_user_id}/evaluations")
async def get_judge_evaluations(
    event_slug: str,
    judge_user_id: str,
    auth: tuple = Depends(require_role("event_slug")),
    conn: AsyncConnection = Depends(get_db)
):
    user, event, memberships = auth
    user_id = str(user["id"])
    target_judge_id = str(judge_user_id)

    roles = [m["role"] for m in memberships]
    is_organizer_or_admin = user.get("is_platform_admin") or ("organizer" in roles)

    # CRITICAL OWNERSHIP CHECK: Caller MUST be target judge OR organizer/admin
    if user_id != target_judge_id and not is_organizer_or_admin:
        raise APIException(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            "Peer score isolation: You cannot view evaluations submitted by another judge."
        )

    async with conn.cursor() as cur:
        await cur.execute("SELECT * FROM evaluations WHERE event_id = %s AND judge_user_id = %s ORDER BY created_at DESC", (event["id"], judge_user_id))
        evaluations = await cur.fetchall()
        for ev in evaluations:
            await cur.execute("SELECT criterion_id, value FROM evaluation_scores WHERE evaluation_id = %s", (ev["id"],))
            ev["scores"] = await cur.fetchall()

    return {"data": evaluations, "meta": {"count": len(evaluations)}}
