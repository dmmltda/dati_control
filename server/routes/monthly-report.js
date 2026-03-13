/**
 * Rota: /api/monthly-report — Relatório Mensal de Aderência
 * Retorna dados por empresa para o mês selecionado:
 *   - Bloco 1: Chamados (company_tickets)
 *   - Bloco 2: Help Desk (horas contratadas vs. utilizadas)
 *   - Bloco 3: Rotinas DATI Import (pendente integração)
 */
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, getAuth } from '@clerk/express';

const router = express.Router();
const prisma = new PrismaClient();


// ── Helper: verifica se o usuário tem acesso à empresa ────────────────────────
async function hasAccessToCompany(userId, userType, companyId) {
  if (userType === 'master') return true;
  const membership = await prisma.user_memberships.findFirst({
    where: { user_id: userId, company_id: companyId },
  });
  return !!membership;
}

// ── Helper: parseia mês no formato YYYY-MM ────────────────────────────────────
function parseMonth(monthStr) {
  const now = new Date();
  if (!monthStr || !/^\d{4}-\d{2}$/.test(monthStr)) {
    // Padrão: mês atual
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    };
  }
  const [year, month] = monthStr.split('-').map(Number);
  return { year, month };
}

// ── Helper: inferir classificação do ticket ───────────────────────────────────
// TODO: adicionar campo classificacao em company_tickets
//   valores: 'Bug' | 'Suporte' | 'Novo Recurso'
function inferClassificacao(ticket) {
  const resumo = (ticket.Resumo || '').toLowerCase();
  if (resumo.includes('bug') || resumo.includes('erro') || resumo.includes('falha')) {
    return 'Bug';
  }
  if (resumo.includes('novo recurso') || resumo.includes('feature') || resumo.includes('melhoria')) {
    return 'Novo Recurso';
  }
  return 'Suporte';
}

