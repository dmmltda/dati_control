-- CreateTable: app_settings
-- Tabela de configurações globais da plataforma (chave-valor persistente).
-- Usada para armazenar a GEMINI_API_KEY e outras settings via UI.
CREATE TABLE IF NOT EXISTS "app_settings" (
    "key"        TEXT         NOT NULL,
    "value"      TEXT         NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);
