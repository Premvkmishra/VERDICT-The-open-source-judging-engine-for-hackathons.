import json
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, status
from psycopg import AsyncConnection

from app.db.database import get_db
from app.middleware.auth import APIException, get_current_user, require_role, get_optional_user
from app.engine import scoring

router = APIRouter(prefix="/events/{event_slug}", tags=["normalization"])

@router.post("/normalization/run", status_code=status.HTTP_201_CREATED)
async def run_normalization(
    event_slug: str,
    auth: tuple = Depends(require_role("event_slug", ["organizer"])),
    conn: AsyncConnection = Depends(get_db)
):
    user, event, _ = auth
    event_id = event["id"]

    async with conn.cursor() as cur:
        # Fetch active rubric criteria
        await cur.execute("SELECT * FROM rubrics WHERE event_id = %s AND is_active = TRUE ORDER BY created_at DESC LIMIT 1", (event_id,))
        rubric = await cur.fetchone()
        if not rubric:
            raise APIException(status.HTTP_400_BAD_REQUEST, "validation_error", "No active rubric configured for this event.")

        await cur.execute("SELECT * FROM rubric_criteria WHERE rubric_id = %s", (rubric["id"],))
        criteria = await cur.fetchall()

        # Fetch submitted evaluations
        await cur.execute(
            """
            SELECT e.*, es.criterion_id, es.value
            FROM evaluations e
            JOIN evaluation_scores es ON e.id = es.evaluation_id
            WHERE e.event_id = %s AND e.status = 'submitted'
            """,
            (event_id,)
        )
        score_rows = await cur.fetchall()

        # Group evaluations by eval_id
        evals_by_id = {}
        for r in score_rows:
            eid = r["id"]
            if eid not in evals_by_id:
                evals_by_id[eid] = {
                    "id": eid,
                    "assignment_id": r["assignment_id"],
                    "project_id": r["project_id"],
                    "judge_user_id": r["judge_user_id"],
                    "reaction": r["reaction"],
                    "final_preference": r["final_preference"],
                    "scores": []
                }
            evals_by_id[eid]["scores"].append({"criterion_id": r["criterion_id"], "value": r["value"]})

        evaluations_list = list(evals_by_id.values())

        # Compute raw weighted score R_jp for each evaluation
        judge_evals = {} # judge_id -> list of (eval_dict, R_jp)
        project_evals = {} # project_id -> list of (eval_dict, R_jp)
        for ev in evaluations_list:
            r_jp = scoring.weighted_evaluation_score(ev["scores"], criteria)
            ev["R_jp"] = r_jp

            jid = str(ev["judge_user_id"])
            pid = str(ev["project_id"])

            if jid not in judge_evals:
                judge_evals[jid] = []
            judge_evals[jid].append(ev)

            if pid not in project_evals:
                project_evals[pid] = []
            project_evals[pid].append(ev)

        # Compute judge stats (μ_j, σ_j, normalizable)
        judge_stats_map = {}
        for jid, ev_list in judge_evals.items():
            raw_scores = [ev["R_jp"] for ev in ev_list]
            stats = scoring.calculate_judge_stats(raw_scores)
            
            # Flags detection
            flags = []
            if stats["n"] < 3:
                flags.append("insufficient_data_judge")
            if stats["n"] >= 3 and stats["stdev"] < 0.01:
                flags.append("low_variance_judge")
            
            stats["flags"] = flags
            judge_stats_map[jid] = stats

        # Fetch all projects
        await cur.execute("SELECT id, title FROM projects WHERE event_id = %s AND status = 'submitted'", (event_id,))
        submitted_projects = await cur.fetchall()
        all_project_ids = [str(p["id"]) for p in submitted_projects]

        # Compute pairwise Bradley-Terry strength
        await cur.execute("SELECT * FROM pairwise_comparisons WHERE event_id = %s", (event_id,))
        pairwise = await cur.fetchall()
        bt_strengths = scoring.bradley_terry(pairwise, all_project_ids)

        # Create Normalization Run
        await cur.execute(
            "INSERT INTO normalization_runs (event_id, method, created_by_user_id) VALUES (%s, 'zscore', %s) RETURNING *;",
            (event_id, user["id"])
        )
        run = await cur.fetchone()
        run_id = run["id"]

        # Insert normalization_judge_stats & normalization_results
        for jid, stats in judge_stats_map.items():
            await cur.execute(
                """
                INSERT INTO normalization_judge_stats (run_id, judge_user_id, completed_count, mean, stdev, is_normalizable, flags_json)
                VALUES (%s, %s, %s, %s, %s, %s, %s);
                """,
                (run_id, jid, stats["n"], stats["mean"], stats["stdev"], stats["normalizable"], json.dumps(stats["flags"]))
            )

        # Calculate per-project z-scores and official_score
        project_scores_data = []
        min_reviews_req = event.get("min_reviews_per_project", 3)

        for proj in submitted_projects:
            pid = str(proj["id"])
            ev_list = project_evals.get(pid, [])
            reviews_count = len(ev_list)

            normalizable_z_scores = []
            raw_scores = []
            yes_pref_count = 0

            for ev in ev_list:
                jid = str(ev["judge_user_id"])
                j_stats = judge_stats_map.get(jid, {})
                r_jp = ev["R_jp"]
                raw_scores.append(r_jp)

                if ev.get("final_preference") == "yes":
                    yes_pref_count += 1

                z_val = None
                if j_stats.get("normalizable"):
                    z_val = scoring.z_score(r_jp, j_stats["mean"], j_stats["stdev"])
                    normalizable_z_scores.append((z_val, 1.0)) # default judge_weight = 1.0

                # Insert normalization_results row
                await cur.execute(
                    """
                    INSERT INTO normalization_results (run_id, project_id, judge_user_id, raw_score, z_score)
                    VALUES (%s, %s, %s, %s, %s);
                    """,
                    (run_id, pid, jid, r_jp, z_val)
                )

            has_norm_judge = len(normalizable_z_scores) > 0
            is_rankable = scoring.is_rankable(reviews_count, has_norm_judge, min_reviews_req)
            official = scoring.aggregate_official_score(normalizable_z_scores) if is_rankable else None
            raw_mean = (sum(raw_scores) / len(raw_scores)) if raw_scores else 0.0

            project_scores_data.append({
                "project_id": pid,
                "reviews_count": reviews_count,
                "is_rankable": is_rankable,
                "official_score": official,
                "yes_pref_count": yes_pref_count,
                "bt_score": bt_strengths.get(pid),
                "raw_mean": raw_mean,
                "flags": []
            })

        # Min-Max Display Scores across rankable projects
        rankable_officials = [p["official_score"] for p in project_scores_data if p["is_rankable"] and p["official_score"] is not None]
        min_off = min(rankable_officials) if rankable_officials else 0.0
        max_off = max(rankable_officials) if rankable_officials else 0.0

        for p in project_scores_data:
            p["display_score"] = scoring.display_score(p["official_score"], min_off, max_off)

        # Rank & Tie Break
        ranked_projects = scoring.rank_and_break_ties(project_scores_data)

        # Insert project_rankings
        for rp in ranked_projects:
            await cur.execute(
                """
                INSERT INTO project_rankings (run_id, project_id, reviews_count, is_rankable, official_score, display_score, rank, tie_break_reason, bradley_terry_score, flags_json)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                """,
                (
                    run_id, rp["project_id"], rp["reviews_count"], rp["is_rankable"],
                    rp["official_score"], rp["display_score"], rp["rank"],
                    rp["tie_break_reason"], rp.get("bt_score"), json.dumps(rp["flags"])
                )
            )

        # Audit event
        await cur.execute(
            """
            INSERT INTO audit_events (event_id, actor_user_id, action, entity_type, entity_id, metadata_json)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (event_id, user["id"], "normalization.ran", "normalization_run", str(run_id), {"run_id": str(run_id)})
        )

    return {"data": {"run_id": str(run_id)}}

@router.get("/results")
async def get_results(
    event_slug: str,
    user: Optional[dict] = Depends(get_optional_user),
    conn: AsyncConnection = Depends(get_db)
):
    async with conn.cursor() as cur:
        await cur.execute("SELECT * FROM events WHERE slug = %s", (event_slug,))
        event = await cur.fetchone()
        if not event:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", f"Event '{event_slug}' not found.")

        # Permissions check
        is_published = (event["status"] == "results_published")
        is_organizer_or_admin = False

        if user:
            await cur.execute(
                "SELECT role FROM event_memberships WHERE event_id = %s AND user_id = %s",
                (event["id"], user["id"])
            )
            m_roles = [r["role"] for r in await cur.fetchall()]
            is_organizer_or_admin = user.get("is_platform_admin") or ("organizer" in m_roles)

        if not is_published and not is_organizer_or_admin:
            raise APIException(status.HTTP_403_FORBIDDEN, "forbidden", "Results for this event have not been published yet.")

        # Fetch latest or published run
        run_id = event.get("published_normalization_run_id")
        if not run_id:
            await cur.execute("SELECT id FROM normalization_runs WHERE event_id = %s ORDER BY run_at DESC LIMIT 1", (event["id"],))
            r_row = await cur.fetchone()
            if r_row:
                run_id = r_row["id"]

        if not run_id:
            return {"data": [], "meta": {"count": 0}}

        await cur.execute(
            """
            SELECT pr.*, p.title as project_title, p.summary as project_summary
            FROM project_rankings pr
            JOIN projects p ON pr.project_id = p.id
            WHERE pr.run_id = %s
            ORDER BY CASE WHEN pr.rank IS NULL THEN 1 ELSE 0 END, pr.rank ASC
            """,
            (run_id,)
        )
        rankings = await cur.fetchall()

    return {"data": rankings, "meta": {"count": len(rankings)}}

@router.get("/results/{project_id}/explain")
async def explain_project_ranking(
    event_slug: str,
    project_id: str,
    user: Optional[dict] = Depends(get_optional_user),
    conn: AsyncConnection = Depends(get_db)
):
    async with conn.cursor() as cur:
        await cur.execute("SELECT * FROM events WHERE slug = %s", (event_slug,))
        event = await cur.fetchone()
        if not event:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", f"Event '{event_slug}' not found.")

        # Fetch evaluations for project
        await cur.execute(
            """
            SELECT e.*, u.display_name as judge_name
            FROM evaluations e
            JOIN users u ON e.judge_user_id = u.id
            WHERE e.project_id = %s AND e.status = 'submitted'
            """,
            (project_id,)
        )
        evaluations = await cur.fetchall()

        # Fetch project ranking
        await cur.execute(
            """
            SELECT pr.* FROM project_rankings pr
            JOIN normalization_runs nr ON pr.run_id = nr.id
            WHERE nr.event_id = %s AND pr.project_id = %s
            ORDER BY nr.run_at DESC LIMIT 1
            """,
            (event["id"], project_id)
        )
        ranking = await cur.fetchone()

    return {
        "data": {
            "project_id": project_id,
            "ranking": ranking,
            "evaluations": evaluations,
            "provenance_chain": "Stored evaluation scores -> Weighted criterion R_jp -> Judge z-score -> Aggregated official score -> Display score"
        }
    }

@router.get("/dashboard/progress")
async def dashboard_progress(
    event_slug: str,
    auth: tuple = Depends(require_role("event_slug", ["organizer"])),
    conn: AsyncConnection = Depends(get_db)
):
    _, event, _ = auth
    event_id = event["id"]

    async with conn.cursor() as cur:
        await cur.execute("SELECT COUNT(*) as cnt FROM projects WHERE event_id = %s AND status = 'submitted'", (event_id,))
        submitted_projects = (await cur.fetchone())["cnt"]

        await cur.execute("SELECT COUNT(*) as cnt FROM judge_assignments WHERE event_id = %s", (event_id,))
        total_assignments = (await cur.fetchone())["cnt"]

        await cur.execute("SELECT COUNT(*) as cnt FROM judge_assignments WHERE event_id = %s AND status = 'completed'", (event_id,))
        completed_assignments = (await cur.fetchone())["cnt"]

    return {
        "data": {
            "submitted_projects": submitted_projects,
            "total_assignments": total_assignments,
            "completed_assignments": completed_assignments,
            "coverage_pct": (completed_assignments / total_assignments * 100) if total_assignments > 0 else 0.0
        }
    }
