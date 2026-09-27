import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, RefreshCcw, ShieldCheck, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { OrganizerGuard } from "@/components/organizer-guard";
import { OrganizerNav } from "@/components/organizer-nav";
import { EmptyState, ErrorBanner, PageHeading, RowsSkeleton } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiPost } from "@/lib/api";
import { flagLabel } from "@/lib/enums";
import { handleApiError } from "@/lib/errors";
import { formatDuration, formatPercent } from "@/lib/format";
import { dashboardQuery } from "@/lib/queries";
import { asObject, pickArray, pickNumber, pickString } from "@/lib/unwrap";

export const Route = createFileRoute("/organizer/events/$slug/dashboard")({
  head: ({ params }) => ({
    meta: [
      { title: `Judging control room — ${params.slug} — Verdict` },
      { name: "description", content: `Coverage, per-judge progress and integrity flags for ${params.slug}.` },
      { property: "og:title", content: `Judging control room — ${params.slug}` },
      {
        property: "og:description",
        content: `Coverage, per-judge progress and integrity flags for ${params.slug}.`,
      },
    ],
  }),
  component: () => {
    const { slug } = Route.useParams();
    return (
      <OrganizerGuard slug={slug}>
        <DashboardPage slug={slug} />
      </OrganizerGuard>
    );
  },
});

