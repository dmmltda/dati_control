-- Migration: add_missing_tables
-- Cria tabelas que existem no schema mas não tinham migration.
-- Usa IF NOT EXISTS para ser segura em DBs que já têm as tabelas.

-- ── audit_logs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id"          TEXT NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id"    TEXT,
    "actor_label" TEXT NOT NULL,
    "action"      TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id"   TEXT,
    "entity_name" TEXT,
    "description" TEXT NOT NULL,
    "meta"        JSONB,
    "company_id"  TEXT,
    "ip_address"  TEXT,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- ── gabi_usage_logs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "gabi_usage_logs" (
    "id"            TEXT NOT NULL,
    "user_id"       TEXT,
    "input_tokens"  INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd"      DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gabi_usage_logs_pkey" PRIMARY KEY ("id")
);

-- ── user_feature_permissions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user_feature_permissions" (
    "id"         TEXT NOT NULL,
    "user_id"    TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "granted"    BOOLEAN NOT NULL DEFAULT true,
    "granted_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_feature_permissions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_feature_permissions_user_id_permission_key"
    ON "user_feature_permissions"("user_id", "permission");
DO $$ BEGIN
    ALTER TABLE "user_feature_permissions"
        ADD CONSTRAINT "user_feature_permissions_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── activity_time_logs ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "activity_time_logs" (
    "id"               TEXT NOT NULL,
    "activity_id"      TEXT NOT NULL,
    "started_at"       TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "subject"          TEXT,
    "created_by"       TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_time_logs_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN
    ALTER TABLE "activity_time_logs"
        ADD CONSTRAINT "activity_time_logs_activity_id_fkey"
        FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── notifications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "notifications" (
    "id"          TEXT NOT NULL,
    "user_id"     TEXT NOT NULL,
    "type"        TEXT NOT NULL,
    "activity_id" TEXT,
    "title"       TEXT NOT NULL,
    "message"     TEXT NOT NULL,
    "read"        BOOLEAN NOT NULL DEFAULT false,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "notifications_user_id_read_idx" ON "notifications"("user_id", "read");
CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "notifications"("created_at");
DO $$ BEGIN
    ALTER TABLE "notifications"
        ADD CONSTRAINT "notifications_activity_id_fkey"
        FOREIGN KEY ("activity_id") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── email_send_log ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "email_send_log" (
    "id"        TEXT NOT NULL,
    "dedup_key" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject"   TEXT NOT NULL,
    "template"  TEXT,
    "tag"       TEXT,
    "sent_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_send_log_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "email_send_log_dedup_key_key" ON "email_send_log"("dedup_key");
CREATE INDEX IF NOT EXISTS "email_send_log_sent_at_idx" ON "email_send_log"("sent_at");

-- ── activities: colunas novas ─────────────────────────────────────────────────
ALTER TABLE "activities"
    ADD COLUMN IF NOT EXISTS "send_invite_email"          BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "invite_sent"                BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "send_summary_email"         BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "summary_sent"               BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "recording_url"              TEXT,
    ADD COLUMN IF NOT EXISTS "send_recording_email"       BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "recording_sent"             BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "next_step_reminder_email"   BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "next_step_reminder_sent"    BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "notify_on_assign"           BOOLEAN NOT NULL DEFAULT false;

-- ── test_schedule: colunas novas ──────────────────────────────────────────────
ALTER TABLE "test_schedule"
    ADD COLUMN IF NOT EXISTS "weekday"              INTEGER,
    ADD COLUMN IF NOT EXISTS "hour"                 INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN IF NOT EXISTS "minute"               INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "notify_on_failure_only" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "last_run_at"          TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "next_run_at"          TIMESTAMP(3);
