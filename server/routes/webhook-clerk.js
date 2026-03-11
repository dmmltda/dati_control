/**
 * @file webhook-clerk.js — Handler de Webhooks do Clerk
 *
 * Recebe eventos do Clerk e sincroniza com o banco de dados.
 *
 * Eventos tratados:
 *   user.created                    → cria registro em `users`
 *   user.updated                    → atualiza nome/email/avatar em `users`
 *   user.deleted                    → marca ativo=false em `users`
 *   organizationMembership.created  → cria user_memberships (quando standard aceita convite)
 *   organizationMembership.deleted  → remove user_memberships do usuário
 *
 * Segurança: valida o Svix signature com CLERK_WEBHOOK_SECRET
 * Sem esse secret, o endpoint rejeita todas as chamadas.
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { Webhook } from 'svix';

const router = Router();
const prisma = new PrismaClient();

// ─── POST /webhook/clerk ─────────────────────────────────────────────────────
// Clerk envia os eventos aqui com assinatura Svix para validação
router.post('/', async (req, res) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;

    if (!secret) {
        console.error('[Webhook] ⚠️ CLERK_WEBHOOK_SECRET não configurado — rejeitando chamada.');
        return res.status(500).json({ error: 'Webhook secret não configurado no servidor.' });
    }

    // Valida a assinatura Svix
    const svixId        = req.headers['svix-id'];
    const svixTimestamp = req.headers['svix-timestamp'];
    const svixSignature = req.headers['svix-signature'];

    if (!svixId || !svixTimestamp || !svixSignature) {
        return res.status(400).json({ error: 'Headers Svix ausentes — chamada inválida.' });
    }

    let event;
    try {
        const wh = new Webhook(secret);
        // rawBody é necessário para validar a assinatura corretamente
        const body = JSON.stringify(req.body);
        event = wh.verify(body, {
            'svix-id': svixId,
            'svix-timestamp': svixTimestamp,
            'svix-signature': svixSignature,
        });
    } catch (err) {
        console.error('[Webhook] ❌ Assinatura inválida:', err.message);
        return res.status(400).json({ error: 'Assinatura inválida' });
    }

    const { type, data } = event;
    console.log(`[Webhook] 📨 Evento recebido: ${type}`);

    try {
        switch (type) {

            // ── user.created ───────────────────────────────────────────────────
            case 'user.created': {
                const nomeCompleto = `${data.first_name || ''} ${data.last_name || ''}`.trim()
                    || data.username
                    || 'Usuário';
                const email = data.email_addresses?.[0]?.email_address || '';
                const iniciais = nomeCompleto.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

                await prisma.users.upsert({
                    where: { id: data.id },
                    update: { nome: nomeCompleto, email, avatar: iniciais, ativo: true },
                    create: {
                        id: data.id,
                        nome: nomeCompleto,
                        email,
                        avatar: iniciais,
                        role: 'member',
                        user_type: 'standard',
                        ativo: true,
                    }
                });
                console.log(`[Webhook] ✅ user.created → ${nomeCompleto} (${data.id})`);
                break;
            }

            // ── user.updated ───────────────────────────────────────────────────
            case 'user.updated': {
                const nomeCompleto = `${data.first_name || ''} ${data.last_name || ''}`.trim()
                    || data.username
                    || 'Usuário';
                const email = data.email_addresses?.[0]?.email_address || '';
                const iniciais = nomeCompleto.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

                await prisma.users.update({
                    where: { id: data.id },
                    data: { nome: nomeCompleto, email, avatar: iniciais }
                }).catch(() => {
                    // Usuário pode não existir ainda no banco (criado antes do webhook)
                    console.warn(`[Webhook] ⚠️ user.updated — usuário ${data.id} não encontrado, ignorando.`);
                });
                console.log(`[Webhook] ✅ user.updated → ${nomeCompleto}`);
                break;
            }

            // ── user.deleted ───────────────────────────────────────────────────
            case 'user.deleted': {
                await prisma.users.update({
                    where: { id: data.id },
                    data: { ativo: false }
                }).catch(() => {
                    console.warn(`[Webhook] ⚠️ user.deleted — usuário ${data.id} não encontrado, ignorando.`);
                });
                console.log(`[Webhook] ✅ user.deleted → ${data.id} marcado como inativo`);
                break;
            }

            // ── organizationMembership.created ─────────────────────────────────
            // Disparado quando alguém aceita um convite e entra na Organization
            case 'organizationMembership.created': {
                const clerkUserId  = data.public_user_data?.user_id;
                const clerkRole    = data.role; // "org:admin" ou "org:member"
                const clerkOrgId   = data.organization?.id;

                if (!clerkUserId) break;

                // Determina o user_type com base no papel no Clerk
                const userType = clerkRole === 'org:admin' ? 'master' : 'standard';

                // Atualiza (ou cria) o user_type no banco
                await prisma.users.update({
                    where: { id: clerkUserId },
                    data: { user_type: userType }
                }).catch(() => {
                    console.warn(`[Webhook] ⚠️ organizationMembership.created — usuário ${clerkUserId} não encontrado.`);
                });

                // Verifica se existe um convite pendente com companies_json
                // para criar os user_memberships automaticamente
                const pendingInvite = await prisma.user_invites.findFirst({
                    where: {
                        status: 'pending',
                        company: { clerk_org_id: clerkOrgId },
                    },
                    include: { company: true }
                }).catch(() => null);

                if (pendingInvite?.companies_json) {
                    try {
                        const sonIds = JSON.parse(pendingInvite.companies_json);
                        for (const sonId of sonIds) {
                            await prisma.user_memberships.upsert({
                                where: {
                                    user_id_company_id: {
                                        user_id: clerkUserId,
                                        company_id: sonId,
                                    }
                                },
                                update: {},
                                create: {
                                    user_id: clerkUserId,
                                    company_id: sonId,
                                    invited_by: pendingInvite.invited_by,
                                }
                            });
                        }
                        // Marca convite como aceito
                        await prisma.user_invites.update({
                            where: { id: pendingInvite.id },
                            data: { status: 'accepted', accepted_at: new Date() }
                        });
                        console.log(`[Webhook] ✅ organizationMembership.created → ${sonIds.length} memberships criados`);
                    } catch (e) {
                        console.error('[Webhook] Erro ao criar memberships do convite:', e.message);
                    }
                }

                console.log(`[Webhook] ✅ organizationMembership.created → user ${clerkUserId} (${userType})`);
                break;
            }

            // ── organizationMembership.deleted ─────────────────────────────────
            // Disparado quando alguém é removido da Organization
            case 'organizationMembership.deleted': {
                const clerkUserId = data.public_user_data?.user_id;
                if (!clerkUserId) break;

                // Remove todos os memberships do usuário
                const deleted = await prisma.user_memberships.deleteMany({
                    where: { user_id: clerkUserId }
                });

                // Volta para standard (perdeu acesso à org)
                await prisma.users.update({
                    where: { id: clerkUserId },
                    data: { user_type: 'standard' }
                }).catch(() => {});

                console.log(`[Webhook] ✅ organizationMembership.deleted → ${deleted.count} memberships removidos de ${clerkUserId}`);
                break;
            }

            default:
                console.log(`[Webhook] ℹ️ Evento não tratado: ${type}`);
        }

        res.json({ received: true, type });
    } catch (err) {
        console.error(`[Webhook] ❌ Erro ao processar ${type}:`, err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
