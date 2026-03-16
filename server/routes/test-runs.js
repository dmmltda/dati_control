/**
 * ============================================================================
 * Rota: /api/test-runs — Módulo de Testes (Fase 1)
 * ============================================================================
 * GET    /api/test-runs                    → lista execuções com casos
 * GET    /api/test-runs/schedule/config    → configuração de agendamento
 * GET    /api/test-runs/:id                → detalhes de uma execução
 * POST   /api/test-runs/trigger            → trigger manual (placeholder)
 * POST   /api/test-runs                    → salva resultado (ingestor local)
 * PUT    /api/test-runs/schedule/config    → salva configuração
 *
 * AUTH: POST usa ingestAuth (livre em dev, token em produção).
 *       GET/PUT abertos — dados de sistema sem PII.
 * ============================================================================
 */
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const router = Router();
const prisma = new PrismaClient();

// ─── Middleware de autenticação para ingestão ────────────────────────────────
// Em produção exige X-Ingest-Token. Em dev local libera sem token.
function ingestAuth(req, res, next) {
    const expectedToken = process.env.TEST_INGEST_TOKEN;
    if (!expectedToken || process.env.NODE_ENV !== 'production') return next();
    const sent = req.headers['x-ingest-token'] || req.query.token;
    if (sent === expectedToken) return next();
    return res.status(401).json({ error: 'Token de ingestão inválido' });
}

