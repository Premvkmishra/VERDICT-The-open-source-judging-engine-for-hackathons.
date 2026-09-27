-- Verdict Canonical Database Schema
-- Applies all required extensions, enums (via TEXT + CHECK), tables, indices, and constraints.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email CITEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. SESSIONS
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ, -- NULL for seeded non-expiring sessions
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. EVENTS
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    tagline TEXT,
    description_md TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'upcoming', 'submissions_open', 'submissions_closed', 'judging_open', 'judging_closed', 'results_published', 'archived')),
    submissions_open_at TIMESTAMPTZ,
    submissions_close_at TIMESTAMPTZ,
    judging_opens_at TIMESTAMPTZ,
    judging_closes_at TIMESTAMPTZ,
    voting_open_at TIMESTAMPTZ,
    voting_close_at TIMESTAMPTZ,
    min_reviews_per_project INT NOT NULL DEFAULT 3,
    min_publish_coverage_pct NUMERIC NOT NULL DEFAULT 0.90,
    published_normalization_run_id UUID,
    normalization_method TEXT NOT NULL DEFAULT 'zscore',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. EVENT MEMBERSHIPS
CREATE TABLE IF NOT EXISTS event_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('organizer', 'judge', 'participant')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, user_id, role)
);

-- 5. TRACKS
CREATE TABLE IF NOT EXISTS tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. PRIZES
CREATE TABLE IF NOT EXISTS prizes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    track_id UUID REFERENCES tracks(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. TEAMS
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. TEAM MEMBERS
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (team_id, user_id)
);

-- 9. TEAM INVITES
CREATE TABLE IF NOT EXISTS team_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL,
    uses_count INT NOT NULL DEFAULT 0,
    max_uses INT NOT NULL DEFAULT 10,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. PROJECTS
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    track_id UUID REFERENCES tracks(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    description_md TEXT,
    repo_url TEXT,
    demo_url TEXT,
    video_url TEXT,
    cover_image_url TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'disqualified')),
    submitted_at TIMESTAMPTZ,
    is_duplicate_of UUID REFERENCES projects(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, team_id)
);

-- 11. PROJECT VERSIONS
CREATE TABLE IF NOT EXISTS project_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version_num INT NOT NULL,
    snapshot_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, version_num)
);

-- 12. RUBRICS
CREATE TABLE IF NOT EXISTS rubrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. RUBRIC CRITERIA
CREATE TABLE IF NOT EXISTS rubric_criteria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rubric_id UUID NOT NULL REFERENCES rubrics(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    description TEXT,
    weight NUMERIC NOT NULL DEFAULT 1.0,
    scale_min INT NOT NULL DEFAULT 1,
    scale_max INT NOT NULL DEFAULT 5,
    option_labels_json JSONB,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. JUDGE ASSIGNMENTS
CREATE TABLE IF NOT EXISTS judge_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    judge_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, judge_user_id)
);

-- 15. EVALUATIONS
CREATE TABLE IF NOT EXISTS evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES judge_assignments(id) ON DELETE CASCADE UNIQUE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    judge_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    reaction TEXT CHECK (reaction IN ('not_convinced', 'interesting', 'stands_out')),
    final_preference TEXT CHECK (final_preference IN ('no', 'maybe', 'yes')),
    tags_json JSONB DEFAULT '[]'::jsonb,
    comment TEXT,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted')),
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 16. EVALUATION SCORES
CREATE TABLE IF NOT EXISTS evaluation_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
    criterion_id UUID NOT NULL REFERENCES rubric_criteria(id) ON DELETE CASCADE,
    value INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (evaluation_id, criterion_id)
);

-- 17. PAIRWISE COMPARISONS
CREATE TABLE IF NOT EXISTS pairwise_comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    judge_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_a_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    project_b_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    winner_project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 18. NORMALIZATION RUNS
CREATE TABLE IF NOT EXISTS normalization_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    method TEXT NOT NULL DEFAULT 'zscore',
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    run_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add deferred Foreign Key on events.published_normalization_run_id
ALTER TABLE events DROP CONSTRAINT IF EXISTS fk_events_published_run;
ALTER TABLE events ADD CONSTRAINT fk_events_published_run FOREIGN KEY (published_normalization_run_id) REFERENCES normalization_runs(id) ON DELETE SET NULL;

-- 19. NORMALIZATION JUDGE STATS
CREATE TABLE IF NOT EXISTS normalization_judge_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES normalization_runs(id) ON DELETE CASCADE,
    judge_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    completed_count INT NOT NULL,
    mean NUMERIC,
    stdev NUMERIC,
    is_normalizable BOOLEAN NOT NULL,
    flags_json JSONB DEFAULT '[]'::jsonb
);

-- 20. NORMALIZATION RESULTS
CREATE TABLE IF NOT EXISTS normalization_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES normalization_runs(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    judge_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    raw_score NUMERIC NOT NULL,
    z_score NUMERIC
);

-- 21. PROJECT RANKINGS
CREATE TABLE IF NOT EXISTS project_rankings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES normalization_runs(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    reviews_count INT NOT NULL,
    is_rankable BOOLEAN NOT NULL,
    official_score NUMERIC,
    display_score NUMERIC,
    rank INT,
    tie_break_reason TEXT,
    bradley_terry_score NUMERIC,
    flags_json JSONB DEFAULT '[]'::jsonb,
    UNIQUE (run_id, project_id)
);

-- 22. VOTES
CREATE TABLE IF NOT EXISTS votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    voter_key TEXT NOT NULL,
    voter_type TEXT NOT NULL CHECK (voter_type IN ('email', 'link', 'account')),
    email CITEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, project_id, voter_key)
);

-- 23. COMMENTS
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    author_display_name TEXT,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden', 'flagged')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 24. AUDIT EVENTS
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- INDICES
CREATE INDEX IF NOT EXISTS idx_projects_event_status ON projects(event_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_title_trgm ON projects USING gin(title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_audit_events_event_action ON audit_events(event_id, action);
