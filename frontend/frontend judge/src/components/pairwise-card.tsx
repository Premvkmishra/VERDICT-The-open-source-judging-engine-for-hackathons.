import { Swords } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { Project } from "@/lib/types";

/**
 * Head-to-head comparison. Deliberately styled with the `signal` accent, not
 * the brand gradient, so it never reads as "one more rubric question".
 */
export function PairwiseCard({
  projectA,
  projectB,
  onPick,
  onSkip,
  pending,
}: {
  projectA: Project;
  projectB: Project;
  onPick: (winnerId: string) => void;
  onSkip?: () => void;
  pending?: boolean;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <section className="animate-rise overflow-hidden rounded-2xl border-2 border-signal/40 bg-card shadow-card">
      <div className="gradient-signal px-6 py-5 text-signal-foreground">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
          <Swords className="h-4 w-4" /> Occasional head-to-head
        </p>
        <h2 className="mt-2 font-display text-2xl">Which of these two is stronger overall?</h2>
        <p className="mt-1 text-sm opacity-90">
          Separate from scoring — this only helps break ties.
        </p>
      </div>

      <div className="grid gap-4 p-6 md:grid-cols-2">
        {[projectA, projectB].map((project) => (
          <button
            key={project.id}
            type="button"
            disabled={pending}
            onMouseEnter={() => setHovered(project.id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onPick(project.id)}
            className={`flex flex-col rounded-xl border p-5 text-left transition-all duration-200 disabled:opacity-60 ${
              hovered === project.id
                ? "border-signal bg-signal-soft shadow-lift"
                : "border-border bg-surface"
            }`}
          >
            {project.cover_image_url ? (
              <img
                src={project.cover_image_url}
                alt=""
                className="mb-4 aspect-[16/9] w-full rounded-lg object-cover"
              />
            ) : null}
            <h3 className="font-display text-xl">{project.title}</h3>
            <p className="mt-2 flex-1 text-sm text-muted-foreground">{project.summary}</p>
            <span className="mt-4 text-sm font-semibold text-signal">Choose this one</span>
          </button>
        ))}
      </div>

      {onSkip ? (
        <div className="border-t border-border px-6 py-4">
          <Button variant="ghost" size="sm" onClick={onSkip} disabled={pending}>
            Skip this comparison
          </Button>
        </div>
      ) : null}
    </section>
  );
}
