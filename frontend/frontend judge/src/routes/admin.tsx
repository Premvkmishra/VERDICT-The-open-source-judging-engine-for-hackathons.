import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

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
import { isAdmin, useMe } from "@/lib/auth";
import { EVENT_STATUS_LABEL } from "@/lib/enums";
import { formatDate } from "@/lib/format";
import { eventsQuery } from "@/lib/queries";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Platform admin — Verdict" },
      { name: "description", content: "Platform-wide list of every event on Verdict." },
      { property: "og:title", content: "Platform admin — Verdict" },
      { property: "og:description", content: "Platform-wide list of every event on Verdict." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { data: me, isLoading } = useMe();
  const eventsQ = useQuery({ ...eventsQuery(), enabled: isAdmin(me) });

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-5xl px-5 py-14">
        <RowsSkeleton rows={4} />
      </main>
    );
  }

  if (!isAdmin(me)) {
    return (
      <main className="mx-auto w-full max-w-2xl px-5 py-20">
        <EmptyState
          title="Platform admins only"
          description="This area is limited to accounts with platform admin rights."
          action={
            <Button asChild variant="outline">
              <Link to="/">Go home</Link>
            </Button>
          }
        />
      </main>
    );
  }

  const events = eventsQ.data ?? [];

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-14">
      <PageHeading
        eyebrow="Platform admin"
        title="All events"
        description="Every event on the platform, regardless of your memberships."
      />

      <div className="mt-8">
        {eventsQ.isLoading ? (
          <RowsSkeleton rows={5} />
        ) : eventsQ.isError ? (
          <ErrorBanner error={eventsQ.error} onRetry={() => void eventsQ.refetch()} />
        ) : !events.length ? (
          <EmptyState title="No events on the platform yet" />
        ) : (
          <div className="panel overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Judging opens</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.slug}>
                    <TableCell className="font-medium">{event.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      /{event.slug}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {EVENT_STATUS_LABEL[event.status] ?? event.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(event.judging_opens_at)}</TableCell>
                    <TableCell>
                      <Link
                        to="/organizer/events/$slug/dashboard"
                        params={{ slug: event.slug }}
                        className="text-sm font-medium text-brand hover:underline"
                      >
                        Control room
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
