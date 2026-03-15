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
    
    const startTime = Date.now();
    let runId;
    let testCaseId;

    try {
        // Criar Test Run
        const run = await prisma.test_runs.create({
            data: {
                suite_type: 'E2E',
                triggered_by: null,
                environment: process.env.NODE_ENV || 'production',
                status: 'running',
                total_tests: 1
            }
        });
        runId = run.id;

        // Criar Test Case
        const tc = await prisma.test_cases.create({
            data: {
                run_id: runId,
                suite_file: 'gabi-test.js',
                module: 'Gabi AI',
                test_name: 'Health Check Gemini API',
                suite_type: 'E2E',
                status: 'RODANDO'
            }
        });
        testCaseId = tc.id;

        const apiKey = await getGeminiApiKey();
        if (!apiKey) {
            throw new Error('Chave da API não configurada.');
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
        
        const duration = Date.now() - startTime;

        // Atualizar Test Logs como Sucesso
        await prisma.test_cases.update({
            where: { id: testCaseId },
            data: { status: 'PASSOU', duration_ms: duration }
        });

        await prisma.test_runs.update({
            where: { id: runId },
            data: { status: 'passed', passed_tests: 1, duration_ms: duration }
        });

        // Histórico de alterações (auditoria) sucesso
        audit.log(prisma, {
            actor: null,
            action: 'SYSTEM',
            entity_type: 'gabi_settings',
            entity_id: 'gabi_test',
            entity_name: 'Teste Gabi AI',
            description: `Teste de saúde da Gabi AI executado com sucesso (${duration}ms).`,
            meta: { status: 'PASSED', duration_ms: duration }
        });

        console.log(`[gabi-test] ✅ Gabi respondendo normalmente em ${duration}ms.`);
    } catch (err) {
        console.error('[gabi-test] ❌ Erro de conexão com a Gabi:', err.message);
        const duration = Date.now() - startTime;

        // Atualizar Test Logs como Falha
        if (testCaseId) {
            await prisma.test_cases.update({
                where: { id: testCaseId },
                data: { status: 'FALHOU', duration_ms: duration, error_message: err.message }
            });
        }
        if (runId) {
            await prisma.test_runs.update({
                where: { id: runId },
                data: { status: 'failed', failed_tests: 1, duration_ms: duration, raw_output: JSON.stringify({ error: err.message }) }
            });
        }
        
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

        // Histórico de alterações (auditoria) falha
        audit.log(prisma, {
            actor: null, // SYSTEM
            action: 'SYSTEM',
            entity_type: 'gabi_settings',
            entity_id: 'gabi_test',
            entity_name: 'Teste Gabi AI',
            description: `Falha na verificação de saúde da Gabi AI: ${err.message}. ${alertEmail ? `Alerta enviado para ${alertEmail}` : 'Nenhum e-mail de alerta configurado.'}`,
            meta: { error: err.message, status: 'FAILED' }
        });
    }
}
