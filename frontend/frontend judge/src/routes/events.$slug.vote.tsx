import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Heart } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorBanner, PageHeading, CardGridSkeleton } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiPost } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { ballotQuery } from "@/lib/queries";

export const Route = createFileRoute("/events/$slug/vote")({
  head: ({ params }) => ({
    meta: [
      { title: `Community vote — ${params.slug} — Verdict` },
      { name: "description", content: `Cast your community vote for the projects at ${params.slug}.` },
      { property: "og:title", content: `Community vote — ${params.slug}` },
      { property: "og:description", content: `Cast your community vote for the projects at ${params.slug}.` },
    ],
  }),
  component: VotePage,
});

function VotePage() {
  const { slug } = Route.useParams();
  const { data: me } = useMe();
  const ballotQ = useQuery(ballotQuery(slug));
  const [email, setEmail] = useState("");
  const [voted, setVoted] = useState<Record<string, boolean>>({});

  const castVote = useMutation({
    mutationFn: async (projectId: string) => {
      const voter_type = me ? "account" : email.trim() ? "email" : "link";
      await apiPost(`/events/${slug}/vote`, {
        project_id: projectId,
        voter_type,
        ...(voter_type === "email" ? { email: email.trim() } : {}),
      });
      return projectId;
    },
    onSuccess: (projectId) => {
      setVoted((v) => ({ ...v, [projectId]: true }));
      toast.success("Thanks — your vote is recorded");
    },
    onError: (error, projectId) => {
      if (error instanceof ApiError && error.code === "conflict") {
        setVoted((v) => ({ ...v, [projectId]: true }));
        toast.info("You've already voted for this project", {
          description: "Only one vote per project, per person.",
        });
        return;
      }
      if (error instanceof ApiError && error.code === "rate_limited") {
        toast.warning("That's a lot of votes at once", {
          description: "Give it a few seconds and try again.",
        });
        return;
      }
      toast.error("We couldn't record that vote", {
        description: error instanceof Error ? error.message : undefined,
      });
    },
  });

  const projects = ballotQ.data ?? [];

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-14">
      <PageHeading
        eyebrow="Community voting"
        title="Pick the projects you love"
        description="Projects are shown in a randomized order. One vote per project."
      />

      {!me ? (
        <div className="panel mt-8 max-w-md p-5">
          <Label htmlFor="voter-email">Your email (optional)</Label>
          <Input
            id="voter-email"
            type="email"
            className="mt-2"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Adding an email keeps your votes linked to you across devices.
          </p>
        </div>
      ) : null}

      <div className="mt-8">
        {ballotQ.isLoading ? (
          <CardGridSkeleton />
        ) : ballotQ.isError ? (
          ballotQ.error instanceof ApiError && ballotQ.error.status === 403 ? (
            <EmptyState
              title="Voting isn't open right now"
              description="Check the event timeline for when community voting opens."
            />
          ) : (
            <ErrorBanner error={ballotQ.error} onRetry={() => void ballotQ.refetch()} />
          )
        ) : !projects.length ? (
          <EmptyState title="No projects on the ballot yet" />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const done = voted[project.id];
              return (
                <div key={project.id} className="panel flex flex-col overflow-hidden">
                  {project.cover_image_url ? (
                    <img
                      src={project.cover_image_url}
                      alt=""
                      loading="lazy"
                      className="aspect-[16/9] w-full object-cover"
                    />
                  ) : (
                    <div className="gradient-brand-soft aspect-[16/9] w-full" />
                  )}
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="font-display text-lg leading-snug">{project.title}</h3>
                    <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{project.summary}</p>
                    <Button
                      className="mt-5 w-full"
                      variant={done ? "secondary" : "default"}
                      disabled={done || castVote.isPending}
                      onClick={() => castVote.mutate(project.id)}
                    >
                      {done ? (
                        <>
                          <Check className="mr-2 h-4 w-4" /> Thanks, recorded
                        </>
                      ) : (
                        <>
                          <Heart className="mr-2 h-4 w-4" /> Vote
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
