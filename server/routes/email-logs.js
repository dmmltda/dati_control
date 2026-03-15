/**
 * ============================================================================
 * Email Logs API — Monitor de E-mails
 * ============================================================================
 * GET /api/email-logs        — Lista log de e-mails com filtros e paginação
 * GET /api/email-logs/stats  — Estatísticas resumidas (total, sent, failed, blocked)
 * ============================================================================
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// ── GET /api/email-logs ──────────────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            status,
            template,
            search,
            dateFrom,
            dateTo,
            sort = 'sent_at',
            order = 'desc',
        } = req.query;

        const take = Math.min(parseInt(limit) || 50, 2000);
        const skip = (parseInt(page) - 1) * take;

        const where = {};

        if (status) {
            where.status = status;
        }
        if (template) {
            where.template = template;
        }
        if (search) {
            where.OR = [
                { recipient: { contains: search, mode: 'insensitive' } },
                { subject:   { contains: search, mode: 'insensitive' } },
                { tag:       { contains: search, mode: 'insensitive' } },
                { template:  { contains: search, mode: 'insensitive' } },
            ];
        }
        if (dateFrom || dateTo) {
            where.sent_at = {};
            if (dateFrom) where.sent_at.gte = new Date(dateFrom);
            if (dateTo)   where.sent_at.lte = new Date(dateTo + 'T23:59:59Z');
        }

        const [rows, total] = await Promise.all([
            prisma.email_send_log.findMany({
                where,
                orderBy: { [sort]: order },
                skip,
                take,
            }),
            prisma.email_send_log.count({ where }),
        ]);

        res.json({
            data: rows,
            total,
            page: parseInt(page),
            pages: Math.ceil(total / take),
        });
    } catch (err) {
        console.error('[email-logs] GET /', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/email-logs/stats ─────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        const { dateFrom, dateTo } = req.query;

        const where = {};
        if (dateFrom || dateTo) {
            where.sent_at = {};
            if (dateFrom) where.sent_at.gte = new Date(dateFrom);
            if (dateTo)   where.sent_at.lte = new Date(dateTo + 'T23:59:59Z');
        }

        const [total, sent, failed, blocked, pending] = await Promise.all([
            prisma.email_send_log.count({ where }),
            prisma.email_send_log.count({ where: { ...where, status: 'sent' } }),
            prisma.email_send_log.count({ where: { ...where, status: 'failed' } }),
            prisma.email_send_log.count({ where: { ...where, status: 'blocked' } }),
            prisma.email_send_log.count({ where: { ...where, status: 'pending' } }),
        ]);

        // Últimos 7 dias por dia
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const recentLogs = await prisma.email_send_log.findMany({
            where: { sent_at: { gte: sevenDaysAgo } },
            select: { sent_at: true, status: true },
            orderBy: { sent_at: 'asc' },
        });

        // Group by day
        const byDay = {};
        recentLogs.forEach(log => {
            const day = log.sent_at.toISOString().split('T')[0];
            if (!byDay[day]) byDay[day] = { sent: 0, failed: 0, blocked: 0 };
            if (log.status === 'sent')    byDay[day].sent++;
            if (log.status === 'failed')  byDay[day].failed++;
            if (log.status === 'blocked') byDay[day].blocked++;
        });

        res.json({ total, sent, failed, blocked, pending, byDay });
    } catch (err) {
        console.error('[email-logs] GET /stats', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;

// ── GET /api/email-logs/:id/thread ───────────────────────────────────────────
router.get('/:id/thread', async (req, res) => {
    try {
        const { id } = req.params;
        let current = await prisma.email_send_log.findUnique({ where: { id } });
        if (!current) return res.status(404).json({ error: 'Log não encontrado.' });
        
        // Encontra o root/email original subindo a árvore
        while (current.parent_email_id) {
            const parent = await prisma.email_send_log.findUnique({ where: { id: current.parent_email_id } });
            if (!parent) break; // Quebrou a cadeia
            current = parent;
        }

        // A partir do root, desce para encontrar todos os filhos (até limites razoáveis)
        const thread = [];
        let toProcess = [current];
        let maxDepth = 100;
        
        while (toProcess.length > 0 && maxDepth > 0) {
            const node = toProcess.shift();
            // Verifica se já não inserimos
            if (!thread.some(t => t.id === node.id)) {
                thread.push(node);
                const children = await prisma.email_send_log.findMany({ 
                    where: { parent_email_id: node.id },
                    orderBy: { sent_at: 'asc' }
                });
                toProcess.push(...children);
            }
            maxDepth--;
        }
        
        // Ordena cronologicamente
        thread.sort((a,b) => new Date(a.sent_at) - new Date(b.sent_at));
        res.json({ data: thread });
    } catch (err) {
        console.error('[email-logs] GET /:id/thread', err);
        res.status(500).json({ error: err.message });
    }
});
