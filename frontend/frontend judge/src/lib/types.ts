import type {
  AssignmentStatus,
  EvaluationStatus,
  EvaluationTag,
  EventStatus,
  FinalPreference,
  MembershipRole,
  ProjectStatus,
  Reaction,
} from "./enums";

export interface User {
  id: string;
  email?: string;
  display_name: string;
  is_platform_admin?: boolean;
}

export interface Membership {
  event_id?: string;
  event_slug?: string;
  role: MembershipRole;
  [key: string]: unknown;
}

export interface Me {
  user: User;
  memberships: Membership[];
}

export interface VerdictEvent {
  id: string;
  slug: string;
  name: string;
  tagline?: string | null;
  description_md?: string | null;
  status: EventStatus;
  submissions_open_at?: string | null;
  submissions_close_at?: string | null;
  judging_opens_at?: string | null;
  judging_closes_at?: string | null;
  voting_open_at?: string | null;
  voting_close_at?: string | null;
  min_reviews_per_project?: number;
  min_publish_coverage_pct?: number;
}

export interface Track {
  id: string;
  event_id: string;
  name: string;
  description?: string | null;
  sort_order?: number;
}

export interface Prize {
  id: string;
  event_id: string;
  track_id?: string | null;
  name: string;
  description?: string | null;
}

export interface Team {
  id: string;
  event_id: string;
  name: string;
  members?: User[];
}

export interface Project {
  id: string;
  event_id: string;
  team_id: string;
  track_id?: string | null;
  title: string;
  summary: string;
  description_md?: string | null;
  repo_url?: string | null;
  demo_url?: string | null;
  video_url?: string | null;
  cover_image_url?: string | null;
  status: ProjectStatus;
  submitted_at?: string | null;
  is_duplicate_of?: string | null;
}

export interface RubricCriterion {
  id: string;
  key: string;
  label: string;
  description?: string | null;
  weight: number;
  scale_min: number;
  scale_max: number;
  option_labels?: Record<string, string>;
  sort_order?: number;
}

export interface Rubric {
  id: string;
  event_id: string;
  name: string;
  criteria: RubricCriterion[];
}

export interface Assignment {
  id: string;
  project_id: string;
  judge_user_id: string;
  status: AssignmentStatus;
  [key: string]: unknown;
}

export interface EvaluationScoreInput {
  criterion_id: string;
  value: number;
}

export interface Evaluation {
  id: string;
  assignment_id: string;
  project_id: string;
  judge_user_id: string;
  reaction?: Reaction | null;
  final_preference?: FinalPreference | null;
  tags?: EvaluationTag[];
  comment?: string | null;
  scores?: EvaluationScoreInput[];
  status: EvaluationStatus;
  submitted_at?: string | null;
  [key: string]: unknown;
}

/** GET /events/{slug}/judge/feed */
export interface JudgeFeedItem {
  assignment: Assignment;
  project: Project;
  rubric: Rubric;
  evaluation?: Evaluation | null;
  completed?: number;
  remaining?: number;
  [key: string]: unknown;
}

export interface PairwisePair {
  project_a: Project;
  project_b: Project;
  [key: string]: unknown;
}

export interface ProjectRanking {
  project_id: string;
  project?: Project;
  project_title?: string;
  reviews_count: number;
  is_rankable: boolean;
  official_score?: number | null;
  display_score?: number | null;
  rank?: number | null;
  tie_break_reason?: string | null;
  flags?: string[];
}

export interface Comment {
  id: string;
  project_id?: string;
  body: string;
  author_display_name?: string | null;
  created_at?: string;
  status?: string;
  [key: string]: unknown;
}

export interface AuditEntry {
  id: string;
  action: string;
  actor_display_name?: string | null;
  actor_user_id?: string | null;
  created_at?: string;
  details?: Record<string, unknown> | null;
  [key: string]: unknown;
}
