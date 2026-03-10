-- CreateTable
CREATE TABLE "product_catalog" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoria" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Ativo',
    "icone" TEXT,
    "cor_badge" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "site_url" TEXT,
    "video_url" TEXT,
    "beneficios" TEXT,
    "publico_alvo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_catalog_pkey" PRIMARY KEY ("id")
);
