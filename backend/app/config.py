import os

DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://verdict:verdict@localhost:5432/verdict")
SESSION_COOKIE_NAME = os.environ.get("SESSION_COOKIE_NAME", "verdict_session")
PORT = int(os.environ.get("PORT", "8080"))
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:8080",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8080",
]
