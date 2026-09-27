import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.config import CORS_ORIGINS
from app.db.database import init_db_pool, close_db_pool
from app.routes import (
    auth,
    events,
    tracks_prizes,
    teams,
    projects,
    rubric,
    assignments,
    judging,
    pairwise,
    normalization,
    voting,
    comments,
    audit,
    exports,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting Verdict FastAPI backend...")
    await init_db_pool()
    yield
    print("Shutting down Verdict FastAPI backend...")
    await close_db_pool()

app = FastAPI(
    title="Verdict API",
    version="1.0.0",
    docs_url="/api/v1/docs",
    openapi_url="/api/v1/openapi.json",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.responses import JSONResponse
from app.middleware.auth import APIException

@app.exception_handler(APIException)
async def api_exception_handler(request: Request, exc: APIException):
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.detail
    )

# Serve OpenAPI YAML spec at /api/v1/openapi.yaml
@app.get("/api/v1/openapi.yaml", include_in_schema=False)
async def get_openapi_yaml():
    yaml_path = os.path.join(os.path.dirname(__file__), "..", "..", "API-CONTRACT.yaml")
    if os.path.exists(yaml_path):
        return FileResponse(yaml_path, media_type="text/yaml")
    return Response(content="openapi: 3.1.0\ninfo:\n  title: Verdict API\n", media_type="text/yaml")

# Include Routers under /api/v1 prefix
api_v1_prefix = "/api/v1"
app.include_router(auth.router, prefix=api_v1_prefix)
app.include_router(events.router, prefix=api_v1_prefix)
app.include_router(tracks_prizes.router, prefix=api_v1_prefix)
app.include_router(teams.router, prefix=api_v1_prefix)
app.include_router(projects.router, prefix=api_v1_prefix)
app.include_router(rubric.router, prefix=api_v1_prefix)
app.include_router(assignments.router, prefix=api_v1_prefix)
app.include_router(judging.router, prefix=api_v1_prefix)
app.include_router(pairwise.router, prefix=api_v1_prefix)
app.include_router(normalization.router, prefix=api_v1_prefix)
app.include_router(voting.router, prefix=api_v1_prefix)
app.include_router(comments.router, prefix=api_v1_prefix)
app.include_router(audit.router, prefix=api_v1_prefix)
app.include_router(exports.router, prefix=api_v1_prefix)

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "verdict-backend"}
