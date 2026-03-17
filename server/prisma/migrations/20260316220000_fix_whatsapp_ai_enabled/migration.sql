-- Migration de EMERGÊNCIA: garante a coluna ai_enabled em produção
-- Corrige o erro: "The column whatsapp_conversations.ai_enabled does not exist in the current database."
-- Causa do erro 500 no WhatsApp Inbox e falha ao iniciar nova conversa.

ALTER TABLE "whatsapp_conversations"
    ADD COLUMN IF NOT EXISTS "ai_enabled" BOOLEAN NOT NULL DEFAULT false;

-- Garante também as demais colunas da migration anterior (segurança)
ALTER TABLE "whatsapp_conversations"
    ADD COLUMN IF NOT EXISTS "contact_nome" TEXT,
    ADD COLUMN IF NOT EXISTS "company_nome" TEXT,
    ADD COLUMN IF NOT EXISTS "activity_id"  TEXT,
    ADD COLUMN IF NOT EXISTS "gabi_temperatura"       TEXT,
    ADD COLUMN IF NOT EXISTS "gabi_temperatura_score" INTEGER,
    ADD COLUMN IF NOT EXISTS "gabi_resumo"            TEXT,
    ADD COLUMN IF NOT EXISTS "gabi_acoes_sugeridas"   TEXT;

-- Garante campos desnormalizados em activity_time_logs
ALTER TABLE "activity_time_logs"
    ADD COLUMN IF NOT EXISTS "contact_nome"  TEXT,
    ADD COLUMN IF NOT EXISTS "activity_type" TEXT;

-- Garante campos WhatsApp em activities
ALTER TABLE "activities"
    ADD COLUMN IF NOT EXISTS "send_invite_whatsapp"   BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "invite_wa_sent"          BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "send_summary_whatsapp"  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "summary_wa_sent"         BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "send_recording_whatsapp" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "recording_wa_sent"       BOOLEAN NOT NULL DEFAULT false;
