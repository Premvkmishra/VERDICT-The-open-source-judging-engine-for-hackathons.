import { Link } from "@tanstack/react-router";
import { ImageIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Project, Track } from "@/lib/types";

export function ProjectCard({
  project,
  slug,
  track,
}: {
  project: Project;
  slug: string;
  track?: Track | undefined;
}) {
  return (
    <Link
      to="/events/$slug/projects/$projectId"
      params={{ slug, projectId: project.id }}
      className="panel group block overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-surface">
        {project.cover_image_url ? (
          <img
            src={project.cover_image_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="gradient-brand-soft flex h-full w-full items-center justify-center">
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="space-y-2 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-display text-lg leading-snug">{project.title}</h3>
          {track ? (
            <Badge variant="secondary" className="shrink-0">
              {track.name}
            </Badge>
          ) : null}
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">{project.summary}</p>
      </div>
    </Link>
  );
}
