/**
 * ============================================================================
 * WhatsApp Service — server/services/whatsapp.js
 * ============================================================================
 *
 * ÚNICO ponto de acesso à API da Meta (WhatsApp Cloud API) em todo o projeto.
 * Todos os envios DEVEM passar por este módulo.
 * Não contém lógica de negócio. Apenas: API Meta + app_settings + log de custo.
 *
 * Uso:
 *   import { sendTextMessage, isWhatsAppConfigured } from './services/whatsapp.js';
 *
 *   const result = await sendTextMessage('+5511999999999', 'Olá!', { origin: 'agent' });
 *
 * Variáveis de ambiente (fallback se não configurado via app_settings):
 *   WHATSAPP_ACCESS_TOKEN     — Token System User Meta
 *   WHATSAPP_PHONE_NUMBER_ID  — ID do número no Meta
 *   WHATSAPP_APP_SECRET       — Para validar assinatura HMAC do webhook
 *   WHATSAPP_VERIFY_TOKEN     — Token livre para verificação inicial
 *
 * ============================================================================
 */

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { sendEmail, isEmailConfigured } from './email.js';

const _prisma = new PrismaClient();
const _alertsEnviados = new Set();

// ── Base URL da Cloud API Meta ─────────────────────────────────────────────────
const META_API_BASE = 'https://graph.facebook.com/v19.0';

// ── Custo estimado por conversa de serviço (Meta cobra por 24h window, não por msg) ────
const COST_SERVICE_WINDOW_USD = 0.025;

// ─── Helpers internos de configuração ─────────────────────────────────────────

async function _getSetting(key) {
    try {
        const row = await _prisma.app_settings.findUnique({ where: { key } });
        return row?.value || null;
    } catch {
        return null;
    }
}

async function _getAccessToken() {
    return (await _getSetting('whatsapp_access_token')) || process.env.WHATSAPP_ACCESS_TOKEN || null;
}

async function _getPhoneNumberId() {
    return (await _getSetting('whatsapp_phone_number_id')) || process.env.WHATSAPP_PHONE_NUMBER_ID || null;
}

// ─── Helpers internos de log ───────────────────────────────────────────────────

/**
 * Registra custo em whatsapp_usage_logs e verifica thresholds de alerta.
 * @param {object} params
 */
function _logCost({ conversation_id = null, company_id = null, origin = 'agent', category = 'service', cost_usd = COST_SERVICE_WINDOW_USD } = {}) {
    _prisma.whatsapp_usage_logs.create({
        data: {
            conversation_id,
            company_id,
            conversation_category: category,
            origin,
            cost_usd,
        },
    }).then(newLog => {
        // Verifica thresholds após logar
        _checkWhatsAppThresholds().catch(err => console.error('[WhatsApp Alert] Threshold check error:', err.message));
    }).catch(err => console.warn('[WhatsApp] Aviso ao logar custo:', err.message));
}

/**
 * Verifica se o consumo mensal atingiu 80% ou 100% do limite.
 * Dispara e-mail de alerta para o administrador.
 */
