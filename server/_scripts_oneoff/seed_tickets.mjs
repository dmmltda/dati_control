// Run: node server/seed_tickets.mjs --list
//      node server/seed_tickets.mjs --seed
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const args = process.argv.slice(2);

async function main() {
  if (args.includes('--list')) {
    const companies = await prisma.companies.findMany({
      where: { Status: 'Ativo' },
      select: { id: true, Nome_da_empresa: true, Nome_do_CS: true },
      take: 15,
      orderBy: { Nome_da_empresa: 'asc' },
    });
    console.log('\n📋 Empresas Ativas:\n');
    companies.forEach((c, i) => {
      console.log(`${i+1}. ${c.Nome_da_empresa}`);
      console.log(`   ID: ${c.id}`);
      console.log(`   CS: ${c.Nome_do_CS || '—'}\n`);
    });
    return;
  }

  if (args.includes('--seed')) {
    const companies = await prisma.companies.findMany({
      where: { Status: 'Ativo' },
      select: { id: true, Nome_da_empresa: true },
      take: 3,
      orderBy: { Nome_da_empresa: 'asc' },
    });

    if (companies.length === 0) {
      console.log('Nenhuma empresa ativa encontrada.');
      return;
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed (2 = março)

    const ticketSets = [
      [
        { Numero: 'T-001', Resumo: 'Erro ao emitir NF de saída', Autor: 'João Silva', daysAgo: 2 },
        { Numero: 'T-002', Resumo: 'Suporte na configuração do módulo fiscal', Autor: 'Maria Oliveira', daysAgo: 5 },
        { Numero: 'T-003', Resumo: 'Bug no relatório de estoque', Autor: 'Pedro Costa', daysAgo: 8 },
        { Numero: 'T-004', Resumo: 'Novo recurso: exportar CSV de vendas', Autor: 'João Silva', daysAgo: 10 },
        { Numero: 'T-005', Resumo: 'Falha na integração com transportadora', Autor: 'Ana Lima', daysAgo: 12 },
      ],
      [
        { Numero: 'T-101', Resumo: 'Suporte configuração de usuários', Autor: 'Carlos Mendes', daysAgo: 3 },
        { Numero: 'T-102', Resumo: 'Melhoria na tela de pedidos', Autor: 'Fernanda Rocha', daysAgo: 7 },
        { Numero: 'T-103', Resumo: 'Bug: campo CNPJ não valida DV', Autor: 'Carlos Mendes', daysAgo: 14 },
      ],
      [
        { Numero: 'T-201', Resumo: 'Erro ao fazer login com SSO', Autor: 'Lucas Pereira', daysAgo: 1 },
        { Numero: 'T-202', Resumo: 'Suporte onboarding módulo compras', Autor: 'Beatriz Santos', daysAgo: 6 },
        { Numero: 'T-203', Resumo: 'Novo recurso: dashboard executivo', Autor: 'Lucas Pereira', daysAgo: 9 },
        { Numero: 'T-204', Resumo: 'Falha na sincronização com ERP legado', Autor: 'Beatriz Santos', daysAgo: 15 },
      ],
    ];

    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];
      const ticketSet = ticketSets[i] || ticketSets[0];
      console.log(`\n🏢 ${company.Nome_da_empresa} (${company.id})`);

      for (const t of ticketSet) {
        const ticketDate = new Date(year, month, now.getDate() - t.daysAgo);
        const id = randomUUID();
        await prisma.company_tickets.create({
          data: {
            id,
            companyId: company.id,
            Data: ticketDate,
            Numero: t.Numero,
            Resumo: t.Resumo,
            Autor: t.Autor,
            Link: `https://suporte.dati.com.br/ticket/${t.Numero}`,
            updatedAt: new Date(),
          },
        });
        console.log(`   ✅ ${t.Numero} — ${t.Resumo}`);
      }
    }

    console.log('\n🎉 Seed concluído! Empresas com tickets:');
    companies.forEach(c => console.log(`  • ${c.Nome_da_empresa}`));
    return;
  }

  console.log('Uso: node server/seed_tickets.mjs --list | --seed');
}

main().catch(console.error).finally(() => prisma.$disconnect());
