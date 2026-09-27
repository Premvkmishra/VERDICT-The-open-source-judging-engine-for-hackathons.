import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Github,
  PartyPopper,
  PlayCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { JudgeFeedSkeleton } from "@/components/judge-feed-skeleton";
import { PairwiseCard } from "@/components/pairwise-card";
import { EmptyState, ErrorBanner, PageHeading } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiPost } from "@/lib/api";
import {
  FINAL_PREFERENCES,
  FINAL_PREFERENCE_LABEL,
  REACTIONS,
  REACTION_LABEL,
  TAGS,
  TAG_LABEL,
  type EvaluationTag,
  type FinalPreference,
  type Reaction,
} from "@/lib/enums";
import { judgeFeedQuery, pairwiseNextQuery } from "@/lib/queries";
import type { EvaluationScoreInput, JudgeFeedItem, RubricCriterion } from "@/lib/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/events/$slug/judge/")({
  head: ({ params }) => ({
    meta: [
      { title: `Judge feed — ${params.slug} — Verdict` },
      { name: "description", content: `Review your assigned projects one at a time for ${params.slug}.` },
      { property: "og:title", content: `Judge feed — ${params.slug}` },
      { property: "og:description", content: `Review your assigned projects one at a time for ${params.slug}.` },
    ],
  }),
  component: JudgeFeedPage,
});

type DraftState = {
  reaction?: Reaction | undefined;
  final_preference?: FinalPreference | undefined;
  tags: EvaluationTag[];
  comment: string;
  scores: Record<string, number>;
};

const EMPTY_DRAFT: DraftState = { tags: [], comment: "", scores: {} };

