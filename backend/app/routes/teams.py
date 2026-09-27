import secrets
from typing import Optional
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from psycopg import AsyncConnection

from app.db.database import get_db
from app.middleware.auth import APIException, get_current_user, require_role

router = APIRouter(tags=["teams"])

class CreateTeamRequest(BaseModel):
    name: str

class JoinTeamRequest(BaseModel):
    code: str

class CreateInviteRequest(BaseModel):
    max_uses: Optional[int] = 10
    expires_at: Optional[str] = None

@router.post("/events/{event_slug}/teams", status_code=status.HTTP_201_CREATED)
async def create_team(
    event_slug: str,
    req: CreateTeamRequest,
    auth: tuple = Depends(require_role("event_slug")),
    conn: AsyncConnection = Depends(get_db)
):
    user, event, _ = auth
    async with conn.cursor() as cur:
        # Create team
        await cur.execute(
            "INSERT INTO teams (event_id, name) VALUES (%s, %s) RETURNING *;",
            (event["id"], req.name)
        )
        team = await cur.fetchone()

        # Add caller to team_members
        await cur.execute(
            "INSERT INTO team_members (team_id, user_id) VALUES (%s, %s);",
            (team["id"], user["id"])
        )

        # Grant participant membership if not already
        await cur.execute(
            """
            INSERT INTO event_memberships (event_id, user_id, role)
            VALUES (%s, %s, 'participant')
            ON CONFLICT (event_id, user_id, role) DO NOTHING;
            """,
            (event["id"], user["id"])
        )

        # Attach members list to response
        team["members"] = [
            {"id": str(user["id"]), "email": user["email"], "display_name": user["display_name"]}
        ]

    return {"data": team}

@router.get("/events/{event_slug}/teams/mine")
async def get_my_team(
    event_slug: str,
    user: dict = Depends(get_current_user),
    conn: AsyncConnection = Depends(get_db)
):
    async with conn.cursor() as cur:
        await cur.execute("SELECT id FROM events WHERE slug = %s", (event_slug,))
        event = await cur.fetchone()
        if not event:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", f"Event '{event_slug}' not found.")

        await cur.execute(
            """
            SELECT t.*
            FROM teams t
            JOIN team_members tm ON t.id = tm.team_id
            WHERE t.event_id = %s AND tm.user_id = %s
            """,
            (event["id"], user["id"])
        )
        team = await cur.fetchone()
        if not team:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", "You are not currently in a team for this event.")

        # Get members
        await cur.execute(
            """
            SELECT u.id, u.email, u.display_name
            FROM team_members tm
            JOIN users u ON tm.user_id = u.id
            WHERE tm.team_id = %s
            """,
            (team["id"],)
        )
        team["members"] = await cur.fetchall()

    return {"data": team}

@router.get("/teams/{team_id}")
async def get_team(team_id: str, conn: AsyncConnection = Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute("SELECT * FROM teams WHERE id = %s", (team_id,))
        team = await cur.fetchone()
        if not team:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", "Team not found.")

        await cur.execute(
            """
            SELECT u.id, u.email, u.display_name
            FROM team_members tm
            JOIN users u ON tm.user_id = u.id
            WHERE tm.team_id = %s
            """,
            (team_id,)
        )
        team["members"] = await cur.fetchall()

    return {"data": team}

@router.post("/events/{event_slug}/teams/join")
async def join_team(
    event_slug: str,
    req: JoinTeamRequest,
    user: dict = Depends(get_current_user),
    conn: AsyncConnection = Depends(get_db)
):
    async with conn.cursor() as cur:
        await cur.execute("SELECT id FROM events WHERE slug = %s", (event_slug,))
        event = await cur.fetchone()
        if not event:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", f"Event '{event_slug}' not found.")

        await cur.execute("SELECT * FROM team_invites WHERE code = %s", (req.code,))
        invite = await cur.fetchone()
        if not invite:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", "Invalid invite code.")

        if invite["uses_count"] >= invite["max_uses"]:
            raise APIException(status.HTTP_409_CONFLICT, "conflict", "Invite code has reached its maximum uses.")

        team_id = invite["team_id"]

        # Add member
        await cur.execute(
            "INSERT INTO team_members (team_id, user_id) VALUES (%s, %s) ON CONFLICT DO NOTHING;",
            (team_id, user["id"])
        )

        # Increment uses_count
        await cur.execute("UPDATE team_invites SET uses_count = uses_count + 1 WHERE id = %s;", (invite["id"],))

        # Grant participant membership
        await cur.execute(
            """
            INSERT INTO event_memberships (event_id, user_id, role)
            VALUES (%s, %s, 'participant')
            ON CONFLICT (event_id, user_id, role) DO NOTHING;
            """,
            (event["id"], user["id"])
        )

        await cur.execute("SELECT * FROM teams WHERE id = %s", (team_id,))
        team = await cur.fetchone()

    return {"data": team}

@router.post("/teams/{team_id}/invites", status_code=status.HTTP_201_CREATED)
async def create_invite(
    team_id: str,
    req: CreateInviteRequest,
    user: dict = Depends(get_current_user),
    conn: AsyncConnection = Depends(get_db)
):
    code = secrets.token_hex(4).upper()
    async with conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO team_invites (team_id, code, max_uses, expires_at) VALUES (%s, %s, %s, %s) RETURNING *;",
            (team_id, code, req.max_uses, req.expires_at)
        )
        invite = await cur.fetchone()

    return {"data": invite}
