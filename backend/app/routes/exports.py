import csv
import io
from fastapi import APIRouter, Depends, Response, status
from psycopg import AsyncConnection

from app.db.database import get_db
from app.middleware.auth import APIException, require_role

router = APIRouter(prefix="/events/{event_slug}", tags=["exports"])

@router.get("/export.csv")
async def export_csv(
    event_slug: str,
    auth: tuple = Depends(require_role("event_slug", ["organizer"])),
    conn: AsyncConnection = Depends(get_db)
):
    _, event, _ = auth
    event_id = event["id"]

    async with conn.cursor() as cur:
        # Get target normalization run
        run_id = event.get("published_normalization_run_id")
        if not run_id:
            await cur.execute("SELECT id FROM normalization_runs WHERE event_id = %s ORDER BY run_at DESC LIMIT 1", (event_id,))
            r_row = await cur.fetchone()
            if r_row:
                run_id = r_row["id"]

        if not run_id:
            rankings = []
        else:
            await cur.execute(
                """
                SELECT pr.rank, pr.project_id, p.title, pr.official_score, pr.display_score, pr.reviews_count, pr.is_rankable, pr.tie_break_reason
                FROM project_rankings pr
                JOIN projects p ON pr.project_id = p.id
                WHERE pr.run_id = %s
                ORDER BY CASE WHEN pr.rank IS NULL THEN 1 ELSE 0 END, pr.rank ASC
                """,
                (run_id,)
            )
            rankings = await cur.fetchall()

    output = io.StringIO()
    writer = csv.writer(output)
    # Header row MUST contain at least one comma
    writer.writerow(["rank", "project_id", "title", "official_score", "display_score", "reviews_count", "is_rankable", "tie_break_reason"])

    for row in rankings:
        writer.writerow([
            row["rank"] if row["rank"] is not None else "",
            row["project_id"],
            row["title"],
            f"{float(row['official_score']):.4f}" if row["official_score"] is not None else "",
            f"{float(row['display_score']):.2f}" if row["display_score"] is not None else "",
            row["reviews_count"],
            row["is_rankable"],
            row["tie_break_reason"] or ""
        ])

    csv_content = output.getvalue()
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=verdict-{event_slug}-results.csv"}
    )
