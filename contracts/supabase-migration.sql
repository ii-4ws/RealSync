-- RealSync Supabase Schema Migration (v1)
-- Run this in Supabase SQL Editor to create all required tables.
-- Generated: 2026-02-06

-- =================================================================
-- Sessions
-- =================================================================
CREATE TABLE IF NOT EXISTS sessions (
  id            UUID PRIMARY KEY,
  title         TEXT NOT NULL,
  meeting_type  TEXT NOT NULL CHECK (meeting_type IN ('official', 'business', 'friends')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  user_id       UUID REFERENCES auth.users(id),
  bot_status    TEXT DEFAULT 'idle' CHECK (bot_status IN ('idle', 'joining', 'connected', 'disconnected')),
  meeting_url   TEXT,
  metadata      JSONB DEFAULT '{}'
);

-- =================================================================
-- Transcript lines
-- =================================================================
CREATE TABLE IF NOT EXISTS transcript_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  text          TEXT NOT NULL,
  speaker       TEXT,
  is_final      BOOLEAN NOT NULL DEFAULT true,
  confidence    REAL,
  ts            TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transcript_session ON transcript_lines(session_id, ts);

-- =================================================================
-- Alerts
-- =================================================================
CREATE TABLE IF NOT EXISTS alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  severity      TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  category      TEXT NOT NULL,
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,
  confidence    REAL,
  source_model  TEXT,
  ts            TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alerts_session ON alerts(session_id, ts);

-- =================================================================
-- Suggestions
-- =================================================================
CREATE TABLE IF NOT EXISTS suggestions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  severity      TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,
  ts            TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suggestions_session ON suggestions(session_id, ts);

-- =================================================================
-- Metrics snapshots (sampled, not every broadcast)
-- =================================================================
CREATE TABLE IF NOT EXISTS metrics_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  data          JSONB NOT NULL,
  ts            TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_metrics_session ON metrics_snapshots(session_id, ts);

-- =================================================================
-- Session reports (generated at session end, accessible post-meeting)
-- =================================================================
CREATE TABLE IF NOT EXISTS session_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  summary       JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_session ON session_reports(session_id);

-- =================================================================
-- User profiles (created automatically on signup via trigger)
-- Stores display name, avatar, etc. Persists until user updates
-- from Settings screen.
-- =================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT UNIQUE,
  full_name     TEXT,
  job_title     TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create a profile row when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the trigger if it already exists to make this migration re-runnable
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =================================================================
-- Row Level Security (RLS) — enable for all tables
-- Users can only access their own session data.
-- =================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_reports ENABLE ROW LEVEL SECURITY;

-- Profile policies: users can read, insert, and update only their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Policy: users can read their own sessions
CREATE POLICY "Users can view own sessions"
  ON sessions FOR SELECT
  USING (user_id = auth.uid());

-- Policy: users can insert their own sessions
CREATE POLICY "Users can create sessions"
  ON sessions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Policy: users can update their own sessions
CREATE POLICY "Users can update own sessions"
  ON sessions FOR UPDATE
  USING (user_id = auth.uid());

-- Policy: service role can do everything (backend uses service key)
-- The service key bypasses RLS, so these policies only restrict
-- anon/authenticated access from the frontend.

-- Child table policies (access via session ownership)
CREATE POLICY "Access own transcript lines"
  ON transcript_lines FOR ALL
  USING (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));

CREATE POLICY "Access own alerts"
  ON alerts FOR ALL
  USING (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));

CREATE POLICY "Access own suggestions"
  ON suggestions FOR ALL
  USING (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));

CREATE POLICY "Access own metrics"
  ON metrics_snapshots FOR ALL
  USING (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));

CREATE POLICY "Access own reports"
  ON session_reports FOR ALL
  USING (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));