// ---------------------------------------------------------------------------
// GET / — lista todas as execuções com resumo de casos
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
    try {
        const { limit = 50, suite_type, status, environment } = req.query;

        const where = {};
        if (suite_type) where.suite_type = suite_type;
        if (status) where.status = status;
        if (environment) where.environment = environment;

        const runs = await prisma.test_runs.findMany({
            where,
            orderBy: { triggered_at: 'desc' },
            take: parseInt(limit),
            include: {
                test_cases: {
                    orderBy: { created_at: 'asc' },
                    select: {
                        id: true,
                        suite_file: true,
                        module: true,
                        test_name: true,
                        suite_type: true,
                        status: true,
                        duration_ms: true,
                        error_message: true,
                        error_stack: true,
                        screenshot_url: true,
                        video_url: true,
                        created_at: true,
                        // Campos de análise enriquecida
                        location_file: true,
                        location_line: true,
                        location_col: true,
                        ai_analysis: true,
                        fix_proposal: true,
                        fix_status: true,
                        fix_applied_at: true,
                        fix_applied_by: true,
                    }
                }
            }
        });

        res.json(runs);
    } catch (err) {
        console.error('[GET /api/test-runs]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// GET /schedule/config — DEVE vir antes de /:id para não ser capturado
// ---------------------------------------------------------------------------
router.get('/schedule/config', async (req, res) => {
    try {
        let config = await prisma.test_schedule.findFirst();
        if (!config) {
            config = await prisma.test_schedule.create({
                data: { id: randomUUID() }
            });
        }
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// GET /:id — detalhes completos de uma execução
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
    try {
        const run = await prisma.test_runs.findUnique({
            where: { id: req.params.id },
            include: { test_cases: { orderBy: { created_at: 'asc' } } }
        });
        if (!run) return res.status(404).json({ error: 'Execução não encontrada' });
        res.json(run);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// POST /trigger — dispara execução manualmente (placeholder Fase 3)
// ---------------------------------------------------------------------------
router.post('/trigger', ingestAuth, async (req, res) => {
    try {
        const { suite_type = 'UNITÁRIO', environment = 'local', triggered_by } = req.body;

        const run = await prisma.test_runs.create({
            data: {
                suite_type,
                environment,
                triggered_by: triggered_by || null,
                status: 'running',
            }
        });

        res.status(202).json({
            message: 'Execução registrada. Execute: npm run test:report',
            run_id: run.id,
            run,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// POST / — salva resultado completo de uma suite
// Chamado pelo script de ingestão (scripts/ingest-test-results.js)
// ---------------------------------------------------------------------------
router.post('/', ingestAuth, async (req, res) => {
    try {
        const {
            suite_type = 'UNITÁRIO',
            environment = 'local',
            triggered_by,
            company_id,
            duration_ms,
            raw_output,
            cases = [],
        } = req.body;

        if (!cases || cases.length === 0) {
            return res.status(400).json({ error: 'Nenhum caso de teste enviado' });
        }

        const total_tests  = cases.length;
        const passed_tests = cases.filter(c => c.status === 'PASSOU').length;
        const failed_tests = cases.filter(c => c.status === 'FALHOU').length;
        const error_tests  = cases.filter(c => c.status === 'ERRO').length;
        const overall_status = (failed_tests > 0 || error_tests > 0) ? 'failed' : 'passed';

        const run = await prisma.test_runs.create({
            data: {
                suite_type,
                environment,
                triggered_by: triggered_by || null,
                company_id:   company_id   || null,
                status:       overall_status,
                total_tests,
                passed_tests,
                failed_tests,
                error_tests,
                duration_ms: duration_ms ? parseInt(duration_ms) : null,
                raw_output:  raw_output ? JSON.stringify(raw_output) : null,
                test_cases: {
                    create: cases.map(c => ({
                        suite_file:     c.suite_file     || null,
                        module:         c.module         || null,
                        test_name:      c.test_name      || 'Teste sem nome',
                        suite_type:     c.suite_type     || suite_type,
                        status:         c.status         || 'ERRO',
                        duration_ms:    c.duration_ms    ? parseInt(c.duration_ms) : null,
                        error_message:  c.error_message  || null,
                        error_stack:    c.error_stack    || null,
                        screenshot_url: c.screenshot_url || null,
                        video_url:      c.video_url      || null,
                        // Campos de localização (Fase 1)
                        location_file:  c.location_file  || null,
                        location_line:  c.location_line  ? parseInt(c.location_line) : null,
                        location_col:   c.location_col   ? parseInt(c.location_col)  : null,
                    }))
                }
            },
            include: { test_cases: true }
        });

        console.log(`[test-runs] ✅ ${run.id} — ${passed_tests}/${total_tests} passou`);

        // ── Análise IA em Background (não bloqueia a response) ───────────────
        const failedCases = run.test_cases.filter(c => c.status === 'FALHOU' || c.status === 'ERRO');
        if (failedCases.length > 0) {
            import('../services/test-analyzer.js')
                .then(({ analyzeFailures }) => analyzeFailures(failedCases, prisma))
                .catch(err => console.warn('[test-analyzer] Análise IA skipped:', err.message));
        }

        res.status(201).json(run);
    } catch (err) {
        console.error('[POST /api/test-runs]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// POST /:id/fix/approve — aprova ou rejeita a correção proposta pela IA
// ---------------------------------------------------------------------------
router.post('/:id/fix/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { approved, user_id } = req.body;

        const tc = await prisma.test_cases.findUnique({ where: { id } });
        if (!tc) return res.status(404).json({ error: 'Caso de teste não encontrado' });
        if (!tc.fix_proposal) return res.status(400).json({ error: 'Sem proposta de correção disponível' });

        if (!approved) {
            await prisma.test_cases.update({ where: { id }, data: { fix_status: 'rejected' } });
            return res.json({ ok: true, fix_status: 'rejected' });
        }

        let proposal;
        try { proposal = JSON.parse(tc.fix_proposal); }
        catch { return res.status(400).json({ error: 'fix_proposal inválido (JSON malformado)' }); }

        const { applyFix } = await import('../services/test-analyzer.js');
        const applyResult = await applyFix(proposal);

        if (!applyResult.ok) return res.status(500).json({ error: applyResult.error });

        await prisma.test_cases.update({
            where: { id },
            data: { fix_status: 'applied', fix_applied_at: new Date(), fix_applied_by: user_id || null }
        });

        console.log(`[test-runs] ✅ Fix aplicado em ${proposal.arquivo} (L${proposal.linha_ini})`);
        res.json({ ok: true, fix_status: 'applied', file: proposal.arquivo });
    } catch (err) {
        console.error('[POST fix/approve]', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------------------------
// PUT /schedule/config — salva configuração de agendamento
// ---------------------------------------------------------------------------
router.put('/schedule/config', async (req, res) => {
    try {
        const {
            enabled, frequency, run_time,
            run_unit, run_functional, run_e2e,
            notify_email, notify_emails, environment, updated_by
        } = req.body;

        let config = await prisma.test_schedule.findFirst();
        const data = {
            ...(updated_by      !== undefined && { updated_by }),
            ...(enabled         !== undefined && { enabled }),
            ...(frequency       !== undefined && { frequency }),
            ...(run_time        !== undefined && { run_time }),
            ...(run_unit        !== undefined && { run_unit }),
            ...(run_functional  !== undefined && { run_functional }),
            ...(run_e2e         !== undefined && { run_e2e }),
            ...(notify_email    !== undefined && { notify_email }),
            ...(notify_emails   !== undefined && { notify_emails }),
            ...(environment     !== undefined && { environment }),
        };

        if (config) {
            config = await prisma.test_schedule.update({ where: { id: config.id }, data });
        } else {
            config = await prisma.test_schedule.create({ data: { id: randomUUID(), ...data } });
        }
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
