/*
  Warnings:

  - You are about to drop the column `channel` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `city` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `cnpj` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `healthScore` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `segment` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `state` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `website` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `department` on the `contacts` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `contacts` table. All the data in the column will be lost.
  - You are about to drop the column `linkedin` on the `contacts` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `contacts` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `contacts` table. All the data in the column will be lost.
  - You are about to drop the column `whatsapp` on the `contacts` table. All the data in the column will be lost.
  - You are about to drop the `company_contracts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `company_onboarding` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sales_activities` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[CNPJ_da_empresa]` on the table `companies` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `Nome_da_empresa` to the `companies` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "company_contracts" DROP CONSTRAINT "company_contracts_companyId_fkey";

-- DropForeignKey
ALTER TABLE "company_onboarding" DROP CONSTRAINT "company_onboarding_companyId_fkey";

-- DropForeignKey
ALTER TABLE "contacts" DROP CONSTRAINT "contacts_companyId_fkey";

-- DropForeignKey
ALTER TABLE "sales_activities" DROP CONSTRAINT "sales_activities_companyId_fkey";

-- DropIndex
DROP INDEX "companies_cnpj_key";

-- AlterTable
ALTER TABLE "companies" DROP COLUMN "channel",
DROP COLUMN "city",
DROP COLUMN "cnpj",
DROP COLUMN "healthScore",
DROP COLUMN "name",
DROP COLUMN "segment",
DROP COLUMN "state",
DROP COLUMN "status",
DROP COLUMN "type",
DROP COLUMN "website",
ADD COLUMN     "CNPJ_da_empresa" TEXT,
ADD COLUMN     "Cidade" TEXT,
ADD COLUMN     "Data_Interesse" TIMESTAMP(3),
ADD COLUMN     "Data_Reunião" TIMESTAMP(3),
ADD COLUMN     "Data_de_churn" TIMESTAMP(3),
ADD COLUMN     "Data_de_follow_up" TIMESTAMP(3),
ADD COLUMN     "Data_início_onboarding" TIMESTAMP(3),
ADD COLUMN     "Data_término_onboarding" TIMESTAMP(3),
ADD COLUMN     "Dores_Gargalos" TEXT,
ADD COLUMN     "ERP" TEXT,
ADD COLUMN     "Estado" TEXT,
ADD COLUMN     "Expectativa_da_DATI" TEXT,
ADD COLUMN     "Fechamento_onboarding_(Sim/Não)" TEXT,
ADD COLUMN     "Health_Score" TEXT,
ADD COLUMN     "Horário_de_follow_up" TEXT,
ADD COLUMN     "Início_com_CS" TIMESTAMP(3),
ADD COLUMN     "Lead" TEXT,
ADD COLUMN     "Modo_da_empresa" TEXT,
ADD COLUMN     "Motivo_do_churn" TEXT,
ADD COLUMN     "Nome_da_empresa" TEXT NOT NULL,
ADD COLUMN     "Nome_do_CS" TEXT,
ADD COLUMN     "Nome_do_usuário" TEXT,
ADD COLUMN     "Participantes_da_Reunião" TEXT,
ADD COLUMN     "Principal_Objetivo" TEXT,
ADD COLUMN     "Qual?_(Módulo_/_Lotus)" TEXT,
ADD COLUMN     "Segmento_da_empresa" TEXT,
ADD COLUMN     "Situação_da_reunião" TEXT,
ADD COLUMN     "Status" TEXT,
ADD COLUMN     "Sucesso_Extraordinário" TEXT,
ADD COLUMN     "Tem_algum_comex?" TEXT,
ADD COLUMN     "Temperatura_de_reunião" TEXT,
ADD COLUMN     "Tipo_de_empresa" TEXT,
ADD COLUMN     "Usuário_Dati_(Sim/Não)" TEXT,
ADD COLUMN     "É_decisor?" TEXT;

-- AlterTable
ALTER TABLE "contacts" DROP COLUMN "department",
DROP COLUMN "email",
DROP COLUMN "linkedin",
DROP COLUMN "name",
DROP COLUMN "role",
DROP COLUMN "whatsapp",
ADD COLUMN     "Cargo_do_contato" TEXT,
ADD COLUMN     "Departamento_do_contato" TEXT,
ADD COLUMN     "Email_1" TEXT,
ADD COLUMN     "LinkedIn" TEXT,
ADD COLUMN     "Nome_do_contato" TEXT,
ADD COLUMN     "WhatsApp" TEXT;

-- DropTable
DROP TABLE "company_contracts";

-- DropTable
DROP TABLE "company_onboarding";

-- DropTable
DROP TABLE "sales_activities";

-- CreateTable
CREATE TABLE "company_products" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "Produto_DATI" TEXT NOT NULL,
    "Valor_Total" DECIMAL(15,2),
    "Valor_Fee_(s/_de_tributação)" DECIMAL(15,2),
    "Proposta_comercial" TEXT,
    "Contrato" TEXT,
    "Valor_mensalidade" DECIMAL(15,2),
    "Valor_de_ISS" DECIMAL(15,2),
    "Valor_de_PIS" DECIMAL(15,2),
    "Valor_de_COFINS" DECIMAL(15,2),
    "Valor_de_CSLL" DECIMAL(15,2),
    "Valor_de_IRRF" DECIMAL(15,2),
    "Valor_Liquido" DECIMAL(15,2),
    "Data_do_contrato" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "Data_teste" TIMESTAMP(3),
    "Hora_teste" TEXT,
    "Tipo_teste" TEXT,
    "Módulo_teste" TEXT,
    "O_que_foi_testado" TEXT,
    "Quem_foi_testado" TEXT,
    "Status_teste" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_CNPJ_da_empresa_key" ON "companies"("CNPJ_da_empresa");

-- AddForeignKey
ALTER TABLE "company_products" ADD CONSTRAINT "company_products_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_logs" ADD CONSTRAINT "test_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