function DashboardPage({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const dashQ = useQuery(dashboardQuery(slug));
  const [forceOpen, setForceOpen] = useState(false);
  const [reason, setReason] = useState("");

  const data = dashQ.data;
  const coverage = asObject(data?.['coverage']) ?? data;
  const coveragePct =
    pickNumber(coverage, ["coverage_pct", "pct", "percent", "coverage_percent"]) ?? undefined;
  const requiredReviews = pickNumber(coverage, ["required_reviews", "reviews_required", "expected_reviews"]);
  const actualReviews = pickNumber(coverage, ["actual_reviews", "completed_reviews", "reviews_completed"]);
  const projectCount = pickNumber(coverage, ["projects_count", "project_count", "projects"]);
  const minCoverage = pickNumber(data, ["min_publish_coverage_pct", "publish_threshold_pct"]);
  const canPublish = pickBool(data, ["can_publish", "publishable", "publish_allowed"]);
  const publishBlockedReason = pickString(data, ["publish_blocked_reason", "blocked_reason", "reason"]);

  const judges = pickArray<Record<string, unknown>>(data, ["judges", "per_judge", "judge_progress"]);
  const flags = pickArray<Record<string, unknown>>(data, ["flags", "integrity_flags", "anomalies"]);

  const runNormalization = useMutation({
    mutationFn: () => apiPost(`/events/${slug}/normalization/run`),
    onSuccess: async () => {
      toast.success("Normalization run complete");
      await queryClient.invalidateQueries({ queryKey: ["dashboard", slug] });
      await queryClient.invalidateQueries({ queryKey: ["results", slug] });
    },
    onError: (e) => handleApiError(e, "The normalization run didn't finish."),
  });

  const publish = useMutation({
    mutationFn: (force?: { reason: string }) =>
      apiPost(`/events/${slug}/publish-results`, force ? { force: true, reason: force.reason } : {}),
    onSuccess: async () => {
      toast.success("Results published");
      setForceOpen(false);
      setReason("");
      await queryClient.invalidateQueries({ queryKey: ["dashboard", slug] });
      await queryClient.invalidateQueries({ queryKey: ["event", slug] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        toast.error("Coverage gate not met", {
          description: `${error.message} You can force-publish with a written reason.`,
        });
        setForceOpen(true);
        return;
      }
      handleApiError(error, "We couldn't publish results.");
    },
  });

  const derivedPct =
    coveragePct ??
    (requiredReviews && actualReviews ? (actualReviews / requiredReviews) * 100 : undefined);

  const publishDisabledReason =
    canPublish === false
      ? (publishBlockedReason ??
        (derivedPct !== undefined && minCoverage !== undefined
          ? `${Math.round(derivedPct)}% coverage — need ${minCoverage}%`
          : "Coverage gate not yet satisfied"))
      : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-12">
      <PageHeading
        eyebrow="Organizer"
        title="Judging control room"
        description="Coverage, panel progress, and every integrity flag from the latest normalization run."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => runNormalization.mutate()}
              disabled={runNormalization.isPending}
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              {runNormalization.isPending ? "Computing…" : "Compute normalization"}
            </Button>
            <Button
              onClick={() => publish.mutate(undefined)}
              disabled={Boolean(publishDisabledReason) || publish.isPending}
              title={publishDisabledReason ?? undefined}
            >
              <Upload className="mr-2 h-4 w-4" />
              {publish.isPending ? "Publishing…" : "Publish results"}
            </Button>
          </>
        }
      />
      {publishDisabledReason ? (
        <p className="mt-3 text-sm text-warning">
          Publishing is blocked: {publishDisabledReason}.{" "}
          <button className="underline" onClick={() => setForceOpen(true)}>
            Force publish with a reason
          </button>
        </p>
      ) : null}

      <OrganizerNav slug={slug} className="mt-6" />

      {dashQ.isLoading ? (
        <div className="mt-8">
          <RowsSkeleton rows={6} />
        </div>
      ) : dashQ.isError ? (
        <ErrorBanner className="mt-8" error={dashQ.error} onRetry={() => void dashQ.refetch()} />
      ) : (
        <div className="mt-8 space-y-8">
          <section className="panel p-7">
            <h2 className="font-display text-2xl">Coverage</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reviews completed against reviews required across every project.
            </p>
            <div className="mt-5 flex flex-wrap items-end gap-8">
              <div>
                <p className="font-display text-5xl">{formatPercent(derivedPct)}</p>
                <p className="mt-1 text-xs text-muted-foreground">of required reviews complete</p>
              </div>
              <div className="min-w-60 flex-1">
                <Progress value={Math.min(derivedPct ?? 0, 100)} />
                <p className="mt-2 text-sm text-muted-foreground">
                  {actualReviews ?? "—"} of {requiredReviews ?? "—"} reviews
                  {projectCount ? ` · ${projectCount} projects` : ""}
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-display text-2xl">Panel</h2>
            <div className="panel mt-4 overflow-x-auto">
              {judges.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Judge</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Avg. review time</TableHead>
                      <TableHead>Flags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {judges.map((judge, index) => {
                      const judgeFlags = pickArray<string>(judge, ["flags"]);
                      return (
                        <TableRow key={pickString(judge, ["judge_user_id", "user_id", "id"]) ?? index}>
                          <TableCell className="font-medium">
                            {pickString(judge, ["display_name", "judge_display_name", "name", "email"]) ??
                              (pickString(judge, ["judge_user_id", "user_id", "id"]) ?? "—").slice(0, 8)}
                          </TableCell>
                          <TableCell>{pickNumber(judge, ["assigned", "assigned_count"]) ?? "—"}</TableCell>
                          <TableCell>{pickNumber(judge, ["completed", "completed_count"]) ?? "—"}</TableCell>
                          <TableCell>
                            {formatDuration(
                              pickNumber(judge, [
                                "avg_review_seconds",
                                "average_review_seconds",
                                "avg_review_time_seconds",
                              ]),
                            )}
                          </TableCell>
                          <TableCell>
                            {judgeFlags.length ? (
                              <div className="flex flex-wrap gap-1.5">
                                {judgeFlags.map((f) => (
                                  <Badge key={f} variant="outline">
                                    {flagLabel(f)}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-6">
                  <EmptyState
                    title="No judge progress yet"
                    description="Per-judge completion appears once assignments exist and judges start reviewing."
                  />
                </div>
              )}
            </div>
          </section>

          <section>
            <h2 className="flex items-center gap-2 font-display text-2xl">
              <ShieldCheck className="h-5 w-5 text-brand" /> Integrity
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Every anomaly from the latest normalization run, with the numbers behind it.
            </p>
            <div className="mt-4 space-y-3">
              {flags.length ? (
                flags.map((flag, index) => {
                  const code = pickString(flag, ["flag", "code", "type"]) ?? "flag";
                  const sentence = pickString(flag, ["sentence", "message", "evidence", "description"]);
                  const evidence = asObject(flag['evidence'] ?? flag['numbers'] ?? flag['stats']);
                  return (
                    <div key={index} className="panel flex flex-wrap gap-4 p-5">
                      <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
                      <div className="min-w-0 flex-1">
                        <Badge variant="outline">{flagLabel(code)}</Badge>
                        {sentence ? <p className="mt-2 text-sm">{sentence}</p> : null}
                        {evidence ? (
                          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                            {Object.entries(evidence).map(([key, value]) => (
                              <div key={key} className="flex gap-1.5">
                                <dt>{key.replace(/_/g, " ")}:</dt>
                                <dd className="font-mono text-foreground">{String(value)}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              ) : (
                <EmptyState
                  title="No anomalies flagged"
                  description="Run normalization to check the panel for low variance, rapid reviews and disagreement."
                />
              )}
            </div>
          </section>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link to="/organizer/events/$slug/results" params={{ slug }}>
                Review rankings
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/organizer/events/$slug/audit" params={{ slug }}>
                Audit trail
              </Link>
            </Button>
          </div>
        </div>
      )}

      <Dialog open={forceOpen} onOpenChange={setForceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Force publish results</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Coverage is below the gate. Your reason is written to the audit log.
            </p>
            <div className="space-y-2">
              <Label htmlFor="force-reason">Reason</Label>
              <Textarea
                id="force-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you publishing early?"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={!reason.trim() || publish.isPending}
              onClick={() => publish.mutate({ reason: reason.trim() })}
            >
              {publish.isPending ? "Publishing…" : "Force publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function pickBool(source: unknown, keys: string[]): boolean | undefined {
  const obj = asObject(source);
  if (!obj) return undefined;
  for (const key of keys) {
    if (typeof obj[key] === "boolean") return obj[key] as boolean;
  }
  return undefined;
}
