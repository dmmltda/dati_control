-- Migration: add contact_nome and company_nome to whatsapp_conversations
-- Esses campos desnormalizados preservam o nome do contato/empresa no momento
-- da criação da conversa, mesmo que o registro seja deletado depois.
-- Também corrige o problema de FK implícita que causava o erro do Prisma Client.

ALTER TABLE "whatsapp_conversations"
  ADD COLUMN IF NOT EXISTS "contact_nome" TEXT,
  ADD COLUMN IF NOT EXISTS "company_nome" TEXT;
