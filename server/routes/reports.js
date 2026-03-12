/**
 * Rota: /api/reports — Tabela nativa de dados do Journey
 * Retorna todos os campos de empresa + dados agregados, com filtros dinâmicos
 */
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, getAuth } from '@clerk/express';

const router = express.Router();
const prisma = new PrismaClient();

// ── Helper: busca os IDs de empresa acessíveis pelo usuário ──────────────────
async function getAccessibleCompanyIds(userId, userType) {
  if (userType === 'master') {
    return null; // master tem acesso a tudo
  } else {
    const memberships = await prisma.user_memberships.findMany({
      where: { user_id: userId },
      select: { company_id: true },
    });
    return memberships.map(m => m.company_id);
  }
}


// ── GET /api/reports/data — tabela principal ─────────────────────────────────
router.get('/data', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) return res.status(403).json({ error: 'Usuário não encontrado' });

    const accessibleIds = await getAccessibleCompanyIds(userId, user.user_type);
    if (accessibleIds !== null && accessibleIds.length === 0) return res.json({ rows: [], total: 0, filterOptions: {} });

    // ── Filtros dinâmicos ────────────────────────────────────────────────────
    const { status, tipo, segmento, health_score, cs, dateFrom, dateTo, search } = req.query;

    const where = accessibleIds !== null ? { id: { in: accessibleIds } } : {};

    if (status)       where.Status = status;
    if (tipo)         where.Tipo_de_empresa = tipo;
    if (segmento)     where.Segmento_da_empresa = segmento;
    if (health_score) where.Health_Score = health_score;
    if (cs)           where.Nome_do_CS = cs;
    if (search)       where.Nome_da_empresa = { contains: search, mode: 'insensitive' };
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo)   where.createdAt.lte = new Date(new Date(dateTo).setHours(23, 59, 59, 999));
    }

    // ── Query principal com dados relacionados ───────────────────────────────
    const companies = await prisma.companies.findMany({
      where,
      include: {
        company_products: {
          select: { Produto_DATI: true, Valor_total: true },
        },
        company_followups: {
          select: { Data_inclusao: true },
          orderBy: { Data_inclusao: 'desc' },
          take: 1,
        },
        company_nps: {
          select: { Score: true, Data: true },
          orderBy: { Data: 'desc' },
          take: 1,
        },
        _count: {
          select: { activities: true, company_tickets: true },
        },
      },
      orderBy: { Nome_da_empresa: 'asc' },
    });

    // ── Formatar linhas da tabela ─────────────────────────────────────────────
    const rows = companies.map(c => ({
      id:                  c.id,
      nome:                c.Nome_da_empresa,
      cnpj:                c.CNPJ_da_empresa     ?? '',
      status:              c.Status             ?? '',
      tipo:                c.Tipo_de_empresa     ?? '',
      segmento:            c.Segmento_da_empresa ?? '',
      health_score:        c.Health_Score        ?? '',
      nps:                 c.NPS || c.company_nps[0]?.Score || '',
      cs:                  c.Nome_do_CS          ?? '',
      usuario:             c.Nome_do_usu_rio     ?? '',
      cidade:              c.Cidade              ?? '',
      estado:              c.Estado              ?? '',
      erp:                 (c.Qual_ERP_ ?? c.ERP) ?? '',
      lead:                c.Lead                ?? '',
      modo:                c.Modo_da_empresa     ?? '',
      site:                c.Site                ?? '',
      inicio_cs:           c.In_cio_com_CS       ?? null,
      data_interesse:      c.Data_Interesse       ?? null,
      inicio_onboarding:   c.Data_in_cio_onboarding ?? null,
      termino_onboarding:  c.Data_t_rmino_onboarding ?? null,
      data_follow_up:      c.Data_de_follow_up   ?? null,
      data_churn:          c.Data_de_churn       ?? null,
      motivo_churn:        c.Motivo_do_churn     ?? '',
      onboarding_fechado:  c.Fechamento_onboarding__Sim_N_o_ ?? '',
      sucesso_ext:         c.Sucesso_Extraordin_rio ?? '',
      objective:           c.Principal_Objetivo  ?? '',
      dores:               c.Dores_Gargalos      ?? '',
      // Agregados
      produtos:            c.company_products.map(p => p.Produto_DATI).filter(Boolean).join(', '),
      valor_total:         c.company_products.reduce((s, p) => s + (parseFloat(p.Valor_total) || 0), 0),
      ultimo_followup:     c.company_followups[0]?.Data_inclusao ?? null,
      total_atividades:    c._count.activities,
      total_tickets:       c._count.company_tickets,
      createdAt:           c.createdAt,
    }));

    // ── Opções únicas para os selects de filtro ───────────────────────────────
    const allForFilters = await prisma.companies.findMany({
      where: accessibleIds !== null ? { id: { in: accessibleIds } } : {},
      select: {
        Status: true,
        Tipo_de_empresa: true,
        Segmento_da_empresa: true,
        Health_Score: true,
        Nome_do_CS: true,
      },
    });

    const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();
    const filterOptions = {
      status:       uniq(allForFilters.map(c => c.Status)),
      tipo:         uniq(allForFilters.map(c => c.Tipo_de_empresa)),
      segmento:     uniq(allForFilters.map(c => c.Segmento_da_empresa)),
      health_score: uniq(allForFilters.map(c => c.Health_Score)),
      cs:           uniq(allForFilters.map(c => c.Nome_do_CS)),
    };

    res.json({ rows, total: rows.length, filterOptions });

  } catch (err) {
    console.error('[reports/data] erro:', err);
    res.status(500).json({ error: 'Erro ao buscar dados' });
  }
});

export default router;
