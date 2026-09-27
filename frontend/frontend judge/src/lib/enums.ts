/**
 * Canonical enum values from ENUMS.md — these strings are frozen and shared
 * with the backend. Display labels are a frontend-only mapping *from* them.
 */

export const REACTIONS = ["not_convinced", "interesting", "stands_out"] as const;
export type Reaction = (typeof REACTIONS)[number];
export const REACTION_LABEL: Record<Reaction, string> = {
  not_convinced: "Not convinced",
  interesting: "Interesting",
  stands_out: "Stands out",
};

export const FINAL_PREFERENCES = ["no", "maybe", "yes"] as const;
export type FinalPreference = (typeof FINAL_PREFERENCES)[number];
export const FINAL_PREFERENCE_LABEL: Record<FinalPreference, string> = {
  no: "No",
  maybe: "Maybe",
  yes: "Yes",
};

export const TAGS = [
  "great_execution",
  "clever_idea",
  "strong_impact",
  "beautiful_ux",
  "technically_impressive",
  "very_original",
  "needs_more_polish",
] as const;
export type EvaluationTag = (typeof TAGS)[number];
export const TAG_LABEL: Record<EvaluationTag, string> = {
  great_execution: "Great execution",
  clever_idea: "Clever idea",
  strong_impact: "Strong impact",
  beautiful_ux: "Beautiful UX",
  technically_impressive: "Technically impressive",
  very_original: "Very original",
  needs_more_polish: "Needs more polish",
};

export const EVENT_STATUSES = [
  "draft",
  "upcoming",
  "submissions_open",
  "submissions_closed",
  "judging_open",
  "judging_closed",
  "results_published",
  "archived",
] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Draft",
  upcoming: "Upcoming",
  submissions_open: "Submissions open",
  submissions_closed: "Submissions closed",
  judging_open: "Judging open",
  judging_closed: "Judging closed",
  results_published: "Results published",
  archived: "Archived",
};

export type ProjectStatus = "draft" | "submitted" | "disqualified";
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  disqualified: "Disqualified",
};

export type AssignmentStatus = "pending" | "in_progress" | "completed";
export const ASSIGNMENT_STATUS_LABEL: Record<AssignmentStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
};

export type EvaluationStatus = "in_progress" | "submitted";

export type MembershipRole = "organizer" | "judge" | "participant";

export type VoterType = "email" | "link" | "account";

export const ANOMALY_FLAG_LABEL: Record<string, string> = {
  low_variance_judge: "Low variance judge",
  insufficient_data_judge: "Insufficient data",
  low_panel_correlation: "Low panel correlation",
  rapid_review: "Rapid review",
  high_disagreement_project: "High disagreement",
  pairwise_rubric_disagreement: "Pairwise/rubric disagreement",
};

export function flagLabel(flag: string): string {
  return ANOMALY_FLAG_LABEL[flag] ?? flag.replace(/_/g, " ");
}

export const TIE_BREAK_LABEL: Record<string, string> = {
  final_preference_count: "Final-round preference count",
  bradley_terry_score: "Bradley-Terry pairwise strength",
  raw_score_mean: "Raw score mean",
  project_id: "Project ID (deterministic last resort)",
  none: "No tie occurred",
};
