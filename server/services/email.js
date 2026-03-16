/**
 * ============================================================================
 * Email Service — servidor/services/email.js
 * ============================================================================
 *
 * ÚNICO ponto de acesso ao Resend em todo o projeto.
 * Todos os envios de e-mail DEVEM passar por este módulo.
 *
 * Uso:
 *   import { sendEmail } from './services/email.js';
 *
 *   await sendEmail({
 *       to: 'usuario@email.com',            // string ou array
 *       template: 'activityReminder',       // nome do template
 *       data: { activity, usuario },        // dados para o template
 *   });
 *
 *   // Ou com HTML personalizado (sem template):
 *   await sendEmail({
 *       to: 'usuario@email.com',
 *       subject: 'Assunto manual',
 *       html: '<p>Conteúdo</p>',
 *   });
 *
 * Templates disponíveis:
 *   - 'activityReminder'  → data: { activity, usuario }
 *   - 'mention'           → data: { activity, mencionadoPor }
 *   - 'gabiAlert'         → data: { spent, limit, pct }
 *   - 'testResult'        → data: { run }
 *
 * ============================================================================
 */

import { Resend } from 'resend';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { activityReminderTemplate } from './email-templates/activity-reminder.js';
import { mentionTemplate }          from './email-templates/mention.js';
import { gabiAlertTemplate }        from './email-templates/gabi-alert.js';
import { testResultTemplate }       from './email-templates/test-result.js';
import { meetingInviteTemplate }    from './email-templates/meeting-invite.js';
import { meetingSummaryTemplate }   from './email-templates/meeting-summary.js';
import { recordingAvailableTemplate } from './email-templates/recording-available.js';
import { taskAssignedTemplate }     from './email-templates/task-assigned.js';
import { nextStepReminderTemplate } from './email-templates/next-step-reminder.js';
import { gabiSummaryTemplate }      from './email-templates/gabi-email-summary.js';
import { npsSurveyTemplate }        from './email-templates/nps-survey.js';

// ── Clientes (instâncias únicas) ──────────────────────────────────────────────────────────────
const _prisma = new PrismaClient();

// ── Cliente Resend (instância única em todo o servidor) ───────────────────────
const _resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

// ── Remetente padrão ──────────────────────────────────────────────────────────
const DEFAULT_FROM = process.env.EMAIL_FROM
    || process.env.GABI_EMAIL_FROM
    || 'Journey CRM <onboarding@resend.dev>';

// ── Mapa de templates ─────────────────────────────────────────────────────────
const TEMPLATES = {
    activityReminder: (data) => activityReminderTemplate(data.activity, data.usuario),
    mention:          (data) => mentionTemplate(data.activity, data.mencionadoPor),
    gabiAlert:        (data) => gabiAlertTemplate(data),
    testResult:       (data) => testResultTemplate(data.run),
    meetingInvite:    (data) => meetingInviteTemplate(data.activity, data.usuario, data.empresa),
    meetingSummary:   (data) => meetingSummaryTemplate(data.activity, data.usuario, data.empresa),
    recording:        (data) => recordingAvailableTemplate(data.activity, data.usuario, data.empresa),
    taskAssigned:     (data) => taskAssignedTemplate(data.activity, data.usuario, data.atribuidoPor, data.empresa),
    nextStep:         (data) => nextStepReminderTemplate(data.activity, data.usuario, data.empresa),
    gabiSummary:      (data) => gabiSummaryTemplate(data),
    npsSurvey:        (data) => npsSurveyTemplate(data.destinatario, data.tipoForm, data.urlForm),
};

/**
 * Envia um e-mail via Resend.
 *
 * @param {object}          opts
 * @param {string|string[]} opts.to          - Destinatário(s)
 * @param {string}          [opts.from]      - Remetente (padrão: EMAIL_FROM do .env)
 * @param {string}          [opts.template]  - Nome do template (ver TEMPLATES acima)
 * @param {object}          [opts.data]      - Dados para o template
 * @param {string}          [opts.subject]   - Assunto manual (quando não usa template)
 * @param {string}          [opts.html]      - HTML manual (quando não usa template)
 * @param {string}          [opts.tag]       - Tag descritiva para logs (ex: 'lembrete-gabi')
 * @param {string}          [opts.dedupKey]  - Chave única de dedup (ex: 'lembrete-{id}-{data}')
 * @param {string}          [opts.replyTo]   - Endereço de resposta para inbound parsing
 * @param {object}          [opts.headers]   - Cabeçalhos customizados (ex: References)
 *
 * @returns {Promise<{ sent: boolean, blocked?: string, error?: string }>}
 */
