import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const items = await prisma.pesquisaNPS.findMany({
  where: { Respostas_JSON: { not: null } },
  orderBy: { createdAt: 'desc' },
  take: 5,
  select: { id: true, Formulario: true, Score: true, Respostas_JSON: true, Destinatarios: true }
});

for(const r of items) {
  console.log('\n=== Form:', r.Formulario, '| Score:', r.Score, '| Para:', r.Destinatarios, '===');
  console.log(JSON.stringify(r.Respostas_JSON, null, 2));
}

await prisma.$disconnect();