// ── Helper: formatar minutos como "Xh YYmin" ──────────────────────────────────
function formatMinutes(totalMinutes) {
  if (totalMinutes === null || totalMinutes === undefined) return '—';
  const neg = totalMinutes < 0;
  const abs = Math.abs(totalMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const str = h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`;
  return neg ? `-${str}` : str;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/monthly-report/overview?month=YYYY-MM
// Resumo de TODAS as empresas ativas — para a aba "Aderência Mensal"
// ─────────────────────────────────────────────────────────────────────────────
router.get('/overview', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) return res.status(403).json({ error: 'Usuário não encontrado' });

    const { month } = req.query;
    const { year, month: m } = parseMonth(month);
    const startDate = new Date(year, m - 1, 1);
    const endDate   = new Date(year, m, 0, 23, 59, 59, 999); // último dia do mês

    // Busca empresas ativas acessíveis
    let companyWhere = { Status: 'Ativo' };
    if (user.user_type !== 'master') {
      const memberships = await prisma.user_memberships.findMany({
        where: { user_id: userId },
        select: { company_id: true },
      });
      const ids = memberships.map(m => m.company_id);
      if (ids.length === 0) return res.json([]);
      companyWhere.id = { in: ids };
    }

    const companies = await prisma.companies.findMany({
      where: companyWhere,
      include: {
        company_tickets: {
          where: {
            Data: { gte: startDate, lte: endDate },
          },
        },
        company_products: {
          select: { Total_horas_hd: true },
        },
      },
      orderBy: { Nome_da_empresa: 'asc' },
    });

    const rows = companies.map(c => {
      const tickets = c.company_tickets || [];
      const totalChamados = tickets.length;

      // Horas contratadas (soma de todos os produtos)
      const horasContratadas = c.company_products.reduce((s, p) => s + (p.Total_horas_hd || 0), 0);
      const minutosContratados = horasContratadas * 60;

      // TODO: aguardando campo duration_minutes em company_tickets
      const minutosUtilizados = 0; // TODO: soma de duration_minutes de tickets tipo Suporte/NR
      const saldoMinutos = minutosContratados - minutosUtilizados;

      // Status calculado
      let status = 'cinza';
      if (minutosContratados > 0) {
        const hdNegativo = saldoMinutos < 0;
        const hdMuitoNegativo = saldoMinutos < -120; // < -2h
        if (hdMuitoNegativo) status = 'vermelho';
        else if (hdNegativo) status = 'amarelo';
        else status = 'verde';
      }

      return {
        id: c.id,
        nome: c.Nome_da_empresa,
        cs: c.Nome_do_CS || '—',
        chamados: totalChamados,
        saldo_hd_minutos: saldoMinutos,
        saldo_hd_formatado: formatMinutes(saldoMinutos),
        aderencia_geral: null, // TODO: integrar com DATI Import
        status,
      };
    });

    res.json(rows);
  } catch (err) {
    console.error('[monthly-report/overview] erro:', err);
    res.status(500).json({ error: 'Erro ao gerar visão geral' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/monthly-report/:companyId?month=YYYY-MM
// Dados completos do relatório mensal de uma empresa
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:companyId', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) return res.status(403).json({ error: 'Usuário não encontrado' });

    const { companyId } = req.params;
    const { month } = req.query;

    // Verificar acesso
    const acesso = await hasAccessToCompany(userId, user.user_type, companyId);
    if (!acesso) return res.status(403).json({ error: 'Acesso negado a esta empresa' });

    const { year, month: m } = parseMonth(month);
    const startDate = new Date(year, m - 1, 1);
    const endDate   = new Date(year, m, 0, 23, 59, 59, 999);

    // ── Busca dados ──────────────────────────────────────────────────────────
    const [company, tickets, products] = await Promise.all([
      prisma.companies.findUnique({ where: { id: companyId } }),
      prisma.company_tickets.findMany({
        where: {
          companyId,
          Data: { gte: startDate, lte: endDate },
        },
        orderBy: { Data: 'asc' },
      }),
      prisma.company_products.findMany({
        where: { companyId },
        select: { Total_horas_hd: true, Produto_DATI: true },
      }),
    ]);

    if (!company) return res.status(404).json({ error: 'Empresa não encontrada' });

    // ═════════════════════════════════════════════════════════════════════════
    // BLOCO 1 — CHAMADOS
    // ═════════════════════════════════════════════════════════════════════════
    const ticketsComClassif = tickets.map(t => ({
      ...t,
      classificacao: inferClassificacao(t),
      // TODO: adicionar campo prazo_resolucao_dias em company_tickets
      //   calculado entre data abertura e data fechamento
      prazo_dias: null, // TODO: aguardando campo de data de fechamento
    }));

    // Contadores
    const total = ticketsComClassif.length;
    // TODO: recorrentes = tickets que aparecem com o mesmo Resumo em meses anteriores
    const recorrentes = 0;

    // Por classificação
    const classifMap = { Bug: 0, Suporte: 0, 'Novo Recurso': 0 };
    ticketsComClassif.forEach(t => {
      if (classifMap[t.classificacao] !== undefined) classifMap[t.classificacao]++;
    });
    const por_classificacao = Object.entries(classifMap).map(([label, value]) => ({ label, value }));

    // Por solicitante (Autor)
    const autorMap = {};
    ticketsComClassif.forEach(t => {
      const autor = t.Autor || 'Desconhecido';
      autorMap[autor] = (autorMap[autor] || 0) + 1;
    });
    const por_solicitante = Object.entries(autorMap)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label, value }));

    // Por prazo (todos nulos por ora — TODO)
    const por_prazo = [
      { label: 'Até 1 dia', value: 0 },
      { label: '2 a 3 dias', value: 0 },
      { label: 'Acima de 3 dias', value: 0 },
    ];

    // Lista detalhada
    const lista = ticketsComClassif.map(t => ({
      numero:        t.Numero || '—',
      resumo:        t.Resumo || '—',
      autor:         t.Autor  || '—',
      data:          t.Data ? t.Data.toISOString().slice(0, 10) : null,
      classificacao: t.classificacao,
      prazo_dias:    t.prazo_dias, // TODO
      link:          t.Link  || null,
    }));

    const chamados = {
      total,
      recorrentes,
      por_classificacao,
      por_solicitante,
      por_prazo,
      lista,
    };

    // ═════════════════════════════════════════════════════════════════════════
    // BLOCO 2 — HELP DESK
    // Regra crítica: Bug NÃO é descontado; Suporte e Novo Recurso SIM.
    // ═════════════════════════════════════════════════════════════════════════
    const horasContratadas = products.reduce((s, p) => s + (p.Total_horas_hd || 0), 0);
    const minutosContratados = horasContratadas * 60;

    // TODO: adicionar campo duration_minutes em company_tickets
    //   para calcular horas utilizadas de help desk por chamado
    const minutosUtilizados = 0; // TODO: soma de duration_minutes de tickets tipo Suporte ou Novo Recurso

    // Por tipo (minutos por classificação)
    const minutosPorClassif = { Bug: 0, Suporte: 0, 'Novo Recurso': 0 };
    // TODO: quando duration_minutes existir, somar aqui por classificação

    const saldoMinutos = minutosContratados - minutosUtilizados;

    const helpdesk = {
      horas_contratadas: horasContratadas,
      horas_utilizadas_minutos: minutosUtilizados,
      saldo_minutos: saldoMinutos,
      saldo_formatado: formatMinutes(saldoMinutos),
      horas_contratadas_formatado: formatMinutes(minutosContratados),
      horas_utilizadas_formatado: formatMinutes(minutosUtilizados),
      por_tipo: [
        { label: 'Bug',          value_minutos: minutosPorClassif.Bug,           descontado: false },
        { label: 'Suporte',      value_minutos: minutosPorClassif.Suporte,        descontado: true },
        { label: 'Novo Recurso', value_minutos: minutosPorClassif['Novo Recurso'], descontado: true },
      ],
      observacao: 'Chamados com classificação Bug não são descontados da franquia de horas.',
    };

    // ═════════════════════════════════════════════════════════════════════════
    // BLOCO 3 — ROTINAS (DATI Import)
    // TODO: integrar com DATI Import API
    //   GET /api/client-report?company_id=X&month=YYYY-MM
    //   Retorna: { rotinas: [{ nome, total, automatico, percentual }], aderencia_geral }
    // ═════════════════════════════════════════════════════════════════════════
    const ROTINAS_NOMES = [
      'Previsão de carga pronta na origem',
      'Confirmação de carga pronta na origem',
      'Solicitação de invoice e packing',
      'Confirmação de invoice e packing',
      'Solicitação dos originais invoice e packing',
      'Solicitação de booking',
      'Booking enviado',
      'Confirmação de saída da origem',
      'Confirmação de chegada no destino',
      'Confirmação de presença de carga',
      'Extração de dados do mercante',
      'Registro de DI/DUIMP',
      'Canal da DI/DUIMP',
      'C.I',
      'Emissão do espelho de NF',
      'Data da coleta',
      'Data da entrega',
    ];

    // Mock data por rotina — TODO: substituir pela chamada real ao DATI Import API
    const MOCK_ACESSOS = [12, 12, 10, 10, 8, 6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 3];
    const MOCK_AUTO    = [11, 12,  8,  7, 6, 6, 5, 4, 5, 3, 4, 4, 3, 2, 3, 2, 3];

    const rotinasItens = ROTINAS_NOMES.map((nome, i) => {
      const total      = MOCK_ACESSOS[i] ?? null;
      const automatico = MOCK_AUTO[i] ?? null;
      const percentual = (total && automatico !== null)
        ? Math.round((automatico / total) * 100)
        : null;
      return { nome, total, automatico, percentual };
    });

    const aderenciaGeral = Math.round(
      rotinasItens.reduce((s, r) => s + (r.percentual ?? 0), 0) / rotinasItens.length
    );

    // ── Resposta final ────────────────────────────────────────────────────────
    res.json({
      empresa: {
        id:   company.id,
        nome: company.Nome_da_empresa,
        cs:   company.Nome_do_CS || null,
      },
      mes:     `${year}-${String(m).padStart(2, '0')}`,
      chamados,
      helpdesk,
      rotinas: {
        aderencia_geral: aderenciaGeral,
        fonte:           'pendente_integracao', // TODO: mudar para 'dati_import' após integração
        itens:           rotinasItens,
      },
    });

  } catch (err) {
    console.error('[monthly-report/:companyId] erro:', err);
    res.status(500).json({ error: 'Erro ao gerar relatório mensal' });
  }
});

export default router;
