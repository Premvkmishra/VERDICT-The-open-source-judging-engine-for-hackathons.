import { queryOptions } from "@tanstack/react-query";

import { apiGet, apiGetList } from "./api";
import type {
  AuditEntry,
  Comment,
  JudgeFeedItem,
  PairwisePair,
  Prize,
  Project,
  ProjectRanking,
  Rubric,
  Team,
  Track,
  VerdictEvent,
} from "./types";

export const eventsQuery = () =>
  queryOptions({
    queryKey: ["events"],
    queryFn: () => apiGetList<VerdictEvent>("/events").then((r) => r.items),
  });

export const eventQuery = (slug: string) =>
  queryOptions({
    queryKey: ["event", slug],
    queryFn: () => apiGet<VerdictEvent>(`/events/${slug}`),
  });

export const tracksQuery = (slug: string) =>
  queryOptions({
    queryKey: ["tracks", slug],
    queryFn: () => apiGetList<Track>(`/events/${slug}/tracks`).then((r) => r.items),
  });

export const prizesQuery = (slug: string) =>
  queryOptions({
    queryKey: ["prizes", slug],
    queryFn: () => apiGetList<Prize>(`/events/${slug}/prizes`).then((r) => r.items),
  });

export const projectsQuery = (
  slug: string,
  params: {
    q?: string | undefined;
    track_id?: string | undefined;
    sort?: "newest" | "title" | undefined;
    page?: number | undefined;
  } = {},
) =>
  queryOptions({
    queryKey: ["projects", slug, params],
    queryFn: () => apiGetList<Project>(`/events/${slug}/projects`, params),
  });

export const projectQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["project", projectId],
    queryFn: () => apiGet<Project>(`/projects/${projectId}`),
  });

export const commentsQuery = (projectId: string) =>
  queryOptions({
    queryKey: ["comments", projectId],
    queryFn: () => apiGetList<Comment>(`/projects/${projectId}/comments`).then((r) => r.items),
  });

export const myTeamQuery = (slug: string) =>
  queryOptions({
    queryKey: ["team", "mine", slug],
    queryFn: () => apiGet<Team | null>(`/events/${slug}/teams/mine`),
    retry: false,
  });

export const rubricQuery = (slug: string) =>
  queryOptions({
    queryKey: ["rubric", slug],
    queryFn: () => apiGet<Rubric | null>(`/events/${slug}/rubric`),
  });

export const judgeFeedQuery = (slug: string) =>
  queryOptions({
    queryKey: ["judge", "feed", slug],
    queryFn: () => apiGet<JudgeFeedItem | null>(`/events/${slug}/judge/feed`),
    staleTime: 0,
    gcTime: 0,
  });

export const pairwiseNextQuery = (slug: string) =>
  queryOptions({
    queryKey: ["pairwise", "next", slug],
    queryFn: () => apiGet<PairwisePair | null>(`/events/${slug}/pairwise/next`),
    staleTime: 0,
  });

export const myEvaluationsQuery = (slug: string) =>
  queryOptions({
    queryKey: ["evaluations", "mine", slug],
    queryFn: () => apiGetList<Record<string, unknown>>(`/events/${slug}/evaluations/mine`).then((r) => r.items),
  });

export const resultsQuery = (slug: string) =>
  queryOptions({
    queryKey: ["results", slug],
    queryFn: () => apiGetList<ProjectRanking>(`/events/${slug}/results`).then((r) => r.items),
  });

export const explainQuery = (slug: string, projectId: string) =>
  queryOptions({
    queryKey: ["explain", slug, projectId],
    queryFn: () => apiGet<Record<string, unknown>>(`/events/${slug}/results/${projectId}/explain`),
  });

export const dashboardQuery = (slug: string) =>
  queryOptions({
    queryKey: ["dashboard", slug],
    queryFn: () => apiGet<Record<string, unknown>>(`/events/${slug}/dashboard/progress`),
  });

export const assignmentsQuery = (slug: string) =>
  queryOptions({
    queryKey: ["assignments", slug],
    queryFn: () => apiGetList<Record<string, unknown>>(`/events/${slug}/assignments`).then((r) => r.items),
  });

export const ballotQuery = (slug: string) =>
  queryOptions({
    queryKey: ["ballot", slug],
    queryFn: () => apiGetList<Project>(`/events/${slug}/vote/ballot`).then((r) => r.items),
    retry: false,
  });

export const auditQuery = (slug: string, page: number, action?: string) =>
  queryOptions({
    queryKey: ["audit", slug, page, action],
    queryFn: () => apiGetList<AuditEntry>(`/events/${slug}/audit`, { page, action }),
  });
