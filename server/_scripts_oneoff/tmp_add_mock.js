import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    await prisma.company_nps.create({
        data: {
            id: 'nps-test-webhook',
            companyId: 'be9c621d-5a72-4c28-8559-a0dd0b5c2232',
            Data: new Date(),
            Destinatario: 'daniel.ti@example.com',
            Formulario: 'NPS',
            Score: 'Pendente',
            updatedAt: new Date()
        }
    });
    console.log("Criado mock pendente");
}
main().catch(console.error).finally(() => prisma.$disconnect());
