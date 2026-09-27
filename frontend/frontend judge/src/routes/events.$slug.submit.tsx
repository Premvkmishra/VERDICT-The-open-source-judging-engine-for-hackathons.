import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorBanner, PageHeading, RowsSkeleton } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiGetList, apiPatch, apiPost } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { PROJECT_STATUS_LABEL } from "@/lib/enums";
import { handleApiError } from "@/lib/errors";
import { eventQuery, myTeamQuery, tracksQuery } from "@/lib/queries";
import type { Project } from "@/lib/types";

export const Route = createFileRoute("/events/$slug/submit")({
  head: ({ params }) => ({
    meta: [
      { title: `Submit your project — ${params.slug} — Verdict` },
      { name: "description", content: `Draft, edit and submit your team's project for ${params.slug}.` },
      { property: "og:title", content: `Submit your project — ${params.slug}` },
      { property: "og:description", content: `Draft, edit and submit your team's project for ${params.slug}.` },
    ],
  }),
  component: SubmitPage,
});

interface FormState {
  title: string;
  summary: string;
  description_md: string;
  repo_url: string;
  demo_url: string;
  video_url: string;
  track_id: string;
}

const EMPTY: FormState = {
  title: "",
  summary: "",
  description_md: "",
  repo_url: "",
  demo_url: "",
  video_url: "",
  track_id: "none",
};

function SubmitPage() {
  const { slug } = Route.useParams();
  const { data: me, isLoading: meLoading } = useMe();
  const queryClient = useQueryClient();

  const eventQ = useQuery(eventQuery(slug));
  const tracksQ = useQuery(tracksQuery(slug));
  const teamQ = useQuery({ ...myTeamQuery(slug), enabled: Boolean(me) });
  const team = teamQ.data ?? null;

  const existingQ = useQuery({
    queryKey: ["my-project", slug, team?.id],
    enabled: Boolean(team?.id),
    queryFn: async () => {
      const { items } = await apiGetList<Project>(`/events/${slug}/projects`);
      return items.find((p) => p.team_id === team?.id) ?? null;
    },
  });
  const project = existingQ.data ?? null;

  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (!project) return;
    setForm({
      title: project.title ?? "",
      summary: project.summary ?? "",
      description_md: project.description_md ?? "",
      repo_url: project.repo_url ?? "",
      demo_url: project.demo_url ?? "",
      video_url: project.video_url ?? "",
      track_id: project.track_id ?? "none",
    });
  }, [project]);

  function payload() {
    return {
      title: form.title.trim(),
      summary: form.summary.trim(),
      description_md: form.description_md.trim() || undefined,
      repo_url: form.repo_url.trim() || undefined,
      demo_url: form.demo_url.trim() || undefined,
      video_url: form.video_url.trim() || undefined,
      ...(form.track_id !== "none" ? { track_id: form.track_id } : {}),
    };
  }

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["my-project", slug, team?.id] });
    await queryClient.invalidateQueries({ queryKey: ["projects", slug] });
  };

  const save = useMutation({
    mutationFn: async () =>
      project ? apiPatch(`/projects/${project.id}`, payload()) : apiPost(`/events/${slug}/projects`, payload()),
    onSuccess: async () => {
      toast.success("Saved");
      await invalidate();
    },
    onError: (error) => {
      if (error instanceof ApiError && (error.code === "deadline_passed" || error.status === 409)) {
        toast.error("The submission deadline has passed", { description: error.message });
        return;
      }
      handleApiError(error, "We couldn't save your project.");
    },
  });

  const submitProject = useMutation({
    mutationFn: async () => apiPost(`/projects/${project?.id}/submit`),
    onSuccess: async () => {
      toast.success("Project submitted");
      await invalidate();
    },
    onError: (error) => {
      if (error instanceof ApiError && (error.code === "deadline_passed" || error.status === 409)) {
        toast.error("The submission deadline has passed", { description: error.message });
        return;
      }
      handleApiError(error, "We couldn't submit your project.");
    },
  });

  if (meLoading || teamQ.isLoading) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-14">
        <RowsSkeleton rows={6} />
      </main>
    );
  }

  if (!me) {
    return (
      <main className="mx-auto w-full max-w-2xl px-5 py-20">
        <EmptyState
          title="Sign in to submit"
          description="Submissions belong to a team on your account."
          action={
            <Button asChild>
              <Link to="/login">Log in</Link>
            </Button>
          }
        />
      </main>
    );
  }

  if (!team) {
    return (
      <main className="mx-auto w-full max-w-2xl px-5 py-20">
        <EmptyState
          title="You need a team first"
          description="Create a team or join one with an invite code, then come back to submit."
          action={
            <Button asChild>
              <Link to="/events/$slug/team" params={{ slug }}>
                Go to teams
              </Link>
            </Button>
          }
        />
      </main>
    );
  }

  const closed =
    eventQ.data?.status === "submissions_closed" ||
    eventQ.data?.status === "judging_open" ||
    eventQ.data?.status === "judging_closed" ||
    eventQ.data?.status === "results_published";

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-14">
      <PageHeading
        eyebrow={team.name}
        title="Your submission"
        description="Saved as a draft. You can keep editing until the deadline."
        actions={
          project ? (
            <Badge variant={project.status === "submitted" ? "default" : "secondary"}>
              {PROJECT_STATUS_LABEL[project.status]}
            </Badge>
          ) : null
        }
      />

      {closed ? (
        <div className="panel-quiet mt-6 p-4 text-sm text-muted-foreground">
          Submissions are closed for this event. The server will reject further changes.
        </div>
      ) : null}

      {existingQ.isError ? (
        <ErrorBanner className="mt-6" error={existingQ.error} onRetry={() => void existingQ.refetch()} />
      ) : null}

      <form
        className="panel mt-8 space-y-5 p-7"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="summary">One-line summary *</Label>
          <Input
            id="summary"
            required
            maxLength={200}
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="track">Track</Label>
          <Select value={form.track_id} onValueChange={(v) => setForm({ ...form, track_id: v })}>
            <SelectTrigger id="track">
              <SelectValue placeholder="No track" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No track</SelectItem>
              {(tracksQ.data ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Full description</Label>
          <Textarea
            id="description"
            rows={8}
            value={form.description_md}
            onChange={(e) => setForm({ ...form, description_md: e.target.value })}
            placeholder="What it does, how you built it, what's next…"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["repo_url", "Repository URL"],
              ["demo_url", "Demo URL"],
              ["video_url", "Video URL"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                type="url"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : project ? "Save changes" : "Create draft"}
          </Button>
          {project && project.status === "draft" ? (
            <Button
              type="button"
              variant="secondary"
              disabled={submitProject.isPending}
              onClick={() => submitProject.mutate()}
            >
              {submitProject.isPending ? "Submitting…" : "Submit project"}
            </Button>
          ) : null}
          {project ? (
            <Button asChild variant="ghost">
              <Link to="/events/$slug/projects/$projectId" params={{ slug, projectId: project.id }}>
                View public page
              </Link>
            </Button>
          ) : null}
        </div>
      </form>
    </main>
  );
}
