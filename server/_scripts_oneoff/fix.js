import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function fix() {
  const users = await prisma.users.findMany({ where: { user_type: 'standard' } });
  for (const u of Object.values(users)) {
       await prisma.users.update({
         where: { id: u.id },
         data: { user_type: 'master' }
       });
       console.log("Fixed:", u.nome, u.email);
  }
}
fix().catch(console.error).finally(() => prisma.$disconnect());
