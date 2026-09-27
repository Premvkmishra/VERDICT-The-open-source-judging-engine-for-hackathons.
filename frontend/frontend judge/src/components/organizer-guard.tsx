import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { EmptyState, RowsSkeleton } from "@/components/state";
import { Button } from "@/components/ui/button";
import { hasRole, useMe } from "@/lib/auth";

/**
 * UX courtesy only — the backend refuses the underlying requests regardless.
 */
export function OrganizerGuard({ slug, children }: { slug: string; children: ReactNode }) {
  const { data: me, isLoading } = useMe();

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-5 py-12">
        <RowsSkeleton rows={4} />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-20">
        <EmptyState
          title="Sign in to continue"
          description="Organizer tools require an account with an organizer role on this event."
          action={
            <Button asChild>
              <Link to="/login">Log in</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (!hasRole(me, slug, "organizer")) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-20">
        <EmptyState
          title="You're not an organizer for this event"
          description="Ask an existing organizer to add you, or head back to the event page."
          action={
            <Button asChild variant="outline">
              <Link to="/events/$slug" params={{ slug }}>
                Back to event
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return <>{children}</>;
}
