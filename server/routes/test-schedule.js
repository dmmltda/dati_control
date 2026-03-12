/**
 * ============================================================================
 * Rota: Test Schedule
 * server/routes/test-schedule.js
 * ============================================================================
 * GET  /api/test-schedule          → busca config atual + status do scheduler
 * PUT  /api/test-schedule          → salva config (master only) + reschedula
 * POST /api/test-runs/trigger      → executa testes manualmente agora
 * GET  /api/test-runs/trigger/status/:runId → status de execução em andamento
 * ============================================================================
 */
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { runAndSave } from '../services/test-runner.js';
import { reschedule, getStatus } from '../services/test-scheduler.js';

const router = Router();
const prisma = new PrismaClient();

// ─── Middleware master-only ───────────────────────────────────────────────────

function masterOnly(req, res, next) {
    const usuario = req.usuarioAtual;
    console.log(`[masterOnly] usuarioAtual:`, JSON.stringify({ id: usuario?.id, email: usuario?.email, user_type: usuario?.user_type }));
    const isMaster = usuario?.user_type === 'master' || process.env.TEST_MODE === 'true';
    console.log(`[masterOnly] isMaster=${isMaster}`);
    if (!isMaster) return res.status(403).json({ error: 'Acesso restrito a usuários master' });
    next();
}

// ─── GET /api/test-schedule ───────────────────────────────────────────────────

