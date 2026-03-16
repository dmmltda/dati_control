import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const messages = await prisma.whatsapp_messages.findMany({
    orderBy: { created_at: 'desc' },
    take: 10
  });
  console.log(JSON.stringify(messages, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
