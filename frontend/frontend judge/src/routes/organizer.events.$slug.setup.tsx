import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { OrganizerGuard } from "@/components/organizer-guard";
import { OrganizerNav } from "@/components/organizer-nav";
import { ErrorBanner, PageHeading, RowsSkeleton } from "@/components/state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiDelete, apiPatch, apiPost } from "@/lib/api";
import { EVENT_STATUSES, EVENT_STATUS_LABEL, type EventStatus } from "@/lib/enums";
import { handleApiError } from "@/lib/errors";
import { eventQuery, prizesQuery, tracksQuery } from "@/lib/queries";

export const Route = createFileRoute("/organizer/events/$slug/setup")({
  head: ({ params }) => ({
    meta: [
      { title: `Setup — ${params.slug} — Verdict organizer` },
      { name: "description", content: `Dates, status, tracks and prizes for ${params.slug}.` },
      { property: "og:title", content: `Setup — ${params.slug}` },
      { property: "og:description", content: `Dates, status, tracks and prizes for ${params.slug}.` },
    ],
  }),
  component: () => {
    const { slug } = Route.useParams();
    return (
      <OrganizerGuard slug={slug}>
        <SetupPage slug={slug} />
      </OrganizerGuard>
    );
  },
});

const DATE_FIELDS = [
  ["submissions_open_at", "Submissions open"],
  ["submissions_close_at", "Submissions close"],
  ["judging_opens_at", "Judging opens"],
  ["judging_closes_at", "Judging closes"],
  ["voting_open_at", "Voting opens"],
  ["voting_close_at", "Voting closes"],
] as const;

