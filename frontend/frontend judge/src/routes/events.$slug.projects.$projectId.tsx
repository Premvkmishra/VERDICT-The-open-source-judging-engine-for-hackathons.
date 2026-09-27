import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, Github, MessageSquare, PlayCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ErrorBanner, PageHeading, RowsSkeleton } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiPost } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { formatDateTime } from "@/lib/format";
import { commentsQuery, projectQuery, tracksQuery } from "@/lib/queries";

export const Route = createFileRoute("/events/$slug/projects/$projectId")({
  head: ({ params }) => ({
    meta: [
      { title: `Project — ${params.slug} — Verdict` },
      { name: "description", content: `Project detail, links and discussion for an entry in ${params.slug}.` },
      { property: "og:title", content: `Project — ${params.slug}` },
      { property: "og:description", content: `Project detail, links and discussion for an entry in ${params.slug}.` },
    ],
  }),
  component: ProjectDetail,
});

function ProjectDetail() {
  const { slug, projectId } = Route.useParams();
  const projectQ = useQuery(projectQuery(projectId));
  const tracksQ = useQuery(tracksQuery(slug));

  const project = projectQ.data;
  const track = tracksQ.data?.find((t) => t.id === project?.track_id);

  if (projectQ.isLoading) {
    return (
      <main className="mx-auto w-full max-w-4xl px-5 py-14">
        <RowsSkeleton rows={6} />
      </main>
    );
  }

  if (projectQ.isError || !project) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-14">
        <ErrorBanner
          error={projectQ.error}
          onRetry={() => void projectQ.refetch()}
          fallback="We couldn't load this project."
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-5 py-14">
      <Link
        to="/events/$slug/gallery"
        params={{ slug }}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to gallery
      </Link>

      {project.cover_image_url ? (
        <img
          src={project.cover_image_url}
          alt=""
          className="mt-6 aspect-[16/7] w-full rounded-xl object-cover shadow-card"
        />
      ) : null}

      <PageHeading
        className="mt-8"
        eyebrow={track?.name}
        title={project.title}
        description={project.summary}
      />

      <div className="mt-6 flex flex-wrap gap-2">
        {project.repo_url ? (
          <Button asChild variant="outline" size="sm">
            <a href={project.repo_url} target="_blank" rel="noreferrer noopener">
              <Github className="mr-2 h-4 w-4" /> Repository
            </a>
          </Button>
        ) : null}
        {project.demo_url ? (
          <Button asChild variant="outline" size="sm">
            <a href={project.demo_url} target="_blank" rel="noreferrer noopener">
              <ExternalLink className="mr-2 h-4 w-4" /> Live demo
            </a>
          </Button>
        ) : null}
        {project.video_url ? (
          <Button asChild variant="outline" size="sm">
            <a href={project.video_url} target="_blank" rel="noreferrer noopener">
              <PlayCircle className="mr-2 h-4 w-4" /> Video
            </a>
          </Button>
        ) : null}
        {project.status === "disqualified" ? (
          <Badge variant="destructive">Disqualified</Badge>
        ) : null}
      </div>

      {project.description_md ? (
        <div className="panel mt-8 p-7">
          <h2 className="font-display text-2xl">Description</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {project.description_md}
          </p>
        </div>
      ) : null}

      <CommentsSection projectId={projectId} />
    </main>
  );
}

function CommentsSection({ projectId }: { projectId: string }) {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const commentsQ = useQuery(commentsQuery(projectId));
  const [body, setBody] = useState("");
  const [authorName, setAuthorName] = useState("");

  const post = useMutation({
    mutationFn: async () =>
      apiPost(`/projects/${projectId}/comments`, {
        body: body.trim(),
        ...(me ? {} : { author_display_name: authorName.trim() || "Guest" }),
      }),
    onSuccess: async () => {
      setBody("");
      toast.success("Comment posted");
      await queryClient.invalidateQueries({ queryKey: ["comments", projectId] });
    },
    onError: (error) => handleApiError(error, "We couldn't post your comment."),
  });

  return (
    <section className="panel mt-8 p-7">
      <h2 className="flex items-center gap-2 font-display text-2xl">
        <MessageSquare className="h-5 w-5 text-brand" /> Discussion
      </h2>

      <form
        className="mt-5 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) post.mutate();
        }}
      >
        {!me ? (
          <div className="space-y-2">
            <Label htmlFor="author">Your name</Label>
            <Input
              id="author"
              value={authorName}
              placeholder="Guest"
              onChange={(e) => setAuthorName(e.target.value)}
            />
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="comment-body">Comment</Label>
          <Textarea
            id="comment-body"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share feedback with the team…"
          />
        </div>
        <Button type="submit" disabled={!body.trim() || post.isPending}>
          {post.isPending ? "Posting…" : "Post comment"}
        </Button>
      </form>

      <div className="mt-8 space-y-4">
        {commentsQ.isLoading ? (
          <RowsSkeleton rows={3} />
        ) : commentsQ.isError ? (
          <ErrorBanner error={commentsQ.error} onRetry={() => void commentsQ.refetch()} />
        ) : !commentsQ.data?.length ? (
          <p className="text-sm text-muted-foreground">No comments yet — be the first.</p>
        ) : (
          commentsQ.data.map((comment) => (
            <div key={comment.id} className="panel-quiet p-4">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{comment.author_display_name ?? "Guest"}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(comment.created_at)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{comment.body}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
