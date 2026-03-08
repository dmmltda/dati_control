-- CreateTable
CREATE TABLE "company_dashboards" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "Data" TIMESTAMP(3),
    "Destinatario" TEXT,
    "Link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_dashboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_nps" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "Data" TIMESTAMP(3),
    "Destinatario" TEXT,
    "Formulario" TEXT,
    "Score" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_nps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_tickets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "Data" TIMESTAMP(3),
    "Numero" TEXT,
    "Resumo" TEXT,
    "Autor" TEXT,
    "Link" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_notes" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "Data" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "Conteudo" TEXT,
    "Autor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_notes_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "company_dashboards" ADD CONSTRAINT "company_dashboards_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_nps" ADD CONSTRAINT "company_nps_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_tickets" ADD CONSTRAINT "company_tickets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_notes" ADD CONSTRAINT "company_notes_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
