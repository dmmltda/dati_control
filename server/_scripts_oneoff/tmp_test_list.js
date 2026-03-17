import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const records = await prisma.company_nps.findMany({ take: 5, orderBy: { createdAt: 'desc' } });
    console.log("Records:", records);
}
main().catch(console.error).finally(() => prisma.$disconnect());
