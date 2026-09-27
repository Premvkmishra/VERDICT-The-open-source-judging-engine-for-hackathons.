import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { OrganizerGuard } from "@/components/organizer-guard";
import { OrganizerNav } from "@/components/organizer-nav";
import { EmptyState, ErrorBanner, PageHeading, RowsSkeleton } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, humanize } from "@/lib/format";
import { auditQuery } from "@/lib/queries";

export const Route = createFileRoute("/organizer/events/$slug/audit")({
  head: ({ params }) => ({
    meta: [
      { title: `Audit trail — ${params.slug} — Verdict organizer` },
      { name: "description", content: `Every recorded action taken on ${params.slug}.` },
      { property: "og:title", content: `Audit trail — ${params.slug}` },
      { property: "og:description", content: `Every recorded action taken on ${params.slug}.` },
    ],
  }),
  component: () => {
    const { slug } = Route.useParams();
    return (
      <OrganizerGuard slug={slug}>
        <AuditPage slug={slug} />
      </OrganizerGuard>
    );
  },
});

function AuditPage({ slug }: { slug: string }) {
  const [page, setPage] = useState(1);
  const [actionInput, setActionInput] = useState("");
  const [action, setAction] = useState<string | undefined>(undefined);
  const q = useQuery(auditQuery(slug, page, action));
  const rows = q.data?.items ?? [];

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-12">
      <PageHeading
        eyebrow="Organizer"
        title="Audit trail"
        description="Who did what, and when — including every force-publish reason."
      />
      <OrganizerNav slug={slug} className="mt-6" />

      <form
        className="mt-8 flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setAction(actionInput.trim() || undefined);
        }}
      >
        <Input
          className="max-w-xs"
          placeholder="Filter by action…"
          value={actionInput}
          onChange={(e) => setActionInput(e.target.value)}
          aria-label="Filter by action"
        />
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      <div className="mt-6">
        {q.isLoading ? (
          <RowsSkeleton rows={8} />
        ) : q.isError ? (
          <ErrorBanner error={q.error} onRetry={() => void q.refetch()} />
        ) : !rows.length ? (
          <EmptyState title="Nothing logged yet" description="Actions on this event will appear here." />
        ) : (
          <>
            <div className="panel overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDateTime(entry.created_at)}
                      </TableCell>
                      <TableCell>{entry.actor_display_name ?? entry.actor_user_id?.slice(0, 8) ?? "—"}</TableCell>
                      <TableCell className="font-medium">{humanize(entry.action)}</TableCell>
                      <TableCell className="max-w-sm truncate font-mono text-xs text-muted-foreground">
                        {entry.details ? JSON.stringify(entry.details) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {page}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={rows.length === 0}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
