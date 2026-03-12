/**
 * ============================================================================
 * Service: Test Runner
 * server/services/test-runner.js
 * ============================================================================
 * Responsável por:
 * - Executar suítes via child_process.spawn
 * - Parsear JSON de output do Vitest/Playwright
 * - Salvar resultados em test_runs no banco
 * - Enviar e-mail de notificação via Resend
 * ============================================================================
 */
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendEmail } from './email.js';

const prisma = new PrismaClient();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../');

// ─── Constantes ───────────────────────────────────────────────────────────────

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos

const COMMANDS = {
    UNITÁRIO: {
        cmd: 'npx',
        args: ['vitest', 'run', '--reporter=json', '--outputFile=/tmp/vitest-results.json'],
        outputFile: '/tmp/vitest-results.json',
    },
    FUNCIONAL: {
        cmd: 'npx',
        args: ['vitest', 'run', '--config', 'vitest.functional.config.js', '--reporter=json', '--outputFile=/tmp/functional-results.json'],
        outputFile: '/tmp/functional-results.json',
    },
    E2E: {
        cmd: 'npx',
        args: ['playwright', 'test', '--reporter=json'],
        outputFile: null, // playwright outputs to stdout
    },
};

// ─── runTests ─────────────────────────────────────────────────────────────────

/**
 * Executa uma suíte de testes via spawn.
 * @param {'UNITÁRIO'|'FUNCIONAL'|'E2E'} type
 * @param {string} environment - 'local' | 'staging' (E2E bloqueado em 'production')
 * @returns {Promise<{exitCode: number, stdout: string, stderr: string, durationMs: number}>}
 */
