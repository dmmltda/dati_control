/**
 * SCRIPT DE DIAGNÓSTICO — DRY RUN (NÃO APAGA NADA)
 * ──────────────────────────────────────────────────
 * Execute contra o banco de PRODUÇÃO do Railway para identificar
 * exatamente o que será removido antes de qualquer limpeza.
 *
 * Como usar:
 *   DATABASE_URL="<connection_string_railway>" node /tmp/cleanup_prod_diagnosis.mjs
 *
 * A connection string do Railway está em:
 *   Railway Dashboard → seu projeto → PostgreSQL → Connect → "Postgres Connection URL"
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['warn', 'error'],
});

// ─── Empresas de teste conhecidas (nomes identificados no diagnóstico) ─────────
const EMPRESAS_TESTE = [
  'Fred cliente ativo',
  'ABC importador',
  'Lucio Ltda',
  'Teste aviso',
  'dfa',
  'Teste email',
  'Empresa Teste',
  'Empresa Diagnóstico',
];

// ─── E-mails de teste conhecidos (Vetor 2 — requisições curl para produção) ───
const EMAILS_FAKE = [
  'joao.silva@teste.com',
  'marta.souza@teste.com',
  'carlos.gomes@teste.com',
];

async function diagnose() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  DIAGNÓSTICO DE LIMPEZA — PRODUÇÃO (DRY RUN / SEM ALTERAÇÕES) ');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── 1. BANCO CONECTADO ─────────────────────────────────────────────────────
  const [{ count: totalEmpresas }] = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count FROM companies
  `;
  const [{ count: totalContatos }] = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count FROM contacts
  `;
  console.log(`📊 Banco conectado com sucesso`);
  console.log(`   Total de empresas em produção: ${totalEmpresas}`);
  console.log(`   Total de contatos em produção: ${totalContatos}\n`);

  // ── 2. VETOR 1 — Empresas de teste criadas via UI ─────────────────────────
  console.log('─────────────────────────────────────────────────────────────');
  console.log('🔴 VETOR 1 — Empresas de teste criadas via UI de produção');
  console.log('─────────────────────────────────────────────────────────────');

  const empresasTeste = await prisma.companies.findMany({
    where: {
      Nome_da_empresa: {
        in: EMPRESAS_TESTE,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      Nome_da_empresa: true,
      createdAt: true,
      Status: true,
      company_type: true,
      _count: {
        select: {
          contacts: true,
          activities: true,
          company_followups: true,
          company_notes: true,
          company_meetings: true,
          company_products: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (empresasTeste.length === 0) {
    console.log('   ✅ Nenhuma empresa de teste encontrada pelos nomes conhecidos.');
  } else {
    console.log(`   ⚠️  ${empresasTeste.length} empresa(s) de teste encontrada(s):\n`);
    for (const e of empresasTeste) {
      console.log(`   • [${e.id}]`);
      console.log(`     Nome: ${e.Nome_da_empresa}`);
      console.log(`     Criada em: ${e.createdAt.toISOString()}`);
      console.log(`     Status: ${e.Status || '(vazio)'} | Tipo: ${e.company_type}`);
      console.log(`     Dados vinculados que serão removidos em cascata:`);
      console.log(`       - Contatos: ${e._count.contacts}`);
      console.log(`       - Atividades: ${e._count.activities}`);
      console.log(`       - Follow-ups: ${e._count.company_followups}`);
      console.log(`       - Notas: ${e._count.company_notes}`);
      console.log(`       - Reuniões: ${e._count.company_meetings ?? 0}`);
      console.log(`       - Produtos: ${e._count.company_products}\n`);
    }
  }

  // ── 3. VETOR 1b — Empresas suspeitas por nome (genéricas) ─────────────────
  console.log('─────────────────────────────────────────────────────────────');
  console.log('🟠 VETOR 1b — Empresas com nomes genéricos criadas recentemente');
  console.log('─────────────────────────────────────────────────────────────');

  const empresasSuspeitas = await prisma.companies.findMany({
    where: {
      AND: [
        { Nome_da_empresa: { notIn: EMPRESAS_TESTE, mode: 'insensitive' } },
        {
          OR: [
            { Nome_da_empresa: { contains: 'teste', mode: 'insensitive' } },
            { Nome_da_empresa: { contains: 'test', mode: 'insensitive' } },
            { Nome_da_empresa: { contains: 'dfa', mode: 'insensitive' } },
            { Nome_da_empresa: { contains: 'diagnóstico', mode: 'insensitive' } },
            { Nome_da_empresa: { contains: 'exemplo', mode: 'insensitive' } },
            { Nome_da_empresa: { contains: 'fictício', mode: 'insensitive' } },
          ],
        },
        {
          createdAt: {
            gte: new Date('2026-03-12T00:00:00Z'),
          },
        },
      ],
    },
    select: {
      id: true,
      Nome_da_empresa: true,
      createdAt: true,
      Status: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  if (empresasSuspeitas.length === 0) {
    console.log('   ✅ Nenhuma empresa adicional suspeita encontrada.\n');
  } else {
    console.log(`   ⚠️  ${empresasSuspeitas.length} empresa(s) suspeita(s) adicionais:\n`);
    for (const e of empresasSuspeitas) {
      console.log(`   • [${e.id}] "${e.Nome_da_empresa}" — criada ${e.createdAt.toISOString()}`);
    }
    console.log('   (Revisar manualmente — não entram no script de limpeza automático)\n');
  }

  // ── 4. VETOR 2 — E-mails fake via curl para produção ──────────────────────
  console.log('─────────────────────────────────────────────────────────────');
  console.log('🔴 VETOR 2 — E-mails fake injetados via curl direto no Railway');
  console.log('─────────────────────────────────────────────────────────────');

  const contatosFake = await prisma.contacts.findMany({
    where: {
      Email_1: {
        in: EMAILS_FAKE,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      Nome_do_contato: true,
      Email_1: true,
      createdAt: true,
      companyId: true,
      companies: {
        select: { Nome_da_empresa: true },
      },
    },
  });

  // Também verificar nos emails_send_log (inbound)
  const emailsInbound = await prisma.email_send_log.findMany({
    where: {
      AND: [
        { direction: 'inbound' },
        {
          recipient: {
            in: EMAILS_FAKE,
          },
        },
      ],
    },
    select: {
      id: true,
      recipient: true,
      subject: true,
      sent_at: true,
      direction: true,
    },
  });

  if (contatosFake.length === 0) {
    console.log('   ✅ Nenhum contato com e-mail fake encontrado.\n');
  } else {
    console.log(`   ⚠️  ${contatosFake.length} contato(s) fake encontrado(s):\n`);
    for (const c of contatosFake) {
      console.log(`   • [${c.id}]`);
      console.log(`     Nome: ${c.Nome_do_contato || '(sem nome)'}`);
      console.log(`     Email: ${c.Email_1}`);
      console.log(`     Criado em: ${c.createdAt.toISOString()}`);
      console.log(`     Empresa vinculada: ${c.companies?.Nome_da_empresa || '(nenhuma)'}\n`);
    }
  }

  if (emailsInbound.length > 0) {
    console.log(`   📧 Registros no email_send_log (inbound) relacionados:`);
    for (const el of emailsInbound) {
      console.log(`   • [${el.id}] ${el.recipient} — ${el.subject} — ${el.sent_at?.toISOString()}`);
    }
    console.log('');
  }

  // ── 5. VETOR 3 — Audit logs da Gabi (SYSTEM) ──────────────────────────────
  console.log('─────────────────────────────────────────────────────────────');
  console.log('🟡 VETOR 3 — Entradas de sistema (Gabi) no audit_log');
  console.log('─────────────────────────────────────────────────────────────');

  const [{ count: gabiLogs }] = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count FROM audit_logs WHERE actor_id IS NULL
  `;
  const [{ count: gabiLogsRecentes }] = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count FROM audit_logs 
    WHERE actor_id IS NULL AND created_at >= NOW() - INTERVAL '7 days'
  `;

  console.log(`   Total de entradas de sistema no audit_log: ${gabiLogs}`);
  console.log(`   Últimos 7 dias: ${gabiLogsRecentes}`);
  console.log(`   → NÃO serão removidas — requerem filtro na UI, não deleção.\n`);

  // ── 6. RESUMO FINAL ────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  RESUMO DO QUE SERIA REMOVIDO EM UMA LIMPEZA CIRÚRGICA');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const idsEmpresasParaRemover = empresasTeste.map(e => e.id);

  console.log(`  Vetor 1 — Empresas de teste (+ cascata): ${empresasTeste.length} empresa(s)`);
  console.log(`  Vetor 2 — Contatos/emails fake:          ${contatosFake.length} contato(s)`);
  console.log(`  Vetor 3 — Audit logs sistema:            MANTER (filtrar na UI)\n`);

  if (idsEmpresasParaRemover.length > 0) {
    console.log('  IDs das empresas a remover:');
    for (const id of idsEmpresasParaRemover) {
      console.log(`    - ${id}`);
    }
  }

  const IDS_CONTATOS_FAKE = contatosFake.map(c => c.id);
  if (IDS_CONTATOS_FAKE.length > 0) {
    console.log('\n  IDs dos contatos fake a remover:');
    for (const id of IDS_CONTATOS_FAKE) {
      console.log(`    - ${id}`);
    }
  }

  console.log('\n  ⚠️  NADA FOI ALTERADO — this was a DRY RUN.');
  console.log('  Para executar a limpeza real, rode: cleanup_prod_EXECUTE.mjs');
  console.log('═══════════════════════════════════════════════════════════════\n');

  await prisma.$disconnect();
}

diagnose().catch(async (e) => {
  console.error('Erro no diagnóstico:', e);
  await prisma.$disconnect();
  process.exit(1);
});
