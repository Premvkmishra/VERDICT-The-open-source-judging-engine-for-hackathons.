import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RefreshCcw, Upload } from "lucide-react";
import { toast } from "sonner";

import { OrganizerGuard } from "@/components/organizer-guard";
import { OrganizerNav } from "@/components/organizer-nav";
import { EmptyState, ErrorBanner, PageHeading, RowsSkeleton } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, apiPost } from "@/lib/api";
import { flagLabel } from "@/lib/enums";
import { handleApiError } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { eventQuery, resultsQuery } from "@/lib/queries";

export const Route = createFileRoute("/organizer/events/$slug/results")({
  head: ({ params }) => ({
    meta: [
      { title: `Results — ${params.slug} — Verdict organizer` },
      { name: "description", content: `Compute normalization and publish rankings for ${params.slug}.` },
      { property: "og:title", content: `Results — ${params.slug} (organizer)` },
      { property: "og:description", content: `Compute normalization and publish rankings for ${params.slug}.` },
    ],
  }),
  component: () => {
    const { slug } = Route.useParams();
    return (
      <OrganizerGuard slug={slug}>
        <OrganizerResults slug={slug} />
      </OrganizerGuard>
    );
  },
});

function OrganizerResults({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const resultsQ = useQuery(resultsQuery(slug));
  const eventQ = useQuery(eventQuery(slug));

  const run = useMutation({
    mutationFn: () => apiPost(`/events/${slug}/normalization/run`),
    onSuccess: async () => {
      toast.success("Normalization run complete");
      await queryClient.invalidateQueries({ queryKey: ["results", slug] });
    },
    onError: (e) => handleApiError(e, "The normalization run didn't finish."),
  });

  const publish = useMutation({
    mutationFn: () => apiPost(`/events/${slug}/publish-results`, {}),
    onSuccess: async () => {
      toast.success("Results published");
      await queryClient.invalidateQueries({ queryKey: ["event", slug] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        toast.error("Coverage gate not met", {
          description: `${error.message} Use force-publish in the control room.`,
        });
        return;
      }
      handleApiError(error, "We couldn't publish results.");
    },
  });

  const rows = resultsQ.data ?? [];

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-12">
      <PageHeading
        eyebrow="Organizer"
        title="Rankings"
        description="The latest normalization run. Open any project to see the full chain behind its rank."
        actions={
          <>
            <Button variant="outline" onClick={() => run.mutate()} disabled={run.isPending}>
              <RefreshCcw className="mr-2 h-4 w-4" />
              {run.isPending ? "Computing…" : "Recompute"}
            </Button>
            <Button onClick={() => publish.mutate()} disabled={publish.isPending}>
              <Upload className="mr-2 h-4 w-4" />
              {eventQ.data?.status === "results_published" ? "Republish" : "Publish"}
            </Button>
          </>
        }
      />
      <OrganizerNav slug={slug} className="mt-6" />

      <div className="mt-8">
        {resultsQ.isLoading ? (
          <RowsSkeleton rows={6} />
        ) : resultsQ.isError ? (
          <ErrorBanner error={resultsQ.error} onRetry={() => void resultsQ.refetch()} />
        ) : !rows.length ? (
          <EmptyState
            title="No ranking yet"
            description="Run normalization once judges have submitted enough reviews."
          />
        ) : (
          <div className="panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Reviews</TableHead>
                  <TableHead>Official</TableHead>
                  <TableHead>Display</TableHead>
                  <TableHead>Rankable</TableHead>
                  <TableHead>Tie-break</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.project_id}>
                    <TableCell className="font-display text-lg">{row.rank ?? "—"}</TableCell>
                    <TableCell className="font-medium">
                      {row.project?.title ?? row.project_title ?? row.project_id.slice(0, 8)}
                    </TableCell>
                    <TableCell>{row.reviews_count}</TableCell>
                    <TableCell className="font-mono">{formatNumber(row.official_score, 4)}</TableCell>
                    <TableCell className="font-mono">{formatNumber(row.display_score, 1)}</TableCell>
                    <TableCell>
                      {row.is_rankable ? (
                        <Badge variant="secondary">Yes</Badge>
                      ) : (
                        <Badge variant="outline">Not rankable</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.tie_break_reason ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {(row.flags ?? []).map((f) => (
                          <Badge key={f} variant="outline">
                            {flagLabel(f)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/organizer/events/$slug/projects/$projectId/why"
                        params={{ slug, projectId: row.project_id }}
                        className="text-sm font-medium text-brand hover:underline"
                      >
                        Why?
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </main>
  );
}