export async function sendEmail({ to, from, template, data, subject, html, tag, dedupKey, replyTo, headers }) {
    // ── Guarda: Resend não configurado ────────────────────────────────────────
    if (!_resend) {
        console.warn(`[Email] RESEND_API_KEY não configurada — e-mail ignorado${tag ? ` [${tag}]` : ''}`);
        return { sent: false, blocked: 'RESEND_API_KEY não configurada' };
    }

    // ── Resolve template → subject + html ─────────────────────────────────────
    if (template) {
        const resolver = TEMPLATES[template];
        if (!resolver) {
            console.error(`[Email] Template desconhecido: "${template}"`);
            return { sent: false, error: `Template desconhecido: ${template}` };
        }
        const resolved = resolver(data || {});
        subject = resolved.subject;
        html    = resolved.html;
    }

    if (!subject || !html) {
        console.error('[Email] subject e html são obrigatórios quando não usa template');
        return { sent: false, error: 'subject e html obrigatórios' };
    }

    // ── Normaliza destinatários ────────────────────────────────────────────────
    const recipients = Array.isArray(to)
        ? to.flatMap(e => e.split(',')).map(e => e.trim()).filter(Boolean)
        : String(to).split(',').map(e => e.trim()).filter(Boolean);

    if (recipients.length === 0) {
        console.warn('[Email] Nenhum destinatário válido — e-mail ignorado');
        return { sent: false, blocked: 'Sem destinatários' };
    }

    // ── Dedup: INSERT antes de enviar ──────────────────────────────────────────────────────────────
    const logTag = tag ? ` [${tag}]` : '';
    dedupKey = dedupKey || crypto.randomUUID();
    
    try {
        await _prisma.email_send_log.create({
            data: {
                dedup_key: dedupKey,
                recipient: recipients.join(','),
                subject,
                template:  template || null,
                tag:       tag     || null,
            },
        });
    } catch (dedupErr) {
        if (dedupErr.code === 'P2002') {
            // Unique constraint: e-mail já enviado com essa chave
            console.warn(`[Email] 🛑 Bloqueado duplicado${logTag}: ${dedupKey}`);
            return { sent: false, blocked: 'duplicate' };
        }
        // Outro erro de DB: loga mas não bloqueia o envio
        console.warn(`[Email] Aviso dedup${logTag}: ${dedupErr.message}`);
    }

    // ── Envio ────────────────────────────────────────────────────────────────────────────────
    try {
        const sendOpts = {
            from:            from || DEFAULT_FROM,
            to:              recipients,
            subject,
            html,
            ...(dedupKey && { idempotencyKey: dedupKey }), // 3ª camada de proteção
        };
        
        // Se definirmos um domínio de inbound geral (ex: respostas@dati.com.br), ou deixamos dinâmico
        if (replyTo) sendOpts.replyTo = replyTo;
        else if (process.env.EMAIL_INBOUND_ADDRESS) {
            // Se configurado no env, usa UUID do e-mail tracker "reply+uuid@dominio.com" pra parse nativo
            const [local, domain] = process.env.EMAIL_INBOUND_ADDRESS.split('@');
            sendOpts.replyTo = `${local}+${dedupKey}@${domain}`;
        }

        if (headers) sendOpts.headers = headers;

        const response = await _resend.emails.send(sendOpts);
        
        // Atualiza a tabela email_send_log com o resend_id pra termos o In-Reply-To oficial
        if (response?.data?.id) {
            await _prisma.email_send_log.update({
                where: { dedup_key: dedupKey },
                data: { resend_id: response.data.id }
            }).catch(() => {});
        }

        console.log(`[Email] ✅ Enviado${logTag} → ${recipients.join(', ')}`);
        return { sent: true };
    } catch (err) {
        console.error(`[Email] ❌ Falha${logTag}:`, err.message);
        // Se o envio falhou e dedup foi inserido, remove para permitir retry
        if (dedupKey) {
            await _prisma.email_send_log.delete({ where: { dedup_key: dedupKey } }).catch(() => {});
        }
        return { sent: false, error: err.message };
    }
}

/**
 * Verifica se o serviço de e-mail está configurado.
 * Útil para conditional checks antes de tentar enviar.
 */
export function isEmailConfigured() {
    return !!_resend;
}
