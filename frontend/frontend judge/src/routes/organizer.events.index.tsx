import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorBanner, PageHeading, RowsSkeleton } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiPost } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { EVENT_STATUS_LABEL } from "@/lib/enums";
import { handleApiError } from "@/lib/errors";
import { eventsQuery } from "@/lib/queries";
import type { VerdictEvent } from "@/lib/types";

export const Route = createFileRoute("/organizer/events/")({
  head: () => ({
    meta: [
      { title: "Your events — Verdict organizer" },
      { name: "description", content: "Create and manage the hackathons you organize on Verdict." },
      { property: "og:title", content: "Your events — Verdict organizer" },
      { property: "og:description", content: "Create and manage the hackathons you organize on Verdict." },
    ],
  }),
  component: OrganizerEvents,
});

function OrganizerEvents() {
  const { data: me, isLoading: meLoading } = useMe();
  const eventsQ = useQuery(eventsQuery());
  const queryClient = useQueryClient();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [tagline, setTagline] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiPost<VerdictEvent>("/events", {
        name: name.trim(),
        slug: slug.trim(),
        tagline: tagline.trim() || undefined,
      }),
    onSuccess: async (event) => {
      toast.success("Event created");
      setOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      if (event?.slug) {
        await router.navigate({ to: "/organizer/events/$slug/setup", params: { slug: event.slug } });
      }
    },
    onError: (e) => handleApiError(e, "We couldn't create that event."),
  });

  const organizerSlugs = new Set(
    (me?.memberships ?? []).filter((m) => m.role === "organizer").map((m) => m.event_slug),
  );
  const events = (eventsQ.data ?? []).filter(
    (e) => me?.user.is_platform_admin || organizerSlugs.has(e.slug),
  );

  if (meLoading) {
    return (
      <main className="mx-auto w-full max-w-5xl px-5 py-14">
        <RowsSkeleton rows={4} />
      </main>
    );
  }

  if (!me) {
    return (
      <main className="mx-auto w-full max-w-2xl px-5 py-20">
        <EmptyState
          title="Sign in to organize"
          description="Organizer tools need an account."
          action={
            <Button asChild>
              <Link to="/login">Log in</Link>
            </Button>
          }
        />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-14">
      <PageHeading
        eyebrow="Organizer"
        title="Your events"
        description="Everything you run, from setup through published results."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> New event
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create an event</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="event-name">Name</Label>
                  <Input
                    id="event-name"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!slug) {
                        setSlug(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "-")
                            .replace(/^-|-$/g, ""),
                        );
                      }
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-slug">URL slug</Label>
                  <Input id="event-slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="event-tagline">Tagline</Label>
                  <Textarea
                    id="event-tagline"
                    rows={2}
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => create.mutate()}
                  disabled={!name.trim() || !slug.trim() || create.isPending}
                >
                  {create.isPending ? "Creating…" : "Create event"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mt-8">
        {eventsQ.isLoading ? (
          <RowsSkeleton rows={4} />
        ) : eventsQ.isError ? (
          <ErrorBanner error={eventsQ.error} onRetry={() => void eventsQ.refetch()} />
        ) : !events.length ? (
          <EmptyState
            title="No events yet"
            description="Create your first event to set up tracks, a rubric and a judging panel."
          />
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <Link
                key={event.slug}
                to="/organizer/events/$slug/dashboard"
                params={{ slug: event.slug }}
                className="panel flex flex-wrap items-center gap-4 p-5 transition-shadow hover:shadow-lift"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-xl">{event.name}</h2>
                  <p className="text-sm text-muted-foreground">/{event.slug}</p>
                </div>
                <Badge variant="secondary">{EVENT_STATUS_LABEL[event.status] ?? event.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
