-- Migration: Add Respostas_JSON column and fix id default in company_nps
-- Safe to run multiple times (IF NOT EXISTS guards)

-- Add the JSON column for storing full form responses
ALTER TABLE "company_nps" ADD COLUMN IF NOT EXISTS "Respostas_JSON" JSONB;

-- Fix id default to use gen_random_uuid() so new rows get UUIDs automatically
ALTER TABLE "company_nps" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
