import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorBanner, PageHeading, RowsSkeleton } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, apiPost } from "@/lib/api";
import { useMe } from "@/lib/auth";
import { handleApiError } from "@/lib/errors";
import { myTeamQuery } from "@/lib/queries";

export const Route = createFileRoute("/events/$slug/team")({
  head: ({ params }) => ({
    meta: [
      { title: `Your team — ${params.slug} — Verdict` },
      { name: "description", content: `Create or join a team for ${params.slug} using an invite code.` },
      { property: "og:title", content: `Your team — ${params.slug}` },
      { property: "og:description", content: `Create or join a team for ${params.slug} using an invite code.` },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const { slug } = Route.useParams();
  const { data: me, isLoading: meLoading } = useMe();
  const queryClient = useQueryClient();
  const teamQ = useQuery({ ...myTeamQuery(slug), enabled: Boolean(me) });

  const [teamName, setTeamName] = useState("");
  const [code, setCode] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["team", "mine", slug] });

  const createTeam = useMutation({
    mutationFn: () => apiPost(`/events/${slug}/teams`, { name: teamName.trim() }),
    onSuccess: async () => {
      toast.success("Team created");
      setTeamName("");
      await refresh();
    },
    onError: (e) => handleApiError(e, "We couldn't create the team."),
  });

  const joinTeam = useMutation({
    mutationFn: () => apiPost(`/events/${slug}/teams/join`, { code: code.trim() }),
    onSuccess: async () => {
      toast.success("You've joined the team");
      setCode("");
      await refresh();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) {
        toast.error("That invite code isn't valid");
        return;
      }
      if (error instanceof ApiError && error.status === 409) {
        toast.error("That invite has expired or is fully used");
        return;
      }
      handleApiError(error, "We couldn't join that team.");
    },
  });

  const team = teamQ.data ?? null;

  const makeInvite = useMutation({
    mutationFn: async () => {
      const data = await apiPost<Record<string, unknown>>(`/teams/${team?.id}/invites`);
      return (data?.['code'] as string | undefined) ?? null;
    },
    onSuccess: (value) => {
      setInviteCode(value);
      if (value) toast.success("Invite code ready");
    },
    onError: (e) => handleApiError(e, "We couldn't create an invite."),
  });

  if (meLoading) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-14">
        <RowsSkeleton rows={4} />
      </main>
    );
  }

  if (!me) {
    return (
      <main className="mx-auto w-full max-w-2xl px-5 py-20">
        <EmptyState
          title="Sign in to manage your team"
          description="Teams are tied to your account."
          action={
            <Button asChild>
              <Link to="/login">Log in</Link>
            </Button>
          }
        />
      </main>
    );
  }

  const noTeamYet = !team || (teamQ.error instanceof ApiError && teamQ.error.status === 404);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-14">
      <PageHeading
        eyebrow="Participant"
        title="Your team"
        description="Create a team or join an existing one with an invite code."
      />

      <div className="mt-8 space-y-6">
        {teamQ.isLoading ? (
          <RowsSkeleton rows={3} />
        ) : team ? (
          <div className="panel p-7">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-brand" />
              <h2 className="font-display text-2xl">{team.name}</h2>
            </div>
            <ul className="mt-5 space-y-2">
              {(team.members ?? []).map((member) => (
                <li key={member.id} className="panel-quiet flex items-center gap-3 p-3 text-sm">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
                    {member.display_name?.slice(0, 1).toUpperCase()}
                  </span>
                  {member.display_name}
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button onClick={() => makeInvite.mutate()} disabled={makeInvite.isPending}>
                <UserPlus className="mr-2 h-4 w-4" />
                {makeInvite.isPending ? "Generating…" : "Create invite code"}
              </Button>
              <Button asChild variant="outline">
                <Link to="/events/$slug/submit" params={{ slug }}>
                  Go to submission
                </Link>
              </Button>
            </div>

            {inviteCode ? (
              <div className="panel-quiet mt-4 flex items-center justify-between gap-3 p-4">
                <code className="font-mono text-lg tracking-widest">{inviteCode}</code>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    void navigator.clipboard?.writeText(inviteCode);
                    toast.success("Copied");
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" /> Copy
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {noTeamYet ? (
          <div className="grid gap-6 md:grid-cols-2">
            <form
              className="panel space-y-3 p-6"
              onSubmit={(e) => {
                e.preventDefault();
                if (teamName.trim()) createTeam.mutate();
              }}
            >
              <h2 className="font-display text-xl">Create a team</h2>
              <div className="space-y-2">
                <Label htmlFor="team-name">Team name</Label>
                <Input id="team-name" value={teamName} onChange={(e) => setTeamName(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={createTeam.isPending}>
                {createTeam.isPending ? "Creating…" : "Create team"}
              </Button>
            </form>

            <form
              className="panel space-y-3 p-6"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.trim()) joinTeam.mutate();
              }}
            >
              <h2 className="font-display text-xl">Join a team</h2>
              <div className="space-y-2">
                <Label htmlFor="invite">Invite code</Label>
                <Input
                  id="invite"
                  value={code}
                  className="font-mono tracking-widest"
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <Button type="submit" variant="secondary" className="w-full" disabled={joinTeam.isPending}>
                {joinTeam.isPending ? "Joining…" : "Join team"}
              </Button>
            </form>
          </div>
        ) : null}

        {teamQ.isError && !(teamQ.error instanceof ApiError && teamQ.error.status === 404) ? (
          <ErrorBanner error={teamQ.error} onRetry={() => void teamQ.refetch()} />
        ) : null}
      </div>
    </main>
  );
}
