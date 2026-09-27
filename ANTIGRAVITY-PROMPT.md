# Antigravity build prompt — Verdict (backend)

Paste everything below into Antigravity as the initial project prompt.

---

Build the backend for **Verdict**, a self-hostable hackathon submission and judging platform,
for a 72-hour hackathon called DOGFOOD. The deliverable will be run by an automated checker
(`run.py`, described below) that makes real HTTP requests with `urllib` — no JavaScript execution,
no login flow, just a pre-issued session header attached directly to each request. Correctness on
that checker plus honest, defensible judging math matter far more than feature count.

## Non-negotiable ground rule

**Implement exactly the API contract below — do not rename endpoints, fields, or enum values, and
do not add undocumented ones.** A separate frontend (built independently, in parallel, against the
same contract) will call these exact paths with these exact shapes. If contract and convenience
disagree, the contract wins; flag the tension in a comment rather than silently deviating.

## Stack recommendation

Pick whatever you (Antigravity / the team) are most fluent in — the brief explicitly says stack
choice isn't judged. A pragmatic default for a 72-hour single-service build: Node.js + Express (or
Fastify) + `pg` or Prisma, or Python + FastAPI + SQLAlchemy. Whichever you pick, keep it a single
deployable service — no microservices, this is a monolith by design (see ARCHITECTURE.md §8).

## Folder structure (adapt to your stack, keep the module boundaries)

```
src/
  auth/              signup, login, session issuance + verification middleware
  events/            event CRUD, lifecycle status derivation, tracks, prizes
  teams/             teams, membership, invite codes
  projects/          draft/edit/submit, deadline enforcement, gallery query
  judging/           rubric config, assignments, evaluations, pairwise, judge feed
  engine/            normalization runs, ranking, anomaly detection — pure functions over
                     stored data, unit-testable with no I/O beyond its own tables
  voting/            public votes, dedup, rate limiting
  comments/          public comments, moderation flag
  audit/             append-only event log — written by every other module
  exports/           CSV generation, reuses the engine's ranking query verbatim
  middleware/        require_role(event_slug, role), rate limiter, error formatter
db/
  migrations/        DATABASE-SCHEMA.sql, applied in order
  seed.(js|py)        loads fixtures.json, creates fixed accounts, prints .dogfood.toml headers
tests/                includes explicit curl-equivalent tests for every permission boundary
docker-compose.yml
Dockerfile
.env.example
```

## Database

Apply `DATABASE-SCHEMA.sql` verbatim as your migration — it is the canonical schema, not a
starting sketch. If your ORM wants models generated from it, generate them from this file rather
than hand-writing a parallel definition that could drift. Every enum-like column is `TEXT` +
`CHECK`, matching `ENUMS.md` exactly — do not switch these to native Postgres `ENUM` types (they
make future value additions require a lock-heavy migration, unnecessary for a 72-hour build).

## Authentication and sessions

Opaque random token (32+ bytes), stored hashed (`sessions.token_hash = sha256(token)`), sent to
the client as `Set-Cookie: verdict_session=<token>; HttpOnly; SameSite=Lax`. Session middleware
looks up the hash, attaches `req.user`, and attaches the caller's `event_memberships` for the
event in the URL (if any) so route handlers can check role without a second query.

**Seeded, non-expiring sessions for the acceptance checker.** The checker never logs in — it
attaches a fixed header per role. Your seed script must: create the organizer/judge/participant
accounts, insert `sessions` rows with `expires_at = NULL` and a known token, and print the exact
`Cookie:` header lines to stdout in `.dogfood.toml`'s `[auth]` format, e.g.:

```
organizer   = "Cookie: verdict_session=<seeded-token>"
judge_a     = "Cookie: verdict_session=<seeded-token>"
judge_b     = "Cookie: verdict_session=<seeded-token>"
participant = "Cookie: verdict_session=<seeded-token>"
```

## `.dogfood.toml` routes — read this before writing the gallery/submit handlers

The checker uses `urllib` with no JS execution. If `routes.gallery` or `routes.submit` point at an
SPA page, the "fixture title in body" check will fail even on a perfectly correct product, because
the raw HTML of a client-rendered page won't contain it. **Point every `.dogfood.toml` route at
the JSON API directly**, and serve frontend + backend behind one reverse-proxied port so
`docker compose up` still satisfies the one-command rule. Concretely:

