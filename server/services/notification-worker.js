import { PrismaClient } from '@prisma/client';
import { createClerkClient } from '@clerk/express';
import { sendEmail } from './email.js';
import { sendTextMessage, isWhatsAppConfigured, normalizePhone } from './whatsapp.js';

const prisma = new PrismaClient();
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

/**
 * Busca o telefone de um usuário pelo userId Clerk.
 * Retorna o valor do campo users.phone (configurado via perfil) ou null.
 */
async function getUserPhone(userId) {
    try {
        const user = await prisma.users.findUnique({
            where:  { id: userId },
            select: { phone: true },
        });
        return user?.phone || null;
    } catch (err) {
        console.warn(`[notification-worker] Erro ao buscar phone de ${userId}:`, err.message);
        return null;
    }
}

/**
 * Gera texto simples (sem HTML) para envio via WhatsApp.
 * @param {string} type       - tipo de notificação
 * @param {object} activity   - registro da atividade
 * @param {object} usuario    - usuário destinatário { nome }
 * @param {string} empresa    - nome da empresa
 * @returns {string}
 */
function buildWhatsAppText(type, activity, usuario, empresa) {
    const titulo  = activity?.title || 'Atividade';
    const nome    = usuario?.nome || 'Usuário';
    const emp     = empresa || '';

    const formatDate = (dt) => {
        if (!dt) return '';
        try {
            return new Date(dt).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
            });
        } catch { return ''; }
    };

    switch (type) {
        case 'reminder':
            return `⏰ *Lembrete Journey*\n\n*${titulo}*${emp ? `\n🏢 ${emp}` : ''}${activity?.activity_datetime ? `\n📅 ${formatDate(activity.activity_datetime)}` : ''}\n\nAcesse o Journey para mais detalhes.`;

        case 'meeting-invite':
            return `📅 *Convite de Reunião — Journey*\n\n*${titulo}*${emp ? `\n🏢 ${emp}` : ''}${activity?.activity_datetime ? `\n🕐 ${formatDate(activity.activity_datetime)}` : ''}${activity?.google_meet_link ? `\n🔗 ${activity.google_meet_link}` : ''}\n\nVocê foi adicionado como participante.`;

        case 'task-assigned':
            return `📋 *Nova tarefa atribuída — Journey*\n\n*${titulo}*${emp ? `\n🏢 ${emp}` : ''}${activity?.next_step_date ? `\n📅 Prazo: ${formatDate(activity.next_step_date)}` : ''}\n\nAcesse o Journey para começar.`;

        case 'next-step':
            return `🎯 *Próximo Passo — Journey*\n\n*${activity?.next_step_title || titulo}*${emp ? `\n🏢 ${emp}` : ''}${activity?.next_step_date ? `\n📅 ${formatDate(activity.next_step_date)}` : ''}\n\nNão esqueça de registrar o andamento.`;

        case 'meeting-summary':
            return `📝 *Resumo do Atendimento — Journey*\n\n*${titulo}*${emp ? `\n🏢 ${emp}` : ''}\n\n*Resumo:* ${activity?.description || 'Nenhum'}\n\n*Próximo Passo:* ${activity?.next_step_title || 'Não definido'}${activity?.next_step_date ? ` (${new Date(activity.next_step_date).toLocaleDateString('pt-BR')})` : ''}`;

        case 'recording':
            return `🎥 *Gravação do Atendimento — Journey*\n\n*${titulo}*${emp ? `\n🏢 ${emp}` : ''}\n\n*Link:* ${activity?.recording_url}\n\nAcesse para revisar o que foi discutido.`;

        default:
            return `📌 *Journey CRM*\n\n${titulo}${emp ? ` — ${emp}` : ''}`;
    }
}

/**
 * Processa um job de notificação enfileirado no pg-boss.
 */
