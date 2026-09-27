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
import { apiPut } from "@/lib/api";
import { handleApiError } from "@/lib/errors";
import { rubricQuery } from "@/lib/queries";

export const Route = createFileRoute("/organizer/events/$slug/rubric")({
  head: ({ params }) => ({
    meta: [
      { title: `Rubric — ${params.slug} — Verdict organizer` },
      { name: "description", content: `Build the scoring rubric judges will answer for ${params.slug}.` },
      { property: "og:title", content: `Rubric — ${params.slug}` },
      { property: "og:description", content: `Build the scoring rubric judges will answer for ${params.slug}.` },
    ],
  }),
  component: () => {
    const { slug } = Route.useParams();
    return (
      <OrganizerGuard slug={slug}>
        <RubricPage slug={slug} />
      </OrganizerGuard>
    );
  },
});

interface DraftCriterion {
  key: string;
  label: string;
  weight: number;
  scale_min: number;
  scale_max: number;
  option_labels: Record<string, string>;
}

function blankCriterion(index: number): DraftCriterion {
  return {
    key: `criterion_${index + 1}`,
    label: "",
    weight: 1,
    scale_min: 1,
    scale_max: 4,
    option_labels: { "1": "", "2": "", "3": "", "4": "" },
  };
}

function RubricPage({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const rubricQ = useQuery(rubricQuery(slug));
  const [name, setName] = useState("Judging rubric");
  const [criteria, setCriteria] = useState<DraftCriterion[]>([]);

  useEffect(() => {
    const rubric = rubricQ.data;
    if (!rubric) return;
    setName(rubric.name ?? "Judging rubric");
    setCriteria(
      (rubric.criteria ?? []).map((c) => ({
        key: c.key,
        label: c.label,
        weight: c.weight,
        scale_min: c.scale_min,
        scale_max: c.scale_max,
        option_labels: c.option_labels ?? {},
      })),
    );
  }, [rubricQ.data]);

  const save = useMutation({
    mutationFn: () => apiPut(`/events/${slug}/rubric`, { name, criteria }),
    onSuccess: async () => {
      toast.success("Rubric saved");
      await queryClient.invalidateQueries({ queryKey: ["rubric", slug] });
    },
    onError: (e) => handleApiError(e, "We couldn't save the rubric."),
  });

  function update(index: number, patch: Partial<DraftCriterion>) {
    setCriteria((list) =>
      list.map((c, i) => {
        if (i !== index) return c;
        const nextC = { ...c, ...patch };
        if (patch.scale_min !== undefined || patch.scale_max !== undefined) {
          const labels: Record<string, string> = {};
          for (let v = nextC.scale_min; v <= nextC.scale_max; v += 1) {
            labels[String(v)] = nextC.option_labels[String(v)] ?? "";
          }
          nextC.option_labels = labels;
        }
        return nextC;
      }),
    );
  }

  const totalWeight = criteria.reduce((sum, c) => sum + (Number(c.weight) || 0), 0);

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-12">
      <PageHeading
        eyebrow="Organizer"
        title="Rubric builder"
        description="Each criterion has its own scale and option labels. Weights are normalized at scoring time."
        actions={
          <Button onClick={() => save.mutate()} disabled={save.isPending || !criteria.length}>
            {save.isPending ? "Saving…" : "Save rubric"}
          </Button>
        }
      />
      <OrganizerNav slug={slug} className="mt-6" />

      {rubricQ.isLoading ? (
        <div className="mt-8">
          <RowsSkeleton rows={5} />
        </div>
      ) : rubricQ.isError ? (
        <ErrorBanner className="mt-8" error={rubricQ.error} onRetry={() => void rubricQ.refetch()} />
      ) : (
        <div className="mt-8 space-y-6">
          <div className="panel flex flex-wrap items-end gap-4 p-6">
            <div className="min-w-60 flex-1 space-y-2">
              <Label htmlFor="rubric-name">Rubric name</Label>
              <Input id="rubric-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <p className="text-sm text-muted-foreground">
              Total weight <span className="font-mono text-foreground">{totalWeight}</span>
            </p>
          </div>

          {criteria.map((criterion, index) => (
            <section key={index} className="panel space-y-5 p-6">
              <div className="flex items-start justify-between gap-4">
                <h2 className="font-display text-xl">Criterion {index + 1}</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove criterion"
                  onClick={() => setCriteria((list) => list.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Label</Label>
                  <Input
                    value={criterion.label}
                    placeholder="Does it work?"
                    onChange={(e) => update(index, { label: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Key</Label>
                  <Input
                    value={criterion.key}
                    onChange={(e) => update(index, { key: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Weight</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min={0}
                    value={criterion.weight}
                    onChange={(e) => update(index, { weight: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Scale min</Label>
                  <Input
                    type="number"
                    value={criterion.scale_min}
                    onChange={(e) => update(index, { scale_min: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Scale max</Label>
                  <Input
                    type="number"
                    value={criterion.scale_max}
                    onChange={(e) => update(index, { scale_max: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Option labels</Label>
                <div className="space-y-2">
                  {Object.keys(criterion.option_labels)
                    .sort((a, b) => Number(a) - Number(b))
                    .map((value) => (
                      <div key={value} className="flex items-center gap-3">
                        <span className="w-8 shrink-0 text-center font-mono text-sm text-muted-foreground">
                          {value}
                        </span>
                        <Input
                          value={criterion.option_labels[value] ?? ""}
                          placeholder={`Label shown for ${value}`}
                          onChange={(e) =>
                            update(index, {
                              option_labels: {
                                ...criterion.option_labels,
                                [value]: e.target.value,
                              },
                            })
                          }
                        />
                      </div>
                    ))}
                </div>
              </div>
            </section>
          ))}

          <Button
            variant="outline"
            onClick={() => setCriteria((list) => [...list, blankCriterion(list.length)])}
          >
            <Plus className="mr-2 h-4 w-4" /> Add criterion
          </Button>
        </div>
      )}
    </main>
  );
}
