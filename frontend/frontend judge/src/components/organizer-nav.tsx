import { Link } from "@tanstack/react-router";

import { cn } from "@/lib/utils";

const TABS = [
  { to: "/organizer/events/$slug/setup", label: "Setup" },
  { to: "/organizer/events/$slug/rubric", label: "Rubric" },
  { to: "/organizer/events/$slug/judges", label: "Judges" },
  { to: "/organizer/events/$slug/dashboard", label: "Control room" },
  { to: "/organizer/events/$slug/results", label: "Results" },
  { to: "/organizer/events/$slug/audit", label: "Audit" },
  { to: "/organizer/events/$slug/export", label: "Export" },
] as const;

export function OrganizerNav({ slug, className }: { slug: string; className?: string }) {
  return (
    <nav
      className={cn(
        "flex gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1",
        className,
      )}
    >
      {TABS.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          params={{ slug }}
          className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          activeProps={{ className: "bg-card text-foreground shadow-card" }}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
