-- danilurist initial schema
-- Idempotent: использует IF NOT EXISTS / DO blocks. Безопасно к повторному запуску.
-- Генерируется вручную (а не drizzle-kit generate), потому что:
--   1) CREATE EXTENSION должен идти до CREATE TABLE c vector-колонками.
--   2) HNSW index с m/ef_construction параметрами не генерируется drizzle-kit.
--   3) PARTIAL indexes (WHERE ocr_status IN (...)) drizzle-kit поддерживает, но безопаснее inline.

-- ============================================================================
-- Extensions
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- Enums
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE case_type AS ENUM (
    'OSAGO','DTP','LABOR','FAMILY','INHERITANCE',
    'ADMIN','CRIMINAL','PROCUREMENT','GENERAL'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ocr_status AS ENUM ('pending','processing','done','failed','skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE message_role AS ENUM ('user','assistant','system','tool');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE effort AS ENUM ('low','medium','high','max');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- users
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id            char(26) PRIMARY KEY,
  email         text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  display_name  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- folders (= chat sessions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS folders (
  id            char(26) PRIMARY KEY,
  user_id       char(26) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  case_type     case_type NOT NULL DEFAULT 'GENERAL',
  system_prompt text NOT NULL,
  effort        effort NOT NULL DEFAULT 'max',
  archived      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_folders_user_active
  ON folders(user_id, archived, updated_at DESC);

-- ============================================================================
-- files
-- ============================================================================
CREATE TABLE IF NOT EXISTS files (
  id           char(26) PRIMARY KEY,
  folder_id    char(26) NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  filename     text NOT NULL,
  storage_path text NOT NULL,
  mime         text NOT NULL,
  size_bytes   bigint NOT NULL,
  sha256       char(64) NOT NULL,
  ocr_status   ocr_status NOT NULL DEFAULT 'pending',
  ocr_text     text,
  ocr_error    text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_files_folder_sha256 ON files(folder_id, sha256);
CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_files_ocr_pending
  ON files(ocr_status) WHERE ocr_status IN ('pending','processing');
CREATE INDEX IF NOT EXISTS idx_files_ocr_text_trgm
  ON files USING gin (ocr_text gin_trgm_ops);

-- ============================================================================
-- messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS messages (
  id          char(26) PRIMARY KEY,
  folder_id   char(26) NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  turn_id     uuid NOT NULL,
  role        message_role NOT NULL,
  content     text NOT NULL,
  tool_calls  jsonb,
  citations   jsonb,
  tokens_in   integer,
  tokens_out  integer,
  archived    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_folder
  ON messages(folder_id, archived, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_turn ON messages(turn_id);

-- ============================================================================
-- embeddings (pgvector HNSW)
-- ============================================================================
CREATE TABLE IF NOT EXISTS embeddings (
  id          char(26) PRIMARY KEY,
  file_id     char(26) NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  folder_id   char(26) NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content     text NOT NULL,
  embedding   vector(1024) NOT NULL,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_embeddings_folder ON embeddings(folder_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_file ON embeddings(file_id, chunk_index);
-- HNSW index — рассчитан на ~50k векторов на single-user MVP.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_embeddings_hnsw') THEN
    CREATE INDEX idx_embeddings_hnsw
      ON embeddings USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
  END IF;
END $$;

-- ============================================================================
-- sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS sessions (
  id          char(26) PRIMARY KEY,
  user_id     char(26) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  user_agent  text,
  ip          inet,
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_active
  ON sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_expiry
  ON sessions(expires_at) WHERE revoked_at IS NULL;

-- ============================================================================
-- audit_log
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id                  bigserial PRIMARY KEY,
  turn_id             uuid,
  folder_id           char(26),
  user_id             char(26),
  action              text NOT NULL,
  model               text,
  effort              effort,
  input_tokens        integer,
  cache_read_tokens   integer DEFAULT 0,
  cache_write_tokens  integer DEFAULT 0,
  output_tokens       integer,
  thinking_tokens     integer DEFAULT 0,
  cost_estimate_usd   numeric(10,6),
  latency_ms          integer,
  tool_calls          jsonb,
  payload             jsonb,
  request_id          text,
  ip                  inet,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_folder_time ON audit_log(folder_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_time ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action_time ON audit_log(action, created_at DESC);

-- ============================================================================
-- tool_call_log
-- ============================================================================
CREATE TABLE IF NOT EXISTS tool_call_log (
  id               bigserial PRIMARY KEY,
  turn_id          uuid NOT NULL,
  folder_id        char(26) NOT NULL,
  name             text NOT NULL,
  input            jsonb NOT NULL,
  output           jsonb,
  output_truncated boolean NOT NULL DEFAULT false,
  latency_ms       integer,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tool_call_log_turn ON tool_call_log(turn_id);

-- ============================================================================
-- tool caches
-- ============================================================================
CREATE TABLE IF NOT EXISTS npa_search_cache (
  query_hash char(64) PRIMARY KEY,
  doc_type   text,
  date_from  date,
  results    jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS npa_doc_cache (
  url_hash      char(64) PRIMARY KEY,
  url           text NOT NULL,
  title         text,
  full_text_md  text NOT NULL,
  structure     jsonb,
  fetched_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS court_search_cache (
  query_hash char(64) PRIMARY KEY,
  results    jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- claude_quota
-- ============================================================================
CREATE TABLE IF NOT EXISTS claude_quota (
  id             serial PRIMARY KEY,
  observed_at    timestamptz NOT NULL DEFAULT now(),
  reset_at       timestamptz NOT NULL,
  requests_left  integer,
  tokens_left    bigint,
  scope          text
);

-- ============================================================================
-- updated_at triggers (folders, files, users)
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_folders_updated_at') THEN
    CREATE TRIGGER tr_folders_updated_at BEFORE UPDATE ON folders
      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_files_updated_at') THEN
    CREATE TRIGGER tr_files_updated_at BEFORE UPDATE ON files
      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_users_updated_at') THEN
    CREATE TRIGGER tr_users_updated_at BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
  END IF;
END $$;
