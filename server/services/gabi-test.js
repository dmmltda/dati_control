import { PrismaClient } from '@prisma/client';
import { sendEmail } from './email.js';
import * as audit from './audit.js';

const prisma = new PrismaClient();

async function getSetting(key, fallback = null) {
    try {
        const row = await prisma.app_settings.findUnique({ where: { key } });
        return row?.value || fallback;
    } catch {
        return fallback;
    }
}

async function getGeminiApiKey() {
    return getSetting('gemini_api_key', process.env.GEMINI_API_KEY || null);
}

const GEMINI_MODELS = [
    'gemini-2.5-flash',
    'gemini-flash-latest'
];

export async function runGabiTestRoutine() {
    console.log('[gabi-test] Iniciando verificação de segurança (30 min)...');
    try {
        const apiKey = await getGeminiApiKey();
        if (!apiKey) {
            console.warn('[gabi-test] Chave da API não configurada. Ignorando teste.');
            return;
        }

        const body = { contents: [{ role: 'user', parts: [{ text: 'Responda apenas "ok"' }] }] };
        let success = false;
        let lastErr = null;

        for (const model of GEMINI_MODELS) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10_000); // 10s
            try {
                const resp = await fetch(url, {
                    method: 'POST',
                    signal: controller.signal,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                clearTimeout(timeoutId);
                
                if (resp.ok) {
                    success = true;
                    break;
                }
                const errBody = await resp.json().catch(() => ({}));
                lastErr = `HTTP ${resp.status} - ${JSON.stringify(errBody)}`;
            } catch (e) {
                clearTimeout(timeoutId);
                lastErr = e.name === 'AbortError' ? 'Timeout (10s)' : e.message;
            }
        }

        if (!success) {
            throw new Error(`Falha nos modelos. Último erro: ${lastErr}`);
        }
        
        console.log('[gabi-test] ✅ Gabi respondendo normalmente.');
    } catch (err) {
        console.error('[gabi-test] ❌ Erro de conexão com a Gabi:', err.message);
        
        // Obter os e-mails de alerta configurados
        const alertEmail = await getSetting('gabi_alert_email', process.env.GABI_ALERT_EMAIL || '');
        if (alertEmail) {
            await sendEmail({
                to: alertEmail,
                subject: '🚨 ALERTA: Gabi AI com problemas de conexão',
                html: `
                    <div style="font-family: sans-serif; color: #333;">
                        <h2 style="color: #ef4444;">🚨 Falha na Gabi AI</h2>
                        <p>A rotina de segurança detectou uma falha de conexão com a API do Gemini.</p>
                        <p><strong>Detalhes do erro:</strong></p>
                        <pre style="background: #f1f5f9; padding: 10px; border-radius: 6px; color: #333;">${err.message}</pre>
                        <p>Verifique a chave da API e a cota do projeto no Google AI Studio.</p>
                    </div>
                `,
                tag: 'gabi-test-failure'
            }).catch(e => console.error('[gabi-test] Falha ao enviar email:', e.message));
        }

        // Histórico de alterações (auditoria)
        audit.log(prisma, {
            actor: null, // SYSTEM
            action: 'SYSTEM',
            entity_type: 'gabi_settings',
            entity_id: 'gabi_test',
            entity_name: 'Teste Gabi AI',
            description: `Falha na verificação de 30 min da Gabi: ${err.message}. ${alertEmail ? `Alerta enviado para ${alertEmail}` : 'Nenhum e-mail de alerta configurado.'}`,
            meta: { error: err.message }
        });
    }
}
