import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Trophy } from "lucide-react";

import { EmptyState, ErrorBanner, PageHeading, RowsSkeleton } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { ApiError } from "@/lib/api";
import { flagLabel } from "@/lib/enums";
import { formatNumber } from "@/lib/format";
import { eventQuery, resultsQuery } from "@/lib/queries";

export const Route = createFileRoute("/events/$slug/results")({
  head: ({ params }) => ({
    meta: [
      { title: `Results — ${params.slug} — Verdict` },
      { name: "description", content: `Published rankings and display scores for ${params.slug}.` },
      { property: "og:title", content: `Results — ${params.slug}` },
      { property: "og:description", content: `Published rankings and display scores for ${params.slug}.` },
    ],
  }),
  component: ResultsPage,
});

function ResultsPage() {
  const { slug } = Route.useParams();
  const eventQ = useQuery(eventQuery(slug));
  const resultsQ = useQuery(resultsQuery(slug));

  const published = eventQ.data?.status === "results_published";

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-14">
      <PageHeading
        eyebrow="Final standings"
        title="Results"
        description={
          published
            ? "Display scores run 0–100. Open any project to see exactly how its rank was produced."
            : "Results for this event haven't been published yet."
        }
      />

      <div className="mt-8">
        {resultsQ.isLoading || eventQ.isLoading ? (
          <RowsSkeleton rows={6} />
        ) : resultsQ.isError ? (
          resultsQ.error instanceof ApiError && resultsQ.error.status === 403 ? (
            <EmptyState
              icon={<Trophy className="h-5 w-5" />}
              title="Results aren't published yet"
              description="The organizer will publish rankings once judging coverage is complete."
            />
          ) : (
            <ErrorBanner error={resultsQ.error} onRetry={() => void resultsQ.refetch()} />
          )
        ) : !resultsQ.data?.length ? (
          <EmptyState title="No ranked projects yet" />
        ) : (
          <ol className="space-y-3">
            {resultsQ.data.map((row) => (
              <li key={row.project_id} className="panel flex flex-wrap items-center gap-4 p-5">
                <span className="gradient-brand flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display text-lg text-brand-foreground">
                  {row.rank ?? "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    to="/events/$slug/projects/$projectId"
                    params={{ slug, projectId: row.project_id }}
                    className="font-display text-lg hover:underline"
                  >
                    {row.project?.title ?? row.project_title ?? "Project"}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.reviews_count} review{row.reviews_count === 1 ? "" : "s"}
                    {row.tie_break_reason ? ` · tie broken by ${row.tie_break_reason}` : ""}
                  </p>
                  {row.flags?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {row.flags.map((flag) => (
                        <Badge key={flag} variant="outline">
                          {flagLabel(flag)}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="font-display text-2xl">{formatNumber(row.display_score, 1)}</p>
                  <p className="text-xs text-muted-foreground">display score</p>
                </div>
                {published ? (
                  <Link
                    to="/organizer/events/$slug/projects/$projectId/why"
                    params={{ slug, projectId: row.project_id }}
                    className="text-sm font-medium text-brand hover:underline"
                  >
                    Why this rank?
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </main>
  );
}
