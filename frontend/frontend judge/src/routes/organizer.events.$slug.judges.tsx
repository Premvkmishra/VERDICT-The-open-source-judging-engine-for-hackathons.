import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { OrganizerGuard } from "@/components/organizer-guard";
import { OrganizerNav } from "@/components/organizer-nav";
import { EmptyState, ErrorBanner, PageHeading, RowsSkeleton } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiPost } from "@/lib/api";
import { ASSIGNMENT_STATUS_LABEL, type AssignmentStatus } from "@/lib/enums";
import { handleApiError } from "@/lib/errors";
import { assignmentsQuery, projectsQuery } from "@/lib/queries";

export const Route = createFileRoute("/organizer/events/$slug/judges")({
  head: ({ params }) => ({
    meta: [
      { title: `Judges — ${params.slug} — Verdict organizer` },
      { name: "description", content: `Assign projects to judges and track the panel for ${params.slug}.` },
      { property: "og:title", content: `Judges — ${params.slug}` },
      { property: "og:description", content: `Assign projects to judges and track the panel for ${params.slug}.` },
    ],
  }),
  component: () => {
    const { slug } = Route.useParams();
    return (
      <OrganizerGuard slug={slug}>
        <JudgesPage slug={slug} />
      </OrganizerGuard>
    );
  },
});

interface AssignmentRow {
  id?: string;
  project_id?: string;
  judge_user_id?: string;
  status?: AssignmentStatus;
  judge_display_name?: string;
  project_title?: string;
  project?: { title?: string };
  judge?: { display_name?: string };
}

function JudgesPage({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const assignmentsQ = useQuery(assignmentsQuery(slug));
  const projectsQ = useQuery(projectsQuery(slug));

  const [judgeIds, setJudgeIds] = useState("");
  const [projectId, setProjectId] = useState("all");

  const rows = (assignmentsQ.data ?? []) as unknown as AssignmentRow[];
  const projects = projectsQ.data?.items ?? [];

  const assign = useMutation({
    mutationFn: async () => {
      const ids = judgeIds
        .split(/[\s,]+/)
        .map((v) => v.trim())
        .filter(Boolean);
      const targets = projectId === "all" ? projects.map((p) => p.id) : [projectId];
      const assignments = ids.flatMap((judge_user_id) =>
        targets.map((project_id) => ({ project_id, judge_user_id })),
      );
      if (!assignments.length) throw new Error("Add at least one judge ID and one project.");
      return apiPost(`/events/${slug}/assignments`, { assignments });
    },
    onSuccess: async () => {
      toast.success("Assignments created");
      setJudgeIds("");
      await queryClient.invalidateQueries({ queryKey: ["assignments", slug] });
    },
    onError: (e) => handleApiError(e, "We couldn't create those assignments."),
  });

  const byJudge = new Map<string, AssignmentRow[]>();
  for (const row of rows) {
    const key = row.judge_user_id ?? "unknown";
    byJudge.set(key, [...(byJudge.get(key) ?? []), row]);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-12">
      <PageHeading
        eyebrow="Organizer"
        title="Judging panel"
        description="Assign projects to judges in bulk and watch the queue drain."
      />
      <OrganizerNav slug={slug} className="mt-6" />

      <section className="panel mt-8 space-y-4 p-7">
        <h2 className="font-display text-2xl">Assign projects</h2>
        <div className="space-y-2">
          <Label htmlFor="judge-ids">Judge user IDs</Label>
          <Textarea
            id="judge-ids"
            rows={3}
            placeholder="One or more user IDs, separated by commas or new lines"
            value={judgeIds}
            onChange={(e) => setJudgeIds(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Judges join the event with their account; paste their user IDs here to build their queues.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="project-select">Projects</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger id="project-select" className="max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All submitted projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => assign.mutate()} disabled={assign.isPending || !judgeIds.trim()}>
          {assign.isPending ? "Assigning…" : "Create assignments"}
        </Button>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-2xl">Current assignments</h2>
        <div className="mt-4">
          {assignmentsQ.isLoading ? (
            <RowsSkeleton rows={5} />
          ) : assignmentsQ.isError ? (
            <ErrorBanner error={assignmentsQ.error} onRetry={() => void assignmentsQ.refetch()} />
          ) : !rows.length ? (
            <EmptyState
              title="No assignments yet"
              description="Once you assign projects, each judge's queue appears here."
            />
          ) : (
            <div className="panel overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Judge</TableHead>
                    <TableHead>Assigned</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>In progress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...byJudge.entries()].map(([judgeId, items]) => (
                    <TableRow key={judgeId}>
                      <TableCell className="font-medium">
                        {items[0]?.judge?.display_name ??
                          items[0]?.judge_display_name ??
                          judgeId.slice(0, 8)}
                      </TableCell>
                      <TableCell>{items.length}</TableCell>
                      <TableCell>
                        {items.filter((i) => i.status === "completed").length}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {ASSIGNMENT_STATUS_LABEL[
                            (items.find((i) => i.status !== "completed")?.status ??
                              "completed") as AssignmentStatus
                          ]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
