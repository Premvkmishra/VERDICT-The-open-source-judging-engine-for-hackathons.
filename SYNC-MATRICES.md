# Verdict — Synchronization Matrices

Every row here must match `API-CONTRACT.yaml` and `DATABASE-SCHEMA.sql` exactly. If a row and the
contract disagree, the contract wins and this file is wrong and should be fixed.

## A. Frontend feature ↔ API endpoint

| Frontend feature | API Endpoint | Request | Response | Backend module | DB tables |
|---|---|---|---|---|---|
| Public gallery + search/filter | `GET /events/{event_slug}/projects` | query: q, track_id, sort, page | `{data: Project[], meta}` | projects | projects, tracks |
| Project detail page | `GET /projects/{project_id}` | — | `{data: Project}` | projects | projects, teams |
| Create team | `POST /events/{event_slug}/teams` | `{name}` | `{data: Team}` | teams | teams, team_members |
| Join team via code | `POST /events/{event_slug}/teams/join` | `{code}` | `{data: Team}` | teams | team_invites, team_members |
| Generate invite link | `POST /teams/{team_id}/invites` | `{max_uses?, expires_at?}` | `{data: {code}}` | teams | team_invites |
| Submit project (create) | `POST /events/{event_slug}/projects` | Project fields | `{data: Project}` | projects | projects |
| Edit draft project | `PATCH /projects/{project_id}` | Project fields | `{data: Project}` | projects | projects, project_versions |
| Finalize submission | `POST /projects/{project_id}/submit` | — | `{data: Project}` | projects | projects |
| Judge feed (Discover) | `GET /events/{event_slug}/judge/feed` | — | `{data: {assignment, project, rubric, progress}}` | judging | judge_assignments, projects, rubrics |
| Autosave evaluation step | `POST /assignments/{id}/evaluation` | partial Evaluation | `{data: Evaluation}` | judging | evaluations, evaluation_scores |
| Submit evaluation | `POST /assignments/{id}/evaluation/submit` | — | `{data: Evaluation}` | judging | evaluations, judge_assignments |
| Judge's own history | `GET /events/{event_slug}/evaluations/mine` | — | `{data: Evaluation[]}` | judging | evaluations |
| Pairwise comparison screen | `GET /events/{event_slug}/pairwise/next` → `POST .../pairwise` | winner_project_id | `{data: PairwiseComparison}` | judging | pairwise_comparisons |
| Rubric builder | `PUT /events/{event_slug}/rubric` | criteria[] | `{data: Rubric}` | judging | rubrics, rubric_criteria |
| Assign judges | `POST /events/{event_slug}/assignments` | assignments[] | `{data: Assignment[]}` | judging | judge_assignments |
| Judging Control Room | `GET /events/{event_slug}/dashboard/progress` | — | coverage + per-judge + flags | engine | judge_assignments, evaluations, normalization_judge_stats |
| Compute normalization | `POST /events/{event_slug}/normalization/run` | — | `{data: {run_id}}` | engine | normalization_runs, normalization_judge_stats, normalization_results, project_rankings |
| "Why did this rank here" | `GET /events/{event_slug}/results/{project_id}/explain` | — | full chain, JUDGING.md §8 | engine | evaluation_scores, normalization_results, project_rankings |
| Publish results | `POST /events/{event_slug}/publish-results` | `{run_id?, force?, reason?}` | `{data: Event}` | events, engine | events, audit_events |
| Public results page | `GET /events/{event_slug}/results` | — | `{data: ProjectRanking[]}` | engine | project_rankings |
| CSV export | `GET /events/{event_slug}/export.csv` | — | text/csv | exports | project_rankings, projects |
| Public voting ballot | `GET /events/{event_slug}/vote/ballot` | — | randomized Project[] | voting | projects, votes |
| Cast vote | `POST /events/{event_slug}/vote` | project_id, voter_type | `{data: {id}}` | voting | votes |
| Project comments | `GET`/`POST /projects/{project_id}/comments` | body | `{data: Comment[]}` / `{data: Comment}` | comments | comments |
| Audit trail viewer | `GET /events/{event_slug}/audit` | page, action | `{data: AuditEvent[]}` | audit | audit_events |

