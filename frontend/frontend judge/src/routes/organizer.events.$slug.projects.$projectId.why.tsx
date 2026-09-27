import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Info } from "lucide-react";

import { EmptyState, ErrorBanner, PageHeading, RowsSkeleton } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  FINAL_PREFERENCE_LABEL,
  REACTION_LABEL,
  TAG_LABEL,
  TIE_BREAK_LABEL,
  type EvaluationTag,
} from "@/lib/enums";
import { formatNumber } from "@/lib/format";
import { explainQuery } from "@/lib/queries";
import { asObject, pickArray, pickNumber, pickString, toDistribution } from "@/lib/unwrap";

export const Route = createFileRoute("/organizer/events/$slug/projects/$projectId/why")({
  head: ({ params }) => ({
    meta: [
      { title: `Why this rank — ${params.slug} — Verdict` },
      {
        name: "description",
        content: `The full provenance chain behind this project's rank: raw answers, weights, normalization and tie-breaks.`,
      },
      { property: "og:title", content: `Why this rank — ${params.slug}` },
      {
        property: "og:description",
        content: `Raw answers, weights, normalization and tie-breaks behind this project's rank.`,
      },
    ],
  }),
  component: WhyPage,
});

function WhyPage() {
  const { slug, projectId } = Route.useParams();
  const q = useQuery(explainQuery(slug, projectId));
  const data = q.data;

  const projectTitle = pickString(data, ["project_title"]) ?? pickString(data?.['project'], ["title"]);
  const evaluations = pickArray<Record<string, unknown>>(data, [
    "evaluations",
    "per_judge",
    "judges",
    "chain",
  ]);
  const aggregate = asObject(data?.['aggregate']) ?? data;
  const panel = asObject(data?.['panel'] ?? data?.['panel_signal'] ?? data?.['informational']);

  if (q.isLoading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-5 py-12">
        <RowsSkeleton rows={8} />
      </main>
    );
  }

  if (q.isError) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-12">
        {q.error instanceof ApiError && q.error.status === 403 ? (
          <EmptyState
            title="Not available yet"
            description="This explanation becomes public once results are published."
            action={
              <Button asChild variant="outline">
                <Link to="/events/$slug/results" params={{ slug }}>
                  Back to results
                </Link>
              </Button>
            }
          />
        ) : (
          <ErrorBanner error={q.error} onRetry={() => void q.refetch()} />
        )}
      </main>
    );
  }

  const tieBreak = pickString(aggregate, ["tie_break_reason"]);

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-12">
      <PageHeading
        eyebrow="Provenance"
        title={projectTitle ? `Why ${projectTitle} ranked here` : "Why this project ranked here"}
        description="Most granular first: every raw answer, then the weights, calibration and aggregation applied on top."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/events/$slug/projects/$projectId" params={{ slug, projectId }}>
              View project
            </Link>
          </Button>
        }
      />

      <section className="mt-10 space-y-6">
        <h2 className="font-display text-2xl">Per-judge chain</h2>
        {evaluations.length ? (
          <ol className="relative space-y-6 border-l-2 border-border pl-6">
            {evaluations.map((evaluation, index) => {
              const judgeName =
                pickString(evaluation, ["judge_display_name", "display_name", "judge_name"]) ??
                `Judge ${index + 1}`;
              const scores = pickArray<Record<string, unknown>>(evaluation, ["scores", "criteria", "answers"]);
              const raw = pickNumber(evaluation, ["raw_score", "raw_weighted_score", "R_jp", "raw"]);
              const mean = pickNumber(evaluation, ["judge_mean", "mean"]);
              const stdev = pickNumber(evaluation, ["judge_stdev", "stdev", "sd", "std"]);
              const z = pickNumber(evaluation, ["z_score", "zscore", "z"]);
              const excluded = pickString(evaluation, ["excluded_reason", "exclusion_reason"]);
              const judgeWeight = pickNumber(evaluation, ["judge_weight", "weight"]);

              return (
                <li key={index} className="panel p-6">
                  <span className="absolute -left-[9px] mt-1.5 h-4 w-4 rounded-full border-2 border-background bg-brand" />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-display text-lg">{judgeName}</h3>
                    {judgeWeight !== undefined ? (
                      <Badge variant="secondary">judge weight {formatNumber(judgeWeight, 2)}</Badge>
                    ) : null}
                  </div>

                  {scores.length ? (
                    <table className="mt-4 w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="pb-2">Criterion</th>
                          <th className="pb-2">Answer</th>
                          <th className="pb-2">Scale</th>
                          <th className="pb-2">Weight</th>
                          <th className="pb-2">Normalized</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scores.map((score, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="py-2">
                              {pickString(score, ["label", "criterion_label", "key"]) ?? "Criterion"}
                            </td>
                            <td className="py-2 font-mono">{pickNumber(score, ["value", "answer"]) ?? "—"}</td>
                            <td className="py-2 font-mono text-muted-foreground">
                              {pickNumber(score, ["scale_min"]) ?? "—"}–{pickNumber(score, ["scale_max"]) ?? "—"}
                            </td>
                            <td className="py-2 font-mono">{formatNumber(pickNumber(score, ["weight"]), 2)}</td>
                            <td className="py-2 font-mono">
                              {formatNumber(pickNumber(score, ["normalized", "n_c"]), 3)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}

                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
                    <Stat label="Raw weighted (0–5)" value={formatNumber(raw, 3)} />
                    <Stat label="Judge mean" value={formatNumber(mean, 3)} />
                    <Stat label="Judge stdev" value={formatNumber(stdev, 3)} />
                    <Stat
                      label="z-score"
                      value={excluded ? "excluded" : formatNumber(z, 3)}
                      hint={excluded ?? undefined}
                    />
                  </dl>
                </li>
              );
            })}
          </ol>
        ) : (
          <EmptyState
            title="No per-judge chain available"
            description="This appears once a normalization run has processed this project's reviews."
          />
        )}

        <div className="panel gradient-brand-soft p-7">
          <h2 className="font-display text-2xl">Aggregate</h2>
          <dl className="mt-5 grid gap-5 sm:grid-cols-4">
            <Stat
              label="Weighted aggregate"
              value={formatNumber(
                pickNumber(aggregate, ["weighted_aggregate", "official_score", "aggregate_score"]),
                4,
              )}
            />
            <Stat
              label="Display score"
              value={formatNumber(pickNumber(aggregate, ["display_score"]), 1)}
            />
            <Stat label="Rank" value={String(pickNumber(aggregate, ["rank"]) ?? "—")} />
            <Stat
              label="Reviews counted"
              value={String(pickNumber(aggregate, ["reviews_count", "reviews"]) ?? "—")}
            />
          </dl>
          {tieBreak ? (
            <p className="mt-5 text-sm">
              <span className="font-medium">Tie broken by:</span>{" "}
              {TIE_BREAK_LABEL[tieBreak.split(" ")[0] ?? tieBreak] ?? tieBreak}
              <span className="text-muted-foreground"> — {tieBreak}</span>
            </p>
          ) : null}
        </div>
      </section>

      {/* Deliberately a different surface: this never enters the score. */}
      <section className="mt-14 rounded-2xl border-2 border-dashed border-signal/50 bg-signal-soft/40 p-7">
        <div className="flex items-center gap-2">
          <Info className="h-5 w-5 text-signal" />
          <h2 className="font-display text-xl">Panel signal (informational — not part of the score)</h2>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <DistributionBlock
            title="First impressions"
            entries={toDistribution(panel?.['reactions'] ?? panel?.['reaction_distribution'])}
            labels={REACTION_LABEL as Record<string, string>}
          />
          <DistributionBlock
            title="Send to finals?"
            entries={toDistribution(
              panel?.['final_preferences'] ?? panel?.['final_preference_distribution'],
            )}
            labels={FINAL_PREFERENCE_LABEL as Record<string, string>}
          />
        </div>

        <div className="mt-6">
          <h3 className="eyebrow">Tags</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {pickArray<string>(panel, ["tags"]).length ? (
              pickArray<string>(panel, ["tags"]).map((tag, i) => (
                <Badge key={`${tag}-${i}`} variant="outline">
                  {TAG_LABEL[tag as EvaluationTag] ?? tag}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">None recorded.</p>
            )}
          </div>
        </div>

        <div className="mt-6">
          <h3 className="eyebrow">Judge comments</h3>
          <div className="mt-2 space-y-2">
            {pickArray<unknown>(panel, ["comments"]).length ? (
              pickArray<unknown>(panel, ["comments"]).map((comment, i) => (
                <p key={i} className="rounded-lg bg-card p-4 text-sm">
                  {typeof comment === "string"
                    ? comment
                    : (pickString(comment, ["comment", "body", "text"]) ?? "")}
                </p>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No comments left on this project.</p>
            )}
          </div>
        </div>

        <div className="mt-6">
          <h3 className="eyebrow">Pairwise record</h3>
          <p className="mt-2 text-sm">
            {pickNumber(panel, ["pairwise_wins", "wins"]) ?? 0} wins ·{" "}
            {pickNumber(panel, ["pairwise_losses", "losses"]) ?? 0} losses
            {pickNumber(panel, ["bradley_terry_score", "bt_score"]) !== undefined
              ? ` · Bradley-Terry ${formatNumber(pickNumber(panel, ["bradley_terry_score", "bt_score"]), 3)}`
              : ""}
          </p>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-mono text-lg">{value}</dd>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function DistributionBlock({
  title,
  entries,
  labels,
}: {
  title: string;
  entries: { key: string; count: number }[];
  labels: Record<string, string>;
}) {
  const total = entries.reduce((sum, e) => sum + e.count, 0);
  return (
    <div>
      <h3 className="eyebrow">{title}</h3>
      {entries.length ? (
        <ul className="mt-3 space-y-2">
          {entries.map((entry) => (
            <li key={entry.key} className="flex items-center gap-3 text-sm">
              <span className="w-32 shrink-0">{labels[entry.key] ?? entry.key}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-card">
                <span
                  className="block h-full rounded-full bg-signal"
                  style={{ width: total ? `${(entry.count / total) * 100}%` : "0%" }}
                />
              </span>
              <span className="w-6 text-right font-mono text-xs">{entry.count}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Nothing recorded.</p>
      )}
    </div>
  );
}