function JudgeFeedPage() {
  const { slug } = Route.useParams();
  const queryClient = useQueryClient();
  const feedQ = useQuery(judgeFeedQuery(slug));

  const item = (feedQ.data ?? null) as JudgeFeedItem | null;
  const assignmentId = item?.assignment?.id ?? null;
  const criteria = useMemo(
    () =>
      [...(item?.rubric?.criteria ?? [])].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      ),
    [item],
  );

  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<unknown>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [showPairwise, setShowPairwise] = useState(false);
  const submittedCount = useRef(0);

  // Reset local answers whenever a new assignment arrives, rehydrating any
  // partial evaluation the server already has.
  useEffect(() => {
    if (!assignmentId) return;
    const existing = item?.evaluation;
    setDraft({
      reaction: (existing?.reaction as Reaction | undefined) ?? undefined,
      final_preference: (existing?.final_preference as FinalPreference | undefined) ?? undefined,
      tags: (existing?.tags as EvaluationTag[] | undefined) ?? [],
      comment: existing?.comment ?? "",
      scores: Object.fromEntries(
        (existing?.scores ?? []).map((s: EvaluationScoreInput) => [s.criterion_id, s.value]),
      ),
    });
    setStep(0);
    setStepError(null);
  }, [assignmentId, item]);

  const pairwiseQ = useQuery({ ...pairwiseNextQuery(slug), enabled: showPairwise });

  const autosave = useMutation({
    mutationFn: async (partial: Record<string, unknown>) =>
      apiPost(`/assignments/${assignmentId}/evaluation`, partial),
    onSuccess: () => setStepError(null),
    onError: (error) => setStepError(error),
  });

  const submitEvaluation = useMutation({
    mutationFn: async () => apiPost(`/assignments/${assignmentId}/evaluation/submit`),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 422) {
        setStepError(error);
        toast.error("Some rubric answers are still missing");
        return;
      }
      setStepError(error);
    },
    onSuccess: async () => {
      submittedCount.current += 1;
      setTransitioning(true);
      const wantsPairwise = submittedCount.current % 3 === 0;
      window.setTimeout(() => {
        void (async () => {
          if (wantsPairwise) setShowPairwise(true);
          await queryClient.invalidateQueries({ queryKey: ["judge", "feed", slug] });
          setTransitioning(false);
        })();
      }, 260);
    },
  });

  const castPairwise = useMutation({
    mutationFn: async (winnerId: string) => {
      const pair = pairwiseQ.data;
      if (!pair) return;
      await apiPost(`/events/${slug}/pairwise`, {
        project_a_id: pair.project_a.id,
        project_b_id: pair.project_b.id,
        winner_project_id: winnerId,
      });
    },
    onSuccess: () => {
      toast.success("Comparison recorded");
      setShowPairwise(false);
    },
    onError: () => {
      toast.error("We couldn't record that comparison");
      setShowPairwise(false);
    },
  });

  function save(partial: Record<string, unknown>) {
    if (!assignmentId) return;
    autosave.mutate(partial);
  }

  const scoresPayload = (scores: Record<string, number>): EvaluationScoreInput[] =>
    Object.entries(scores).map(([criterion_id, value]) => ({ criterion_id, value }));

  // ---- step plumbing -----------------------------------------------------
  const totalSteps = 3 + criteria.length + 1; // discover, react, criteria…, decide, reflect
  const criterionIndex = step - 2;
  const currentCriterion: RubricCriterion | undefined = criteria[criterionIndex];
  const isDiscover = step === 0;
  const isReact = step === 1;
  const isCriterion = criterionIndex >= 0 && criterionIndex < criteria.length;
  const isDecide = step === 2 + criteria.length;
  const isReflect = step === 3 + criteria.length;

  const next = () => setStep((s) => Math.min(s + 1, totalSteps - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  // ---- render ------------------------------------------------------------
  if (feedQ.isLoading || transitioning) {
    return (
      <Shell slug={slug}>
        <JudgeFeedSkeleton />
      </Shell>
    );
  }

  if (feedQ.isError) {
    const err = feedQ.error;
    if (err instanceof ApiError && err.status === 403) {
      return (
        <Shell slug={slug}>
          <EmptyState
            title="You're not judging this event"
            description="Ask an organizer to add you to the judging panel."
          />
        </Shell>
      );
    }
    return (
      <Shell slug={slug}>
        <ErrorBanner error={err} onRetry={() => void feedQ.refetch()} fallback="We couldn't load your queue." />
      </Shell>
    );
  }

  if (showPairwise && pairwiseQ.data?.project_a && pairwiseQ.data?.project_b) {
    return (
      <Shell slug={slug}>
        <PairwiseCard
          projectA={pairwiseQ.data.project_a}
          projectB={pairwiseQ.data.project_b}
          pending={castPairwise.isPending}
          onPick={(id) => castPairwise.mutate(id)}
          onSkip={() => setShowPairwise(false)}
        />
      </Shell>
    );
  }

  if (!item) {
    return (
      <Shell slug={slug}>
        <EmptyState
          icon={<PartyPopper className="h-5 w-5" />}
          title="You're all caught up"
          description={`${submittedCount.current} completed · 0 remaining. Thanks for judging carefully.`}
          action={
            <Button asChild variant="outline">
              <Link to="/events/$slug/judge/history" params={{ slug }}>
                Review your history
              </Link>
            </Button>
          }
        />
      </Shell>
    );
  }

  const project = item.project;

  return (
    <Shell slug={slug} completed={item.completed} remaining={item.remaining}>
      <article className="panel animate-rise overflow-hidden">
        {/* progress rail */}
        <div className="flex items-center gap-1 border-b border-border bg-surface px-6 py-3">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-colors",
                i < step ? "bg-brand" : i === step ? "bg-brand/60" : "bg-border",
              )}
            />
          ))}
        </div>

        <div className="p-7">
          {stepError ? (
            <ErrorBanner
              className="mb-5"
              error={stepError}
              fallback="That didn't save."
              onRetry={() => {
                setStepError(null);
                save({
                  ...(draft.reaction ? { reaction: draft.reaction } : {}),
                  ...(draft.final_preference ? { final_preference: draft.final_preference } : {}),
                  tags: draft.tags,
                  comment: draft.comment,
                  scores: scoresPayload(draft.scores),
                });
              }}
            />
          ) : null}

          {isDiscover ? (
            <div className="space-y-5">
              {project.cover_image_url ? (
                <img
                  src={project.cover_image_url}
                  alt=""
                  className="aspect-[16/7] w-full rounded-xl object-cover"
                />
              ) : null}
              <div>
                <p className="eyebrow">Discover</p>
                <h2 className="mt-2 font-display text-3xl">{project.title}</h2>
                <p className="mt-2 text-muted-foreground">{project.summary}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {project.repo_url ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={project.repo_url} target="_blank" rel="noreferrer noopener">
                      <Github className="mr-2 h-4 w-4" /> Repo
                    </a>
                  </Button>
                ) : null}
                {project.demo_url ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={project.demo_url} target="_blank" rel="noreferrer noopener">
                      <ExternalLink className="mr-2 h-4 w-4" /> Demo
                    </a>
                  </Button>
                ) : null}
                {project.video_url ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={project.video_url} target="_blank" rel="noreferrer noopener">
                      <PlayCircle className="mr-2 h-4 w-4" /> Video
                    </a>
                  </Button>
                ) : null}
              </div>
              {project.description_md ? (
                <div className="panel-quiet max-h-72 overflow-y-auto p-5">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {project.description_md}
                  </p>
                </div>
              ) : null}
              <Button size="lg" onClick={next}>
                Start review <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          ) : null}

          {isReact ? (
            <div className="space-y-5">
              <div>
                <p className="eyebrow">React</p>
                <h2 className="mt-2 font-display text-2xl">First impression</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Gut reaction — this never enters the score.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {REACTIONS.map((reaction) => (
                  <ChoiceChip
                    key={reaction}
                    label={REACTION_LABEL[reaction]}
                    selected={draft.reaction === reaction}
                    size="lg"
                    onClick={() => {
                      setDraft((d) => ({ ...d, reaction }));
                      save({ reaction });
                      window.setTimeout(next, 180);
                    }}
                  />
                ))}
              </div>
              <StepNav onBack={back} onNext={next} nextDisabled={!draft.reaction} />
            </div>
          ) : null}

          {isCriterion && currentCriterion ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="eyebrow">
                    Evaluate · {criterionIndex + 1} of {criteria.length}
                  </p>
                  <h2 className="mt-2 font-display text-2xl">{currentCriterion.label}</h2>
                  {currentCriterion.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">{currentCriterion.description}</p>
                  ) : null}
                </div>
                <Badge variant="secondary">weight {currentCriterion.weight}</Badge>
              </div>

              <div className="flex gap-1.5">
                {criteria.map((c, i) => (
                  <span
                    key={c.id}
                    className={cn(
                      "h-2 w-2 rounded-full",
                      draft.scores[c.id] !== undefined
                        ? "bg-brand"
                        : i === criterionIndex
                          ? "bg-brand/50"
                          : "bg-border",
                    )}
                  />
                ))}
              </div>

              <div className="grid gap-3">
                {range(currentCriterion.scale_min, currentCriterion.scale_max).map((value) => (
                  <ChoiceChip
                    key={value}
                    label={currentCriterion.option_labels?.[String(value)] ?? `Score ${value}`}
                    hint={String(value)}
                    selected={draft.scores[currentCriterion.id] === value}
                    onClick={() => {
                      const scores = { ...draft.scores, [currentCriterion.id]: value };
                      setDraft((d) => ({ ...d, scores }));
                      save({ scores: scoresPayload(scores) });
                      window.setTimeout(next, 180);
                    }}
                  />
                ))}
              </div>

              <StepNav
                onBack={back}
                onNext={next}
                nextDisabled={draft.scores[currentCriterion.id] === undefined}
              />
            </div>
          ) : null}

          {isDecide ? (
            <div className="space-y-5">
              <div>
                <p className="eyebrow">Decide</p>
                <h2 className="mt-2 font-display text-2xl">
                  If you could send only one project to the final round, would this be it?
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {FINAL_PREFERENCES.map((pref) => (
                  <ChoiceChip
                    key={pref}
                    label={FINAL_PREFERENCE_LABEL[pref]}
                    size="lg"
                    selected={draft.final_preference === pref}
                    onClick={() => {
                      setDraft((d) => ({ ...d, final_preference: pref }));
                      save({ final_preference: pref });
                      window.setTimeout(next, 180);
                    }}
                  />
                ))}
              </div>
              <StepNav onBack={back} onNext={next} nextDisabled={!draft.final_preference} />
            </div>
          ) : null}

          {isReflect ? (
            <div className="space-y-5">
              <div>
                <p className="eyebrow">Reflect</p>
                <h2 className="mt-2 font-display text-2xl">Anything worth noting?</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Optional. Tags and comments help organizers, not the score.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {TAGS.map((tag) => {
                  const selected = draft.tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => {
                        const tags = selected
                          ? draft.tags.filter((t) => t !== tag)
                          : [...draft.tags, tag];
                        setDraft((d) => ({ ...d, tags }));
                        save({ tags });
                      }}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                        selected
                          ? "border-brand bg-brand-soft text-brand"
                          : "border-border bg-surface text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {TAG_LABEL[tag]}
                    </button>
                  );
                })}
              </div>

              <Textarea
                rows={4}
                placeholder="A short note for the organizers…"
                value={draft.comment}
                onChange={(e) => setDraft((d) => ({ ...d, comment: e.target.value }))}
                onBlur={() => save({ comment: draft.comment })}
              />

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="ghost" onClick={back}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <Button
                  size="lg"
                  disabled={submitEvaluation.isPending}
                  onClick={() => {
                    save({ tags: draft.tags, comment: draft.comment });
                    submitEvaluation.mutate();
                  }}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {submitEvaluation.isPending ? "Submitting…" : "Submit review"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </article>
    </Shell>
  );
}

