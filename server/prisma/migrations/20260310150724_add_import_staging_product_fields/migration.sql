-- AlterTable
ALTER TABLE "import_staging" ADD COLUMN     "cobranca_setup" TEXT,
ADD COLUMN     "produto_dati" TEXT,
ADD COLUMN     "qtd_usuarios" TEXT,
ADD COLUMN     "tipo_cobranca" TEXT,
ADD COLUMN     "total_horas_hd" INTEGER,
ADD COLUMN     "valor_adic_hd" DECIMAL(15,2),
ADD COLUMN     "valor_minimo" DECIMAL(15,2),
ADD COLUMN     "valor_setup" DECIMAL(15,2),
ADD COLUMN     "valor_unitario" DECIMAL(15,2),
ADD COLUMN     "valor_usuario_adic" DECIMAL(15,2);
