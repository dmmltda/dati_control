import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fix() {
  const users = await prisma.users.findMany();
  for (let u of users) {
    if ((u.email && u.email.toLowerCase().includes('daniel')) || (u.nome && u.nome.toLowerCase().includes('daniel'))) {
       await prisma.users.update({
         where: { id: u.id },
         data: { user_type: 'master' }
       });
       console.log(`✅ O usuário ${u.nome} (${u.email}) foi alterado para master!`);
    }
  }
}

fix().catch(console.error).finally(() => prisma.$disconnect());
