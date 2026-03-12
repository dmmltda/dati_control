/**
 * @file google-meet.js — Rotas da integração Google Meet
 *
 * POST /api/google-meet/create
 *   Cria um Meeting Space para uma atividade do tipo "Reunião".
 *   Auth: qualquer usuário autenticado com acesso à empresa.
 *
 * POST /api/google-meet/sync-recordings
 *   Dispara manualmente a sync de gravações (equivale ao cron de 5 min).
 *   Auth: apenas masters.
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireMaster } from '../middleware/checkAccess.js';
import { createMeetingSpace, findRecordingsForSpace, downloadDriveFile } from '../services/google-meet.js';
import * as audit from '../services/audit.js';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const router = Router();
const prisma = new PrismaClient();

// Supabase (lazy — pode não estar configurado)
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    : null;

// ─── POST /api/google-meet/create ────────────────────────────────────────────
router.post('/create', async (req, res) => {
    const { activityId } = req.body;

    if (!activityId) {
        return res.status(400).json({ error: 'activityId é obrigatório.' });
    }

    // 1. Busca atividade e verifica acesso
    let activity;
    try {
        activity = await prisma.activities.findUnique({
            where: { id: activityId },
            select: {
                id: true,
                title: true,
                activity_type: true,
                company_id: true,
                google_meet_link: true,
                google_event_id: true,
                companies: {
                    select: { id: true, Nome_da_empresa: true }
                }
            }
        });
    } catch (err) {
        console.error('[POST /api/google-meet/create] Erro ao buscar atividade:', err.message);
        return res.status(500).json({ error: err.message });
    }

    if (!activity) {
        return res.status(404).json({ error: 'Atividade não encontrada.' });
    }

    // Verifica se o usuário tem acesso à empresa desta atividade
    const usuario = req.usuarioAtual;
    if (usuario.user_type !== 'master') {
        const membership = await prisma.user_memberships.findUnique({
            where: {
                user_id_company_id: {
                    user_id: usuario.id,
                    company_id: activity.company_id,
                }
            }
        });
        if (!membership) {
            return res.status(403).json({ error: 'Sem permissão para esta atividade.' });
        }
    }

    // 2. Verifica se já tem link (evita duplicadas)
    if (activity.google_meet_link) {
        return res.json({
            meetLink: activity.google_meet_link,
            alreadyExists: true,
            message: 'Esta atividade já possui uma reunião Meet criada.',
        });
    }

    // 3. Cria o Meeting Space via Google Meet API
    const space = await createMeetingSpace();

    if (!space) {
        return res.status(503).json({
            error: 'Integração Google Meet não configurada ou falhou. Configure GOOGLE_SERVICE_ACCOUNT_JSON.',
        });
    }

    // 4. Salva os campos na atividade
    try {
        await prisma.activities.update({
            where: { id: activityId },
            data: {
                google_meet_link: space.meetingUri,
                google_event_id: space.name,
                updatedAt: new Date(),
            }
        });
    } catch (err) {
        console.error('[POST /api/google-meet/create] Erro ao salvar link na atividade:', err.message);
        return res.status(500).json({ error: err.message });
    }

    // 5. Audit log
    audit.log(prisma, {
        actor: usuario,
        action: 'UPDATE',
        entity_type: 'activity',
        entity_id: activityId,
        entity_name: activity.title,
        description: `Reunião Google Meet iniciada para "${activity.title}"`,
        meta: { meetingUri: space.meetingUri, spaceName: space.name },
        company_id: activity.company_id,
        ip_address: req.ip,
    });

    console.log(`[GoogleMeet] ✅ Reunião criada para atividade ${activityId}: ${space.meetingUri}`);

    res.json({ meetLink: space.meetingUri });
});

// ─── POST /api/google-meet/sync-recordings ────────────────────────────────────
// Trigger manual da sync de gravações (mesmo que o cron faz, mas sob demanda)
router.post('/sync-recordings', requireMaster, async (req, res) => {
    let synced = 0;

    try {
        const result = await syncPendingRecordings(prisma, supabase);
        synced = result.synced;
    } catch (err) {
        console.error('[POST /api/google-meet/sync-recordings] Erro:', err.message);
        return res.status(500).json({ error: err.message });
    }

    res.json({ synced, message: `${synced} gravação(ões) sincronizada(s).` });
});

export default router;

// ─── Lógica de sync (reutilizada pelo cron e pela rota manual) ────────────────

/**
 * Busca atividades com reunião encerrada sem gravação vinculada
 * e vincula as gravações encontradas no Drive.
 *
 * @param {PrismaClient} prismaClient
 * @param {import('@supabase/supabase-js').SupabaseClient | null} supabaseClient
 * @returns {Promise<{ synced: number }>}
 */
export async function syncPendingRecordings(prismaClient, supabaseClient) {
    // Verifica se Google está configurado
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        return { synced: 0 };
    }

    // Janela: atividades com data > 10 minutos atrás (reunião encerrada)
    const cutoff = new Date(Date.now() - 10 * 60 * 1000);

    // Busca atividades com google_event_id, data no passado e sem gravação vinculada
    const activities = await prismaClient.activities.findMany({
        where: {
            google_event_id: { not: null },
            activity_datetime: { lt: cutoff },
            activity_attachments: {
                none: { file_type: 'meet_recording' }
            }
        },
        select: {
            id: true,
            title: true,
            company_id: true,
            google_event_id: true,
        }
    });

    let synced = 0;

    for (const act of activities) {
        try {
            const recordings = await findRecordingsForSpace(act.google_event_id);

            for (const rec of recordings) {
                let fileUrl = rec.webViewLink; // fallback: link direto do Drive

                // Tenta upload para Supabase Storage se disponível
                if (supabaseClient) {
                    try {
                        const buffer = await downloadDriveFile(rec.id);
                        if (buffer) {
                            const storagePath = `meet-recordings/${act.id}/${rec.name}`;
                            const { error: upError } = await supabaseClient.storage
                                .from('activity-attachments')
                                .upload(storagePath, buffer, {
                                    contentType: rec.mimeType || 'video/mp4',
                                    upsert: false,
                                });

                            if (!upError) {
                                const { data: urlData } = supabaseClient.storage
                                    .from('activity-attachments')
                                    .getPublicUrl(storagePath);
                                fileUrl = urlData.publicUrl;
                            } else {
                                console.warn(`[Meet Sync] Supabase upload falhou para ${rec.name}:`, upError.message);
                            }
                        }
                    } catch (uploadErr) {
                        console.warn(`[Meet Sync] Erro no upload Supabase (usando Drive link):`, uploadErr.message);
                    }
                }

                // Cria registro de anexo
                await prismaClient.activity_attachments.create({
                    data: {
                        id: randomUUID(),
                        activity_id: act.id,
                        file_url: fileUrl,
                        file_name: rec.name,
                        file_type: 'meet_recording',
                        file_size: rec.size || null,
                        uploaded_by: null, // sistema
                    }
                });

                console.log(`[Meet Sync] ✅ Gravação vinculada à atividade ${act.id}: ${rec.name}`);
                synced++;
            }
        } catch (err) {
            console.error(`[Meet Sync] Erro ao processar atividade ${act.id}:`, err.message);
        }
    }

    return { synced };
}
