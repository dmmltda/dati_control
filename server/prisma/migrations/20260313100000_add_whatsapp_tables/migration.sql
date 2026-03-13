-- Migration: add_whatsapp_tables
-- Cria as tabelas para o WhatsApp HD Inbox

-- ── whatsapp_conversations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."whatsapp_conversations" (
    "id"                    TEXT NOT NULL,
    "contact_id"            TEXT,
    "company_id"            TEXT,
    "wa_phone_number"       TEXT NOT NULL,
    "status"                TEXT NOT NULL DEFAULT 'open',
    "opened_at"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at"             TIMESTAMP(3),
    "assigned_to"           TEXT,
    "activity_id"           TEXT,
    "gabi_temperatura"      TEXT,
    "gabi_temperatura_score" INTEGER,
    "gabi_resumo"           TEXT,
    "gabi_acoes_sugeridas"  TEXT,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- FK para contacts (nullable, SET NULL ao deletar)
ALTER TABLE "public"."whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- FK para companies (nullable, SET NULL ao deletar)
ALTER TABLE "public"."whatsapp_conversations"
    ADD CONSTRAINT "whatsapp_conversations_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
    ON DELETE SET NULL ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED;

-- ── whatsapp_messages ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."whatsapp_messages" (
    "id"              TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "wa_message_id"   TEXT,
    "direction"       TEXT NOT NULL,
    "content_type"    TEXT NOT NULL DEFAULT 'text',
    "content"         TEXT NOT NULL,
    "sent_by"         TEXT,
    "origin"          TEXT NOT NULL DEFAULT 'agent',
    "status"          TEXT NOT NULL DEFAULT 'sent',
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- Unique index em wa_message_id para dedup
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_messages_wa_message_id_key"
    ON "public"."whatsapp_messages"("wa_message_id")
    WHERE "wa_message_id" IS NOT NULL;

-- FK para whatsapp_conversations (CASCADE delete)
ALTER TABLE "public"."whatsapp_messages"
    ADD CONSTRAINT "whatsapp_messages_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ── whatsapp_usage_logs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."whatsapp_usage_logs" (
    "id"                    TEXT NOT NULL,
    "conversation_id"       TEXT,
    "company_id"            TEXT,
    "conversation_category" TEXT,
    "origin"                TEXT,
    "cost_usd"              DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_usage_logs_pkey" PRIMARY KEY ("id")
);
