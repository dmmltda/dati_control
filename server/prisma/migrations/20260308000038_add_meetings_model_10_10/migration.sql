/*
  Warnings:

  - You are about to drop the column `Data_Reunião` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `Participantes_da_Reunião` on the `companies` table. All the data in the column will be lost.
  - You are about to drop the column `Temperatura_de_reunião` on the `companies` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "companies" DROP COLUMN "Data_Reunião",
DROP COLUMN "Participantes_da_Reunião",
DROP COLUMN "Temperatura_de_reunião";

-- CreateTable
CREATE TABLE "company_meetings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "Data_reuniao" TIMESTAMP(3),
    "Participantes" TEXT,
    "Temperatura" TEXT,
    "Link_gravacao" TEXT,
    "Observacoes" TEXT,
    "Tipo_reuniao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_meetings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "company_meetings" ADD CONSTRAINT "company_meetings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
