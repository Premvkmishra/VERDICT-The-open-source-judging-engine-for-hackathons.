import time
from collections import defaultdict
from fastapi import Request
from app.middleware.auth import APIException

# In-memory sliding window rate limiter
# Key -> list of timestamps
_rate_limits = defaultdict(list)

def check_rate_limit(key: str, max_requests: int = 10, window_seconds: int = 60):
    now = time.time()
    timestamps = _rate_limits[key]
    
    # Filter timestamps within window
    _rate_limits[key] = [ts for ts in timestamps if now - ts < window_seconds]
    
    if len(_rate_limits[key]) >= max_requests:
        raise APIException(429, "rate_limited", "Too many requests. Please slow down and try again shortly.")
    
    _rate_limits[key].append(now)

def rate_limit(max_requests: int = 10, window_seconds: int = 60):
    async def dependency(request: Request):
        client_ip = request.client.host if request.client else "127.0.0.1"
        key = f"{request.url.path}:{client_ip}"
        check_rate_limit(key, max_requests, window_seconds)
    return dependency
