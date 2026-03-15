-- Migration: add_email_log_missing_columns
-- Adiciona colunas que faltavam na tabela email_send_log
-- Usa ADD COLUMN IF NOT EXISTS para ser segura em qualquer ambiente.

ALTER TABLE "public"."email_send_log"
    ADD COLUMN IF NOT EXISTS "status"          TEXT NOT NULL DEFAULT 'sent',
    ADD COLUMN IF NOT EXISTS "resend_id"       TEXT,
    ADD COLUMN IF NOT EXISTS "error_message"   TEXT,
    ADD COLUMN IF NOT EXISTS "content"         TEXT,
    ADD COLUMN IF NOT EXISTS "direction"       TEXT NOT NULL DEFAULT 'outbound',
    ADD COLUMN IF NOT EXISTS "parent_email_id" TEXT,
    ADD COLUMN IF NOT EXISTS "gabi_analysis"   JSONB;

-- Índice no status (para filtros rápidos do Monitor de E-mails)
CREATE INDEX IF NOT EXISTS "email_send_log_status_idx" ON "public"."email_send_log"("status");
