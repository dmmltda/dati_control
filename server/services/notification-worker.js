import { PrismaClient } from '@prisma/client';
import { createClerkClient } from '@clerk/express';
import { sendEmail } from './email.js';

const prisma = new PrismaClient();
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

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

    // 2. Busca o usuário destinatário no Clerk
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

    const email = clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) {
        console.warn(`[notification-worker] Clerk user ${userId} has no email`);
        return;
    }

    const usuario = {
        id: clerkUser.id,
        nome: `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || clerkUser.username || 'Usuário',
        email: email
    };

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
    const dedupKey = `${type}-${activityId || 'noact'}-${userId}-${extra?.dedupSuffix || Date.now()}`;
    
    await sendEmail({
        to: email,
        template,
        data,
        tag: `job-${type}`,
        dedupKey
    });

    console.log(`[notification-worker] Job ${type} processed for ${email}`);
}
