import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { EmptyState, ErrorBanner, PageHeading, RowsSkeleton } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FINAL_PREFERENCE_LABEL,
  REACTION_LABEL,
  TAG_LABEL,
  type EvaluationTag,
  type FinalPreference,
  type Reaction,
} from "@/lib/enums";
import { formatDateTime } from "@/lib/format";
import { myEvaluationsQuery } from "@/lib/queries";
import type { Evaluation, Project } from "@/lib/types";

export const Route = createFileRoute("/events/$slug/judge/history")({
  head: ({ params }) => ({
    meta: [
      { title: `Your reviews — ${params.slug} — Verdict` },
      { name: "description", content: `A read-only record of the reviews you submitted for ${params.slug}.` },
      { property: "og:title", content: `Your reviews — ${params.slug}` },
      { property: "og:description", content: `A read-only record of the reviews you submitted for ${params.slug}.` },
    ],
  }),
  component: HistoryPage,
});

type EvaluationRow = Evaluation & { project?: Project; project_title?: string };

function HistoryPage() {
  const { slug } = Route.useParams();
  const q = useQuery(myEvaluationsQuery(slug));
  const rows = (q.data ?? []) as unknown as EvaluationRow[];

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12">
      <PageHeading
        eyebrow="Judging"
        title="Your reviews"
        description="Only your own reviews — other judges' scores are never shown."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/events/$slug/judge" params={{ slug }}>
              Back to queue
            </Link>
          </Button>
        }
      />

      <div className="mt-8 space-y-4">
        {q.isLoading ? (
          <RowsSkeleton rows={4} />
        ) : q.isError ? (
          <ErrorBanner error={q.error} onRetry={() => void q.refetch()} />
        ) : !rows.length ? (
          <EmptyState
            title="No reviews yet"
            description="Reviews you submit will be listed here."
            action={
              <Button asChild>
                <Link to="/events/$slug/judge" params={{ slug }}>
                  Start judging
                </Link>
              </Button>
            }
          />
        ) : (
          rows.map((row) => (
            <div key={row.id} className="panel p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg">
                    {row.project?.title ?? row.project_title ?? "Project"}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.status === "submitted"
                      ? `Submitted ${formatDateTime(row.submitted_at)}`
                      : "Still in progress"}
                  </p>
                </div>
                <Badge variant={row.status === "submitted" ? "default" : "secondary"}>
                  {row.status === "submitted" ? "Submitted" : "In progress"}
                </Badge>
              </div>

              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">First impression</dt>
                  <dd className="font-medium">
                    {row.reaction ? REACTION_LABEL[row.reaction as Reaction] : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Send to finals?</dt>
                  <dd className="font-medium">
                    {row.final_preference
                      ? FINAL_PREFERENCE_LABEL[row.final_preference as FinalPreference]
                      : "—"}
                  </dd>
                </div>
              </dl>

              {row.tags?.length ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {row.tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {TAG_LABEL[tag as EvaluationTag] ?? tag}
                    </Badge>
                  ))}
                </div>
              ) : null}

              {row.comment ? (
                <p className="panel-quiet mt-4 p-4 text-sm text-muted-foreground">{row.comment}</p>
              ) : null}
            </div>
          ))
        )}
      </div>
    </main>
  );
}
