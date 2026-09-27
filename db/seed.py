#!/usr/bin/env python3
import hashlib
import json
import os
import sys
import psycopg

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def seed_database():
    db_url = os.environ.get("DATABASE_URL", "postgres://verdict:verdict@localhost:5432/verdict")
    print(f"Connecting to database: {db_url}")

    schema_path = os.path.join(os.path.dirname(__file__), "migrations", "DATABASE-SCHEMA.sql")
    fixtures_path = os.path.join(os.path.dirname(__file__), "fixtures.json")

    with open(schema_path, "r", encoding="utf-8") as f:
        schema_sql = f.read()

    with open(fixtures_path, "r", encoding="utf-8") as f:
        fixtures = json.load(f)

    with psycopg.connect(db_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            # Apply schema
            print("Applying DATABASE-SCHEMA.sql migration...")
            cur.execute(schema_sql)

            # Insert event
            event = fixtures["event"]
            cur.execute(
                """
                INSERT INTO events (slug, name, tagline, description_md, status, submissions_open_at, submissions_close_at, judging_opens_at, judging_closes_at, min_reviews_per_project, min_publish_coverage_pct)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (slug) DO UPDATE SET
                    name = EXCLUDED.name,
                    status = EXCLUDED.status,
                    submissions_close_at = EXCLUDED.submissions_close_at
                RETURNING id;
                """,
                (
                    event["slug"],
                    event["name"],
                    event["tagline"],
                    event["description_md"],
                    event["status"],
                    event["submissions_open_at"],
                    event["submissions_close_at"],
                    event["judging_opens_at"],
                    event["judging_closes_at"],
                    event["min_reviews_per_project"],
                    event["min_publish_coverage_pct"],
                ),
            )
            event_id = cur.fetchone()[0]

            # Insert users, memberships, and sessions
            user_tokens = {}
            user_ids = {}
            for user in fixtures["users"]:
                cur.execute(
                    """
                    INSERT INTO users (id, email, password_hash, display_name, is_platform_admin)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
                    RETURNING id;
                    """,
                    (
                        user["id"],
                        user["email"],
                        hashlib.sha256(user["token"].encode("utf-8")).hexdigest(),
                        user["display_name"],
                        user["is_platform_admin"],
                    ),
                )
                uid = cur.fetchone()[0]
                user_ids[user["email"]] = uid
                user_tokens[user["email"]] = user["token"]

                # Membership
                cur.execute(
                    """
                    INSERT INTO event_memberships (event_id, user_id, role)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (event_id, user_id, role) DO NOTHING;
                    """,
                    (event_id, uid, user["role"]),
                )

                # Non-expiring Session
                token_hash = hash_token(user["token"])
                cur.execute(
                    """
                    INSERT INTO sessions (user_id, token_hash, expires_at)
                    VALUES (%s, %s, NULL)
                    ON CONFLICT (token_hash) DO NOTHING;
                    """,
                    (uid, token_hash),
                )

            # Insert Tracks
            track_ids = {}
            for track in fixtures["tracks"]:
                cur.execute(
                    """
                    INSERT INTO tracks (id, event_id, name, description, sort_order)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING;
                    """,
                    (track["id"], event_id, track["name"], track["description"], track["sort_order"]),
                )
                track_ids[track["name"]] = track["id"]

            # Insert Prizes
            for prize in fixtures.get("prizes", []):
                cur.execute(
                    """
                    INSERT INTO prizes (id, event_id, track_id, name, description)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING;
                    """,
                    (prize["id"], event_id, prize.get("track_id"), prize["name"], prize["description"]),
                )

            # Insert Rubric & Criteria
            rubric = fixtures["rubric"]
            cur.execute(
                """
                INSERT INTO rubrics (event_id, name, is_active)
                VALUES (%s, %s, TRUE)
                RETURNING id;
                """,
                (event_id, rubric["name"]),
            )
            rubric_id = cur.fetchone()[0]

            criteria_map = {}
            for crit in rubric["criteria"]:
                cur.execute(
                    """
                    INSERT INTO rubric_criteria (id, rubric_id, key, label, description, weight, scale_min, scale_max, sort_order)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING;
                    """,
                    (
                        crit["id"],
                        rubric_id,
                        crit["key"],
                        crit["label"],
                        crit["description"],
                        crit["weight"],
                        crit["scale_min"],
                        crit["scale_max"],
                        crit["sort_order"],
                    ),
                )
                criteria_map[crit["key"]] = crit["id"]

            # Insert Participant Team & Projects
            participant_id = user_ids["participant@verdict.dev"]
            cur.execute(
                """
                INSERT INTO teams (event_id, name)
                VALUES (%s, %s)
                RETURNING id;
                """,
                (event_id, "Primary Builder Team"),
            )
            team_id = cur.fetchone()[0]

            cur.execute(
                """
                INSERT INTO team_members (team_id, user_id)
                VALUES (%s, %s)
                ON CONFLICT (team_id, user_id) DO NOTHING;
                """,
                (team_id, participant_id),
            )

            # Insert Team Invites
            cur.execute(
                """
                INSERT INTO team_invites (team_id, code, max_uses)
                VALUES (%s, %s, 10)
                ON CONFLICT (code) DO NOTHING;
                """,
                (team_id, "INVITE123"),
            )

            project_ids = []
            for proj in fixtures["projects"]:
                cur.execute(
                    """
                    INSERT INTO projects (id, event_id, team_id, track_id, title, summary, description_md, repo_url, status, submitted_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING;
                    """,
                    (
                        proj["id"],
                        event_id,
                        team_id,
                        proj.get("track_id"),
                        proj["title"],
                        proj["summary"],
                        proj.get("description_md"),
                        proj.get("repo_url"),
                        proj["status"],
                        "2026-09-24T18:00:00Z" if proj["status"] == "submitted" else None,
                    ),
                )
                project_ids.append(proj["id"])

            # Seed Judge Assignments & Sample Evaluations
            judge_emails = [
                "judge_a@verdict.dev",
                "judge_b@verdict.dev",
                "judge_c@verdict.dev",
                "judge_d@verdict.dev",
            ]
            
            # Scores pattern per judge to demonstrate normalization
            # Ada (Judge A): normalizable, high scores
            # Alan (Judge B): normalizable, medium scores
            # Grace (Judge C): normalizable, spread scores
            # Zero Variance (Judge D): n=3 but std=0.0 (all 3s)
            judge_score_patterns = {
                "judge_a@verdict.dev": [4, 4, 3],
                "judge_b@verdict.dev": [2, 3, 3],
                "judge_c@verdict.dev": [1, 2, 4],
                "judge_d@verdict.dev": [3, 3, 3],  # Zero variance
            }

            for p_idx, pid in enumerate(project_ids):
                for j_email in judge_emails:
                    jid = user_ids[j_email]
                    cur.execute(
                        """
                        INSERT INTO judge_assignments (event_id, project_id, judge_user_id, status)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (project_id, judge_user_id) DO NOTHING
                        RETURNING id;
                        """,
                        (event_id, pid, jid, "completed"),
                    )
                    res = cur.fetchone()
                    if res:
                        assignment_id = res[0]
                        cur.execute(
                            """
                            INSERT INTO evaluations (assignment_id, project_id, judge_user_id, event_id, reaction, final_preference, tags_json, comment, status, submitted_at)
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (assignment_id) DO NOTHING
                            RETURNING id;
                            """,
                            (
                                assignment_id,
                                pid,
                                jid,
                                event_id,
                                "stands_out" if p_idx == 0 else "interesting",
                                "yes" if p_idx == 0 else "maybe",
                                json.dumps(["great_execution", "clever_idea"]),
                                f"Detailed evaluation by {j_email} for project {p_idx+1}",
                                "submitted",
                                "2026-09-25T14:00:00Z",
                            ),
                        )
                        eval_res = cur.fetchone()
                        if eval_res:
                            eval_id = eval_res[0]
                            val = judge_score_patterns[j_email][p_idx % len(judge_score_patterns[j_email])]
                            for crit_key, crit_id in criteria_map.items():
                                cur.execute(
                                    """
                                    INSERT INTO evaluation_scores (evaluation_id, criterion_id, value)
                                    VALUES (%s, %s, %s)
                                    ON CONFLICT (evaluation_id, criterion_id) DO NOTHING;
                                    """,
                                    (eval_id, crit_id, val),
                                )

            # Audit event
            cur.execute(
                """
                INSERT INTO audit_events (event_id, actor_user_id, action, entity_type, entity_id, metadata_json)
                VALUES (%s, %s, %s, %s, %s, %s);
                """,
                (
                    event_id,
                    user_ids["organizer@verdict.dev"],
                    "event.seeded",
                    "event",
                    str(event_id),
                    json.dumps({"seeded_at": "2026-09-27T12:00:00Z"}),
                ),
            )

    print("\nDatabase seeded successfully!")

    # Write .dogfood.toml config file
    dogfood_toml_content = f"""[portal]
base_url = "http://localhost:8080"

[auth]
organizer   = "Cookie: verdict_session={user_tokens['organizer@verdict.dev']}"
judge_a     = "Cookie: verdict_session={user_tokens['judge_a@verdict.dev']}"
judge_b     = "Cookie: verdict_session={user_tokens['judge_b@verdict.dev']}"
participant = "Cookie: verdict_session={user_tokens['participant@verdict.dev']}"

[routes]
gallery      = "/api/v1/events/dogfood-demo/projects"
submit       = "/api/v1/events/dogfood-demo/projects"
judge_scores = "/api/v1/events/dogfood-demo/evaluations/mine"
peer_scores  = "/api/v1/events/dogfood-demo/judges/{user_ids['judge_a@verdict.dev']}/evaluations"
csv_export   = "/api/v1/events/dogfood-demo/export.csv"
"""
    dogfood_path = os.path.join(os.path.dirname(__file__), "..", ".dogfood.toml")
    with open(dogfood_path, "w", encoding="utf-8") as f:
        f.write(dogfood_toml_content)

    print("\nGenerated .dogfood.toml headers:")
    print("--------------------------------------------------")
    print(dogfood_toml_content)
    print("--------------------------------------------------")

if __name__ == "__main__":
    seed_database()
