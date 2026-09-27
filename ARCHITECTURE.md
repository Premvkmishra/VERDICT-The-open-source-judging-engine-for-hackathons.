# Verdict — Architecture

Source of truth alongside `DATABASE-SCHEMA.sql`, `ENUMS.md`, `API-CONTRACT.yaml`, `JUDGING.md`.
Frontend (Lovable) and backend (Antigravity) must not diverge from these five files. If a prompt
and a file disagree, the file wins.

---

## 1. Product thesis

**Verdict** is a self-hostable hackathon submission and judging platform built around one idea:
judges should discover and react to projects, not fill out forms. Underneath that feed sits a
scoring engine that only uses signals it can defend — a rubric, weighted and normalized across
judges — with everything else (first impressions, preferences, head-to-head comparisons) kept
as separate, clearly-labeled evidence rather than folded into the score.

Positioning: *Easy for judges. Hard to game. Easy to explain.*

## 2. Roles and permission model

Two layers:

- **Platform role**: `users.is_platform_admin` (boolean). Platform admins manage all events and
  users. This is the `admin` role from the brief.
- **Event role**: rows in `event_memberships` (`organizer`, `judge`, `participant`). A user can
  hold multiple event roles across different events, and in principle multiple roles in the same
  event (e.g. an organizer who also judges), each as a separate membership row.
- **`visitor`** is not a stored role — it is simply the absence of a session, and it is what the
  public gallery, project pages, voting ballot, and comments must work under.

Permission rule of thumb, enforced in the backend on every request, never in the frontend alone:

| Action | visitor | participant (own team) | judge (own assignment) | organizer (own event) | admin |
|---|---|---|---|---|---|
| View public gallery / project page | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create/edit team, submit/edit project before deadline | ❌ | ✅ | ❌ | ✅ (override) | ✅ |
| View own evaluations | ❌ | ❌ | ✅ | ✅ | ✅ |
| View another judge's evaluations | ❌ | ❌ | ❌ | ✅ | ✅ |
| Configure rubric, tracks, prizes, assignments | ❌ | ❌ | ❌ | ✅ | ✅ |
| Trigger normalization / publish results | ❌ | ❌ | ❌ | ✅ | ✅ |
| Export CSV / view audit log | ❌ | ❌ | ❌ | ✅ | ✅ |

## 3. Event lifecycle

`draft → upcoming → submissions_open → submissions_closed → judging_open → judging_closed → results_published → archived`

- `submissions_open` / `submissions_closed` is derived from `now()` vs. `submissions_close_at`,
  not just a manual flag — this is what makes deadline enforcement hold even if the organizer
  forgets to click a button. The stored `status` is a cache updated by a scheduled check *and*
  re-validated on every write to `projects`.
- `judging_open` similarly follows `judging_opens_at` / `judging_closes_at`.
- `results_published` is a manual organizer action (`POST /events/{event_slug}/publish-results`),
  gated by the publish rule in `JUDGING.md` §7.

## 4. Judging lifecycle (per project)

`unassigned → assigned → in_progress (≥1 evaluation started) → under_review (some submitted, some pending) → fully_reviewed (≥ min_reviews_per_project submitted) → ranked (after a normalization run includes it) → published`

