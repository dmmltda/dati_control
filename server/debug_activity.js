import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    // Verifica a atividade criada pela Gabi
    const atividade = await prisma.activities.findUnique({
        where: { id: '47ce0dbe-4dd3-4f6e-92e9-300dd0cd9d0a' },
        include: {
            activity_assignees: true,
            companies: true
        }
    });
    console.log('\n--- Atividade da Gabi ---');
    console.log(JSON.stringify(atividade, null, 2));
    await prisma.$disconnect();
}
run().catch(console.error);
