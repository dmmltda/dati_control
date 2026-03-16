/**
 * =============================================================================
 * Rota: /api/whatsapp — Inbox HD + Webhook Meta
 * =============================================================================
 *
 * Importa services/whatsapp.js para toda comunicação com a API Meta.
 * NUNCA chama a API Meta diretamente aqui.
 *
 * Endpoints:
 *  GET  /api/whatsapp/webhook              — verificação inicial do webhook
 *  POST /api/whatsapp/webhook              — receber mensagens/status (sem auth)
 *  GET  /api/whatsapp/stream               — SSE para agentes conectados
 *  POST /api/whatsapp/send                 — enviar mensagem (auth)
 *  POST /api/whatsapp/conversations/:id/close — encerrar + análise Gabi (auth)
 *  GET  /api/whatsapp/conversations        — listar conversas (auth)
 *  GET  /api/whatsapp/conversations/:id/messages — histórico (auth)
 *  GET  /api/whatsapp/stats                — custo + distribuição (auth)
 * =============================================================================
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, getAuth } from '@clerk/express';
import {
    sendTextMessage,
    parseWebhookPayload,
    isWhatsAppConfiguredAsync,
    isWhatsAppConfigured,
    normalizePhone,
} from '../services/whatsapp.js';
import * as audit from '../services/audit.js';

const router = express.Router();
const prisma = new PrismaClient();

// ── Modelos Gemini (mesmos do gabi.js) ────────────────────────────────────────
const GEMINI_MODELS = [
    'gemini-2.5-flash',
    'gemini-2.0-flash-lite',
    'gemini-flash-latest',
    'gemini-2.0-flash',
    'gemini-pro-latest',
];

// ── SSE — Mapa de clientes conectados ────────────────────────────────────────
const _sseClients = new Map(); // userId → Response

/**
 * Emite um evento SSE para todos os agentes conectados.
 * @param {string} eventType - "new_message" | "conversation_closed"
 * @param {object} data
 */
function emitToAgents(eventType, data) {
    const payload = `data: ${JSON.stringify({ type: eventType, ...data })}\n\n`;
    for (const [userId, res] of _sseClients.entries()) {
        try {
            res.write(payload);
        } catch (err) {
            console.warn(`[WhatsApp] SSE erro ao emitir para ${userId}:`, err.message);
            _sseClients.delete(userId);
        }
    }
}

// ── Helper: middleware de extração de usuário (inline sem duplicar imports) ──
async function extractUser(req, res, next) {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });
    try {
        const usuario = await prisma.users.findUnique({ where: { id: userId } });
        if (!usuario) return res.status(401).json({ error: 'Usuário não encontrado' });
        req.usuarioAtual = usuario;
        next();
    } catch (err) {
        return res.status(500).json({ error: 'Erro de autenticação' });
    }
}

// ── Helper: busca configuração Gemini ────────────────────────────────────────
async function getGeminiApiKey() {
    try {
        const row = await prisma.app_settings.findUnique({ where: { key: 'gemini_api_key' } });
        return row?.value || process.env.GEMINI_API_KEY || null;
    } catch {
        return process.env.GEMINI_API_KEY || null;
    }
}

// ── Helper: chama Gemini com fallback de modelos ──────────────────────────────
async function geminiGenerate(body) {
    const apiKey = await getGeminiApiKey();
    if (!apiKey) throw new Error('Gemini API Key não configurada');

    let lastErr;
    for (const model of GEMINI_MODELS) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), 20_000);
        try {
            const resp = await fetch(url, {
                method: 'POST',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' },
                body:   JSON.stringify(body),
            });
            clearTimeout(timeoutId);
            if (resp.ok) return await resp.json();
            lastErr = await resp.json().catch(() => ({}));
            if ([429, 404, 503].includes(resp.status)) {
                console.warn(`[WhatsApp Gabi] Modelo ${model} falhou (${resp.status}), tentando próximo...`);
                continue;
            }
            throw new Error(`Gemini ${resp.status}: ${JSON.stringify(lastErr)}`);
        } catch (e) {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') {
                console.warn(`[WhatsApp Gabi] Modelo ${model} timeout, tentando próximo...`);
                lastErr = { error: 'timeout' };
                continue;
            }
            throw e;
        }
    }
    throw new Error(`Gemini: todos os modelos falharam. Último: ${JSON.stringify(lastErr)}`);
}