function Shell({
  slug,
  children,
  completed,
  remaining,
}: {
  slug: string;
  children: React.ReactNode;
  completed?: number | undefined;
  remaining?: number | undefined;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12">
      <PageHeading
        eyebrow="Judging"
        title="Your queue"
        description="One project at a time. Everything autosaves as you go."
        actions={
          <div className="flex items-center gap-2">
            {completed !== undefined ? <Badge variant="secondary">{completed} done</Badge> : null}
            {remaining !== undefined ? <Badge variant="outline">{remaining} left</Badge> : null}
            <Button asChild variant="ghost" size="sm">
              <Link to="/events/$slug/judge/history" params={{ slug }}>
                History
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/events/$slug/judge/compare" params={{ slug }}>
                Compare
              </Link>
            </Button>
          </div>
        }
      />
      <div className="mt-8">{children}</div>
    </main>
  );
}

function ChoiceChip({
  label,
  hint,
  selected,
  onClick,
  size = "md",
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
  size?: "md" | "lg";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl border text-left font-medium transition-all duration-200",
        size === "lg" ? "px-5 py-6 text-base" : "px-5 py-4 text-sm",
        selected
          ? "border-brand bg-brand-soft text-brand shadow-card"
          : "border-border bg-surface hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-card",
      )}
    >
      <span>{label}</span>
      {hint ? <span className="font-mono text-xs text-muted-foreground">{hint}</span> : null}
      {selected ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : null}
    </button>
  );
}

function StepNav({
  onBack,
  onNext,
  nextDisabled,
}: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>
      <Button variant="secondary" onClick={onNext} disabled={nextDisabled}>
        Continue <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

function range(min: number, max: number): number[] {
  const out: number[] = [];
  for (let i = min; i <= max; i += 1) out.push(i);
  return out;
}
