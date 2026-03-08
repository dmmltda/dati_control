-- CreateTable
CREATE TABLE "company_followups" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "Data_inclusao" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "Conteudo" TEXT,
    "Usuario" TEXT,
    "Area" TEXT,
    "Data_proximo_contato" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_followups_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "company_followups" ADD CONSTRAINT "company_followups_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
