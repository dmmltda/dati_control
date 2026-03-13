import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Chaves válidas atuais (de permissions.js)
const VALID_KEYS = [
  'dashboard.view', 'companies.view', 'my_tasks.view', 'reports.view',
  'audit.view', 'test_logs.view', 'gabi.view',
  'company_tab.basic_data', 'company_tab.products', 'company_tab.contacts',
  'company_tab.cs', 'company_tab.activities',
  'company_edit.basic_data', 'company_edit.products', 'company_edit.contacts',
  'company_edit.cs', 'company_edit.activities',
];

// Remove permissões obsoletas de todos os usuários
const result = await prisma.user_feature_permissions.deleteMany({
  where: { permission: { notIn: VALID_KEYS } }
});

console.log(`✅ Removidas ${result.count} permissões obsoletas.`);

// Mostra o estado atual
const users = await prisma.users.findMany({ select: { id: true, nome: true, email: true } });
for (const u of users) {
  const perms = await prisma.user_feature_permissions.findMany({ where: { user_id: u.id }, select: { permission: true } });
  if (perms.length > 0) {
    console.log(`\n👤 ${u.nome} (${u.email}): ${perms.length} permissões`);
    perms.forEach(p => console.log(`  ✅ ${p.permission}`));
  }
}

await prisma.$disconnect();
