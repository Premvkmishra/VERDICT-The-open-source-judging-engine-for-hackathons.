import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";

import { ProjectCard } from "@/components/project-card";
import { CardGridSkeleton, EmptyState, ErrorBanner, PageHeading } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { projectsQuery, tracksQuery } from "@/lib/queries";

export const Route = createFileRoute("/events/$slug/gallery")({
  head: ({ params }) => ({
    meta: [
      { title: `Project gallery — ${params.slug} — Verdict` },
      {
        name: "description",
        content: `Browse every submitted project for ${params.slug}. Search by name and filter by track.`,
      },
      { property: "og:title", content: `Project gallery — ${params.slug}` },
      {
        property: "og:description",
        content: `Browse every submitted project for ${params.slug}.`,
      },
    ],
  }),
  component: GalleryPage,
});

function GalleryPage() {
  const { slug } = Route.useParams();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [trackId, setTrackId] = useState<string>("all");
  const [sort, setSort] = useState<"newest" | "title">("newest");

  const tracksQ = useQuery(tracksQuery(slug));
  const projectsQ = useQuery(
    projectsQuery(slug, {
      q: q || undefined,
      track_id: trackId === "all" ? undefined : trackId,
      sort,
    }),
  );

  const tracks = tracksQ.data ?? [];
  const projects = projectsQ.data?.items ?? [];

  return (
    <main className="mx-auto w-full max-w-7xl px-5 py-14">
      <PageHeading
        eyebrow="Public gallery"
        title="Projects"
        description="Everything submitted to this event."
      />

      <form
        className="mt-8 flex flex-wrap items-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(search.trim());
        }}
      >
        <div className="relative min-w-60 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search projects…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search projects"
          />
        </div>

        <Select value={trackId} onValueChange={setTrackId}>
          <SelectTrigger className="w-48" aria-label="Filter by track">
            <SelectValue placeholder="All tracks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tracks</SelectItem>
            {tracks.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => setSort(v as "newest" | "title")}>
          <SelectTrigger className="w-40" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="title">Title A–Z</SelectItem>
          </SelectContent>
        </Select>

        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <div className="mt-8">
        {projectsQ.isLoading ? (
          <CardGridSkeleton />
        ) : projectsQ.isError ? (
          <ErrorBanner error={projectsQ.error} onRetry={() => void projectsQ.refetch()} />
        ) : !projects.length ? (
          <EmptyState
            title="No projects match"
            description={q ? `Nothing found for “${q}”.` : "Submissions will appear here as they arrive."}
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                slug={slug}
                track={tracks.find((t) => t.id === project.track_id)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
