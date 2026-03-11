/*
  Warnings:

  - A unique constraint covering the columns `[clerk_org_id]` on the table `companies` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "clerk_org_id" TEXT,
ADD COLUMN     "company_type" TEXT NOT NULL DEFAULT 'standalone',
ADD COLUMN     "mom_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "department" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "timezone" TEXT DEFAULT 'America/Sao_Paulo',
ADD COLUMN     "user_type" TEXT NOT NULL DEFAULT 'standard';

-- CreateTable
CREATE TABLE "user_memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "can_create" BOOLEAN NOT NULL DEFAULT true,
    "can_edit" BOOLEAN NOT NULL DEFAULT true,
    "can_delete" BOOLEAN NOT NULL DEFAULT false,
    "can_export" BOOLEAN NOT NULL DEFAULT false,
    "invited_by" TEXT,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_invites" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company_mom_id" TEXT NOT NULL,
    "user_type" TEXT NOT NULL DEFAULT 'standard',
    "companies_json" TEXT,
    "clerk_invite_id" TEXT,
    "invited_by" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_memberships_user_id_company_id_key" ON "user_memberships"("user_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_invites_clerk_invite_id_key" ON "user_invites"("clerk_invite_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_clerk_org_id_key" ON "companies"("clerk_org_id");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_mom_id_fkey" FOREIGN KEY ("mom_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_company_mom_id_fkey" FOREIGN KEY ("company_mom_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
