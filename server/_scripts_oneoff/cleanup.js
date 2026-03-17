// Limpa empresas com status inválido e recria com status corretos
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const INVALID = new Set(['Cliente Ativo', 'Churned', 'Em Implementação', 'Pausado']);

const companies = await prisma.companies.findMany({ select: { id: true, Status: true, Nome_da_empresa: true } });

let deleted = 0;
for (const c of companies) {
    if (INVALID.has(c.Status)) {
        await prisma.companies.delete({ where: { id: c.id } });
        console.log(`🗑️  Removida: ${c.Nome_da_empresa} (${c.Status})`);
        deleted++;
    }
}

console.log(`\n✅ ${deleted} empresas com status inválido removidas.\n`);
await prisma.$disconnect();
