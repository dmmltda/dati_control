/*
  Warnings:

  - You are about to drop the column `Help_desk_mensal` on the `company_products` table. All the data in the column will be lost.
  - You are about to drop the column `Hora_help_desk_adicional` on the `company_products` table. All the data in the column will be lost.
  - You are about to drop the column `Quantidade_usuarios` on the `company_products` table. All the data in the column will be lost.
  - You are about to drop the column `Setup` on the `company_products` table. All the data in the column will be lost.
  - You are about to drop the column `Valor_Fee_(s/_de_tributação)` on the `company_products` table. All the data in the column will be lost.
  - You are about to drop the column `Valor_Liquido` on the `company_products` table. All the data in the column will be lost.
  - You are about to drop the column `Valor_de_COFINS` on the `company_products` table. All the data in the column will be lost.
  - You are about to drop the column `Valor_de_CSLL` on the `company_products` table. All the data in the column will be lost.
  - You are about to drop the column `Valor_de_IRRF` on the `company_products` table. All the data in the column will be lost.
  - You are about to drop the column `Valor_de_ISS` on the `company_products` table. All the data in the column will be lost.
  - You are about to drop the column `Valor_de_PIS` on the `company_products` table. All the data in the column will be lost.
  - You are about to drop the column `Valor_mensalidade` on the `company_products` table. All the data in the column will be lost.
  - You are about to drop the column `Valor_por_DI_DUIMP` on the `company_products` table. All the data in the column will be lost.
  - You are about to drop the column `Valor_por_documento` on the `company_products` table. All the data in the column will be lost.
  - You are about to drop the column `Valor_por_processo` on the `company_products` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "company_products" DROP COLUMN "Help_desk_mensal",
DROP COLUMN "Hora_help_desk_adicional",
DROP COLUMN "Quantidade_usuarios",
DROP COLUMN "Setup",
DROP COLUMN "Valor_Fee_(s/_de_tributação)",
DROP COLUMN "Valor_Liquido",
DROP COLUMN "Valor_de_COFINS",
DROP COLUMN "Valor_de_CSLL",
DROP COLUMN "Valor_de_IRRF",
DROP COLUMN "Valor_de_ISS",
DROP COLUMN "Valor_de_PIS",
DROP COLUMN "Valor_mensalidade",
DROP COLUMN "Valor_por_DI_DUIMP",
DROP COLUMN "Valor_por_documento",
DROP COLUMN "Valor_por_processo",
ADD COLUMN     "Cobranca_setup" TEXT,
ADD COLUMN     "Qtd_usuarios" TEXT,
ADD COLUMN     "Total_horas_hd" INTEGER,
ADD COLUMN     "Valor_adic_hd" DECIMAL(15,2),
ADD COLUMN     "Valor_setup" DECIMAL(15,2);

-- CreateTable
CREATE TABLE "product_historico" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "Data_faturamento" TIMESTAMP(3),
    "Data_pagamento" TIMESTAMP(3),
    "Anexo_NF" TEXT,
    "Anexo_NF_nome" TEXT,
    "Anexo_pagamento" TEXT,
    "Anexo_pagamento_nome" TEXT,
    "Outros_anexos" TEXT,
    "Outros_anexos_nome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_historico_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "product_historico" ADD CONSTRAINT "product_historico_productId_fkey" FOREIGN KEY ("productId") REFERENCES "company_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