```toml
[portal]
base_url = "http://localhost:8080"

[routes]
gallery      = "/api/v1/events/dogfood-demo/projects"
submit       = "/api/v1/events/dogfood-demo/projects"
judge_scores = "/api/v1/events/dogfood-demo/evaluations/mine"
peer_scores  = "/api/v1/events/dogfood-demo/judges/{judge_a_user_id}/evaluations"
csv_export   = "/api/v1/events/dogfood-demo/export.csv"
```

(`{judge_a_user_id}` — substitute the real seeded UUID; print it alongside the auth headers so
whoever writes the final `.dogfood.toml` can paste it in.)

## Authorization — the one check that must never be reimplemented ad hoc

Every protected route calls a single `requireRole(eventSlug, allowedRoles)` middleware/helper that:
1. 401s if there's no valid session.
2. 403s if the caller has no matching `event_memberships` row for this event (or isn't
   `is_platform_admin`).

For the two "does this belong to me" endpoints — `GET /events/{slug}/evaluations/mine` and
`GET /events/{slug}/judges/{judge_user_id}/evaluations` — layer one additional ownership check on
top: the second endpoint 403s unless `req.user.id === judge_user_id` OR the caller is
organizer/admin on that event. **This exact check is what the T2 "judge cannot see peer scores"
acceptance test verifies**, and it is the single most commonly-missed line in similar builds —
write an automated test for it explicitly, calling the route as judge_b against judge_a's id, and
keep that test in `tests/` even after everything else is built, since it is worth more of your
score than most other individual features combined (Judging Integrity is 25% of the total; this
one check is most of what "backend-enforced role isolation" means in practice).

## Deadline enforcement

Every write to `projects` (create, `PATCH`, `submit`) compares `now()` to
`events.submissions_close_at` server-side and returns `409 {error:{code:'deadline_passed',...}}`
if it has passed — regardless of any client-sent flag. The seeded fixture event's
`submissions_close_at` is in the past on purpose (matches the DOGFOOD fixture data), so this path
gets exercised by the acceptance checker directly on first run — do not special-case it away.

## The judging engine — implement `JUDGING.md` exactly, function by function

This is worth implementing as pure, independently-testable functions taking arrays of stored rows
and returning computed values, separate from any HTTP handling:

1. `normalizeCriterionValue(value, scaleMin, scaleMax) → n ∈ [0,1]`
2. `weightedEvaluationScore(scores[], criteria[]) → R ∈ [0,1]` (JUDGING.md §2)
3. `judgeStats(rawScoresForJudge[]) → {n, mean, stdev, normalizable}` — `normalizable` requires
   `n ≥ 3 AND stdev ≥ 0.01` (JUDGING.md §3)
4. `zScore(R, mean, stdev) → z` (only called when `normalizable`)
5. `aggregateOfficialScore(zScoresWithJudgeWeights[]) → official_score` (JUDGING.md §4) — weighted
   mean; returns `null`/undefined if the input set is empty
6. `isRankable(reviewsCount, hasAtLeastOneNormalizableJudge, minReviewsPerProject) → bool`
   (JUDGING.md §5)
7. `displayScore(official_score, minOverRankableSet, maxOverRankableSet) → 0..100` (JUDGING.md §6),
   `50` for all if the set has zero spread
8. `rankAndBreakTies(projects[]) → ranked[]` implementing the exact four-step tie-break order in
   JUDGING.md §7, recording which step (if any) fired into `tie_break_reason`
9. `bradleyTerry(pairwiseComparisons[]) → {project_id: strength}` via iterative MM (JUDGING.md §9)
   — only needed if you attempt the Pairwise Mode bonus; tie-break step 2 simply skips if this
   hasn't been computed for the tied pair
10. `detectAnomalies(...) → flags[]` implementing every rule in JUDGING.md §10, each flag carrying
    its numeric evidence, never an accusatory phrasing

`POST /events/{event_slug}/normalization/run` orchestrates 1→10 over all `submitted` evaluations
for the event, writes one new `normalization_runs` row plus its `normalization_judge_stats`,
`normalization_results`, and `project_rankings` rows (never mutates a prior run — history is
append-only so `/why` can always answer against whichever run was actually published).
`GET /results/{project_id}/explain` re-derives and displays every step of that chain from the
stored rows (it may recompute the raw R_jp live from `evaluation_scores` for freshness, per
JUDGING.md §8, rather than trusting only the cached row).

