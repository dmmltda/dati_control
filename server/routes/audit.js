/**
 * @file audit.js — Rotas do Histórico de Alterações
 *
 * GET /api/audit-logs
 *   Query params:
 *     page        (default 1)
 *     limit       (default 50, max 200)
 *     action      (CREATE | UPDATE | DELETE | INVITE | MEMBERSHIP | IMPORT | SYSTEM)
 *     entity_type (company | user | membership | invite | activity | import)
 *     actor_id    (Clerk user ID)
 *     company_id  (filtrar por empresa)
 *     search      (busca livre em description, actor_label, entity_name)
 *     dateFrom    (YYYY-MM-DD)
 *     dateTo      (YYYY-MM-DD)
 *
 * Acesso: somente masters (requireMaster).
 * Masters veem todo o histórico da organização.
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireFeature } from '../middleware/checkAccess.js';

const router = Router();
const prisma = new PrismaClient();

// ─── GET /api/audit-logs ─────────────────────────────────────────────────────
router.get('/', requireFeature('audit.view'), async (req, res) => {
    const {
        page = '1',
        limit = '50',
        action,
        entity_type,
        actor_id,
        company_id,
        search,
        dateFrom,
        dateTo,
    } = req.query;

    const take = Math.min(parseInt(limit) || 50, 200);
    const skip = (Math.max(parseInt(page) || 1, 1) - 1) * take;

    // ── Construção dinâmica do WHERE ────────────────────────────────────────
    const where = {};

    if (action)      where.action = action;
    if (entity_type) where.entity_type = entity_type;
    if (actor_id)    where.actor_id = actor_id;
    if (company_id)  where.company_id = company_id;

    if (search?.trim()) {
        where.OR = [
            { description:  { contains: search.trim(), mode: 'insensitive' } },
            { actor_label:  { contains: search.trim(), mode: 'insensitive' } },
            { entity_name:  { contains: search.trim(), mode: 'insensitive' } },
        ];
    }

    if (dateFrom || dateTo) {
        where.created_at = {};
        if (dateFrom) where.created_at.gte = new Date(dateFrom + 'T00:00:00-03:00');
        if (dateTo)   where.created_at.lte = new Date(dateTo   + 'T23:59:59-03:00');
    }

    try {
        const [logs, total] = await Promise.all([
            prisma.audit_logs.findMany({
                where,
                orderBy: { created_at: 'desc' },
                skip,
                take,
                select: {
                    id: true,
                    created_at: true,
                    actor_id: true,
                    actor_label: true,
                    action: true,
                    entity_type: true,
                    entity_id: true,
                    entity_name: true,
                    description: true,
                    meta: true,
                    company_id: true,
                    ip_address: true,
                },
            }),
            prisma.audit_logs.count({ where }),
        ]);

        res.json({
            data: logs,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / take),
            limit: take,
        });
    } catch (err) {
        console.error('[GET /api/audit-logs] Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/audit-logs/stats ────────────────────────────────────────────────
// Retorna contagens por action (útil para badges no frontend)
router.get('/stats', requireFeature('audit.view'), async (req, res) => {
    try {
        const counts = await prisma.audit_logs.groupBy({
            by: ['action'],
            _count: { action: true },
            orderBy: { _count: { action: 'desc' } },
        });

        const total = await prisma.audit_logs.count();

        res.json({
            total,
            by_action: counts.map(c => ({ action: c.action, count: c._count.action })),
        });
    } catch (err) {
        console.error('[GET /api/audit-logs/stats] Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
