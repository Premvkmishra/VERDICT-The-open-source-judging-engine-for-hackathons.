# Verdict — Canonical Enums

Every value below must be used verbatim, in this casing, by both frontend and backend. Nothing
here is a display label — display labels are a frontend-only mapping *from* these values.

## Roles
`event_memberships.role`: `organizer` | `judge` | `participant`
(`visitor` is not stored — absence of a session. `admin` is `users.is_platform_admin = true`.)

## Event status
`events.status`: `draft` | `upcoming` | `submissions_open` | `submissions_closed` | `judging_open` | `judging_closed` | `results_published` | `archived`

## Project status
`projects.status`: `draft` | `submitted` | `disqualified`

## Judge assignment status
`judge_assignments.status`: `pending` | `in_progress` | `completed`

## Evaluation status
`evaluations.status`: `in_progress` | `submitted`

## Reaction (first impression — informational only, see JUDGING.md §0)
`evaluations.reaction`: `not_convinced` | `interesting` | `stands_out`
Display labels: "Not convinced" / "Interesting" / "Stands out"

## Final-round preference (tie-break signal only, see JUDGING.md §0, §7)
`evaluations.final_preference`: `no` | `maybe` | `yes`
Display labels: "No" / "Maybe" / "Yes" (question shown: *"If you could send only one project to
the final round, would this be it?"*)

## Reflect tags (informational — free selection, stored as a JSON array of these strings)
`evaluations.tags[]` values: `great_execution` | `clever_idea` | `strong_impact` | `beautiful_ux` | `technically_impressive` | `very_original` | `needs_more_polish`

## Voter type
`votes.voter_type`: `email` | `link` | `account`

## Comment status
`comments.status`: `visible` | `hidden` | `flagged`

## Normalization method
`events.normalization_method` / `normalization_runs.method`: `zscore` (only value supported in v1;
column exists as a string, not a fixed set, so a future method can be added without a migration
that touches every row)

## Anomaly flags (JUDGING.md §10 — stored in `normalization_judge_stats.flags[]` or
`project_rankings.flags[]`, always with accompanying numeric evidence in the same row)
`low_variance_judge` | `insufficient_data_judge` | `low_panel_correlation` | `rapid_review` | `high_disagreement_project` | `pairwise_rubric_disagreement`

## Tie-break reason (`project_rankings.tie_break_reason`, free text but must start with one of)
`final_preference_count` | `bradley_terry_score` | `raw_score_mean` | `project_id` | `none` (no tie occurred)

## API error codes (`error.code` in every non-2xx JSON body — see API-CONTRACT.yaml)
`unauthenticated` | `forbidden` | `not_found` | `validation_error` | `deadline_passed` | `event_not_open` | `conflict` | `rate_limited` | `internal_error`