## Publish gating

`POST /events/{event_slug}/publish-results` computes
`rankable_count / submitted_project_count` for the target run and requires it `≥
events.min_publish_coverage_pct` unless the request includes `{force: true, reason: "..."}`, in
which case it proceeds anyway but writes an `audit_events` row with `action:
'results.force_published'` and the given reason in `metadata` — never a silent override.

## Voting, rate limiting, duplicate detection

- Duplicate prevention is the database `UNIQUE(event_id, project_id, voter_key)` constraint on
  `votes` — catch the resulting unique-violation and translate it to `409 conflict`, don't
  pre-check-then-insert (race-prone).
- Rate limiting on `POST /vote` and `POST /comments`: a simple sliding-window limiter keyed by IP
  and by `voter_key`/author, in-memory is fine for a single-instance 72-hour build; log rejections
  to `audit_events`.
- Randomized ballot order: shuffle server-side per request (or per-voter-seeded shuffle if you
  want a stable-but-still-randomized-looking order across a single voter's page reloads) — never
  trust a client-supplied order.

## CSV export

`GET /events/{event_slug}/export.csv` must call the **exact same** ranking-read function that
backs `GET /events/{event_slug}/results` — write one function, call it from both handlers, so the
two can never disagree. Header row must always contain at least one comma (e.g.
`rank,project_id,title,official_score,display_score,reviews_count`).

## Audit log

Every state-changing action across every module writes one `audit_events` row (see
`DATABASE-SCHEMA.sql`) — actor, action, entity, a metadata snapshot. No update/delete route exists
for this table; if convenient in your stack, `REVOKE UPDATE, DELETE ON audit_events FROM
app_user;` at the database-role level as a second line of defense against an accidental future
handler.

## Docker Compose / one-command rule

`docker-compose.yml` must bring up: a Postgres container (with a named volume, seeded on first
boot by your `db/seed` script), the backend (which serves the built frontend as static assets and
proxies its own `/api/v1/*` routes on the same port), with zero external network dependencies at
runtime. `docker compose up` → `http://localhost:8080` is a fully seeded, fully functional portal,
network off. Print the `.dogfood.toml`-ready auth headers to the container logs (or a mounted
file) on first boot, per the Authentication section above.

## Tests

Beyond the acceptance checker, write your own `tests/` covering at minimum: every row in
`SYNC-MATRICES.md` §C (deadline enforcement, peer-score isolation, vote dedup, CSV/results
parity, audit immutability), the worked example in `JUDGING.md` §11 as a golden-value unit test
for the scoring pipeline, and the zero-variance-judge and insufficient-reviews edge cases from
`JUDGING.md` §3/§5 explicitly (the seed data is constructed to exercise both).

## Environment variables (`.env.example`)

```
DATABASE_URL=postgres://verdict:verdict@db:5432/verdict
SESSION_COOKIE_NAME=verdict_session
NODE_ENV=production   # or FASTAPI_ENV, matching your stack
PORT=8080
```

## API documentation

Serve `API-CONTRACT.yaml` (this exact file, unmodified beyond filling in any `TODO`s you
introduce — there should be none) at `/api/v1/openapi.yaml` and, if time allows, a rendered
Swagger UI at `/api/v1/docs` — this covers the "API First" bonus's documentation requirement for
free if you also expose the endpoints it describes publicly and stably.

## Everything else — source of truth

Implement exactly what's in the attached files; treat any ambiguity as a bug in this prompt to
flag, not license to improvise:

- `API-CONTRACT.yaml` — every endpoint, request/response shape, status code
- `DATABASE-SCHEMA.sql` — the migration, verbatim
- `ENUMS.md` — every allowed string value
- `JUDGING.md` — the exact scoring/normalization/tie-break/anomaly math
- `SYNC-MATRICES.md` — which DB tables and constraints back which endpoint, and the enforcement
  checklist
- `ARCHITECTURE.md` — lifecycle states, module boundaries, seed data shape, and the acceptance
  checker mapping (§11) — read this section again right before wiring `.dogfood.toml`