// ── Helper: busca ou cria conversa open para um número ───────────────────────
async function findOrCreateConversation(waPhoneNumber) {
    const { randomUUID } = await import('crypto');
    const normalized = normalizePhone(waPhoneNumber);

    // Busca conversa aberta
    let conv = await prisma.whatsapp_conversations.findFirst({
        where: {
            wa_phone_number: normalized,
            status: 'open',
        },
        orderBy: { opened_at: 'desc' },
        include: { contacts: true, companies: true },
    });

    if (conv) return conv;

    // Tenta vincular a um contato pelo número
    // Para o Brasil, lidamos com variações de 12 e 13 dígitos (9º dígito)
    let matched = null;
    let baseDigits = normalized;
    if (normalized.startsWith('55') && normalized.length === 13) {
        // Tenta achar com e sem o 9 logo após o DDD
        const ddd = normalized.substring(2, 4);
        const semOito = normalized.substring(0, 4) + normalized.substring(5); // sem o 9
        const variacoes = [normalized, semOito];
        
        matched = await prisma.contacts.findFirst({
            where: {
                OR: [
                    { WhatsApp: { in: variacoes } },
                    { WhatsApp: { in: variacoes.map(v => `+${v}`) } },
                    { WhatsApp: { in: variacoes.map(v => `${v.substring(0,2)} (${v.substring(2,4)}) ${v.substring(4,8)}-${v.substring(8)}`) } }
                ]
            },
            select: { id: true, companyId: true, Nome_do_contato: true }
        });
    } else {
        matched = await prisma.contacts.findFirst({
            where: {
                OR: [
                    { WhatsApp: normalized },
                    { WhatsApp: `+${normalized}` },
                ]
            },
            select: { id: true, companyId: true, Nome_do_contato: true }
        });
    }

    // Busca empresa se matched
    let company = null;
    if (matched?.companyId) {
        company = await prisma.companies.findUnique({
            where: { id: matched.companyId },
            select: { id: true, Nome_da_empresa: true }
        });
    }

    // Se identificou empresa, cria atividade automaticamente (Requisito 4)
    let activityId = null;
    if (company) {
        const activity = await prisma.activities.create({
            data: {
                id: randomUUID(),
                company_id: company.id,
                activity_type: 'Chamados HD',
                title: `Atendimento WhatsApp: ${matched.Nome_do_contato || 'Contato'}`,
                description: `Chamado iniciado via WhatsApp (${normalized}). Aguardando encerramento para resumo Gabi.`,
                status: 'Em Andamento',
                activity_datetime: new Date(),
            }
        });
        activityId = activity.id;
        console.log(`[WhatsApp] ⚡ Atividade autogerada: ${activity.id} para empresa ${company.Nome_da_empresa}`);
    }

    conv = await prisma.whatsapp_conversations.create({
        data: {
            wa_phone_number: normalized,
            contact_id:      matched?.id     || null,
            company_id:      matched?.companyId || null,
            contact_nome:    matched?.Nome_do_contato || null,
            company_nome:    company?.Nome_da_empresa || null,
            status:          'open',
            activity_id:     activityId,
        },
        include: { contacts: true, companies: true },
    });

    console.log(`[WhatsApp] 📱 Nova conversa criada para +${normalized} (id: ${conv.id})`);
    return conv;
}

// =============================================================================
// ENDPOINTS
// =============================================================================

// ─── GET /api/whatsapp/webhook ── Verificação inicial do webhook ──────────────
router.get('/webhook', (req, res) => {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'journey_wh_2026';

    if (mode === 'subscribe' && token === verifyToken) {
        console.log('[WhatsApp] ✅ Webhook verificado pelo Meta');
        return res.status(200).send(challenge);
    }

    console.warn('[WhatsApp] ❌ Falha na verificação do webhook. token:', token);
    return res.status(403).json({ error: 'Verify token inválido' });
});