export async function runTests(type, environment = 'local') {
    if (type === 'E2E' && environment === 'production') {
        throw new Error('E2E bloqueado em produção. Use environment local ou staging.');
    }

    const config = COMMANDS[type];
    if (!config) throw new Error(`Tipo de teste desconhecido: ${type}`);

    return new Promise((resolve, reject) => {
        const start = Date.now();
        let stdout = '';
        let stderr = '';
        let killed = false;

        console.log(`[test-runner] 🚀 Iniciando ${type} em ${ROOT}`);
        const proc = spawn(config.cmd, config.args, {
            cwd: ROOT,
            env: { ...process.env, CI: 'true' },
            shell: true,
        });

        const timer = setTimeout(() => {
            killed = true;
            proc.kill('SIGTERM');
            console.warn(`[test-runner] ⏰ Timeout de 5min — ${type} interrompido`);
        }, TIMEOUT_MS);

        proc.stdout.on('data', d => { stdout += d.toString(); });
        proc.stderr.on('data', d => { stderr += d.toString(); });

        proc.on('close', (code) => {
            clearTimeout(timer);
            const durationMs = Date.now() - start;
            console.log(`[test-runner] ✅ ${type} finalizado em ${durationMs}ms — exit ${code}`);
            resolve({ exitCode: code ?? 1, stdout, stderr, durationMs, killed });
        });

        proc.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

// ─── parseResults ─────────────────────────────────────────────────────────────

/**
 * Converte output JSON do Vitest/Playwright em array de casos para test_cases.
 * @param {string} jsonOutput - stdout ou conteúdo do arquivo de resultado
 * @param {'UNITÁRIO'|'FUNCIONAL'|'E2E'} type
 * @returns {Array<{test_name, suite_file, module, status, duration_ms, error_message, error_stack}>}
 */
export function parseResults(jsonOutput, type) {
    try {
        const parsed = JSON.parse(jsonOutput);
        return _parseVitest(parsed, type);
    } catch (_) {
        // Tenta extrair JSON de stdout com prefixo/sufixo de log
        const match = jsonOutput.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (match) {
            try {
                const parsed = JSON.parse(match[1]);
                return _parseVitest(parsed, type);
            } catch (__) {}
        }
        console.warn('[test-runner] Não foi possível parsear JSON de resultados');
        return [];
    }
}

function _parseVitest(data, type) {
    const cases = [];

    // Vitest JSON format: { testResults: [{ testFilePath, testResults:[{title,status,duration}] }] }
    const fileResults = data.testResults || data.results || [];

    for (const file of fileResults) {
        const suiteFile = path.basename(file.testFilePath || file.file || 'unknown');
        const mod = suiteFile.replace(/\.test\.[jt]s$/, '');

        for (const test of (file.testResults || file.tests || [])) {
            const status = _mapStatus(test.status);
            cases.push({
                suite_file:    suiteFile,
                module:        mod,
                test_name:     test.title || test.name || 'Sem nome',
                suite_type:    type,
                status,
                duration_ms:   Math.round(test.duration || 0),
                error_message: test.failureMessages?.[0]?.split('\n')[0] || null,
                error_stack:   test.failureMessages?.join('\n') || null,
            });
        }
    }

    return cases;
}

function _mapStatus(vitestStatus) {
    // Vitest: 'passed' | 'failed' | 'skipped' | 'pending' | 'todo'
    if (vitestStatus === 'passed') return 'PASSOU';
    if (vitestStatus === 'failed') return 'FALHOU';
    return 'ERRO';
}

// ─── saveResults ──────────────────────────────────────────────────────────────

/**
 * Persiste a execução de testes no banco (test_runs + test_cases).
 * @param {object} opts
 * @returns {Promise<test_runs>}
 */
export async function saveResults({ type, environment, cases, durationMs, rawOutput, triggeredBy }) {
    const total   = cases.length;
    const passed  = cases.filter(c => c.status === 'PASSOU').length;
    const failed  = cases.filter(c => c.status === 'FALHOU').length;
    const errors  = cases.filter(c => c.status === 'ERRO').length;
    const overall = (failed > 0 || errors > 0) ? 'failed' : 'passed';

    const run = await prisma.test_runs.create({
        data: {
            suite_type:    type,
            environment,
            triggered_by:  triggeredBy || null,
            status:        total > 0 ? overall : 'failed',
            total_tests:   total,
            passed_tests:  passed,
            failed_tests:  failed,
            error_tests:   errors,
            duration_ms:   durationMs ? Math.round(durationMs) : null,
            raw_output:    rawOutput ? JSON.stringify(rawOutput).slice(0, 65000) : null,
            test_cases: {
                create: cases.map(c => ({
                    suite_file:     c.suite_file     || null,
                    module:         c.module         || null,
                    test_name:      c.test_name      || 'Teste sem nome',
                    suite_type:     c.suite_type     || type,
                    status:         c.status         || 'ERRO',
                    duration_ms:    c.duration_ms    ? Math.round(c.duration_ms) : null,
                    error_message:  c.error_message  || null,
                    error_stack:    c.error_stack    || null,
                    screenshot_url: c.screenshot_url || null,
                    video_url:      c.video_url      || null,
                }))
            }
        },
        include: { test_cases: true }
    });

    console.log(`[test-runner] 💾 Salvo: ${run.id} — ${passed}/${total} passou`);

    // Atualiza last_run_at no schedule
    await prisma.test_schedule.updateMany({
        data: { last_run_at: new Date() }
    }).catch(() => {});

    return run;
}

// ─── sendFailureEmail ─────────────────────────────────────────────────────────

/**
 * Envia email de notificação quando uma suíte falha.
 * Usa Resend (já configurado no projeto).
 */
export async function sendFailureEmail(run, emailTo) {
    if (!emailTo) return;
    await sendEmail({
        to:       emailTo,
        template: 'testResult',
        data:     { run },
        tag:      `test-result-${run.id}`,
        dedupKey: `test-result-${run.id}`,   // garante: 1 email por execução de teste
    });
}

// ─── runAndSave (orquestrador) ────────────────────────────────────────────────

/**
 * Executa + parseia + salva + notifica.
 * @returns {Promise<test_runs>}
 */
export async function runAndSave({ type, environment = 'local', triggeredBy, scheduleConfig }) {
    const { exitCode, stdout, stderr, durationMs, killed } = await runTests(type, environment);

    const cases = parseResults(stdout, type);

    // Se o processo foi morto ou não produziu output, cria um caso de erro
    if (cases.length === 0) {
        cases.push({
            suite_file:    null,
            module:        null,
            test_name:     killed ? 'Execução interrompida por timeout' : 'Sem output de testes',
            suite_type:    type,
            status:        'ERRO',
            duration_ms:   durationMs,
            error_message: killed ? 'Timeout de 5 minutos excedido' : (stderr?.slice(0, 500) || 'Sem output'),
            error_stack:   stderr || null,
        });
    }

    const run = await saveResults({
        type,
        environment,
        cases,
        durationMs,
        rawOutput: { exitCode, stdoutSnippet: stdout.slice(0, 2000) },
        triggeredBy,
    });

    // Email de notificação
    const notify_email = scheduleConfig?.notify_email;
    const onlyOnFailure = scheduleConfig?.notify_on_failure_only !== false;
    if (notify_email) {
        const shouldSend = !onlyOnFailure || run.status === 'failed';
        if (shouldSend) await sendFailureEmail(run, notify_email);
    }

    return run;
}
