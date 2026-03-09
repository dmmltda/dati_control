-- AlterTable
ALTER TABLE "company_products" ADD COLUMN     "Help_desk_mensal" TEXT,
ADD COLUMN     "Hora_help_desk_adicional" DECIMAL(15,2),
ADD COLUMN     "Quantidade_usuarios" TEXT,
ADD COLUMN     "Setup" TEXT,
ADD COLUMN     "Valor_minimo" DECIMAL(15,2),
ADD COLUMN     "Valor_por_DI_DUIMP" DECIMAL(15,2),
ADD COLUMN     "Valor_por_documento" TEXT,
ADD COLUMN     "Valor_por_processo" DECIMAL(15,2),
ADD COLUMN     "Valor_usuario_adicional" DECIMAL(15,2);
