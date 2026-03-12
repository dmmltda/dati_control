/**
 * @file invites.js — Rotas de Convites de Usuários
 *
 * POST   /api/invites            → envia convite (salva no banco + chama Clerk)
 * GET    /api/invites            → lista convites pendentes (master only)
 * DELETE /api/invites/:id        → cancela/revoga um convite (master only)
 *
 * Fluxo completo:
 *  1. Master preenche e-mail, tipo e empresas no modal
 *  2. POST /api/invites → salva user_invites + chama Clerk Organization Invitations API
 *  3. Clerk envia e-mail de convite para o usuário
 *  4. Quando o usuário aceita → webhook organizationMembership.created
 *     → webhook-clerk.js aplica user_type e cria user_memberships
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireMaster } from '../middleware/checkAccess.js';
import { randomUUID } from 'crypto';
import * as audit from '../services/audit.js';

const router = Router();
const prisma = new PrismaClient();

// ─── Helper: Busca empresa mãe e seu clerk_org_id ─────────────────────────────
async function getMomCompany() {
    return prisma.companies.findFirst({
        where: { company_type: 'mom' },
        select: { id: true, Nome_da_empresa: true, clerk_org_id: true }
    });
}

// ─── Helper: Envia convite via Clerk User Invitations API ────────────────────
async function sendClerkInvite(email, userType, redirectUrl = 'https://journeycontrol.up.railway.app/') {
    const clerkKey = process.env.CLERK_SECRET_KEY;
    if (!clerkKey) {
        console.warn('[Invites] CLERK_SECRET_KEY não configurada. Convite só salvo no banco.');
        return null;
    }

    const resp = await fetch('https://api.clerk.com/v1/invitations', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${clerkKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            email_address: email,
            redirect_url: redirectUrl,
            public_metadata: {
                user_type: userType,   // aplicado via webhook user.created
                journey_invite: true,
            },
            notify: true,   // Clerk envia e-mail automaticamente
            ignore_existing: false,
        }),
    });

    const data = await resp.json();

    if (!resp.ok) {
        const errMsg = data.errors?.[0]?.long_message
            || data.errors?.[0]?.message
            || data.error
            || JSON.stringify(data);
        throw new Error(`Clerk: ${errMsg}`);
    }

    console.log(`[Invites] ✅ Convite Clerk (User Invitations) enviado para ${email} — id: ${data.id}`);
    return data.id; // clerk_invite_id
}

// ─── POST /api/invites ────────────────────────────────────────────────────────
router.post('/', requireMaster, async (req, res) => {
    const { email, user_type = 'standard', companies = [] } = req.body;

    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'E-mail inválido.' });
    }
    if (!['master', 'standard'].includes(user_type)) {
        return res.status(400).json({ error: 'user_type deve ser "master" ou "standard".' });
    }

    try {
        // 1. Busca empresa mãe
        const mom = await getMomCompany();
        if (!mom) {
            return res.status(500).json({
                error: 'Nenhuma empresa mãe (company_type: "mom") cadastrada no sistema.'
            });
        }

        // 2. Verifica se já existe convite pendente para este e-mail
        const existing = await prisma.user_invites.findFirst({
            where: { email: email.toLowerCase().trim(), status: 'pending' }
        });
        if (existing) {
            return res.status(409).json({
                error: `Já existe um convite pendente para "${email}".`,
                can_resend: true,
                invite_id: existing.id,
            });
        }

        // 3. Verifica se usuário já existe no sistema
        const existingUser = await prisma.users.findFirst({
            where: { email: email.toLowerCase().trim() }
        });
        if (existingUser) {
            return res.status(409).json({
                error: `O e-mail "${email}" já está cadastrado no sistema.`
            });
        }

        // 4. Envia convite via Clerk (pode ser null se org não configurada)
        let clerkInviteId = null;
        try {
            clerkInviteId = await sendClerkInvite(email, user_type);

        } catch (clerkErr) {
            // Se Clerk falhar por org não configurada, apenas loga e continua
            // O convite é salvo no banco e o admin pode reenviar depois
            console.warn('[Invites] Falha no Clerk (continuando sem convite Clerk):', clerkErr.message);
            // Re-lança apenas erros críticos (ex: email duplicado no Clerk)
            if (clerkErr.message.includes('already') || clerkErr.message.includes('duplicate')) {
                return res.status(409).json({ error: clerkErr.message });
            }
        }

        // 5. Salva convite no banco
        const companiesJson = companies.length > 0 ? JSON.stringify(companies) : null;
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias

        const invite = await prisma.user_invites.create({
            data: {
                id: randomUUID(),
                email: email.toLowerCase().trim(),
                company_mom_id: mom.id,
                user_type,
                companies_json: companiesJson,
                clerk_invite_id: clerkInviteId,
                invited_by: req.usuarioAtual.id,
                status: 'pending',
                expires_at: expiresAt,
            }
        });

        console.log(`[POST /api/invites] ✅ Convite criado: ${email} (${user_type}) por ${req.usuarioAtual.nome}`);

        // ── Audit log: convite enviado ─────────────────────────────────────
        audit.log(prisma, {
            actor:       req.usuarioAtual,
            action:      'INVITE',
            entity_type: 'invite',
            entity_id:   invite.id,
            entity_name: email,
            description: `Enviou convite para "${email}" como ${user_type}`,
            meta:        { email, user_type, companies, clerk_sent: !!clerkInviteId },
            ip_address:  req.ip,
        });

        res.status(201).json({
            id: invite.id,
            email: invite.email,
            user_type: invite.user_type,
            status: invite.status,
            expires_at: invite.expires_at,
            clerk_sent: !!clerkInviteId,
            message: clerkInviteId
                ? `Convite enviado para ${email} via Clerk. O usuário receberá um e-mail em breve.`
                : `Convite registrado no sistema. Configure o Clerk Organization para enviar e-mails automáticos.`,
        });

    } catch (err) {
        console.error('[POST /api/invites] Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/invites ─────────────────────────────────────────────────────────
// Lista convites pendentes (master only)
router.get('/', requireMaster, async (req, res) => {
    try {
        const invites = await prisma.user_invites.findMany({
            where: { status: 'pending' },
            orderBy: { createdAt: 'desc' },
        });
        res.json(invites);
    } catch (err) {
        console.error('[GET /api/invites] Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/invites/:id/resend ─────────────────────────────────────────────
// Revoga convite pendente e envia um novo (master only)
router.post('/:id/resend', requireMaster, async (req, res) => {
    const { id } = req.params;
    try {
        const invite = await prisma.user_invites.findUnique({ where: { id } });
        if (!invite) return res.status(404).json({ error: 'Convite não encontrado.' });
        if (invite.status !== 'pending') return res.status(400).json({ error: 'Este convite não está mais pendente.' });

        const mom = await getMomCompany();

        // Revoga o convite anterior no Clerk
        if (invite.clerk_invite_id && mom?.clerk_org_id) {
            try {
                await fetch(
                    `https://api.clerk.com/v1/organizations/${mom.clerk_org_id}/invitations/${invite.clerk_invite_id}/revoke`,
                    { method: 'POST', headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` } }
                );
            } catch (e) { console.warn('[Invites] Falha ao revogar no Clerk:', e.message); }
        }
        await prisma.user_invites.update({ where: { id }, data: { status: 'revoked', updatedAt: new Date() } });

        // Envia novo convite via Clerk
        let clerkInviteId = null;
        try {
            clerkInviteId = await sendClerkInvite(invite.email, invite.user_type);

        } catch (e) { console.warn('[Invites] Clerk resend falhou:', e.message); }

        // Cria novo registro no banco
        const novoInvite = await prisma.user_invites.create({
            data: {
                id: randomUUID(),
                email: invite.email,
                company_mom_id: invite.company_mom_id,
                user_type: invite.user_type,
                companies_json: invite.companies_json,
                clerk_invite_id: clerkInviteId,
                invited_by: req.usuarioAtual.id,
                status: 'pending',
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            }
        });

        console.log(`[POST /api/invites/:id/resend] ✅ Convite reenviado para ${invite.email}`);

        // ── Audit log: reenvio de convite ──────────────────────────────────
        audit.log(prisma, {
            actor:       req.usuarioAtual,
            action:      'INVITE',
            entity_type: 'invite',
            entity_id:   novoInvite.id,
            entity_name: invite.email,
            description: `Reenviou convite para "${invite.email}"`,
            meta:        { email: invite.email, user_type: invite.user_type, clerk_sent: !!clerkInviteId },
            ip_address:  req.ip,
        });

        res.status(201).json({
            id: novoInvite.id,
            email: novoInvite.email,
            clerk_sent: !!clerkInviteId,
            message: `Convite reenviado para ${invite.email}.`,
        });
    } catch (err) {
        console.error('[POST /api/invites/:id/resend] Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── DELETE /api/invites/:id ──────────────────────────────────────────────────
// Revoga um convite (master only)
router.delete('/:id', requireMaster, async (req, res) => {
    const { id } = req.params;
    try {
        const invite = await prisma.user_invites.findUnique({ where: { id } });
        if (!invite) return res.status(404).json({ error: 'Convite não encontrado.' });

        // Tenta revogar no Clerk também
        if (invite.clerk_invite_id) {
            const mom = await getMomCompany();
            if (mom?.clerk_org_id) {
                try {
                    await fetch(
                        `https://api.clerk.com/v1/organizations/${mom.clerk_org_id}/invitations/${invite.clerk_invite_id}/revoke`,
                        {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` }
                        }
                    );
                } catch (e) {
                    console.warn('[Invites] Falha ao revogar no Clerk:', e.message);
                }
            }
        }

        await prisma.user_invites.update({
            where: { id },
            data: { status: 'revoked', updatedAt: new Date() }
        });

        // ── Audit log: revogação de convite ──────────────────────────────
        audit.log(prisma, {
            actor:       req.usuarioAtual,
            action:      'DELETE',
            entity_type: 'invite',
            entity_id:   id,
            entity_name: invite.email,
            description: `Revogou convite de "${invite.email}"`,
            meta:        { email: invite.email, user_type: invite.user_type },
            ip_address:  req.ip,
        });

        res.json({ ok: true, message: 'Convite revogado.' });
    } catch (err) {
        console.error('[DELETE /api/invites/:id] Erro:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
