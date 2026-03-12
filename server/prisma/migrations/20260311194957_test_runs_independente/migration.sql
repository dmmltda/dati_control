-- Migration: test_runs_independente
-- Remove test_logs (vinculado a companyId) e cria test_runs, test_cases e test_schedule
-- independentes de empresa.
--
-- ATENÇÃO: As tabelas abaixo já existem no banco (criadas via migrate do schema anterior).
-- Esta migration registra formalmente a mudança no histórico.
-- O IF NOT EXISTS garante idempotência caso o banco já tenha as tabelas.

-- ── Remover tabela legada ─────────────────────────────────────────────────────
DROP TABLE IF EXISTS "test_logs";

-- ── Novas tabelas ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "test_runs" (
    "id"            TEXT NOT NULL,
    "suite_type"    TEXT NOT NULL,
    "triggered_by"  TEXT,
    "triggered_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "environment"   TEXT NOT NULL DEFAULT 'local',
    "status"        TEXT NOT NULL DEFAULT 'running',
    "total_tests"   INTEGER NOT NULL DEFAULT 0,
    "passed_tests"  INTEGER NOT NULL DEFAULT 0,
    "failed_tests"  INTEGER NOT NULL DEFAULT 0,
    "error_tests"   INTEGER NOT NULL DEFAULT 0,
    "duration_ms"   INTEGER,
    "raw_output"    TEXT,
    "company_id"    TEXT,

    CONSTRAINT "test_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "test_cases" (
    "id"              TEXT NOT NULL,
    "run_id"          TEXT NOT NULL,
    "suite_file"      TEXT,
    "module"          TEXT,
    "test_name"       TEXT NOT NULL,
    "suite_type"      TEXT NOT NULL,
    "status"          TEXT NOT NULL,
    "duration_ms"     INTEGER,
    "error_message"   TEXT,
    "error_stack"     TEXT,
    "screenshot_url"  TEXT,
    "video_url"       TEXT,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "test_schedule" (
    "id"              TEXT NOT NULL,
    "enabled"         BOOLEAN NOT NULL DEFAULT false,
    "frequency"       TEXT NOT NULL DEFAULT 'manual',
    "run_time"        TEXT NOT NULL DEFAULT '02:00',
    "run_unit"        BOOLEAN NOT NULL DEFAULT true,
    "run_functional"  BOOLEAN NOT NULL DEFAULT true,
    "run_e2e"         BOOLEAN NOT NULL DEFAULT false,
    "notify_email"    BOOLEAN NOT NULL DEFAULT false,
    "notify_emails"   TEXT,
    "environment"     TEXT NOT NULL DEFAULT 'local',
    "updated_by"      TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_schedule_pkey" PRIMARY KEY ("id")
);

-- ── Foreign Keys ──────────────────────────────────────────────────────────────

ALTER TABLE "test_runs"
    ADD CONSTRAINT "test_runs_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "test_cases"
    ADD CONSTRAINT "test_cases_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "test_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Remove a foreign key legada companies→test_logs (se existir por qualquer razão)
ALTER TABLE "companies"
    DROP COLUMN IF EXISTS "test_logs";
