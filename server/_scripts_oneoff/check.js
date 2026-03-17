import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const emails = await prisma.email_send_log.findMany({
    where: { direction: 'inbound' },
    orderBy: { sent_at: 'desc' },
    take: 3
  });
  console.log(emails.map(e => ({ id: e.id, content: e.content })));
}
run().catch(console.error).finally(() => prisma.$disconnect());
