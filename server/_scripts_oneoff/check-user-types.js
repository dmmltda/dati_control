import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const types = await prisma.users.findMany({
    select: { user_type: true },
    distinct: ['user_type']
  });
  console.log(JSON.stringify(types, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
