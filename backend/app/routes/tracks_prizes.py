from typing import Optional
from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel
from psycopg import AsyncConnection

from app.db.database import get_db
from app.middleware.auth import APIException, require_role

router = APIRouter(tags=["tracks_prizes"])

class CreateTrackRequest(BaseModel):
    name: str
    description: Optional[str] = None
    sort_order: Optional[int] = 0

class UpdateTrackRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None

class CreatePrizeRequest(BaseModel):
    name: str
    description: Optional[str] = None
    track_id: Optional[str] = None

class UpdatePrizeRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    track_id: Optional[str] = None

# Tracks
@router.get("/events/{event_slug}/tracks")
async def list_tracks(event_slug: str, conn: AsyncConnection = Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute("SELECT id FROM events WHERE slug = %s", (event_slug,))
        event = await cur.fetchone()
        if not event:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", f"Event '{event_slug}' not found.")
        await cur.execute("SELECT * FROM tracks WHERE event_id = %s ORDER BY sort_order ASC, name ASC", (event["id"],))
        tracks = await cur.fetchall()
    return {"data": tracks, "meta": {"count": len(tracks)}}

@router.post("/events/{event_slug}/tracks", status_code=status.HTTP_201_CREATED)
async def create_track(
    event_slug: str,
    req: CreateTrackRequest,
    auth: tuple = Depends(require_role("event_slug", ["organizer"])),
    conn: AsyncConnection = Depends(get_db)
):
    _, event, _ = auth
    async with conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO tracks (event_id, name, description, sort_order) VALUES (%s, %s, %s, %s) RETURNING *;",
            (event["id"], req.name, req.description, req.sort_order)
        )
        track = await cur.fetchone()
    return {"data": track}

@router.patch("/tracks/{track_id}")
async def update_track(track_id: str, req: UpdateTrackRequest, conn: AsyncConnection = Depends(get_db)):
    fields = []
    values = []
    for k, v in req.model_dump(exclude_unset=True).items():
        fields.append(f"{k} = %s")
        values.append(v)
    if not fields:
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM tracks WHERE id = %s", (track_id,))
            return {"data": await cur.fetchone()}

    values.append(track_id)
    query = f"UPDATE tracks SET {', '.join(fields)} WHERE id = %s RETURNING *;"
    async with conn.cursor() as cur:
        await cur.execute(query, values)
        track = await cur.fetchone()
        if not track:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", "Track not found.")
    return {"data": track}

@router.delete("/tracks/{track_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_track(track_id: str, conn: AsyncConnection = Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute("DELETE FROM tracks WHERE id = %s", (track_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)

# Prizes
@router.get("/events/{event_slug}/prizes")
async def list_prizes(event_slug: str, conn: AsyncConnection = Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute("SELECT id FROM events WHERE slug = %s", (event_slug,))
        event = await cur.fetchone()
        if not event:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", f"Event '{event_slug}' not found.")
        await cur.execute("SELECT * FROM prizes WHERE event_id = %s ORDER BY name ASC", (event["id"],))
        prizes = await cur.fetchall()
    return {"data": prizes, "meta": {"count": len(prizes)}}

@router.post("/events/{event_slug}/prizes", status_code=status.HTTP_201_CREATED)
async def create_prize(
    event_slug: str,
    req: CreatePrizeRequest,
    auth: tuple = Depends(require_role("event_slug", ["organizer"])),
    conn: AsyncConnection = Depends(get_db)
):
    _, event, _ = auth
    async with conn.cursor() as cur:
        await cur.execute(
            "INSERT INTO prizes (event_id, track_id, name, description) VALUES (%s, %s, %s, %s) RETURNING *;",
            (event["id"], req.track_id, req.name, req.description)
        )
        prize = await cur.fetchone()
    return {"data": prize}

@router.patch("/prizes/{prize_id}")
async def update_prize(prize_id: str, req: UpdatePrizeRequest, conn: AsyncConnection = Depends(get_db)):
    fields = []
    values = []
    for k, v in req.model_dump(exclude_unset=True).items():
        fields.append(f"{k} = %s")
        values.append(v)
    if not fields:
        async with conn.cursor() as cur:
            await cur.execute("SELECT * FROM prizes WHERE id = %s", (prize_id,))
            return {"data": await cur.fetchone()}

    values.append(prize_id)
    query = f"UPDATE prizes SET {', '.join(fields)} WHERE id = %s RETURNING *;"
    async with conn.cursor() as cur:
        await cur.execute(query, values)
        prize = await cur.fetchone()
        if not prize:
            raise APIException(status.HTTP_404_NOT_FOUND, "not_found", "Prize not found.")
    return {"data": prize}

@router.delete("/prizes/{prize_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_prize(prize_id: str, conn: AsyncConnection = Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute("DELETE FROM prizes WHERE id = %s", (prize_id,))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
