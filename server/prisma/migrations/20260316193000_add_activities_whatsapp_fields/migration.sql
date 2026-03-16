-- Migration: add missing WhatsApp notification fields to activities table
-- These fields were added to the Prisma schema but were missing from production DB.

ALTER TABLE "activities"
    ADD COLUMN IF NOT EXISTS "send_invite_whatsapp"   BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "invite_wa_sent"          BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "send_summary_whatsapp"  BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "summary_wa_sent"         BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "send_recording_whatsapp" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "recording_wa_sent"       BOOLEAN NOT NULL DEFAULT false;

-- Also add desnormalized fields to activity_time_logs if missing
ALTER TABLE "activity_time_logs"
    ADD COLUMN IF NOT EXISTS "contact_nome"  TEXT,
    ADD COLUMN IF NOT EXISTS "activity_type" TEXT;