export async function processNotificationJob({ type, activityId, userId, extra }) {
    console.log(`[notification-worker] Processing ${type} for activity ${activityId}, user ${userId}`);

    // 1. Busca a atividade com relações necessárias
    const activity = await prisma.activities.findUnique({
        where: { id: activityId },
        include: {
            activity_assignees: true,
            activity_next_step_responsibles: true,
            companies: true
        }
    });

    if (!activity && type !== 'gabi-summary') {
        console.warn(`[notification-worker] Activity ${activityId} not found`);
        return;
    }

    // 2. Busca o usuário destinatário (Clerk ou E-mail direto)
    let email;
    let usuario;

    const isDirectEmail = userId && userId.includes('@');

    if (isDirectEmail) {
        // E-mail direto (ex: dmmltda@gmail.com) — sem Clerk lookup
        email   = userId;
        usuario = {
            id:    userId,
            nome:  userId.split('@')[0], // fallback de nome
            email: userId,
        };
    } else {
        let clerkUser;
        try {
            clerkUser = await clerkClient.users.getUser(userId);
        } catch (err) {
            console.error(`[notification-worker] Error fetching Clerk user ${userId}:`, err.message);
            throw err; // retry
        }

        if (!clerkUser) {
            console.warn(`[notification-worker] Clerk user ${userId} not found`);
            return;
        }

        email = clerkUser.emailAddresses[0]?.emailAddress;
        if (!email) {
            console.warn(`[notification-worker] Clerk user ${userId} has no email`);
            return;
        }

        usuario = {
            id:    clerkUser.id,
            nome:  `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || clerkUser.username || 'Usuário',
            email: email,
        };
    }

    const empresa = activity?.companies?.Nome_da_empresa || 'Nenhuma';

    // 3. Switch pelo tipo de notificação
    let template;
    let data = { activity, usuario, empresa };

    switch (type) {
        case 'reminder':
            template = 'activityReminder';
            break;
        case 'meeting-invite':
            template = 'meetingInvite';
            break;
        case 'meeting-summary':
            template = 'meetingSummary';
            break;
        case 'recording':
            template = 'recording';
            break;
        case 'task-assigned':
            template = 'taskAssigned';
            if (extra?.atribuidoPorId) {
                try {
                    const assigner = await clerkClient.users.getUser(extra.atribuidoPorId);
                    data.atribuidoPor = {
                        nome: `${assigner.firstName || ''} ${assigner.lastName || ''}`.trim() || assigner.username || 'Colega'
                    };
                } catch (err) {
                    console.warn(`[notification-worker] Error fetching assigner ${extra.atribuidoPorId}:`, err.message);
                }
            }
            break;
        case 'next-step':
            template = 'nextStep';
            break;
        case 'gabi-summary':
            template = 'gabiSummary';
            data = {
                subject: extra?.subject,
                body: extra?.body,
                solicitadoPor: null
            };
            if (extra?.solicitadoPorId) {
                try {
                    const requester = await clerkClient.users.getUser(extra.solicitadoPorId);
                    data.solicitadoPor = {
                        nome: `${requester.firstName || ''} ${requester.lastName || ''}`.trim() || requester.username || 'Sistema'
                    };
                } catch (err) {
                    console.warn(`[notification-worker] Error fetching requester ${extra.solicitadoPorId}:`, err.message);
                }
            }
            break;
        default:
            console.error(`[notification-worker] Unknown notification type: ${type}`);
            return;
    }

    // 4. Envia o e-mail
    // Para e-mails diretos (não-Clerk), usa timestamp para permitir reenvio a cada save
    const dedupSuffix = isDirectEmail ? Date.now() : (extra?.dedupSuffix || Date.now());
    const dedupKey = `${type}-${activityId || 'noact'}-${userId}-${dedupSuffix}`;

    await sendEmail({
        to: email,
        template,
        data,
        tag: `job-${type}`,
        dedupKey
    });

    console.log(`[notification-worker] Job ${type} processed for ${email}`);

    // 5. Envio via WhatsApp
    const waTypes = ['reminder', 'meeting-invite', 'task-assigned', 'next-step', 'meeting-summary', 'recording'];
    
    // Novas flags baseadas nos campos do schema
    const shouldSendWA = 
        (type === 'reminder' && activity?.reminder_whatsapp) ||
        (type === 'meeting-invite' && activity?.send_invite_whatsapp) ||
        (type === 'meeting-summary' && activity?.send_summary_whatsapp) ||
        (type === 'recording' && activity?.send_recording_whatsapp) ||
        (['task-assigned', 'next-step'].includes(type) && activity?.reminder_whatsapp); // fallback para tarefas

    if (
        waTypes.includes(type) &&
        shouldSendWA &&
        isWhatsAppConfigured()
    ) {
        try {
            const phone = await getUserPhone(userId);
            if (phone) {
                const waText = buildWhatsAppText(type, activity, usuario, empresa);
                await sendTextMessage(phone, waText, {
                    origin:          'reminder',
                    conversation_id: null,
                    company_id:      activity?.company_id || null,
                });
                console.log(`[notification-worker] ✅ WhatsApp enviado para ${normalizePhone(phone)} [${type}]`);
            } else {
                console.log(`[notification-worker] Usuário ${userId} sem número de WhatsApp cadastrado — WA ignorado`);
            }
        } catch (waErr) {
            // Não deixa o worker crashar por falha de WhatsApp
            console.warn(`[notification-worker] Erro ao enviar WhatsApp [${type}]:`, waErr.message);
        }
    }
}
