-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "status" TEXT,
    "name" TEXT NOT NULL,
    "cnpj" TEXT,
    "state" TEXT,
    "city" TEXT,
    "type" TEXT,
    "segment" TEXT,
    "website" TEXT,
    "channel" TEXT,
    "healthScore" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_contracts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "totalValue" DECIMAL(15,2),
    "hdHours" INTEGER,
    "monthlyFee" DECIMAL(15,2),
    "iss" DECIMAL(15,2),
    "pis" DECIMAL(15,2),
    "cofins" DECIMAL(15,2),
    "csll" DECIMAL(15,2),
    "irrf" DECIMAL(15,2),
    "netValue" DECIMAL(15,2),
    "contractDate" TIMESTAMP(3),
    "proposalUrl" TEXT,
    "contractUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_onboarding" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "csStartDate" TIMESTAMP(3),
    "churnDate" TIMESTAMP(3),
    "churnReason" TEXT,
    "comexSystem" TEXT,
    "erp" TEXT,
    "hasIntegration" TEXT,
    "duimpViaDati" TEXT,
    "duimpQuantity" INTEGER,
    "userQuantity" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_onboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT,
    "department" TEXT,
    "email" TEXT,
    "whatsapp" TEXT,
    "linkedin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_activities" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "interestDate" TIMESTAMP(3),
    "meetingDate" TIMESTAMP(3),
    "participants" TEXT,
    "isDecisionMaker" TEXT,
    "temperature" TEXT,
    "recordingUrl" TEXT,
    "followUpUser" TEXT,
    "followUpDate" TIMESTAMP(3),
    "followUpTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_cnpj_key" ON "companies"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "company_onboarding_companyId_key" ON "company_onboarding"("companyId");

-- AddForeignKey
ALTER TABLE "company_contracts" ADD CONSTRAINT "company_contracts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_onboarding" ADD CONSTRAINT "company_onboarding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_activities" ADD CONSTRAINT "sales_activities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