Backend-only, intentionally admin/organizer-facing with no separate frontend consumer beyond the
above: `PATCH /events/{event_slug}` (event settings, covered by the setup screen using the same
endpoint as event creation), `PATCH/DELETE /tracks/{id}`, `PATCH/DELETE /prizes/{id}` (covered by
the setup screen's inline edit/delete actions on the same list rendered by the GET).

## B. API ↔ DB usage

| API | DB tables used | Read/Write | Important constraints |
|---|---|---|---|
| `POST /events/{slug}/projects` | projects | Write | `UNIQUE(event_id, team_id)`; deadline check against `events.submissions_close_at` before insert |
| `PATCH /projects/{id}` | projects, project_versions | Write | deadline check on every write; snapshot inserted into project_versions before update |
| `GET /events/{slug}/projects` | projects, tracks | Read | `idx_projects_event_status`, `idx_projects_title_trgm` for `q` search |
| `POST /events/{slug}/teams/join` | team_invites, team_members | Write | `team_invites.uses_count < max_uses`, `expires_at` check; `UNIQUE(team_id,user_id)` prevents double-join |
| `POST /assignments/{id}/evaluation` | evaluations, evaluation_scores | Write | `UNIQUE(assignment_id)` on evaluations enforces one evaluation per assignment; `UNIQUE(evaluation_id,criterion_id)` prevents duplicate criterion rows |
| `POST /assignments/{id}/evaluation/submit` | evaluations, judge_assignments | Write | app-level check: one `evaluation_scores` row per active rubric criterion, else 422; sets `evaluations.status='submitted'`, `judge_assignments.status='completed'` |
| `GET /events/{slug}/judges/{judge_user_id}/evaluations` | evaluations, event_memberships | Read | app-level ownership check (`caller.id == judge_user_id` OR caller has `organizer`/is admin) — **this is not a DB constraint, it is the single most important backend `if` statement in the whole system**; DB has no way to express "only this row's owner" so it must be enforced in the query layer before any row is returned |
| `POST /events/{slug}/normalization/run` | evaluations, evaluation_scores, rubric_criteria, judge_assignments, pairwise_comparisons → normalization_runs, normalization_judge_stats, normalization_results, project_rankings | Read+Write | reads only `evaluations.status='submitted'`; writes are all scoped to one new `run_id`, never mutates a prior run (immutable history) |
| `POST /events/{slug}/publish-results` | events, normalization_runs, project_rankings, audit_events | Write | coverage computed from `project_rankings.is_rankable` for the target run vs. `COUNT(projects WHERE status='submitted')`; sets `events.published_normalization_run_id` and `events.status='results_published'`; always writes one `audit_events` row |
| `POST /events/{slug}/vote` | votes | Write | `UNIQUE(event_id, project_id, voter_key)` is the actual duplicate-vote enforcement — DB-level, not app-level; app-level rate limiter is a separate, additional layer (sliding window per IP/voter_key, not stored in this schema — in-memory or a small `rate_limit_hits` table if persistence across restarts is wanted) |
| `GET /events/{slug}/export.csv` | project_rankings, projects | Read | must query the **same** ranking data the `/results` endpoint uses — one query function shared by both, so CSV and UI can never disagree |
| `GET /events/{slug}/audit` | audit_events | Read | organizer/admin only; append-only table, no write route exists for the frontend at all |

## C. Enforcement checklist (backend, never frontend-only)

- [ ] Deadline check reads `events.submissions_close_at` server-side on every `POST/PATCH` to projects — never trusts a client-sent flag.
- [ ] Judge peer-score isolation is one shared ownership check used by both `.../evaluations/mine` and `.../judges/{id}/evaluations` — not reimplemented per route.
- [ ] Vote dedup is a DB unique constraint, not just an app-level "have we seen this voter_key" check that could race.
- [ ] CSV export and the results API read from the identical query — verified by a test that diffs them on the seed data.
- [ ] Audit log has no update/delete route, and ideally `REVOKE UPDATE, DELETE` at the DB role level.