async function _checkWhatsAppThresholds() {
    try {
        const now   = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const anoMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // 1. Soma consumo do mês
        const agg = await _prisma.whatsapp_usage_logs.aggregate({
            _sum: { cost_usd: true },
            where: { created_at: { gte: start, lt: end } },
        });

        const totalSpent = parseFloat(agg._sum?.cost_usd || 0);
        
        // 2. Busca configurações
        const limit    = parseFloat(await _getSetting('whatsapp_monthly_limit_usd', process.env.WHATSAPP_MONTHLY_LIMIT_USD || '20'));
        const alertPct = parseFloat(await _getSetting('whatsapp_alert_pct', process.env.WHATSAPP_ALERT_PCT || '80'));
        const alertEmail = await _getSetting('whatsapp_alert_email', process.env.WHATSAPP_ALERT_EMAIL || process.env.GABI_ALERT_EMAIL || '');
        
        if (!alertEmail || !isEmailConfigured()) return;

        const currentPct = (totalSpent / limit) * 100;

        // 3. Alerta de percentual (ex: 80%)
        if (currentPct >= alertPct) {
            const key = `${anoMes}_WA_PCT${Math.floor(alertPct)}`;
            if (!_alertsEnviados.has(key)) {
                _alertsEnviados.add(key);
                await sendEmail({
                    to: alertEmail,
                    subject: `⚠️ Alerta de Consumo WhatsApp: ${currentPct.toFixed(1)}% atingido`,
                    template: 'gabiAlert', // Reusando template por simplicidade, ou criando um novo
                    data: {
                        totalSpent: totalSpent.toFixed(2),
                        limit: limit.toFixed(2),
                        currentPct: currentPct.toFixed(1),
                        serviceName: 'WhatsApp Cloud API'
                    }
                });
                console.log(`[WhatsApp Alert] 📧 E-mail de threshold ${alertPct}% enviado para ${alertEmail}`);
            }
        }

        // 4. Alerta de limite (100%)
        if (totalSpent >= limit) {
            const key = `${anoMes}_WA_LIMITE`;
            if (!_alertsEnviados.has(key)) {
                _alertsEnviados.add(key);
                await sendEmail({
                    to: alertEmail,
                    subject: '🚨 CRÍTICO: Limite Mensal WhatsApp Atingido',
                    template: 'gabiAlert',
                    data: {
                        totalSpent: totalSpent.toFixed(2),
                        limit: limit.toFixed(2),
                        currentPct: currentPct.toFixed(1),
                        serviceName: 'WhatsApp Cloud API'
                    }
                });
                console.log(`[WhatsApp Alert] 📧 E-mail de limite 100% enviado para ${alertEmail}`);
            }
        }
    } catch (err) {
        throw err;
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTS PÚBLICOS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Normaliza número de telefone para comparações (remove +, espaços, hífens, parênteses).
 * Use em TODO o sistema ao comparar/guardar números.
 *
 * @param {string} phone
 * @returns {string}
 */
export function normalizePhone(phone) {
    if (!phone) return '';
    return String(phone).replace(/[\s\-().+]/g, '');
}

/**
 * Normaliza número brasileiro para ENVIO via API Meta.
 * O Meta envia webhooks com números BR sem o "9" de celular (ex: 554888480707 = 12 dígitos),
 * mas para ENTREGAR mensagens precisa do "9" (ex: 5548988480707 = 13 dígitos).
 *
 * Regra: DDDs brasileiros (55 + 2 dígitos DDD) com 8 dígitos restantes → inserir 9.
 * Ex: 554888480707 → 5548988480707
 *     5511988880707 → sem alteração (já tem 13 dígitos)
 *
 * @param {string} phone - número normalizado (sem + ou espaços)
 * @returns {string}
 */
export function normalizePhoneForSend(phone) {
    let clean = normalizePhone(phone);
    if (!clean) return '';
    
    // Regra do 9º dígito: +55 (Brasil) + DDD (2 dígitos) + 8 dígitos = 12 dígitos totais
    // Se tiver 12 dígitos e começar com 55, adicionamos o 9 após o DDD
    if (clean.length === 12 && clean.startsWith('55')) {
        const ddd = clean.substring(2, 4);
        const numero = clean.substring(4);
        
        // (Opcional, mas seguro) Apenas números de celular normalmente começam com 6, 7, 8 ou 9.
        // Mas a regra geral da Anatel para todos os celulares do Brasil é ter 9.
        clean = `55${ddd}9${numero}`;
    }
    
    return clean;
}

/**
 * Verifica se o serviço de WhatsApp está configurado (token + number_id presentes).
 * Equivalente ao isEmailConfigured() do email.js.
 *
 * IMPORTANTE: Esta função é SÍNCRONA e verifica apenas variáveis de ambiente.
 * Para verificação completa (incluindo app_settings), use isWhatsAppConfiguredAsync().
 *
 * @returns {boolean}
 */
export function isWhatsAppConfigured() {
    return !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/**
 * Versão assíncrona que verifica env + app_settings.
 * @returns {Promise<boolean>}
 */
export async function isWhatsAppConfiguredAsync() {
    const token = await _getAccessToken();
    const phoneId = await _getPhoneNumberId();
    return !!(token && phoneId);
}

/**
 * Envia mensagem de texto simples via WhatsApp Cloud API.
 * Equivalente ao sendEmail() do email.js.
 *
 * @param {string} to      - Número E.164 sem + (ex: "5511999999999") ou com + (será normalizado)
 * @param {string} text    - Texto da mensagem (máx 4096 chars)
 * @param {object} [opts]
 * @param {string} [opts.origin]          - "agent"|"gabi"|"reminder"|"system" (para log de custo)
 * @param {string} [opts.conversation_id] - ID da conversa no banco (para log de custo)
 * @param {string} [opts.company_id]      - ID da empresa (para log de custo)
 * @param {boolean} [opts.logCost]        - Se false, não registra custo (padrão: true)
 *
 * @returns {Promise<{ sent: boolean, wa_message_id?: string, error?: string }>}
 */
export async function sendTextMessage(to, text, opts = {}) {
    const { origin = 'agent', conversation_id = null, company_id = null, logCost = true } = opts;

    const accessToken  = await _getAccessToken();
    const phoneNumberId = await _getPhoneNumberId();

    if (!accessToken || !phoneNumberId) {
        console.warn('[WhatsApp] Credenciais não configuradas — mensagem ignorada');
        return { sent: false, error: 'WhatsApp não configurado' };
    }

    // Normaliza: remove + e espaços para envio e injeta o 9º dígito se necessário
    const toClean = normalizePhoneForSend(to);
    if (!toClean) {
        console.warn('[WhatsApp] Número de destino inválido:', to);
        return { sent: false, error: 'Número inválido' };
    }

    const payload = {
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                toClean,
        type:              'text',
        text: { body: String(text).substring(0, 4096) },
    };

    try {
        const resp = await fetch(`${META_API_BASE}/${phoneNumberId}/messages`, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
        });

        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) {
            console.error(`[WhatsApp] ❌ Falha ao enviar para ${toClean}: ${resp.status}`, data?.error?.message || data);
            return { sent: false, error: data?.error?.message || `HTTP ${resp.status}` };
        }

        const wa_message_id = data?.messages?.[0]?.id || null;
        console.log(`[WhatsApp] ✅ Mensagem enviada para +${toClean} [${origin}]${wa_message_id ? ' | id: ' + wa_message_id : ''}`);

        // Log de custo (fire-and-forget)
        if (logCost) {
            _logCost({ conversation_id, company_id, origin, category: 'service' });
        }

        return { sent: true, wa_message_id };

    } catch (err) {
        console.error(`[WhatsApp] ❌ Erro de rede ao enviar para ${toClean}:`, err.message);
        return { sent: false, error: err.message };
    }
}

/**
 * Envia mensagem usando template aprovado pela Meta.
 * Necessário para conversas iniciadas pelo business fora da janela de 24h.
 *
 * @param {string} to
 * @param {string} templateName
 * @param {string} languageCode  - ex: "pt_BR"
 * @param {Array}  [components]  - parâmetros do template (body/header)
 * @param {object} [opts]        - mesmas opts do sendTextMessage
 *
 * @returns {Promise<{ sent: boolean, wa_message_id?: string, error?: string }>}
 */
export async function sendTemplateMessage(to, templateName, languageCode = 'pt_BR', components = [], opts = {}) {
    const { origin = 'agent', conversation_id = null, company_id = null, logCost = true } = opts;

    const accessToken   = await _getAccessToken();
    const phoneNumberId = await _getPhoneNumberId();

    if (!accessToken || !phoneNumberId) {
        console.warn('[WhatsApp] Credenciais não configuradas — template ignorado');
        return { sent: false, error: 'WhatsApp não configurado' };
    }

    const toClean = normalizePhoneForSend(to);
    if (!toClean) {
        return { sent: false, error: 'Número inválido' };
    }

    const payload = {
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to:                toClean,
        type:              'template',
        template: {
            name:     templateName,
            language: { code: languageCode },
            ...(components.length > 0 && { components }),
        },
    };

    try {
        const resp = await fetch(`${META_API_BASE}/${phoneNumberId}/messages`, {
            method:  'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
        });

        const data = await resp.json().catch(() => ({}));

        if (!resp.ok) {
            console.error(`[WhatsApp] ❌ Falha ao enviar template "${templateName}" para ${toClean}:`, data?.error?.message || data);
            return { sent: false, error: data?.error?.message || `HTTP ${resp.status}` };
        }

        const wa_message_id = data?.messages?.[0]?.id || null;
        console.log(`[WhatsApp] ✅ Template "${templateName}" enviado para +${toClean} [${origin}]`);

        if (logCost) {
            _logCost({ conversation_id, company_id, origin, category: 'utility' });
        }

        return { sent: true, wa_message_id };

    } catch (err) {
        console.error(`[WhatsApp] ❌ Erro de rede ao enviar template "${templateName}":`, err.message);
        return { sent: false, error: err.message };
    }
}

/**
 * Parseia e valida o payload recebido no webhook POST da Meta.
 * Valida assinatura HMAC-SHA256 com WHATSAPP_APP_SECRET.
 *
 * @param {Buffer|string} rawBody   - body bruto para validar assinatura
 * @param {string}        signature - header X-Hub-Signature-256 (ex: "sha256=abc123")
 *
 * @returns {Array<NormalizedMessage>} mensagens normalizadas
 *
 * NormalizedMessage: {
 *   wa_message_id: string,
 *   from: string,           // número sem +
 *   type: string,           // "text" | "image" | "audio" | "document" ...
 *   text: string|null,
 *   timestamp: number,
 *   is_status_update: boolean,
 *   status?: string,        // present se is_status_update=true
 * }
 *
 * @throws {Error} se assinatura inválida
 */
export function parseWebhookPayload(rawBody, signature) {
    const appSecret = process.env.WHATSAPP_APP_SECRET;

    // Validação HMAC — obrigatória se APP_SECRET estiver configurado
    if (appSecret) {
        if (!signature) {
            console.warn('[WhatsApp] Webhook sem assinatura — rejeitando');
            throw new Error('Missing signature');
        }
        const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
        const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(body).digest('hex');
        if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
            console.warn('[WhatsApp] Assinatura HMAC inválida');
            throw new Error('Invalid signature');
        }
    }

    // Parse do body
    let parsed;
    try {
        parsed = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString() : rawBody);
    } catch (err) {
        throw new Error('Invalid JSON payload');
    }

    const messages = [];

    // Estrutura Meta: entry[] > changes[] > value > messages[]
    for (const entry of (parsed.entry || [])) {
        for (const change of (entry.changes || [])) {
            const value = change.value;
            if (!value) continue;

            // Mensagens recebidas
            for (const msg of (value.messages || [])) {
                messages.push({
                    wa_message_id:    msg.id,
                    from:             msg.from,          // número sem +
                    type:             msg.type || 'text',
                    text:             msg.text?.body || msg.caption || null,
                    timestamp:        parseInt(msg.timestamp || 0),
                    is_status_update: false,
                });
            }

            // Status updates (delivered, read, failed, etc.)
            for (const status of (value.statuses || [])) {
                messages.push({
                    wa_message_id:    status.id,
                    from:             status.recipient_id,
                    type:             'status',
                    text:             null,
                    timestamp:        parseInt(status.timestamp || 0),
                    is_status_update: true,
                    status:           status.status, // "sent" | "delivered" | "read" | "failed"
                });
            }
        }
    }

    return messages;
}
