-- Migration: Syncing missing fields for WhatsApp Gabi Analysis and Test Case AI Analysis
-- This migration ensures production has all columns required by the updated routes and services.

-- 1. WhatsApp Conversations
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "gabi_temperatura" TEXT;
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "gabi_temperatura_score" INTEGER;
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "gabi_resumo" TEXT;
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "gabi_acoes_sugeridas" TEXT;
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "activity_id" TEXT;

-- 2. Test Cases (AI Analysis fields)
ALTER TABLE "test_cases" ADD COLUMN IF NOT EXISTS "ai_analysis" TEXT;
ALTER TABLE "test_cases" ADD COLUMN IF NOT EXISTS "fix_proposal" TEXT;
ALTER TABLE "test_cases" ADD COLUMN IF NOT EXISTS "fix_status" TEXT;
ALTER TABLE "test_cases" ADD COLUMN IF NOT EXISTS "fix_applied_at" TIMESTAMP(3);
ALTER TABLE "test_cases" ADD COLUMN IF NOT EXISTS "fix_applied_by" TEXT;
ALTER TABLE "test_cases" ADD COLUMN IF NOT EXISTS "location_file" TEXT;
ALTER TABLE "test_cases" ADD COLUMN IF NOT EXISTS "location_line" INTEGER;
ALTER TABLE "test_cases" ADD COLUMN IF NOT EXISTS "location_col" INTEGER;

-- 3. App Settings (for Gemini Config)
-- (Already handled by previous migrations if present, but adding safety check)
CREATE TABLE IF NOT EXISTS "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- 4. Audit Log (ensure meta is present)
-- (Safety check for Audit Log)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='audit_logs' AND column_name='meta') THEN
        ALTER TABLE "audit_logs" ADD COLUMN "meta" JSONB;
    END IF;
END $$;
