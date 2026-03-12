/**
 * @file users.js — Rotas de Gestão de Usuários
 *
 * GET  /api/users          → lista usuários (somente master)
 * GET  /api/users/:id      → detalhes de um usuário
 * PUT  /api/users/:id      → edita user_type, phone, department, ativo
 * GET  /api/users/me/companies → empresas acessíveis pelo usuário logado
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireMaster } from '../middleware/checkAccess.js';
import * as audit from '../services/audit.js';

const router = Router();
const prisma = new PrismaClient();

// ─── GET /api/users ──────────────────────────────────────────────────────────
// Lista todos os usuários ativos (somente master pode ver todos)
router.get('/', requireMaster, async (req, res) => {
    try {
        const users = await prisma.users.findMany({
            where: { ativo: true },
            orderBy: { nome: 'asc' },
            select: {
                id: true,
                nome: true,
                email: true,
                avatar: true,
                user_type: true,
                role: true,
                ativo: true,
                phone: true,
                department: true,
                createdAt: true,
                user_memberships: {
                    include: {
                        company: {
                            select: {
                                id: true,
                                Nome_da_empresa: true,
                                company_type: true,
                            }
                        }
                    }
                }
            }
        });

        // Formata a resposta com lista de empresas vinculadas
        const formatted = users.map(u => ({
            ...u,
            companies: u.user_memberships.map(m => ({
                id: m.company.id,
                nome: m.company.Nome_da_empresa,
                company_type: m.company.company_type,
                permissions: {
                    can_create: m.can_create,
                    can_edit: m.can_edit,
                    can_delete: m.can_delete,
                    can_export: m.can_export,
                }
            })),
            user_memberships: undefined, // oculta o array raw
        }));

        res.json(formatted);
    } catch (err) {
        console.error('[GET /api/users] Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/users/me/companies ─────────────────────────────────────────────
// Retorna as empresas acessíveis pelo usuário logado
// master → retorna todas as companies (mãe + filhas)
// standard → retorna somente as vinculadas via user_memberships
router.get('/me/companies', async (req, res) => {
    const usuario = req.usuarioAtual;

    try {
        if (usuario.user_type === 'master') {
            // master vê todas as empresas
            const companies = await prisma.companies.findMany({
                orderBy: { Nome_da_empresa: 'asc' },
                select: {
                    id: true,
                    Nome_da_empresa: true,
                    company_type: true,
                    mom_id: true,
                    Status: true,
                }
            });

            return res.json({
                user_type: 'master',
                companies: companies.map(c => ({
                    ...c,
                    permissions: {
                        can_create: true,
                        can_edit: true,
                        can_delete: true,
                        can_export: true,
                    }
                }))
            });
        }

        // standard → somente as vinculadas
        const memberships = await prisma.user_memberships.findMany({
            where: { user_id: usuario.id },
            include: {
                company: {
                    select: {
                        id: true,
                        Nome_da_empresa: true,
                        company_type: true,
                        mom_id: true,
                        Status: true,
                    }
                }
            }
        });

        return res.json({
            user_type: 'standard',
            companies: memberships.map(m => ({
                id: m.company.id,
                Nome_da_empresa: m.company.Nome_da_empresa,
                company_type: m.company.company_type,
                mom_id: m.company.mom_id,
                Status: m.company.Status,
                permissions: {
                    can_create: m.can_create,
                    can_edit: m.can_edit,
                    can_delete: m.can_delete,
                    can_export: m.can_export,
                }
            }))
        });
    } catch (err) {
        console.error('[GET /api/users/me/companies] Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/users/:id ───────────────────────────────────────────────────────
// Detalhes de um usuário (master vê qualquer um; standard vê só a si mesmo)
router.get('/:id', async (req, res) => {
    const usuario = req.usuarioAtual;
    const { id } = req.params;

    // standard só pode ver seus próprios dados
    if (usuario.user_type !== 'master' && usuario.id !== id) {
        return res.status(403).json({ error: 'Acesso negado' });
    }

    try {
        const user = await prisma.users.findUnique({
            where: { id },
            include: {
                user_memberships: {
                    include: {
                        company: {
                            select: {
                                id: true,
                                Nome_da_empresa: true,
                                company_type: true,
                            }
                        }
                    }
                }
            }
        });

        if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
        res.json(user);
    } catch (err) {
        console.error('[GET /api/users/:id] Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── PUT /api/users/:id ───────────────────────────────────────────────────────
// Edita user_type, phone, department, ativo (somente master)
router.put('/:id', requireMaster, async (req, res) => {
    const { id } = req.params;
    const { user_type, phone, department, ativo } = req.body;

    // Valida user_type
    const validTypes = ['master', 'standard'];
    if (user_type && !validTypes.includes(user_type)) {
        return res.status(400).json({
            error: `user_type inválido. Use: ${validTypes.join(' | ')}`
        });
    }

    try {
        // Snapshot antes para diff
        const before = await prisma.users.findUnique({
            where: { id },
            select: { nome: true, user_type: true, phone: true, department: true, ativo: true }
        });

        const updated = await prisma.users.update({
            where: { id },
            data: {
                ...(user_type !== undefined && { user_type }),
                ...(phone !== undefined && { phone }),
                ...(department !== undefined && { department }),
                ...(ativo !== undefined && { ativo }),
                updatedAt: new Date(),
            }
        });

        // ── Audit log: edição de usuário ────────────────────────────────────
        if (before) {
            const changes = {};
            if (user_type !== undefined) changes.user_type = user_type;
            if (phone !== undefined) changes.phone = phone;
            if (department !== undefined) changes.department = department;
            if (ativo !== undefined) changes.ativo = ativo;
            const { description, meta } = audit.diff(before, changes, 'user', before.nome);
            audit.log(prisma, {
                actor:       req.usuarioAtual,
                action:      'UPDATE',
                entity_type: 'user',
                entity_id:   id,
                entity_name: before.nome,
                description,
                meta,
                ip_address:  req.ip,
            });
        }

        console.log(`[PUT /api/users/${id}] ✅ Usuário atualizado: ${updated.nome}`);
        res.json(updated);
    } catch (err) {
        if (err.code === 'P2025') {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        console.error('[PUT /api/users/:id] Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
