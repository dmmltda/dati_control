import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const messages = await prisma.whatsapp_messages.findMany({
    orderBy: { created_at: 'desc' },
    take: 10,
    select: { direction: true, origin: true, content: true, status: true, conversation: { select: { wa_phone_number: true } } }
  });
  console.log(JSON.stringify(messages, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
