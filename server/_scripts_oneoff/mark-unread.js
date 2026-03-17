import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.notifications.updateMany({
    data: {
      read: false
    }
  });
  console.log('Todas as notificações foram marcadas como NÃO lidas.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