// ─── POST /api/whatsapp/webhook ── Receber mensagens da Meta (sem auth) ───────
// NOTA: O raw body middleware é configurado em server/index.js ANTES do express.json
router.post('/webhook', async (req, res) => {
    // Responde 200 IMEDIATAMENTE — Meta cancela após 5s
    res.sendStatus(200);

    // Processa de forma assíncrona (não bloqueia a resposta)
    setImmediate(async () => {
        try {
            const rawBody  = req.body;   // Buffer (configurado via express.raw em index.js)
            const signature = req.headers['x-hub-signature-256'] || '';

            let events;
            try {
                events = parseWebhookPayload(rawBody, signature);
            } catch (parseErr) {
                console.warn('[WhatsApp] Webhook inválido:', parseErr.message);
                return;
            }

            for (const evt of events) {
                // ── Ignora status updates por enquanto (tratado via wa_message_id) ──
                if (evt.is_status_update) {
                    // Atualiza status das mensagens outbound
                    if (evt.status && evt.wa_message_id) {
                        await prisma.whatsapp_messages.updateMany({
                            where:  { wa_message_id: evt.wa_message_id },
                            data:   { status: evt.status },
                        }).catch(() => {});
                    }
                    continue;
                }

                // ── Dedup: ignora mensagem já processada ──────────────────────────
                if (evt.wa_message_id) {
                    const existing = await prisma.whatsapp_messages.findUnique({
                        where: { wa_message_id: evt.wa_message_id },
                    });
                    if (existing) {
                        console.log(`[WhatsApp] Dedup: mensagem ${evt.wa_message_id} já processada`);
                        continue;
                    }
                }

                // ── Busca/cria conversa ────────────────────────────────────────────
                const conv = await findOrCreateConversation(evt.from);

                // ── Salva mensagem ─────────────────────────────────────────────────
                const msg = await prisma.whatsapp_messages.create({
                    data: {
                        conversation_id: conv.id,
                        wa_message_id:   evt.wa_message_id || null,
                        direction:       'inbound',
                        content_type:    evt.type !== 'text' ? evt.type : 'text',
                        content:         evt.text || `[${evt.type}]`,
                        origin:          'agent',  // inbound = externo
                        sent_by:         null,
                        status:          'sent',
                    },
                });

                console.log(`[WhatsApp] 📩 Mensagem recebida de +${evt.from} (conv: ${conv.id})`);

                // ── MODO GABI: Auto-reply se configurado (Requisito 6/7) ──────────
                if (conv.ai_enabled) {
                    console.log(`[WhatsApp] 🤖 Modo Gabi ativo na conversa ${conv.id}. Gerando resposta...`);
                    
                    try {
                        const history = await prisma.whatsapp_messages.findMany({
                            where: { conversation_id: conv.id },
                            orderBy: { created_at: 'desc' },
                            take: 10
                        });
                        const reversedHistory = history.reverse();
                        const promptMessages = reversedHistory.map(m => ({
                            role: m.direction === 'inbound' ? 'user' : 'model',
                            parts: [{ text: m.content }]
                        }));
                        const systemPrompt = `Você é a Gabi, assistente inteligente da DATI no sistema Journey. 
Responda de forma curta, profissional e amigável via WhatsApp.
Você ajuda clientes da empresa ${conv.company_nome || 'DATI'}.
Se não souber algo, peça para aguardar um atendente.
Pule linhas para facilitar a leitura.`;
                        const gabiBody = {
                            contents: [{ role: 'user', parts: [{ text: systemPrompt }] }, ...promptMessages],
                            generationConfig: { temperature: 0.2, maxOutputTokens: 500 }
                        };
                        const gabiResp = await geminiGenerate(gabiBody);
                        const aiResponse = gabiResp?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                        
                        if (aiResponse) {
                            const result = await sendTextMessage(`+${conv.wa_phone_number}`, aiResponse, {
                                origin: 'gabi',
                                conversation_id: conv.id,
                                company_id: conv.company_id
                            });
                            if (result.sent) {
                                const gabiMsg = await prisma.whatsapp_messages.create({
                                    data: {
                                        conversation_id: conv.id,
                                        wa_message_id: result.wa_message_id || null,
                                        direction: 'outbound',
                                        content_type: 'text',
                                        content: aiResponse,
                                        origin: 'gabi',
                                        status: 'sent'
                                    }
                                });
                                emitToAgents('new_message', {
                                    conversationId: conv.id,
                                    message: { ...gabiMsg, created_at: gabiMsg.created_at?.toISOString() }
                                });
                            }
                        }
                    } catch (aiErr) {
                        console.error(`[WhatsApp] Erro na resposta da Gabi:`, aiErr.message);
                    }
                }

                // ── Emite SSE para agentes conectados ──────────────────────────────
                emitToAgents('new_message', {
                    conversationId: conv.id,
                    message: {
                        id:          msg.id,
                        direction:   'inbound',
                        content:     msg.content,
                        content_type: msg.content_type,
                        created_at:  msg.created_at,
                    },
                    contact: {
                        nome:    conv.contacts?.Nome_do_contato || null,
                        empresa: conv.companies?.Nome_da_empresa || null,
                        phone:   evt.from,
                    },
                });
            }
        } catch (err) {
            console.error('[WhatsApp] Erro no processamento do webhook:', err.message);
        }
    });
});

