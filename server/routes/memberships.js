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
import * as audit from '../services/audit.js';

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

        audit.log(prisma, {
            actor: master,
            action: 'MEMBERSHIP',
            entity_type: 'membership',
            entity_id: membership.id,
            entity_name: `${membership.user.nome} ↔ ${membership.company.Nome_da_empresa}`,
            description: `Vinculou ${membership.user.nome} à empresa ${membership.company.Nome_da_empresa}`,
            meta: { user_id, company_id, can_create, can_edit, can_delete, can_export },
            company_id,
            ip_address: req.ip,
        });

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
    const master = req.usuarioAtual;

    try {
        // Snapshot anterior para diff
        const before = await prisma.user_memberships.findUnique({
            where: { id },
            select: { can_create: true, can_edit: true, can_delete: true, can_export: true,
                      user_id: true, company_id: true }
        });

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

        if (before) {
            const newPerms = { can_create, can_edit, can_delete, can_export };
            const { description, meta } = audit.diff(before, newPerms, 'membership',
                `${updated.user.nome} em ${updated.company.Nome_da_empresa}`);
            audit.log(prisma, {
                actor: master,
                action: 'UPDATE',
                entity_type: 'membership',
                entity_id: id,
                entity_name: `${updated.user.nome} em ${updated.company.Nome_da_empresa}`,
                description,
                meta,
                company_id: updated.company.id,
                ip_address: req.ip,
            });
        }

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
    const master = req.usuarioAtual;
    try {
        // Snapshot antes de deletar
        const before = await prisma.user_memberships.findUnique({
            where: { id },
            include: {
                user: { select: { nome: true } },
                company: { select: { id: true, Nome_da_empresa: true } },
            }
        });

        await prisma.user_memberships.delete({ where: { id } });
        console.log(`[DELETE /api/memberships/${id}] ✅ Vínculo removido`);

        if (before) {
            audit.log(prisma, {
                actor: master,
                action: 'DELETE',
                entity_type: 'membership',
                entity_id: id,
                entity_name: `${before.user.nome} em ${before.company.Nome_da_empresa}`,
                description: `Desvinculou ${before.user.nome} da empresa ${before.company.Nome_da_empresa}`,
                company_id: before.company.id,
                ip_address: req.ip,
            });
        }

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