router.get('/', async (req, res) => {
    try {
        let config = await prisma.test_schedule.findFirst();

        // Cria registro padrão se não existir
        if (!config) {
            config = await prisma.test_schedule.create({
                data: {
                    enabled:               false,
                    frequency:             'manual',
                    hour:                  2,
                    minute:                0,
                    weekday:               null,
                    run_unit:              true,
                    run_functional:        true,
                    run_e2e:               false,
                    notify_email:          null,
                    notify_on_failure_only: true,
                    environment:           'local',
                }
            });
        }

        const schedulerStatus = getStatus();

        // Busca última execução
        const lastRun = await prisma.test_runs.findFirst({
            orderBy: { triggered_at: 'desc' },
            select: {
                id: true,
                suite_type: true,
                status: true,
                triggered_at: true,
                duration_ms: true,
                total_tests: true,
                passed_tests: true,
                failed_tests: true,
            }
        });

        res.json({
            config,
            scheduler: {
                active:   schedulerStatus.active,
                cronExpr: schedulerStatus.cronExpr,
                nextRun:  config.next_run_at?.toISOString() || schedulerStatus.nextRun,
            },
            lastRun: lastRun || null,
        });
    } catch (err) {
        console.error('[test-schedule] GET error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── PUT /api/test-schedule ───────────────────────────────────────────────────

router.put('/', masterOnly, async (req, res) => {
    const {
        enabled,
        frequency,
        weekday,
        hour,
        minute,
        run_unit,
        run_functional,
        run_e2e,
        notify_email,
        notify_on_failure_only,
        environment,
    } = req.body;

    // Validações básicas
    if (frequency && !['manual', 'diario', 'semanal'].includes(frequency)) {
        return res.status(400).json({ error: 'frequency inválida' });
    }
    if (hour != null && (hour < 0 || hour > 23)) {
        return res.status(400).json({ error: 'hour deve ser 0-23' });
    }
    if (minute != null && (minute < 0 || minute > 59)) {
        return res.status(400).json({ error: 'minute deve ser 0-59' });
    }
    if (weekday != null && (weekday < 0 || weekday > 6)) {
        return res.status(400).json({ error: 'weekday deve ser 0-6' });
    }
    if (run_e2e && environment === 'production') {
        return res.status(400).json({ error: 'E2E não pode ser agendado em produção' });
    }

    try {
        const userId = req.auth?.userId || 'system';
        let config = await prisma.test_schedule.findFirst();

        const data = {
            ...(enabled               !== undefined && { enabled: Boolean(enabled) }),
            ...(frequency             !== undefined && { frequency }),
            ...(weekday               !== undefined && { weekday: weekday !== null ? Number(weekday) : null }),
            ...(hour                  !== undefined && { hour: Number(hour) }),
            ...(minute                !== undefined && { minute: Number(minute) }),
            ...(run_unit              !== undefined && { run_unit: Boolean(run_unit) }),
            ...(run_functional        !== undefined && { run_functional: Boolean(run_functional) }),
            ...(run_e2e               !== undefined && { run_e2e: Boolean(run_e2e) }),
            ...(notify_email          !== undefined && { notify_email: notify_email || null }),
            ...(notify_on_failure_only !== undefined && { notify_on_failure_only: Boolean(notify_on_failure_only) }),
            ...(environment           !== undefined && { environment }),
            updated_by: userId,
        };

        if (config) {
            config = await prisma.test_schedule.update({
                where: { id: config.id },
                data,
            });
        } else {
            config = await prisma.test_schedule.create({ data });
        }

        // Reagenda o cron com a nova config
        await reschedule();
        const schedulerStatus = getStatus();

        res.json({
            message: 'Configuração salva com sucesso',
            config,
            scheduler: {
                active:   schedulerStatus.active,
                cronExpr: schedulerStatus.cronExpr,
                nextRun:  config.next_run_at?.toISOString() || schedulerStatus.nextRun,
            },
        });
    } catch (err) {
        console.error('[test-schedule] PUT error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/test-schedule/trigger ─────────────────────────────────────────

// Track de execuções manuais em andamento
const _runningJobs = new Map(); // runId → { types, started, done, run }

router.post('/trigger', masterOnly, async (req, res) => {
    const { types = ['UNITÁRIO'], environment = 'local' } = req.body;

    if (!Array.isArray(types) || types.length === 0) {
        return res.status(400).json({ error: 'Informe pelo menos um tipo em "types"' });
    }

    const VALID_TYPES = ['UNITÁRIO', 'FUNCIONAL', 'E2E'];
    for (const t of types) {
        if (!VALID_TYPES.includes(t)) {
            return res.status(400).json({ error: `Tipo inválido: ${t}` });
        }
        if (t === 'E2E' && environment === 'production') {
            return res.status(400).json({ error: 'E2E bloqueado em produção' });
        }
    }

    const runId = `manual_${Date.now()}`;
    const userId = req.auth?.userId || 'manual';

    const jobState = {
        runId,
        types,
        started: new Date(),
        done: false,
        results: [],
        error: null,
    };
    _runningJobs.set(runId, jobState);

    // Busca scheduleConfig para email
    const scheduleConfig = await prisma.test_schedule.findFirst().catch(() => null);

    // Executa em background (não bloqueia a resposta HTTP)
    res.json({ message: 'Execução iniciada', runId, types });

    ;(async () => {
        for (const type of types) {
            try {
                const run = await runAndSave({
                    type,
                    environment,
                    triggeredBy: userId,
                    scheduleConfig: scheduleConfig || undefined,
                });
                jobState.results.push({ type, runId: run.id, status: run.status });
            } catch (err) {
                console.error(`[trigger] Erro em ${type}:`, err.message);
                jobState.error = err.message;
                jobState.results.push({ type, status: 'error', error: err.message });
            }
        }
        jobState.done = true;
        jobState.finishedAt = new Date();
        console.log(`[trigger] ✅ ${runId} concluído:`, jobState.results);

        // Remove da memória após 10 min
        setTimeout(() => _runningJobs.delete(runId), 10 * 60 * 1000);
    })();
});

// ─── GET /api/test-schedule/trigger/status/:runId ────────────────────────────

router.get('/trigger/status/:runId', masterOnly, (req, res) => {
    const job = _runningJobs.get(req.params.runId);
    if (!job) return res.status(404).json({ error: 'Run não encontrado ou já expirou' });
    res.json(job);
});

export default router;
