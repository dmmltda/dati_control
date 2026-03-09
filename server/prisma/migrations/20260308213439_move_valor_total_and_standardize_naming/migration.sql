/*
  Warnings:

  - You are about to drop the column `Valor_Total` on the `company_products` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "company_products" DROP COLUMN "Valor_Total",
ADD COLUMN     "Valor_total" DECIMAL(15,2);
