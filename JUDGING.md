# Verdict — Judging Engine

This document is the exact, reproducible specification of how a rubric answer becomes a rank.
Every number here must be recomputable from rows in `evaluation_scores`, `evaluations`,
`normalization_runs`, `normalization_judge_stats`, `normalization_results`, and
`project_rankings` — no calculation may depend on anything not stored.

## 0. Which signals affect the official score, and which don't

| Signal | Affects official score? | Role |
|---|---|---|
| Rubric criterion scores | **Yes** | The only input to the weighted, normalized score |
| Judge weight (organizer-set) | **Yes** | Applied when aggregating normalized scores across judges |
| First-impression reaction | No | Organizer dashboard, informational panel signal only |
| Final-round preference ("send forward?") | No, except tie-break | Tie-break step 1 only |
| Tags / free-text comment | No | Organizer dashboard, informational |
| Pairwise comparisons | No, except tie-break | Bradley-Terry strength used at tie-break step 2, and as a disagreement check shown to the organizer, never blended into the score |
| Missing / incomplete reviews | Affects **eligibility to be ranked**, not the formula itself | See §5 |

Reasoning: a defensible score is one an organizer can trace to a specific, comparable, repeated
judgment. Reactions and preferences are single quick taps, not comparable across judges the way a
weighted rubric is, and pairwise comparisons only exist for project pairs a judge happened to see
together — using them in the primary score would make some projects' scores depend on who they
were randomly paired against. All three remain valuable as evidence and tie-breakers, never as the
score itself.

## 1. Raw criterion normalization

Each rubric criterion `c` has an organizer-configured scale `[min_c, max_c]` (criteria may have
different scale lengths — "Does it work?" has 3 options, "Impact" has 4, etc.). A judge's answer
is stored as an integer `v` in `[min_c, max_c]`.

```
n_c = (v - min_c) / (max_c - min_c)        # normalized to [0, 1]
```

## 2. Raw weighted evaluation score

For one evaluation (one judge `j`, one project `p`), with criterion weights `w_c` from the active
rubric (`Σ w_c` need not equal 1; it is normalized here):

```
R_jp = Σ(w_c · n_c) / Σ(w_c)                # in [0, 1]
```

`R_jp × 5` is stored and displayed as the judge's raw 0–5 score for that project. This raw score
is always visible to the organizer per-evaluation, unnormalized — it is the ground truth every
later number must trace back to.

## 3. Per-judge normalization (cross-judge calibration)

**Method: per-judge z-score. Chosen over min-max or percentile normalization because it corrects
for both a judge's central tendency (runs harsh/generous) and their spread (uses only the middle
of the scale, or the extremes) with one well-understood, widely-taught statistic, and because
every value it produces — μ, σ, z — is independently checkable by an organizer with a
spreadsheet, which matters more here than marginal robustness gains from a rank-based method.**

For judge `j`, over the set `P_j` of projects they have a **submitted** evaluation for in this
event:

```
μ_j = mean(R_jp for p in P_j)
σ_j = sample_stdev(R_jp for p in P_j)        # n−1 denominator
n_j = |P_j|
```

```
z_jp = (R_jp − μ_j) / σ_j            for p in P_j, only if the judge is "normalizable"
```

**A judge is normalizable only if `n_j ≥ 3` and `σ_j ≥ ε` (ε = 0.01).**

If a judge is *not* normalizable (too few completed reviews, or literally zero variance — e.g.
the fixture judge who scored everything identically):
- Their raw scores (`R_jp`) remain fully visible, per-project, in the organizer dashboard and the
  `/why` drill-down.
- Their scores are **excluded from the normalized aggregate** used for ranking (§4) — not
  defaulted to `z = 0`, because silently treating "gave everyone a 5" as "agrees with the panel"
  would hide exactly the pattern the organizer needs to see.
