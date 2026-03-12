/**
 * ============================================================================
 * Service: Test Scheduler
 * server/services/test-scheduler.js
 * ============================================================================
 * Usa node-cron para agendar execuções automáticas de testes.
 * - loadSchedule(): lê config do banco ao iniciar
 * - scheduleJob(config): cria cron expression e agenda job
 * - reschedule(): cancela job atual e recria
 * - init(): exportado e chamado no boot do servidor
 * ============================================================================
 */
import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { runAndSave } from './test-runner.js';

const prisma = new PrismaClient();

// ─── Estado interno ───────────────────────────────────────────────────────────

let _currentTask = null;      // ScheduledTask do node-cron (ou null)
let _currentConfig = null;    // config atual do banco

// ─── Cron expression builder ──────────────────────────────────────────────────

/**
 * Converte hora, minuto e weekday em uma expressão cron.
 * @param {object} config
 * @returns {string|null} - expressão cron ou null se "manual"
 */
function buildCronExpression({ frequency, hour, minute, weekday }) {
    const h = Number(hour ?? 2);
    const m = Number(minute ?? 0);

    if (frequency === 'diario') {
        return `${m} ${h} * * *`;               // todo dia às HH:MM
    }

    if (frequency === 'semanal') {
        const wd = weekday ?? 1;                 // segunda-feira por padrão
        return `${m} ${h} * * ${wd}`;
    }

    return null; // "manual" → sem cron
}

/**
 * Calcula a próxima execução com base na expressão cron.
 * @returns {Date|null}
 */
function calcNextRun(cronExpr) {
    if (!cronExpr) return null;
    try {
        const parsed = cron.parse(cronExpr);
        // node-cron não expõe nextDate natively — calculamos manualmente
        const now = new Date();
        const [m, h, , , wd] = cronExpr.split(' ').map(Number);

        const next = new Date();
        next.setSeconds(0, 0);
        next.setMinutes(m);
        next.setHours(h);

        if (cronExpr.includes('* * *')) {
            // diário — se já passou hoje, vai para amanhã
            if (next <= now) next.setDate(next.getDate() + 1);
        } else {
            // semanal — avança até próximo weekday
            while (next.getDay() !== wd || next <= now) {
                next.setDate(next.getDate() + 1);
            }
        }

        return next;
    } catch (_) {
        return null;
    }
}

// ─── loadSchedule ─────────────────────────────────────────────────────────────

export async function loadSchedule() {
    try {
        const config = await prisma.test_schedule.findFirst();
        _currentConfig = config;
        return config;
    } catch (err) {
        console.error('[scheduler] Erro ao carregar schedule:', err.message);
        return null;
    }
}

// ─── scheduleJob ──────────────────────────────────────────────────────────────

export function scheduleJob(config) {
    if (_currentTask) {
        _currentTask.stop();
        _currentTask.destroy?.();
        _currentTask = null;
        console.log('[scheduler] ⏹  Job anterior cancelado');
    }

    if (!config?.enabled) {
        console.log('[scheduler] 📅 Agendamento desabilitado');
        return;
    }

    const expr = buildCronExpression(config);
    if (!expr) {
        console.log('[scheduler] 📅 Frequência manual — sem job automático');
        return;
    }

    if (!cron.validate(expr)) {
        console.error(`[scheduler] ❌ Expressão cron inválida: "${expr}"`);
        return;
    }

    console.log(`[scheduler] ✅ Job agendado: "${expr}" (${config.frequency})`);

    _currentTask = cron.schedule(expr, async () => {
        console.log(`[scheduler] ▶️  Executando testes agendados — ${new Date().toISOString()}`);

        const types = [];
        if (config.run_unit)       types.push('UNITÁRIO');
        if (config.run_functional) types.push('FUNCIONAL');
        if (config.run_e2e)        types.push('E2E');

        for (const type of types) {
            try {
                await runAndSave({
                    type,
                    environment:  config.environment || 'local',
                    triggeredBy:  'scheduler',
                    scheduleConfig: config,
                });
            } catch (err) {
                console.error(`[scheduler] Erro ao executar ${type}:`, err.message);
            }
        }

        // Atualiza next_run_at
        const nextExpr = buildCronExpression(config);
        const nextRun  = calcNextRun(nextExpr);
        await prisma.test_schedule.updateMany({
            data: {
                last_run_at: new Date(),
                next_run_at: nextRun,
            }
        }).catch(() => {});
    }, {
        timezone: 'America/Sao_Paulo',
    });
}

// ─── reschedule ───────────────────────────────────────────────────────────────

/**
 * Recarrega a config do banco e recria o job.
 * Chamado após PUT /api/test-schedule.
 */
export async function reschedule() {
    const config = await loadSchedule();
    scheduleJob(config);

    // Atualiza next_run_at no banco
    const expr    = config ? buildCronExpression(config) : null;
    const nextRun = calcNextRun(expr);
    if (nextRun) {
        await prisma.test_schedule.updateMany({
            data: { next_run_at: nextRun }
        }).catch(() => {});
    }

    return config;
}

// ─── getStatus ────────────────────────────────────────────────────────────────

export function getStatus() {
    const config = _currentConfig;
    if (!config) return { active: false };

    const expr    = config.enabled ? buildCronExpression(config) : null;
    const nextRun = calcNextRun(expr);

    return {
        active:     !!_currentTask,
        cronExpr:   expr,
        nextRun:    nextRun?.toISOString() || null,
        config,
    };
}

// ─── init ─────────────────────────────────────────────────────────────────────

/**
 * Inicializa o scheduler. Chamado no boot do servidor (server/index.js).
 */
export async function init() {
    console.log('[scheduler] Inicializando...');
    const config = await loadSchedule();
    scheduleJob(config);

    const expr = config?.enabled ? buildCronExpression(config) : null;
    const next = calcNextRun(expr);
    console.log(`[scheduler] Próxima execução: ${next?.toISOString() || 'manual'}`);
}
