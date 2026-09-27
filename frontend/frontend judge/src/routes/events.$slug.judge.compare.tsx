import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Swords } from "lucide-react";
import { toast } from "sonner";

import { PairwiseCard } from "@/components/pairwise-card";
import { EmptyState, ErrorBanner, PageHeading, RowsSkeleton } from "@/components/state";
import { Button } from "@/components/ui/button";
import { ApiError, apiPost } from "@/lib/api";
import { pairwiseNextQuery } from "@/lib/queries";

export const Route = createFileRoute("/events/$slug/judge/compare")({
  head: ({ params }) => ({
    meta: [
      { title: `Head-to-head — ${params.slug} — Verdict` },
      { name: "description", content: `Occasional pairwise comparisons used only for tie-breaks at ${params.slug}.` },
      { property: "og:title", content: `Head-to-head — ${params.slug}` },
      {
        property: "og:description",
        content: `Occasional pairwise comparisons used only for tie-breaks at ${params.slug}.`,
      },
    ],
  }),
  component: ComparePage,
});

function ComparePage() {
  const { slug } = Route.useParams();
  const queryClient = useQueryClient();
  const pairQ = useQuery(pairwiseNextQuery(slug));

  const cast = useMutation({
    mutationFn: async (winnerId: string) => {
      const pair = pairQ.data;
      if (!pair) return;
      await apiPost(`/events/${slug}/pairwise`, {
        project_a_id: pair.project_a.id,
        project_b_id: pair.project_b.id,
        winner_project_id: winnerId,
      });
    },
    onSuccess: async () => {
      toast.success("Comparison recorded");
      await queryClient.invalidateQueries({ queryKey: ["pairwise", "next", slug] });
    },
    onError: () => toast.error("We couldn't record that comparison"),
  });

  const pair = pairQ.data;

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-12">
      <PageHeading
        eyebrow="Tie-break signal"
        title="Head-to-head"
        description="Comparisons never enter the score — they only break ties between projects that finish level."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/events/$slug/judge" params={{ slug }}>
              Back to queue
            </Link>
          </Button>
        }
      />

      <div className="mt-8">
        {pairQ.isLoading ? (
          <RowsSkeleton rows={4} />
        ) : pairQ.isError ? (
          pairQ.error instanceof ApiError && pairQ.error.status === 403 ? (
            <EmptyState title="You're not judging this event" />
          ) : (
            <ErrorBanner error={pairQ.error} onRetry={() => void pairQ.refetch()} />
          )
        ) : pair?.project_a && pair?.project_b ? (
          <PairwiseCard
            projectA={pair.project_a}
            projectB={pair.project_b}
            pending={cast.isPending}
            onPick={(id) => cast.mutate(id)}
          />
        ) : (
          <EmptyState
            icon={<Swords className="h-5 w-5" />}
            title="No comparison available right now"
            description="Pairs appear as more of the panel finishes reviewing. Keep working through your queue."
            action={
              <Button asChild>
                <Link to="/events/$slug/judge" params={{ slug }}>
                  Back to queue
                </Link>
              </Button>
            }
          />
        )}
      </div>
    </main>
  );
}
