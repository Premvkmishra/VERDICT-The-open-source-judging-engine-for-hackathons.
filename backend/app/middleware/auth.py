import hashlib
from typing import List, Optional, Tuple, Dict, Any
from fastapi import Request, HTTPException, Depends, status
from psycopg import AsyncConnection
from app.config import SESSION_COOKIE_NAME
from app.db.database import get_db

class APIException(HTTPException):
    def __init__(self, status_code: int, code: str, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(
            status_code=status_code,
            detail={
                "error": {
                    "code": code,
                    "message": message,
                    **({"details": details} if details else {})
                }
            }
        )

async def get_optional_user(
    request: Request,
    conn: AsyncConnection = Depends(get_db)
) -> Optional[Dict[str, Any]]:
    cookie_token = request.cookies.get(SESSION_COOKIE_NAME)
    if not cookie_token:
        # Check Authorization header as fallback if Cookie header not used
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            cookie_token = auth_header[7:]
        elif request.headers.get("Cookie"):
            # Parse Cookie header manually if request.cookies missed it
            raw_cookie = request.headers.get("Cookie", "")
            for part in raw_cookie.split(";"):
                if "=" in part:
                    k, v = part.strip().split("=", 1)
                    if k == SESSION_COOKIE_NAME:
                        cookie_token = v
                        break

    if not cookie_token:
        return None

    token_hash = hashlib.sha256(cookie_token.encode("utf-8")).hexdigest()
    
    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT u.id, u.email, u.display_name, u.is_platform_admin, s.id as session_id
            FROM sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token_hash = %s AND (s.expires_at IS NULL OR s.expires_at > now())
            """,
            (token_hash,)
        )
        user = await cur.fetchone()
        return user

async def get_current_user(user: Optional[Dict[str, Any]] = Depends(get_optional_user)) -> Dict[str, Any]:
    if not user:
        raise APIException(status.HTTP_401_UNAUTHORIZED, "unauthenticated", "You must be signed in to perform this action.")
    return user

def require_role(event_slug_param: str = "event_slug", allowed_roles: Optional[List[str]] = None):
    async def dependency(
        request: Request,
        user: Optional[Dict[str, Any]] = Depends(get_optional_user),
        conn: AsyncConnection = Depends(get_db)
    ) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any], List[Dict[str, Any]]]:
        event_slug = request.path_params.get(event_slug_param) or request.query_params.get(event_slug_param)
        
        event = None
        memberships = []
        
        if event_slug:
            async with conn.cursor() as cur:
                await cur.execute("SELECT * FROM events WHERE slug = %s", (event_slug,))
                event = await cur.fetchone()
                if not event:
                    raise APIException(status.HTTP_404_NOT_FOUND, "not_found", f"Event '{event_slug}' not found.")
                
                if user:
                    await cur.execute(
                        "SELECT * FROM event_memberships WHERE event_id = %s AND user_id = %s",
                        (event["id"], user["id"])
                    )
                    memberships = await cur.fetchall()

        if allowed_roles:
            if not user:
                raise APIException(status.HTTP_401_UNAUTHORIZED, "unauthenticated", "You must be signed in to perform this action.")
            
            if user.get("is_platform_admin"):
                return user, event, memberships
            
            user_roles = [m["role"] for m in memberships]
            if not any(role in allowed_roles for role in user_roles):
                raise APIException(
                    status.HTTP_403_FORBIDDEN,
                    "forbidden",
                    f"Action requires one of the following roles for this event: {', '.join(allowed_roles)}"
                )

        return user, event, memberships

    return dependency