A project can be `fully_reviewed` without being `ranked` (normalization hasn't run yet), and
`ranked` without being `published` (organizer hasn't published results yet).

## 5. Result lifecycle

`not_computed → computed (normalization_runs row exists) → stale (new evaluations arrived since last run) → published (organizer action, locks the run used for public display)`

Publishing pins a specific `normalization_runs.id` as the public one. Re-running normalization
after publish does not change the public result until the organizer re-publishes explicitly —
this keeps "why did this rank here" answerable against a fixed run.

## 6. Information architecture / frontend routes

Public (visitor):
- `/` — event list / landing
- `/events/:slug` — event home
- `/events/:slug/gallery` — public gallery, search + filter (maps to `GET /events/{event_slug}/projects`)
- `/events/:slug/projects/:projectId` — project detail + comments
- `/events/:slug/vote` — public ballot (only while voting open and results hidden)
- `/events/:slug/results` — public results (only after publish)

Auth:
- `/login`, `/signup`

Participant:
- `/events/:slug/team` — create/join team via invite code, see teammates
- `/events/:slug/submit` — draft/edit submission until deadline

Judge:
- `/events/:slug/judge` — the Discover→React→Evaluate→Decide→Reflect feed, one project at a time
- `/events/:slug/judge/compare` — occasional pairwise screen
- `/events/:slug/judge/history` — judge's own past evaluations (read-only)

Organizer (event-scoped, requires `organizer` membership on `:slug`):
- `/organizer/events` — list / create events
- `/organizer/events/:slug/setup` — dates, tracks, prizes
- `/organizer/events/:slug/rubric` — rubric builder
- `/organizer/events/:slug/judges` — invite, assign, set judge weights
- `/organizer/events/:slug/dashboard` — Judging Control Room
- `/organizer/events/:slug/projects/:projectId/why` — rank drill-down
- `/organizer/events/:slug/results` — compute / publish
- `/organizer/events/:slug/audit` — audit trail
- `/organizer/events/:slug/export` — CSV export

Admin:
- `/admin` — all events, all users, platform-wide audit

## 7. Frontend screen specification (selected — full detail for every screen lives in the Lovable prompt)

### `/events/:slug/judge` — the core screen

- **Role**: judge, membership required.
- **Data required on load**: `GET /events/{event_slug}/judge/feed` → next unfinished assignment
  (or `null` if queue empty) with full project detail, the active rubric, and this judge's
  progress counters (`completed`, `remaining`).
- **API calls**: `GET .../judge/feed`, `POST /assignments/{id}/evaluation` (autosave draft on
  each step), `POST /assignments/{id}/evaluation/submit` (finalize), occasionally
  `GET /events/{event_slug}/pairwise/next` + `POST /events/{event_slug}/pairwise`.
- **Flow**: five stacked steps in one continuous screen, not five separate pages — Discover
  (media, description, links) → React (3-choice chip) → Evaluate (rubric, one criterion visible
  at a time with a progress dots indicator) → Decide (send-to-finals 3-choice) → Reflect (tags +
  optional comment). Advancing auto-saves the partial evaluation (`status: in_progress`) so a
  closed tab never loses work. Submitting locks it (`status: submitted`) and immediately loads
  the next feed item without a full page transition.
- **Loading state**: skeleton card matching the final layout (image block + text lines), never a
  spinner-only screen.
- **Empty state**: "You're caught up" screen with completed/remaining counts and a link to
  `/judge/history`.
- **Error state**: inline retry banner on the current step; never discards already-entered data.
- **Success state**: brief (under 400ms) confirmation transition into the next project — no modal,
  no "Are you sure."
- **Responsive**: single-column on mobile, full flow unchanged; media becomes full-width above
  the text block.
- **Permissions**: 403 redirect to event home if the caller has no `judge` membership on `:slug`.

### `/organizer/events/:slug/dashboard` — Judging Control Room

- **Data required**: `GET /events/{event_slug}/dashboard/progress` (coverage stats, per-judge
  completion, integrity flags) + `GET /events/{event_slug}/results` if a run exists.
- Sections: coverage summary (projects × required reviews vs. actual), per-judge table
  (assigned/completed/avg time/flags), integrity panel (anomaly flags from the latest
  normalization run, each shown as an evidence sentence, never an accusation), a "Compute
  normalization" action, and a "Publish results" action gated per `JUDGING.md` §7 with a visible
  reason when disabled (e.g. "62% coverage, need 90%").

### `/organizer/events/:slug/projects/:projectId/why`

- Renders the full provenance chain from `JUDGING.md` §8 for one project: raw rubric answers per
  judge → per-criterion weighting → each judge's raw weighted score → that judge's μ/σ across
  their queue → z-score → weighted aggregate → final rank, plus any anomaly flags touching this
  project and, separately and visually distinct, the informational panel (reactions,
  preferences, pairwise record).

## 8. Backend architecture

Single deployable service (monolith, not microservices — appropriate for 72 hours and for the
"one command" adoptability requirement), fronted by a reverse proxy that also serves the built
frontend, so `docker compose up` exposes one port.

Modules (folder-per-module, see Antigravity prompt for exact layout):
- `auth` — signup/login/session issuance, session verification middleware
- `events` — event CRUD, lifecycle status derivation, tracks, prizes
- `teams` — teams, membership, invite codes
- `projects` — draft/edit/submit, deadline enforcement, gallery query (search/filter)
- `judging` — rubric config, assignments, evaluations, pairwise
- `engine` — normalization runs, ranking, anomaly detection (pure functions over stored data,
  independently testable, no I/O beyond reading/writing its own tables)
- `voting` — public votes, dedup, rate limiting
- `comments` — public comments, moderation flag
- `audit` — append-only event log, written by every other module, read by organizer/admin only
- `exports` — CSV generation from the same query the results screen uses (single source of truth)

Cross-cutting: a single `require_role(event_slug, role)` middleware used by every protected route
— this is the one thing that must never be reimplemented ad hoc per route, because the T2
acceptance check exists specifically to catch a route that forgot to call it.

## 9. Security model

- **Sessions**: opaque random token, hashed at rest (`sessions.token_hash`), sent as
  `Cookie: verdict_session=<token>`. No JWTs needed for a self-hosted single-instance app —
  simpler to reason about and to revoke.
- **Role isolation is enforced by resource ownership, not by role name alone.** E.g. a judge
  reading `/judges/{judge_user_id}/evaluations` is allowed only if `judge_user_id == caller.id`
  OR caller is organizer/admin of that event. This is the exact check the T2 "peer scores" test
  targets — implemented once in `judging` module, not duplicated.
- **Submission deadline** is enforced server-side by comparing `now()` to
  `events.submissions_close_at` on every write to `projects`/`project_versions`, independent of
  what the frontend shows.
- **Vote dedup**: unique constraint on `(event_id, project_id, voter_key)` where `voter_key` is a
  salted hash of email (email-gated voting) or a per-browser signed token (link voting) —
  enforced at the database level, not just application logic.
- **Rate limiting**: per-IP and per-voter_key sliding window on `POST /vote` and
  `POST /comments`, implemented in middleware, logged to `audit_events` on rejection.
- **Audit trail**: every state-changing action (assignment created, evaluation submitted,
  normalization run, publish, vote, role grant) writes one `audit_events` row with actor, action,
  entity, and a metadata snapshot. Audit is append-only — no update/delete route exists for it.
- **Frontend hides UI, backend refuses requests.** Every permission boundary above has a
  corresponding automated test in `tests/` that calls the route directly with curl-equivalent
  requests and asserts the status code, independent of any UI.

## 10. Seed data model

Loaded from `fixtures.json` (DOGFOOD's shared file) at container boot, then extended with the
platform's own accounts so the acceptance checker's fixed headers work:

- 1 event (`dogfood-demo`, `submissions_close_at` in the past — matches fixture — so the T1
  closed-submission check passes honestly)
- 1 organizer account, 4 judge accounts (`judge_a`..`judge_d`), several participant accounts —
  seed script prints the exact `Cookie:` header for each, matching `.dogfood.toml`'s `[auth]`
  format
- 8 tracks, ~40 projects imported from `fixtures.json` (title/summary/repo_url preserved,
  `team`/`track` foreign keys resolved), including the fixture's one duplicate submission
  (stored with `is_duplicate_of` set, visible in the organizer dashboard, not silently dropped)
- 1 active rubric matching the example in the brief (Does it work? / Idea / Execution / Impact)
- Judge assignments distributed so coverage is realistic but incomplete: most projects have 3–4
  submitted evaluations, several have only 1–2 (feeds the "insufficient reviews" and coverage-gate
  logic), one judge (`judge_d`) has near-zero score variance on purpose (feeds the low-variance
  anomaly flag), a handful of pairwise comparisons exist for a few high-traffic projects, and a
  spread of audit events (assignment creation, submissions, one forced-publish note) exist so the
  audit trail isn't empty on first load.

## 11. Acceptance-checker mapping

| Checker step | Route in `.dogfood.toml` | Backend endpoint | Enforcement point |
|---|---|---|---|
| Stranger GET gallery → 200 | `gallery` | `GET /api/v1/events/{event_slug}/projects` | public route, no auth middleware |
| Gallery shows fixture title | `gallery` | same | response body is JSON containing `title` fields verbatim from `fixtures.json` |
| Closed event POST submit → 4xx | `submit` | `POST /api/v1/events/{event_slug}/projects` | deadline check compares `now()` to seeded past `submissions_close_at`, returns 409 |
| Judge A GET own scores → 200 | `judge_scores` | `GET /api/v1/events/{event_slug}/evaluations/mine` | session → caller id, no cross-user lookup possible |
| Judge B GET judge A's scores → 401/403 | `peer_scores` | `GET /api/v1/events/{event_slug}/judges/{judge_a_id}/evaluations` | `require_role` ownership check: caller.id != judge_a_id and caller is not organizer/admin → 403 |
| Participant GET judge scores → 401/403 | `judge_scores` | same endpoint as above, different caller | caller has no `judge` membership → 403 |
| Organizer GET CSV → 200, comma in first line | `csv_export` | `GET /api/v1/events/{event_slug}/export.csv` | requires `organizer`/`admin` membership; header row always has ≥1 comma by construction |

Because `run.py` never executes JavaScript, every route named in `.dogfood.toml` **must** point at
the JSON API directly, not at an SPA page — this is called out explicitly in both delivery prompts.

## 12. Implementation order (72 hours)

1. **Hours 0–6**: schema migration, auth/sessions, seed script that loads `fixtures.json` and
   prints `.dogfood.toml`-ready headers. Get `docker compose up` working end to end on empty
   features first — adoptability is 20% of the score and compounds every hour it's broken.
2. **Hours 6–18**: events/tracks/prizes CRUD, teams + invites, project draft/edit/submit with
   deadline enforcement, public gallery with search/filter. This alone clears T1 — commit
   `.dogfood.toml` with `claimed = ["T1"]` and a passing `acceptance-report.txt` before moving on.
3. **Hours 18–36**: rubric config, judge assignment, the judge feed endpoint + evaluation
   submit/autosave, role-isolation middleware, CSV export, organizer dashboard read model. This
   clears T2 — re-run the checker, commit the updated report.
4. **Hours 36–44**: normalization engine (`engine` module) + `/why` drill-down + audit trail —
   this is 25% of the score and the Best Judging Engine prize; do not skip or rush it to fit T3.
5. **Hours 44–56**: T3 — public voting, comments, results-hidden-during-voting, randomized
   ballot order, rate limiting, duplicate detection.
6. **Hours 56–64**: frontend polish pass on the judge feed and organizer dashboard specifically —
   these are the two screens that get demoed and judged directly.
7. **Hours 64–70**: pick **one** T4/bonus item and do it properly — Pairwise Mode is nearly free
   since pairwise data collection is already in the T2 build; Threat Model is nearly free as pure
   writing. Do not start a third.
8. **Hours 70–72**: record the 5-minute demo video, finalize README/ARCHITECTURE/DATA-MODEL/
   JUDGING docs, commit the honest final `acceptance-report.txt`.
