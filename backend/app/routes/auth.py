import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, EmailStr
from psycopg import AsyncConnection

from app.config import SESSION_COOKIE_NAME
from app.db.database import get_db
from app.middleware.auth import APIException, get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(req: SignupRequest, conn: AsyncConnection = Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute("SELECT id FROM users WHERE email = %s", (req.email,))
        existing = await cur.fetchone()
        if existing:
            raise APIException(status.HTTP_409_CONFLICT, "conflict", "An account with this email already exists.")

        pwd_hash = hash_password(req.password)
        await cur.execute(
            """
            INSERT INTO users (email, password_hash, display_name)
            VALUES (%s, %s, %s)
            RETURNING id, email, display_name, is_platform_admin
            """,
            (req.email, pwd_hash, req.display_name)
        )
        user = await cur.fetchone()
        return {"data": user}

@router.post("/login")
async def login(req: LoginRequest, response: Response, conn: AsyncConnection = Depends(get_db)):
    pwd_hash = hash_password(req.password)
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT id, email, display_name, is_platform_admin FROM users WHERE email = %s AND password_hash = %s",
            (req.email, pwd_hash)
        )
        user = await cur.fetchone()
        if not user:
            raise APIException(status.HTTP_401_UNAUTHORIZED, "unauthenticated", "Invalid email or password.")

        token = secrets.token_hex(32)
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(days=30)

        await cur.execute(
            "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (%s, %s, %s)",
            (user["id"], token_hash, expires_at)
        )

        response.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=token,
            httponly=True,
            samesite="lax",
            path="/"
        )
        return {"data": user}

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response, user: dict = Depends(get_current_user), conn: AsyncConnection = Depends(get_db)):
    if "session_id" in user:
        async with conn.cursor() as cur:
            await cur.execute("DELETE FROM sessions WHERE id = %s", (user["session_id"],))
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@router.get("/me")
async def me(user: dict = Depends(get_current_user), conn: AsyncConnection = Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT em.event_id, e.slug as event_slug, em.role
            FROM event_memberships em
            JOIN events e ON em.event_id = e.id
            WHERE em.user_id = %s
            """,
            (user["id"],)
        )
        memberships = await cur.fetchall()

    return {
        "data": {
            "user": {
                "id": str(user["id"]),
                "email": user["email"],
                "display_name": user["display_name"],
                "is_platform_admin": user["is_platform_admin"]
            },
            "memberships": memberships
        }
    }
