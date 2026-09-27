import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Scale, ScrollText } from "lucide-react";

import { CardGridSkeleton, EmptyState, ErrorBanner } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EVENT_STATUS_LABEL } from "@/lib/enums";
import { formatDate } from "@/lib/format";
import { eventsQuery } from "@/lib/queries";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Verdict — Hackathon judging that holds up" },
      {
        name: "description",
        content:
          "Browse live hackathons, submit your project, judge a calibrated queue, and publish results every organizer can trace back to a single answer.",
      },
      { property: "og:title", content: "Verdict — Hackathon judging that holds up" },
      {
        property: "og:description",
        content:
          "Browse live hackathons, submit projects, judge a calibrated queue, and publish explainable results.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { data: events, isLoading, isError, error, refetch } = useQuery(eventsQuery());

  return (
    <main>
      <section className="gradient-brand-soft relative overflow-hidden border-b border-border">
        <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:py-28">
          <div className="max-w-3xl animate-rise">
            <p className="eyebrow mb-4">Hackathon judging platform</p>
            <h1 className="font-display text-5xl leading-[1.05] sm:text-6xl">
              Judge projects,{" "}
              <span className="text-gradient-brand">not forms.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              One smooth review flow for judges. A serious control room for organizers.
              Every rank traceable to the exact answers behind it.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <a href="#events">
                  Browse events <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/organizer/events">Run an event</Link>
              </Button>
            </div>
          </div>

          <div className="mt-16 grid gap-5 sm:grid-cols-3">
            {[
              {
                icon: CheckCircle2,
                title: "A queue, not a spreadsheet",
                body: "React, score one criterion at a time, decide, reflect. Autosaved at every step.",
              },
              {
                icon: Scale,
                title: "Calibrated across judges",
                body: "Per-judge z-score normalization with weighted criteria — harsh and generous panels line up.",
              },
              {
                icon: ScrollText,
                title: "Explainable ranks",
                body: "Every score drills down to raw answers, weights, normalization and tie-breaks.",
              },
            ].map((f) => (
              <div key={f.title} className="panel p-6">
                <f.icon className="h-5 w-5 text-brand" />
                <h3 className="mt-4 font-display text-lg">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="events" className="mx-auto w-full max-w-7xl scroll-mt-20 px-5 py-16">
        <h2 className="font-display text-3xl">Events</h2>
        <p className="mt-2 text-muted-foreground">Public and joined events.</p>

        <div className="mt-8">
          {isLoading ? (
            <CardGridSkeleton count={3} />
          ) : isError ? (
            <ErrorBanner error={error} onRetry={() => void refetch()} />
          ) : !events?.length ? (
            <EmptyState
              title="No events yet"
              description="When an event is published it will appear here."
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => (
                <Link
                  key={event.id ?? event.slug}
                  to="/events/$slug"
                  params={{ slug: event.slug }}
                  className="panel group flex flex-col p-6 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-xl leading-snug">{event.name}</h3>
                    <Badge variant="secondary" className="shrink-0">
                      {EVENT_STATUS_LABEL[event.status] ?? event.status}
                    </Badge>
                  </div>
                  {event.tagline ? (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{event.tagline}</p>
                  ) : null}
                  <p className="mt-auto pt-5 text-xs text-muted-foreground">
                    Judging opens {formatDate(event.judging_opens_at)}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