- The dashboard flags this explicitly: *"Judge X: n=2 completed reviews (need ≥3) — scores shown
  but not included in the ranked aggregate"* or *"Judge X: σ=0.00 across 6 reviews — scores shown
  but not included in the ranked aggregate."*

## 4. Aggregate normalized score per project

For project `p`, over the set `J_p` of normalizable judges who submitted an evaluation for `p`,
with organizer-configured per-judge weight `weight_j` (default `1.0`):

```
official_score(p) = Σ(weight_j · z_jp) / Σ(weight_j)     for j in J_p
```

This is the number ranking is sorted on. It is a signed real number (typically roughly in
`[-2, 2]`), not itself a 0–5 or 0–100 scale — see §6 for the display transform.

If `J_p` is empty (every judge who reviewed `p` was non-normalizable, or nobody has submitted yet),
`official_score(p)` is undefined and the project is not ranked (§5).

## 5. Eligibility and publish gating

- `min_reviews_per_project` (organizer setting, default `3`): a project is **rankable** only if it
  has at least this many **submitted** evaluations, at least one of which is from a normalizable
  judge.
- A project below the threshold is shown in the organizer dashboard and, if published, in the
  public results as **"Not enough reviews to rank"** — never silently omitted, never assigned a
  fabricated rank.
- **Publish gate**: `POST /events/{event_slug}/publish-results` succeeds only if
  `(rankable projects) / (submitted projects) ≥ min_coverage_pct` (organizer setting, default
  `90%`). If the organizer wants to publish below that threshold, the request must include
  `{"force": true, "reason": "<text>"}` — this is written to `audit_events` verbatim, and the
  published results page carries a visible "published with N/M projects rankable" notice. There is
  no silent override.

## 6. Display transform (presentation only — never used for ranking)

To show a human-friendly number without pretending it's a raw 0–5 score, each ranked project's
`official_score` is min-max rescaled across the set of rankable projects in the same run:

```
display_score(p) = 100 · (official_score(p) − min(official_score over rankable set)) /
                          (max(official_score over rankable set) − min(...))
```

If every rankable project has the same `official_score` (spread is zero), `display_score = 50` for
all of them. `display_score` is stored per run in `project_rankings.display_score` alongside the
canonical `official_score` — the drill-down always shows both, labeled clearly as "ranking value"
vs. "display score."

## 7. Ranking and deterministic tie-breaking

Sort rankable projects descending by `official_score`. Ties (`|Δofficial_score| < 1e-9`) are broken,
in this exact order, until one is deterministic:

1. **Higher count of `final_preference = 'yes'`** among submitted evaluations for that project.
   (Informational signal, used here only as a tie-break — see §0.)
2. **Higher Bradley-Terry strength score** (§9), computed only if both tied projects have at least
   one recorded pairwise comparison; skip this step entirely if not.
3. **Higher unweighted mean of raw scores** `mean(R_jp × 5)` across *all* judges who reviewed the
   project (including non-normalizable ones) — a simpler, unnormalized fallback.
4. **Lower project `id` (UUID) ascending** — a stable, arbitrary, but fully deterministic final
   fallback so re-running the algorithm on identical data always produces an identical order.

`project_rankings.tie_break_reason` records which step (if any) resolved a given tie, so the
`/why` view can say plainly "tied with Project X on official score; resolved by final-round
preference count" rather than leaving an unexplained ordering.

## 8. Provenance chain ("why did this project rank here")

The `/why` view for project `p`, backed by `GET /events/{event_slug}/results/{project_id}/explain`,
renders exactly this chain, every step sourced from a stored row:

```
Project
 └─ Judge assignments (judge_assignments rows for p)
     └─ Individual evaluations (evaluations rows, status=submitted)
         └─ Raw rubric answers (evaluation_scores rows) ── criterion weights (rubric_criteria)
             └─ Raw weighted score R_jp (§2, recomputed live, not cached — always fresh)
                 └─ That judge's μ_j, σ_j, n_j across their full queue (normalization_judge_stats)
                     └─ z_jp (§3) — or "excluded, not normalizable" with the reason
                         └─ Weighted aggregate official_score(p) (§4)
                             └─ display_score(p) (§6)
                                 └─ Rank (§7), with tie-break reason if applicable
```

