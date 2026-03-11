/**
 * @file memberships.js — Rotas de Vínculos Usuário ↔ Empresa Filha
 *
 * GET    /api/memberships              → lista vínculos (somente master)
 * POST   /api/memberships              → cria vínculo (somente master)
 * PUT    /api/memberships/:id          → edita permissões (somente master)
 * DELETE /api/memberships/:id          → remove vínculo (somente master)
 *
 * GET    /api/memberships/company/:companyId → usuários de uma empresa filha
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireMaster } from '../middleware/checkAccess.js';

const router = Router();
const prisma = new PrismaClient();

// ─── GET /api/memberships ─────────────────────────────────────────────────────
// Lista todos os vínculos (somente master)
router.get('/', requireMaster, async (req, res) => {
    try {
        const memberships = await prisma.user_memberships.findMany({
            include: {
                user: {
                    select: { id: true, nome: true, email: true, avatar: true, user_type: true }
                },
                company: {
                    select: { id: true, Nome_da_empresa: true, company_type: true, mom_id: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json(memberships);
    } catch (err) {
        console.error('[GET /api/memberships] Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/memberships/company/:companyId ──────────────────────────────────
// Usuários vinculados a uma empresa filha específica (somente master)
router.get('/company/:companyId', requireMaster, async (req, res) => {
    const { companyId } = req.params;
    try {
        const memberships = await prisma.user_memberships.findMany({
            where: { company_id: companyId },
            include: {
                user: {
                    select: { id: true, nome: true, email: true, avatar: true, user_type: true, ativo: true }
                }
            }
        });
        res.json(memberships);
    } catch (err) {
        console.error('[GET /api/memberships/company/:id] Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/memberships ────────────────────────────────────────────────────
// Cria vínculo entre um usuário standard e uma empresa filha
// Body: { user_id, company_id, can_create, can_edit, can_delete, can_export }
router.post('/', requireMaster, async (req, res) => {
    const { user_id, company_id, can_create = true, can_edit = true, can_delete = false, can_export = false } = req.body;
    const master = req.usuarioAtual;

    if (!user_id || !company_id) {
        return res.status(400).json({ error: 'user_id e company_id são obrigatórios' });
    }

    try {
        // Verifica se a empresa é realmente uma company_son
        const company = await prisma.companies.findUnique({ where: { id: company_id } });
        if (!company) return res.status(404).json({ error: 'Empresa não encontrada' });
        if (company.company_type === 'mom') {
            return res.status(400).json({
                error: 'Não é possível vincular um usuário diretamente à empresa mãe. Use user_type: "master" para isso.'
            });
        }

        // Verifica se o usuário existe
        const user = await prisma.users.findUnique({ where: { id: user_id } });
        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
        if (user.user_type === 'master') {
            return res.status(400).json({
                error: 'Usuário master já tem acesso total. Não é necessário criar memberships para ele.'
            });
        }

        const membership = await prisma.user_memberships.create({
            data: {
                user_id,
                company_id,
                can_create,
                can_edit,
                can_delete,
                can_export,
                invited_by: master.id,
            },
            include: {
                user: { select: { id: true, nome: true, email: true } },
                company: { select: { id: true, Nome_da_empresa: true } }
            }
        });

        console.log(`[POST /api/memberships] ✅ Vínculo criado: ${membership.user.nome} ↔ ${membership.company.Nome_da_empresa}`);
        res.status(201).json(membership);
    } catch (err) {
        if (err.code === 'P2002') {
            return res.status(409).json({ error: 'Este usuário já está vinculado a esta empresa.' });
        }
        console.error('[POST /api/memberships] Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── PUT /api/memberships/:id ────────────────────────────────────────────────
// Edita as permissões de um vínculo existente (somente master)
router.put('/:id', requireMaster, async (req, res) => {
    const { id } = req.params;
    const { can_create, can_edit, can_delete, can_export } = req.body;

    try {
        const updated = await prisma.user_memberships.update({
            where: { id },
            data: {
                ...(can_create !== undefined && { can_create }),
                ...(can_edit !== undefined && { can_edit }),
                ...(can_delete !== undefined && { can_delete }),
                ...(can_export !== undefined && { can_export }),
                updatedAt: new Date(),
            },
            include: {
                user: { select: { id: true, nome: true, email: true } },
                company: { select: { id: true, Nome_da_empresa: true } }
            }
        });

        console.log(`[PUT /api/memberships/${id}] ✅ Permissões atualizadas`);
        res.json(updated);
    } catch (err) {
        if (err.code === 'P2025') {
            return res.status(404).json({ error: 'Vínculo não encontrado' });
        }
        console.error('[PUT /api/memberships/:id] Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── DELETE /api/memberships/:id ─────────────────────────────────────────────
// Remove vínculo de um usuário com uma empresa filha (somente master)
router.delete('/:id', requireMaster, async (req, res) => {
    const { id } = req.params;
    try {
        await prisma.user_memberships.delete({ where: { id } });
        console.log(`[DELETE /api/memberships/${id}] ✅ Vínculo removido`);
        res.json({ success: true, message: 'Vínculo removido com sucesso.' });
    } catch (err) {
        if (err.code === 'P2025') {
            return res.status(404).json({ error: 'Vínculo não encontrado' });
        }
        console.error('[DELETE /api/memberships/:id] Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
