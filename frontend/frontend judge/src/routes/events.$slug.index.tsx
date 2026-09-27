import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Calendar, Gavel, Trophy, Users } from "lucide-react";

import { ErrorBanner, PageHeading, RowsSkeleton } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hasRole, useMe } from "@/lib/auth";
import { EVENT_STATUS_LABEL } from "@/lib/enums";
import { formatDateTime } from "@/lib/format";
import { eventQuery, prizesQuery, tracksQuery } from "@/lib/queries";

export const Route = createFileRoute("/events/$slug/")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} — Verdict` },
      { name: "description", content: `Event home for ${params.slug}: tracks, prizes, timeline, gallery and results.` },
      { property: "og:title", content: `${params.slug} — Verdict` },
      {
        property: "og:description",
        content: `Event home for ${params.slug}: tracks, prizes, timeline, gallery and results.`,
      },
    ],
  }),
  component: EventHome,
});

function EventHome() {
  const { slug } = Route.useParams();
  const { data: me } = useMe();
  const eventQ = useQuery(eventQuery(slug));
  const tracksQ = useQuery(tracksQuery(slug));
  const prizesQ = useQuery(prizesQuery(slug));

  const event = eventQ.data;
  const isJudge = hasRole(me, slug, "judge");
  const isOrganizer = hasRole(me, slug, "organizer");

  if (eventQ.isLoading) {
    return (
      <main className="mx-auto w-full max-w-5xl px-5 py-16">
        <RowsSkeleton rows={6} />
      </main>
    );
  }

  if (eventQ.isError || !event) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-16">
        <ErrorBanner
          error={eventQ.error}
          onRetry={() => void eventQ.refetch()}
          fallback="We couldn't load this event."
        />
      </main>
    );
  }

  const timeline = [
    { label: "Submissions open", value: event.submissions_open_at },
    { label: "Submissions close", value: event.submissions_close_at },
    { label: "Judging opens", value: event.judging_opens_at },
    { label: "Judging closes", value: event.judging_closes_at },
    { label: "Voting opens", value: event.voting_open_at },
    { label: "Voting closes", value: event.voting_close_at },
  ].filter((t) => t.value);

  return (
    <main>
      <section className="gradient-brand-soft border-b border-border">
        <div className="mx-auto w-full max-w-5xl px-5 py-16">
          <PageHeading
            eyebrow={EVENT_STATUS_LABEL[event.status] ?? event.status}
            title={event.name}
            description={event.tagline}
            actions={
              <>
                <Button asChild>
                  <Link to="/events/$slug/gallery" params={{ slug }}>
                    Gallery <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                {event.status === "results_published" ? (
                  <Button asChild variant="outline">
                    <Link to="/events/$slug/results" params={{ slug }}>
                      <Trophy className="mr-2 h-4 w-4" /> Results
                    </Link>
                  </Button>
                ) : null}
              </>
            }
          />

          <div className="mt-8 flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/events/$slug/team" params={{ slug }}>
                <Users className="mr-2 h-4 w-4" /> Team
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/events/$slug/submit" params={{ slug }}>
                Submit a project
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/events/$slug/vote" params={{ slug }}>
                Community vote
              </Link>
            </Button>
            {isJudge ? (
              <Button asChild size="sm">
                <Link to="/events/$slug/judge" params={{ slug }}>
                  <Gavel className="mr-2 h-4 w-4" /> Judge feed
                </Link>
              </Button>
            ) : null}
            {isOrganizer ? (
              <Button asChild size="sm" variant="secondary">
                <Link to="/organizer/events/$slug/dashboard" params={{ slug }}>
                  Control room
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-8 px-5 py-14 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-8">
          {event.description_md ? (
            <div className="panel p-7">
              <h2 className="font-display text-2xl">About</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {event.description_md}
              </p>
            </div>
          ) : null}

          <div className="panel p-7">
            <h2 className="font-display text-2xl">Tracks</h2>
            {tracksQ.isLoading ? (
              <RowsSkeleton rows={3} />
            ) : tracksQ.data?.length ? (
              <ul className="mt-4 space-y-3">
                {tracksQ.data.map((track) => (
                  <li key={track.id} className="panel-quiet p-4">
                    <p className="font-medium">{track.name}</p>
                    {track.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">{track.description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No tracks announced yet.</p>
            )}
          </div>

          <div className="panel p-7">
            <h2 className="font-display text-2xl">Prizes</h2>
            {prizesQ.isLoading ? (
              <RowsSkeleton rows={2} />
            ) : prizesQ.data?.length ? (
              <ul className="mt-4 space-y-3">
                {prizesQ.data.map((prize) => (
                  <li key={prize.id} className="panel-quiet p-4">
                    <p className="font-medium">{prize.name}</p>
                    {prize.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">{prize.description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No prizes announced yet.</p>
            )}
          </div>
        </div>

        <aside className="space-y-6">
          <div className="panel p-6">
            <h2 className="flex items-center gap-2 font-display text-lg">
              <Calendar className="h-4 w-4 text-brand" /> Timeline
            </h2>
            {timeline.length ? (
              <dl className="mt-4 space-y-3 text-sm">
                {timeline.map((t) => (
                  <div key={t.label} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t.label}</dt>
                    <dd className="text-right font-medium">{formatDateTime(t.value)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">Dates to be announced.</p>
            )}
          </div>

          <div className="panel p-6 text-sm">
            <h2 className="font-display text-lg">Judging</h2>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-muted-foreground">Reviews per project</span>
              <Badge variant="secondary">{event.min_reviews_per_project ?? "—"}</Badge>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-muted-foreground">Publish coverage gate</span>
              <Badge variant="secondary">
                {event.min_publish_coverage_pct != null ? `${event.min_publish_coverage_pct}%` : "—"}
              </Badge>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