function toLocalInput(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function SetupPage({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const eventQ = useQuery(eventQuery(slug));
  const tracksQ = useQuery(tracksQuery(slug));
  const prizesQ = useQuery(prizesQuery(slug));

  const [form, setForm] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<EventStatus>("draft");
  const [minReviews, setMinReviews] = useState("");
  const [minCoverage, setMinCoverage] = useState("");
  const [trackName, setTrackName] = useState("");
  const [prizeName, setPrizeName] = useState("");

  useEffect(() => {
    const e = eventQ.data;
    if (!e) return;
    setForm({
      name: e.name ?? "",
      tagline: e.tagline ?? "",
      description_md: e.description_md ?? "",
      ...Object.fromEntries(DATE_FIELDS.map(([key]) => [key, toLocalInput(e[key])])),
    });
    setStatus(e.status);
    setMinReviews(String(e.min_reviews_per_project ?? ""));
    setMinCoverage(String(e.min_publish_coverage_pct ?? ""));
  }, [eventQ.data]);

  const saveEvent = useMutation({
    mutationFn: async () =>
      apiPatch(`/events/${slug}`, {
        name: form['name'],
        tagline: form['tagline'] || null,
        description_md: form['description_md'] || null,
        status,
        ...Object.fromEntries(
          DATE_FIELDS.map(([key]) => [
            key,
            form[key] ? new Date(form[key]).toISOString() : null,
          ]),
        ),
        ...(minReviews ? { min_reviews_per_project: Number(minReviews) } : {}),
        ...(minCoverage ? { min_publish_coverage_pct: Number(minCoverage) } : {}),
      }),
    onSuccess: async () => {
      toast.success("Event settings saved");
      await queryClient.invalidateQueries({ queryKey: ["event", slug] });
    },
    onError: (e) => handleApiError(e, "We couldn't save the event."),
  });

  const addTrack = useMutation({
    mutationFn: () => apiPost(`/events/${slug}/tracks`, { name: trackName.trim() }),
    onSuccess: async () => {
      setTrackName("");
      await queryClient.invalidateQueries({ queryKey: ["tracks", slug] });
    },
    onError: (e) => handleApiError(e, "We couldn't add that track."),
  });

  const removeTrack = useMutation({
    mutationFn: (id: string) => apiDelete(`/tracks/${id}`),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["tracks", slug] }),
    onError: (e) => handleApiError(e, "We couldn't remove that track."),
  });

  const addPrize = useMutation({
    mutationFn: () => apiPost(`/events/${slug}/prizes`, { name: prizeName.trim() }),
    onSuccess: async () => {
      setPrizeName("");
      await queryClient.invalidateQueries({ queryKey: ["prizes", slug] });
    },
    onError: (e) => handleApiError(e, "We couldn't add that prize."),
  });

  const removePrize = useMutation({
    mutationFn: (id: string) => apiDelete(`/prizes/${id}`),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["prizes", slug] }),
    onError: (e) => handleApiError(e, "We couldn't remove that prize."),
  });

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-12">
      <PageHeading eyebrow="Organizer" title="Event setup" description={`/${slug}`} />
      <OrganizerNav slug={slug} className="mt-6" />

      {eventQ.isLoading ? (
        <div className="mt-8">
          <RowsSkeleton rows={6} />
        </div>
      ) : eventQ.isError ? (
        <ErrorBanner className="mt-8" error={eventQ.error} onRetry={() => void eventQ.refetch()} />
      ) : (
        <div className="mt-8 space-y-8">
          <section className="panel space-y-5 p-7">
            <h2 className="font-display text-2xl">Basics</h2>
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form['name'] ?? ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tagline">Tagline</Label>
              <Input
                id="tagline"
                value={form['tagline'] ?? ""}
                onChange={(e) => setForm({ ...form, tagline: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                rows={6}
                value={form['description_md'] ?? ""}
                onChange={(e) => setForm({ ...form, description_md: e.target.value })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as EventStatus)}>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {EVENT_STATUS_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="min-reviews">Min reviews per project</Label>
                <Input
                  id="min-reviews"
                  type="number"
                  min={1}
                  value={minReviews}
                  onChange={(e) => setMinReviews(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="min-coverage">Min publish coverage %</Label>
                <Input
                  id="min-coverage"
                  type="number"
                  min={0}
                  max={100}
                  value={minCoverage}
                  onChange={(e) => setMinCoverage(e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="panel space-y-5 p-7">
            <h2 className="font-display text-2xl">Timeline</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {DATE_FIELDS.map(([key, label]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{label}</Label>
                  <Input
                    id={key}
                    type="datetime-local"
                    value={form[key] ?? ""}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <Button onClick={() => saveEvent.mutate()} disabled={saveEvent.isPending}>
              {saveEvent.isPending ? "Saving…" : "Save event settings"}
            </Button>
          </section>

          <div className="grid gap-8 lg:grid-cols-2">
            <ListEditor
              title="Tracks"
              value={trackName}
              onChange={setTrackName}
              onAdd={() => trackName.trim() && addTrack.mutate()}
              pending={addTrack.isPending}
              loading={tracksQ.isLoading}
              items={(tracksQ.data ?? []).map((t) => ({ id: t.id, label: t.name }))}
              onRemove={(id) => removeTrack.mutate(id)}
            />
            <ListEditor
              title="Prizes"
              value={prizeName}
              onChange={setPrizeName}
              onAdd={() => prizeName.trim() && addPrize.mutate()}
              pending={addPrize.isPending}
              loading={prizesQ.isLoading}
              items={(prizesQ.data ?? []).map((p) => ({ id: p.id, label: p.name }))}
              onRemove={(id) => removePrize.mutate(id)}
            />
          </div>
        </div>
      )}
    </main>
  );
}

function ListEditor({
  title,
  value,
  onChange,
  onAdd,
  onRemove,
  items,
  pending,
  loading,
}: {
  title: string;
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  items: { id: string; label: string }[];
  pending?: boolean;
  loading?: boolean;
}) {
  return (
    <section className="panel space-y-4 p-7">
      <h2 className="font-display text-2xl">{title}</h2>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd();
        }}
      >
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={`Add a ${title.toLowerCase().replace(/s$/, "")}`} />
        <Button type="submit" size="icon" disabled={pending} aria-label={`Add ${title}`}>
          <Plus className="h-4 w-4" />
        </Button>
      </form>
      {loading ? (
        <RowsSkeleton rows={2} />
      ) : items.length ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="panel-quiet flex items-center justify-between gap-3 p-3">
              <span className="text-sm">{item.label}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${item.label}`}
                onClick={() => onRemove(item.id)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing added yet.</p>
      )}
    </section>
  );
}