// ─── GET /api/whatsapp/stream ── SSE para agentes ─────────────────────────────
router.get('/stream', requireAuth(), extractUser, (req, res) => {
    const userId = req.usuarioAtual.id;

    res.set({
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'X-Accel-Buffering': 'no',  // desativa buffer no Nginx/proxy
    });
    res.flushHeaders();

    // Mensagem inicial de confirmação
    res.write(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`);

    // Heartbeat a cada 30s para manter a conexão viva
    const heartbeat = setInterval(() => {
        try {
            res.write(':ping\n\n');
        } catch {
            clearInterval(heartbeat);
        }
    }, 30_000);

    _sseClients.set(userId, res);
    console.log(`[WhatsApp] SSE conectado: ${userId} (total: ${_sseClients.size})`);

    req.on('close', () => {
        clearInterval(heartbeat);
        _sseClients.delete(userId);
        console.log(`[WhatsApp] SSE desconectado: ${userId} (total: ${_sseClients.size})`);
    });
});

// ─── POST /api/whatsapp/send ── Enviar mensagem (agente) ──────────────────────
router.post('/send', requireAuth(), extractUser, async (req, res) => {
    try {
        const { conversationId, text } = req.body;
        const userId = req.usuarioAtual.id;

        if (!conversationId || !text?.trim()) {
            return res.status(400).json({ error: 'conversationId e text são obrigatórios' });
        }

        // Busca a conversa
        const conv = await prisma.whatsapp_conversations.findUnique({
            where: { id: conversationId },
        });
        if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
        if (conv.status === 'closed') return res.status(400).json({ error: 'Conversa já encerrada' });

        // Envia via serviço central
        const result = await sendTextMessage(`+${conv.wa_phone_number}`, text.trim(), {
            origin:          'agent',
            conversation_id: conv.id,
            company_id:      conv.company_id,
        });

        if (!result.sent) {
            return res.status(502).json({ error: result.error || 'Falha ao enviar' });
        }

        // Registra mensagem outbound
        const msg = await prisma.whatsapp_messages.create({
            data: {
                conversation_id: conv.id,
                wa_message_id:   result.wa_message_id || null,
                direction:       'outbound',
                content_type:    'text',
                content:         text.trim(),
                sent_by:         userId,
                origin:          'agent',
                status:          'sent',
            },
        });

        // Atualiza updated_at da conversa
        await prisma.whatsapp_conversations.update({
            where: { id: conv.id },
            data:  { updated_at: new Date() },
        });

        return res.json({ ok: true, message: msg });

    } catch (err) {
        console.error('[WhatsApp POST /send]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/whatsapp/start ── Iniciar nova conversa a partir do sistema ────
router.post('/start', requireAuth(), extractUser, async (req, res) => {
    try {
        const { phone, text, contactName } = req.body;
        const userId = req.usuarioAtual.id;

        if (!phone || !text?.trim()) {
            return res.status(400).json({ error: 'phone e text são obrigatórios' });
        }

        // Normaliza número
        const cleanPhone = normalizePhone(phone);
        if (!cleanPhone) {
            return res.status(400).json({ error: 'Número de telefone inválido. Use o formato: 5548999999999' });
        }

        // Verifica se já existe conversa aberta com esse número
        const existing = await prisma.whatsapp_conversations.findFirst({
            where: { wa_phone_number: cleanPhone, status: 'open' },
        });
        if (existing) {
            return res.status(409).json({
                error: 'Já existe uma conversa aberta com esse número.',
                conversationId: existing.id,
            });
        }

        // Tenta vincular a um contato/empresa pelo campo WhatsApp
        const contact = await prisma.contacts.findFirst({
            where: {
                OR: [
                    { WhatsApp: { contains: cleanPhone } },
                    { WhatsApp: { contains: `+${cleanPhone}` } },
                    { WhatsApp: cleanPhone },
                    { WhatsApp: `+${cleanPhone}` },
                ],
            },
        });
        // Busca empresa do contato (se houver)
        const company = contact?.companyId
            ? await prisma.companies.findUnique({ where: { id: contact.companyId }, select: { id: true, Nome_da_empresa: true } })
            : null;

        // Cria conversa no banco
        const { randomUUID } = await import('crypto');
        const convId = randomUUID();
        // Se identificou empresa, cria atividade automaticamente (Requisito 4)
        let activityId = null;
        if (company) {
            const activity = await prisma.activities.create({
                data: {
                    id: randomUUID(),
                    company_id: company.id,
                    activity_type: 'Chamados HD',
                    title: `Atendimento WhatsApp: ${contactName || contact?.Nome_do_contato || 'Contato'}`,
                    description: `Chamado iniciado via sistema Journey para o número ${cleanPhone}.`,
                    status: 'Em Andamento',
                    activity_datetime: new Date(),
                }
            });
            activityId = activity.id;
        }

        const conv = await prisma.whatsapp_conversations.create({
            data: {
                id:              convId,
                wa_phone_number: cleanPhone,
                status:          'open',
                opened_at:       new Date(),
                contact_id:      contact?.id || null,
                contact_nome:    contactName || contact?.Nome_do_contato || null,
                company_id:      company?.id || null,
                company_nome:    company?.Nome_da_empresa || null,
                activity_id:     activityId,
            },
        });

        // Envia a mensagem inicial
        const result = await sendTextMessage(`+${cleanPhone}`, text.trim(), {
            origin: 'agent',
            conversation_id: convId,
            company_id: conv.company_id,
        });

        if (!result.sent) {
            let errorMsg = result.error || 'Falha ao enviar mensagem.';
            if (errorMsg.includes('access token') || errorMsg.includes('expired')) {
                errorMsg = 'O Token do WhatsApp expirou ou é inválido. A meta exige um "System User Access Token" PERMANENTE para produção. Gere um novo nas configurações de usuários do Business Manager.';
            }
            return res.status(502).json({ error: errorMsg });
        }

        // Registra mensagem outbound
        const msg = await prisma.whatsapp_messages.create({
            data: {
                conversation_id: convId,
                wa_message_id:   result.wa_message_id || null,
                direction:       'outbound',
                content_type:    'text',
                content:         text.trim(),
                sent_by:         userId,
                origin:          'agent',
                status:          'sent',
            },
        });

        // Emite SSE para todos os agentes
        emitToAgents('new_message', {
            conversationId: convId,
            message: { ...msg, created_at: msg.created_at?.toISOString() },
        });

        console.log(`[WhatsApp] ✅ Nova conversa iniciada para +${cleanPhone} (conv: ${convId})`);
        return res.json({ ok: true, conversationId: convId, message: msg });

    } catch (err) {
        console.error('[WhatsApp POST /start]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/whatsapp/conversations/:id/close ── Encerrar + análise Gabi ───
router.post('/conversations/:id/close', requireAuth(), extractUser, async (req, res) => {
    try {
        const convId = req.params.id;
        const userId = req.usuarioAtual.id;

        // 1. Busca conversa + mensagens
        const conv = await prisma.whatsapp_conversations.findUnique({
            where: { id: convId },
        });
        if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });
        if (conv.status === 'closed') return res.status(400).json({ error: 'Conversa já encerrada' });

        // Regra de Obrigatoriedade: a conversa DEVE estar vinculada a uma empresa para fechar e gerar log
        if (!conv.company_id) {
            return res.status(400).json({ 
                error: 'Vínculo empresa obrigatório', 
                message: 'Vincule este número a uma empresa antes de encerrar para garantir o log de atendimento.' 
            });
        }

        const messages = await prisma.whatsapp_messages.findMany({
            where:   { conversation_id: convId },
            orderBy: { created_at: 'asc' },
        });

        // 2. Calcula duração
        const openedAt = conv.opened_at;
        const closedAt = new Date();
        const durationMinutes = Math.max(1, Math.round((closedAt - openedAt) / 60000));

        // 3. Monta transcript
        const transcript = messages.map(m => {
            const hora = new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const autor = m.direction === 'inbound' ? 'Cliente' : (m.origin === 'gabi' ? 'Gabi' : 'Agente');
            return `[${hora}] ${autor}: ${m.content}`;
        }).join('\n');

        // 4. Análise Gabi
        let analise = {
            temperatura:      'neutro',
            temperatura_score: 3,
            resumo:           'Atendimento WhatsApp',
            acoes_sugeridas:  [],
        };

        try {
            const gabiBody = {
                contents: [{
                    role: 'user',
                    parts: [{ text: `Você é especialista em Customer Success. Analise este transcript de atendimento WhatsApp e responda SOMENTE com JSON válido, sem markdown, sem explicações.

JSON esperado:
{
  "temperatura": "critico|negativo|neutro|positivo|encantado",
  "temperatura_score": 1|2|3|4|5,
  "resumo": "2-3 frases descrevendo o atendimento e estado do cliente",
  "acoes_sugeridas": ["ação 1", "ação 2"]
}

Critérios de temperatura:
- critico (1): cliente frustrado, ameaça de cancelamento, problema grave não resolvido
- negativo (2): cliente insatisfeito, problema parcialmente resolvido
- neutro (3): atendimento padrão, sem sinal claro de satisfação ou insatisfação
- positivo (4): cliente satisfeito, problema resolvido, tom amigável
- encantado (5): cliente muito satisfeito, elogios, promotor

Baseie em: linguagem do cliente, resolução do problema, sinais de churn ou upsell. Se o assunto for vago, tente identificar a intenção principal. Nunca retorne apenas "Atendimento WhatsApp" se houver conteúdo na conversa.

Transcript:
${transcript || '(sem mensagens)'}`
                    }],
                }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
            };

            const gabiResp = await geminiGenerate(gabiBody);
            const rawText = gabiResp?.candidates?.[0]?.content?.parts?.[0]?.text || '';

            // Remove markdown code fences se presentes
            const cleaned = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
            const parsed  = JSON.parse(cleaned);

            analise = {
                temperatura:       parsed.temperatura      || 'neutro',
                temperatura_score: parseInt(parsed.temperatura_score) || 3,
                resumo:            parsed.resumo           || 'Atendimento WhatsApp',
                acoes_sugeridas:   Array.isArray(parsed.acoes_sugeridas) ? parsed.acoes_sugeridas : [],
            };
            console.log(`[WhatsApp] 🧠 Análise Gabi: ${analise.temperatura} (${analise.temperatura_score}/5)`);
        } catch (gabiErr) {
            console.warn('[WhatsApp] Gabi análise falhou, usando padrão neutro:', gabiErr.message);
        }

        // 5. Atualiza ou cria activity "Chamados HD"
        const activityTitle = `WA: ${analise.resumo.substring(0, 80)}`;
        const activityDesc  = `${analise.resumo}\n\nAções sugeridas:\n${analise.acoes_sugeridas.map(a => `• ${a}`).join('\n')}`;

        let resultActivity = null;
        let activityId = conv.activity_id;
        if (activityId) {
            // Atualiza atividade existente
            resultActivity = await prisma.activities.update({
                where: { id: activityId },
                data: {
                    title:              activityTitle,
                    description:        activityDesc,
                    status:             'Concluído',
                    time_spent_minutes: durationMinutes,
                    updated_at:         closedAt,
                }
            });
        } else {
            // Cria nova se não foi criada ao abrir (fallback)
            const { randomUUID } = await import('crypto');
            resultActivity = await prisma.activities.create({
                data: {
                    id:              randomUUID(),
                    activity_type:   'Chamados HD',
                    title:           activityTitle,
                    description:     activityDesc,
                    company_id:      conv.company_id || null,
                    status:          'Concluído',
                    time_spent_minutes: durationMinutes,
                    created_by_user_id: userId,
                    updated_at:      closedAt,
                },
            });
            activityId = resultActivity.id;
        }

        // 6. Cria activity_time_logs
        const { randomUUID: uuidLog } = await import('crypto');
        await prisma.activity_time_logs.create({
            data: {
                id:               uuidLog(),
                activity_id:      activityId,
                started_at:       openedAt,
                duration_minutes: durationMinutes,
                subject:          `Atendimento WhatsApp: ${analise.resumo.substring(0, 50)}...`,
                created_by:       userId,
                // ── NOVOS CAMPOS PARA "PASTA TEMPO" ──
                contact_nome:     conv.contact_nome || `+${conv.wa_phone_number}` || 'Contato',
                activity_type:    'Chamados HD', // padrão para WhatsApp Inbox
            },
        });

        // 7. Atualiza conversa
        await prisma.whatsapp_conversations.update({
            where: { id: convId },
            data: {
                status:                'closed',
                closed_at:             closedAt,
                activity_id:           activityId,
                gabi_temperatura:      analise.temperatura,
                gabi_temperatura_score: analise.temperatura_score,
                gabi_resumo:           analise.resumo,
                gabi_acoes_sugeridas:  JSON.stringify(analise.acoes_sugeridas),
            },
        });

        // 8. Log de custo
        await prisma.whatsapp_usage_logs.create({
            data: {
                conversation_id:       convId,
                company_id:            conv.company_id || null,
                conversation_category: 'service',
                origin:                'inbox',
                cost_usd:              0, // já foi logado por mensagem no sendTextMessage
            },
        }).catch(() => {});

        // 9. Audit log
        audit.log(prisma, {
            actor:       req.usuarioAtual,
            action:      'UPDATE',
            entity_type: 'whatsapp_conversation',
            entity_id:   convId,
            entity_name: `Conversa WA +${conv.wa_phone_number}`,
            description: `Encerrou conversa WhatsApp (${durationMinutes}min) — temperatura: ${analise.temperatura} — Atividade criada: ${activityTitle}`,
            meta:        { duracao_minutos: durationMinutes, temperatura: analise.temperatura, activity_id: resultActivity.id },
            company_id:  conv.company_id || null,
        });

        // 10. Emite SSE
        emitToAgents('conversation_closed', {
            conversationId: convId,
            activityId:     resultActivity.id,
            analise,
        });

        return res.json({
            ok:       true,
            activity: { id: resultActivity.id, title: resultActivity.title },
            analise,
        });

    } catch (err) {
        console.error('[WhatsApp POST /close]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/whatsapp/conversations/:id/link ── Vínculo manual ──────────────
router.post('/conversations/:id/link', requireAuth(), extractUser, async (req, res) => {
    try {
        const convId = req.params.id;
        const { contact_id, company_id, contact_nome: manual_nome } = req.body;

        if (!contact_id && !company_id && !manual_nome) {
            return res.status(400).json({ error: 'Informe um contato, empresa ou nome para vincular.' });
        }

        const conv = await prisma.whatsapp_conversations.findUnique({ where: { id: convId } });
        if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

        let contactId   = contact_id || conv.contact_id;
        let companyId   = company_id || conv.company_id;
        let contactNome = manual_nome || conv.contact_nome;
        let companyNome = conv.company_nome;

        // 1. Resolve Contato
        if (contact_id) {
            const contact = await prisma.contacts.findUnique({ where: { id: contact_id } });
            if (contact) {
                contactNome = contact.Nome_do_contato;
                if (!companyId) companyId = contact.companyId;
            }
        }

        // 2. Resolve Empresa
        if (companyId) {
            const company = await prisma.companies.findUnique({ where: { id: company_id } });
            if (company) companyNome = company.Nome_da_empresa;
        }

        // 3. Auto-criação de Contato no CRM se tiver Empresa + Nome + Telefone
        if (companyId && contactNome && !contactId && conv.wa_phone_number) {
            try {
                const { randomUUID } = await import('crypto');
                const newContact = await prisma.contacts.create({
                    data: {
                        id: randomUUID(),
                        companyId: companyId,
                        Nome_do_contato: contactNome,
                        WhatsApp: conv.wa_phone_number,
                    }
                });
                contactId = newContact.id;
                console.log(`[WhatsApp] 👤 Contato criado via vínculo: ${contactNome} (id: ${contactId})`);
            } catch (err) {
                console.warn('[WhatsApp] Falha ao criar contato no CRM:', err.message);
                // Segue sem ID de contato, mas com nome
            }
        }

        const updated = await prisma.whatsapp_conversations.update({
            where: { id: convId },
            data: {
                contact_id:   contactId || null,
                company_id:   companyId || null,
                contact_nome: contactNome,
                company_nome: companyNome,
                updated_at:   new Date()
            },
            include: { contacts: true, companies: true }
        });

        // Se já existe uma atividade vinculada, sincroniza a empresa nela
        if (updated.activity_id && updated.company_id) {
            await prisma.activities.update({
                where: { id: updated.activity_id },
                data: { company_id: updated.company_id }
            }).catch(() => {});
        }

        return res.json({ 
            ok: true, 
            contact_nome: updated.contact_nome, 
            company_nome: updated.company_nome 
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/whatsapp/conversations/:id/ai ── Toggle modo Gabi ───────────────
router.post('/conversations/:id/ai', requireAuth(), extractUser, async (req, res) => {
    try {
        const convId = req.params.id;
        const { enabled } = req.body;

        const conv = await prisma.whatsapp_conversations.findUnique({ where: { id: convId } });
        if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

        await prisma.whatsapp_conversations.update({
            where: { id: convId },
            data: { ai_enabled: !!enabled, updated_at: new Date() }
        });

        const statusLabel = !!enabled ? 'ativado' : 'desativado';
        console.log(`[WhatsApp] 🤖 Modo Gabi ${statusLabel} para conversa ${convId}`);
        
        return res.json({ ok: true, ai_enabled: !!enabled });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/whatsapp/conversations ── Listar conversas ──────────────────────
router.get('/conversations', requireAuth(), extractUser, async (req, res) => {
    try {
        const { status = 'open', page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const where = {};
        if (status !== 'all') where.status = status;

        const [conversations, total] = await Promise.all([
            prisma.whatsapp_conversations.findMany({
                where,
                orderBy: { updated_at: 'desc' },
                skip,
                take: parseInt(limit),
                include: {
                    contacts:  { select: { Nome_do_contato: true } },
                    companies: { select: { Nome_da_empresa: true } },
                    messages: {
                        orderBy: { created_at: 'desc' },
                        take: 1,
                    },
                },
            }),
            prisma.whatsapp_conversations.count({ where }),
        ]);

        const data = conversations.map(conv => ({
            id:              conv.id,
            wa_phone_number: conv.wa_phone_number,
            status:          conv.status,
            opened_at:       conv.opened_at,
            closed_at:       conv.closed_at,
            assigned_to:     conv.assigned_to,
            gabi_temperatura:       conv.gabi_temperatura,
            gabi_temperatura_score: conv.gabi_temperatura_score,
            gabi_resumo:            conv.gabi_resumo,
            contact_nome:    conv.contacts?.Nome_do_contato  || null,
            company_nome:    conv.companies?.Nome_da_empresa || null,
            last_message:    conv.messages[0] || null,
        }));

        return res.json({ data, total, page: parseInt(page), limit: parseInt(limit) });

    } catch (err) {
        console.error('[WhatsApp GET /conversations]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/whatsapp/conversations/:id/messages ── Histórico ────────────────
router.get('/conversations/:id/messages', requireAuth(), extractUser, async (req, res) => {
    try {
        const convId = req.params.id;

        const conv = await prisma.whatsapp_conversations.findUnique({
            where: { id: convId },
            include: {
                contacts:  { select: { Nome_do_contato: true, WhatsApp: true } },
                companies: { select: { Nome_da_empresa: true } },
            },
        });
        if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

        const messages = await prisma.whatsapp_messages.findMany({
            where:   { conversation_id: convId },
            orderBy: { created_at: 'asc' },
        });

        return res.json({
            conversation: {
                id:              conv.id,
                wa_phone_number: conv.wa_phone_number,
                status:          conv.status,
                opened_at:       conv.opened_at,
                closed_at:       conv.closed_at,
                gabi_temperatura:       conv.gabi_temperatura,
                gabi_temperatura_score: conv.gabi_temperatura_score,
                gabi_resumo:            conv.gabi_resumo,
                gabi_acoes_sugeridas:   conv.gabi_acoes_sugeridas ? JSON.parse(conv.gabi_acoes_sugeridas) : [],
                contact_nome:    conv.contacts?.Nome_do_contato  || null,
                company_nome:    conv.companies?.Nome_da_empresa || null,
            },
            messages,
        });

    } catch (err) {
        console.error('[WhatsApp GET /messages]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/whatsapp/stats ── Dashboard ─────────────────────────────────────
router.get('/stats', requireAuth(), async (req, res) => {
    try {
        const now   = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);

        const [configured, costAgg, totalConvs, openConvs, tempDistrib, monthlyByDay] = await Promise.all([
            isWhatsAppConfiguredAsync(),
            // Custo do mês atual
            prisma.whatsapp_usage_logs.aggregate({
                _sum: { cost_usd: true },
                where: { created_at: { gte: start, lt: end } },
            }),
            // Total de conversas
            prisma.whatsapp_conversations.count(),
            // Conversas abertas
            prisma.whatsapp_conversations.count({ where: { status: 'open' } }),
            // Distribuição de temperatura
            prisma.whatsapp_conversations.groupBy({
                by: ['gabi_temperatura'],
                _count: { id: true },
                where: { status: 'closed', gabi_temperatura: { not: null } },
            }),
            // Custo por mês (últimos 6 meses)
            prisma.whatsapp_usage_logs.findMany({
                where: { created_at: { gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } },
                select: { cost_usd: true, created_at: true },
            }),
        ]);

        // Agrupa custo por mês
        const byMonth = {};
        for (const row of monthlyByDay) {
            const key = new Date(row.created_at).toLocaleDateString('pt-BR', { month: '2-digit', year: 'numeric' });
            byMonth[key] = (byMonth[key] || 0) + parseFloat(row.cost_usd || 0);
        }

        return res.json({
            configured,
            current_month_cost_usd: parseFloat(costAgg._sum?.cost_usd || 0).toFixed(4),
            total_conversations:    totalConvs,
            open_conversations:     openConvs,
            temperatura_distribution: tempDistrib.map(t => ({
                temperatura: t.gabi_temperatura,
                total: t._count.id,
            })),
            monthly_cost_history: Object.entries(byMonth).map(([mes, custo]) => ({
                mes,
                cost_usd: parseFloat(custo.toFixed(4)),
            })),
        });

    } catch (err) {
        console.error('[WhatsApp GET /stats]', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ── HELPER: app_settings ─────────────────────────────────────────────────────
async function _getSetting(key, fallback = null) {
    try {
        const row = await prisma.app_settings.findUnique({ where: { key } });
        return row?.value || fallback;
    } catch {
        return fallback;
    }
}

// ── GET /api/whatsapp/usage ───────────────────────────────────────────────────
router.get('/usage', requireAuth(), async (req, res) => {
    try {
        const now   = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        
        const logs = await prisma.whatsapp_usage_logs.findMany({
            where: { created_at: { gte: start, lt: end } },
            orderBy: { created_at: 'desc' },
            take: 200
        });

        const monthly = {
            cost:   logs.reduce((s, l) => s + (l.cost_usd || 0), 0),
            sessions: logs.length, // Cada log é uma sessão ou disparo cobrado
        };

        const byDay = {};
        logs.forEach(l => {
            const day = new Date(l.created_at).toLocaleDateString('pt-BR');
            if (!byDay[day]) byDay[day] = { cost: 0, sessions: 0 };
            byDay[day].cost  += (l.cost_usd || 0);
            byDay[day].sessions += 1;
        });
        const daily = Object.entries(byDay).map(([date, v]) => ({ date, ...v }));

        res.json({
            monthly, 
            daily,
            token_configured: !!(await _getSetting('whatsapp_access_token')) || !!process.env.WHATSAPP_ACCESS_TOKEN,
            phone_id_configured: !!(await _getSetting('whatsapp_phone_number_id')) || !!process.env.WHATSAPP_PHONE_NUMBER_ID,
            phone_id: (await _getSetting('whatsapp_phone_number_id')) || process.env.WHATSAPP_PHONE_NUMBER_ID || '',
            limit: parseFloat(await _getSetting('whatsapp_monthly_limit_usd', process.env.WHATSAPP_MONTHLY_LIMIT_USD || '20')),
            alert_pct: parseFloat(await _getSetting('whatsapp_alert_pct', process.env.WHATSAPP_ALERT_PCT || '80')),
            alert_email: await _getSetting('whatsapp_alert_email', process.env.WHATSAPP_ALERT_EMAIL || ''),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── PATCH /api/whatsapp/settings ──────────────────────────────────────────────
router.patch('/settings', requireAuth(), async (req, res) => {
    const { userId } = getAuth(req);
    const { whatsapp_access_token, whatsapp_phone_number_id, monthly_limit_usd, alert_pct, alert_email } = req.body;

    try {
        // Check if user is master
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (user?.user_type !== 'master') {
            return res.status(403).json({ error: 'Apenas administradores podem alterar estas configurações.' });
        }

        const upsertSetting = async (key, value) => {
            await prisma.app_settings.upsert({
                where: { key },
                update: { value: String(value), updated_by: userId },
                create: { key, value: String(value), updated_by: userId },
            });
        };

        const changes = [];
        if (whatsapp_access_token !== undefined && String(whatsapp_access_token).trim() !== '') {
            await upsertSetting('whatsapp_access_token', whatsapp_access_token.trim());
            changes.push('Token atualizado');
        }
        if (whatsapp_phone_number_id !== undefined && String(whatsapp_phone_number_id).trim() !== '') {
            await upsertSetting('whatsapp_phone_number_id', whatsapp_phone_number_id.trim());
            changes.push('Phone ID atualizado');
        }
        if (monthly_limit_usd !== undefined) {
            await upsertSetting('whatsapp_monthly_limit_usd', monthly_limit_usd);
            changes.push(`Limite: $${monthly_limit_usd}`);
        }
        if (alert_pct !== undefined) {
            await upsertSetting('whatsapp_alert_pct', alert_pct);
            changes.push(`Alerta: ${alert_pct}%`);
        }
        if (alert_email !== undefined) {
            await upsertSetting('whatsapp_alert_email', alert_email);
            changes.push(`E-mail alerta: ${alert_email}`);
        }

        if (changes.length > 0) {
            audit.log(prisma, {
                actor: user,
                action: 'UPDATE',
                entity_type: 'whatsapp_settings',
                entity_id: 'whatsapp',
                entity_name: 'Configurações WhatsApp',
                description: `Alterou configurações do WhatsApp: ${changes.join(', ')}`,
                meta: { changes }
            });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