Below this chain, visually separated under a **"Panel signal (informational)"** heading, the same
view shows: reaction distribution, final-preference distribution, tags, comments, and any pairwise
record for this project — clearly labeled as not contributing to the score above.

## 9. Pairwise comparisons (Bradley-Terry — bonus/T4)

A pairwise comparison records that judge `j`, shown projects `a` and `b`, picked a winner. The
Bradley-Terry model assigns each project a latent strength `s_p > 0` such that
`P(a beats b) = s_a / (s_a + s_b)`. Fit by iterative MM (minorization-maximization), a closed-form,
easily-audited alternative to gradient descent:

```
for each project p:  W_p = number of comparisons p won
repeat until convergence:
  for each project p:
    s_p ← W_p / Σ_over_matches_m_involving_p( n_m / (s_p + s_opponent(m)) )
  normalize Σ s_p = number of projects   # anchors the scale
```

Strength scores are stored per normalization run (they depend only on `pairwise_comparisons`, not
on rubric data) and used **only** for: (a) tie-break step 2 above, and (b) an organizer-facing
disagreement flag (§10) comparing the Bradley-Terry order to the rubric-based order. They never
enter §4.

## 10. Anomaly flags — evidence, not accusation

Computed once per normalization run, stored on the run, shown in the organizer dashboard with the
exact numbers behind each flag. The system never asserts intent or bias — every flag is phrased as
an observed statistical fact.

| Flag | Condition | Displayed as |
|---|---|---|
| `low_variance_judge` | `σ_j < 0.01` over `n_j ≥ 3` submitted evaluations | "Judge {name}'s scores show unusually low spread (σ={val}) across {n} reviews." |
| `insufficient_data_judge` | `n_j < 3` | "Judge {name} has completed {n} of {assigned} assigned reviews — not enough to normalize yet." |
| `low_panel_correlation` | Pearson `r` between judge `j`'s `z_jp` and the panel-average `z` (excluding `j`) on their `≥5` shared projects is `< 0.2` | "Judge {name}'s rankings differ notably from the panel's on shared projects (r={val})." |
| `rapid_review` | median(`evaluations.submitted_at − created_at`) `< 30s` over `≥5` evaluations | "Judge {name} submitted {n} reviews averaging under 30 seconds each." |
| `high_disagreement_project` | `sample_stdev(z_jp across J_p) > 1.0` with `|J_p| ≥ 3` | "Reviewers disagreed substantially on {project} (σ={val} across {n} judges)." |
| `pairwise_rubric_disagreement` | Bradley-Terry rank and rubric rank for the same project differ by more than 25% of the field size | "{project}'s head-to-head record ranks it {bt_rank} while its rubric score ranks it {rubric_rank}." |

## 11. Worked example

Rubric: *Idea* (weight 1, scale 1–4), *Execution* (weight 2, scale 1–4), *Impact* (weight 1,
scale 1–4). Judge Ada scores project "Quiet Hours": Idea=3, Execution=4, Impact=2.

```
n_idea = (3-1)/(4-1) = 0.667
n_exec = (4-1)/(4-1) = 1.000
n_impact = (2-1)/(4-1) = 0.333

R = (1·0.667 + 2·1.000 + 1·0.333) / (1+2+1) = (0.667+2.000+0.333)/4 = 0.75   → raw 0–5 display: 3.75
```

If Ada's queue mean is `μ=0.60`, stdev `σ=0.18` (n=8 ≥ 3, σ ≥ 0.01 → normalizable):

```
z = (0.75 − 0.60) / 0.18 = 0.833
```

That `0.833` is one input into the weighted mean across all normalizable judges who reviewed
"Quiet Hours" — the resulting `official_score` is what determines its rank.
