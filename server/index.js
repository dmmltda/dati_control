import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { clerkMiddleware, requireAuth, getAuth } from '@clerk/express';
import cron from 'node-cron';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { sendEmail, isEmailConfigured } from './services/email.js';
import { initQueue, boss } from './services/job-queue.js';

import usersRouter from './routes/users.js';
import featurePermissionsRouter from './routes/feature-permissions.js';
import { requireFeature } from './middleware/checkAccess.js';

import membershipsRouter from './routes/memberships.js';
import invitesRouter from './routes/invites.js';
import webhookClerkRouter from './routes/webhook-clerk.js';
import gabiRouter from './routes/gabi.js';
import testRunsRouter from './routes/test-runs.js';
import testScheduleRouter from './routes/test-schedule.js';
import reportsRouter from './routes/reports.js';
import monthlyReportRouter from './routes/monthly-report.js';
import auditRouter from './routes/audit.js';
import googleMeetRouter, { syncPendingRecordings } from './routes/google-meet.js';
import whatsappRouter from './routes/whatsapp.js';
import emailLogsRouter from './routes/email-logs.js';
import * as audit from './services/audit.js';
import { init as initScheduler } from './services/test-scheduler.js';




const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Carrega variáveis de ambiente ────────────────────────────────────────────────────
// dotenvx falha silenciosamente neste ambiente (injecting env: 0).
// Lê o arquivo manualmente e injeta em process.env apenas o que ainda não foi definido.
function loadEnvFile(filePath) {
    try {
        const content = readFileSync(filePath, 'utf-8');
        let count = 0;
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx === -1) continue;
            const key = trimmed.substring(0, eqIdx).trim();
            const val = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
            if (key && val && !process.env[key]) {
                process.env[key] = val;
                count++;
            }
        }
        if (count > 0) console.log(`[env] ✅ ${count} variáveis carregadas de ${filePath}`);
    } catch (e) {
        // arquivo opcional — não falha
    }
}

// Carrega server/.env primeiro (DATABASE_URL, GEMINI_API_KEY, CLERK_SECRET_KEY, etc.)
// depois root .env como fallback
loadEnvFile(path.join(__dirname, '.env'));        // server/.env
loadEnvFile(path.join(__dirname, '..', '.env'));  // root .env (fallback)


const app = express();
const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['query', 'info', 'warn', 'error'],
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
});
const PORT = process.env.PORT || 8000;
const IS_PROD = process.env.NODE_ENV === 'production';

// ─── Supabase Storage ────────────────────────────────────────────────────────
const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    : null;

// ─── CORS — restrito em produção, aberto em dev ──────────────────────────────
app.use(cors({
    origin: IS_PROD
        ? (process.env.ALLOWED_ORIGIN || '*')
        : ['http://localhost:3000', 'http://localhost:8000', 'http://127.0.0.1:8000'],
    credentials: true,
}));

// ─── Webhook Clerk — ANTES do json parser (Svix precisa do body raw) ───────────────────
// express.raw converte o body para Buffer, preservando os bytes originais
// necessário para validar a assinatura HMAC do Svix
app.use('/webhook/clerk', express.raw({ type: 'application/json' }), (req, res, next) => {
    // Converte Buffer para objeto JS antes de passar para o router
    if (Buffer.isBuffer(req.body)) {
        req.rawBody = req.body;
        req.body = JSON.parse(req.body.toString());
    }
    next();
}, webhookClerkRouter);

// ─── CRÍTICO: WhatsApp Webhook raw body — ANTES do express.json global ──────────
// A API Meta requer validação HMAC da assinatura no body bruto.
// Este middleware deve ser registrado antes do express.json() para capturar o Buffer.
app.use('/api/whatsapp/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ─── Forçar no-cache para index.html (evita sidebar desatualizada no browser)
app.get(['/', '/index.html'], (req, res) => {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
    });
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ─── Servir arquivos estáticos do frontend ───────────────────────────────────
// Em desenvolvimento: serve tudo da raiz do projeto
// Em produção (Railway): serve a partir da raiz também (index.html + css/ + js/)
app.use(express.static(path.join(__dirname, '..'), {
    setHeaders: (res, filePath) => {
        // Em dev: desabilita cache de JS/CSS para refletir mudanças imediatamente
        if (!IS_PROD && (filePath.endsWith('.js') || filePath.endsWith('.css'))) {
            res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        }
    },
}));

// ─── Clerk Middleware ────────────────────────────────────────────────────────
// Injeta req.auth em todas as requisições. Não bloqueia por si só.
// As rotas protegidas usam requireAuth() individualmente.

// Endpoint público de correção de emergência (protegido por chave)
// Remove após uso: POST /fix-masters com body { key: "dati-fix-2024" }
app.post('/fix-masters', async (req, res) => {
    const { key } = req.body;
    if (key !== (process.env.ADMIN_FIX_KEY || 'dati-fix-2024')) {
        return res.status(403).json({ error: 'Key inválida' });
    }
    const results = {};
    try {
        const r1 = await prisma.users.updateMany({ where: { user_type: 'Master' }, data: { user_type: 'master' } });
        results.case_fixed = r1.count;
    } catch(e) { results.case_fixed_err = e.message; }
    try {
        const r2 = await prisma.users.updateMany({ where: { user_type: 'standard', OR: [{ email: { contains: 'daniel', mode: 'insensitive' } }, { nome: { contains: 'daniel', mode: 'insensitive' } }] }, data: { user_type: 'master' } });
        results.master_fixed = r2.count;
    } catch(e) { results.master_fixed_err = e.message; }
    try {
        const VALID = ['dashboard.view','companies.view','my_tasks.view','reports.view','audit.view','test_logs.view','gabi.view','company_tab.basic_data','company_tab.products','company_tab.contacts','company_tab.cs','company_tab.activities','company_edit.basic_data','company_edit.products','company_edit.contacts','company_edit.cs','company_edit.activities'];
        const r3 = await prisma.user_feature_permissions.deleteMany({ where: { permission: { notIn: VALID } } });
        results.perms_cleaned = r3.count;
    } catch(e) { results.perms_cleaned_err = e.message; }
    try {
        results.users = await prisma.users.findMany({ select: { nome: true, email: true, user_type: true } });
    } catch(e) { results.users_err = e.message; }
    return res.json({ ok: true, ...results });
});

// Endpoint de seed de atividades (protegido por chave)
// POST /seed-activities com body { key: "dati-fix-2024", user_id: "clerk_user_id" }
app.post('/seed-activities', async (req, res) => {
    const { key, user_id } = req.body;
    if (key !== (process.env.ADMIN_FIX_KEY || 'dati-fix-2024')) {
        return res.status(403).json({ error: 'Key inválida' });
    }
    try {
        const { randomUUID } = await import('crypto');
        // Busca o usuário cujo id foi passado (ou o primeiro master)
        const targetUser = user_id
            ? await prisma.users.findUnique({ where: { id: user_id } })
            : await prisma.users.findFirst({ where: { user_type: 'master' } });

        if (!targetUser) return res.status(404).json({ error: 'Usuário não encontrado' });

        // Busca a primeira empresa disponível (se houver)
        const firstCompany = await prisma.companies.findFirst({ select: { id: true, Nome_da_empresa: true } }).catch(() => null);

        const now = new Date();
        const seeds = [
            { type: 'Comentário',      title: 'Follow-up com cliente após reunião',          status: 'Concluído',    priority: 'média',   daysOffset: -5 },
            { type: 'Reunião',         title: 'Apresentação do roadmap Q2',                  status: 'Concluído',    priority: 'alta',    daysOffset: -3 },
            { type: 'Chamados CS',     title: 'Suporte técnico — erro no módulo de import',  status: 'Em Andamento', priority: 'urgente', daysOffset: -1 },
            { type: 'Ação necessária', title: 'Enviar proposta atualizada para aprovação',   status: 'A Fazer',      priority: 'alta',    daysOffset:  1 },
            { type: 'Comentário',      title: 'Verificar acesso ao ambiente de homologação', status: 'A Fazer',      priority: 'baixa',   daysOffset:  2 },
            { type: 'Reunião',         title: 'Kickoff do onboarding — nova empresa',        status: 'A Fazer',      priority: 'alta',    daysOffset:  3 },
            { type: 'Chamados HD',     title: 'Integração com ERP — mapeamento de campos',   status: 'A Fazer',      priority: 'média',   daysOffset:  5 },
            { type: 'Ação necessária', title: 'Revisão do SLA — contrato renovado',          status: 'Cancelado',    priority: 'baixa',   daysOffset: -7 },
        ];

        const created = [];
        for (const s of seeds) {
            const dt = new Date(now);
            dt.setDate(dt.getDate() + s.daysOffset);
            const act = await prisma.activities.create({
                data: {
                    id:                  randomUUID(),
                    activity_type:       s.type,
                    title:               s.title,
                    status:              s.status,
                    priority:            s.priority,
                    activity_datetime:   dt,
                    created_by_user_id:  targetUser.id,
                    company_id:          firstCompany?.id || null,
                    updated_at:          now,
                    activity_assignees: {
                        create: [{ id: randomUUID(), user_id: targetUser.id }]
                    },
                },
            });
            created.push(act.id);
        }
        return res.json({ ok: true, created: created.length, user: targetUser.nome, company: firstCompany?.Nome_da_empresa || null });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

app.use(clerkMiddleware({ secretKey: process.env.CLERK_SECRET_KEY }));


// Health Check — rota pública, sem autenticação
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Servidor Journey 10/10 operando!' });
});

// ─── Scheduler de Lembretes (node-cron) ────────────────────────────────────
// Roda a cada minuto e envia alertas de atividades com lembrete vencido
// ─── Scheduler de Notificações (pg-boss + node-cron) ────────────────────────
// Roda a cada 5 minutos para escanear atividades que precisam de disparo
cron.schedule('*/5 * * * *', async () => {
    try {
        const agora = new Date();
        const amanha = new Date(agora);
        amanha.setDate(amanha.getDate() + 1);

        // Scan A — Lembretes agendados (substitui cron atual)
        const lembretes = await prisma.activities.findMany({
            where: {
                reminder_at: { lte: agora },
                reminder_sent: false,
                reminder_email: true,
            },
            include: { activity_assignees: true },
        });

        for (const act of lembretes) {
            const userIds = [...new Set([
                act.created_by_user_id,
                ...act.activity_assignees.map(a => a.user_id),
            ].filter(Boolean))];

            for (const userId of userIds) {
                await boss.send('send-notification', 
                    { type: 'reminder', activityId: act.id, userId },
                    { singletonKey: `reminder-${act.id}-${userId}` }
                );
            }
        }

        if (lembretes.length > 0) {
            await prisma.activities.updateMany({
                where: { id: { in: lembretes.map(a => a.id) } },
                data: { reminder_sent: true },
            });
            console.log(`[Scan A] Enfileirados ${lembretes.length} lembretes.`);
        }

        // Scan B — Próximo passo (1 dia antes)
        const proximosPassos = await prisma.activities.findMany({
            where: {
                next_step_date: { lte: amanha },
                next_step_reminder_sent: false,
                next_step_reminder_email: true,
            },
            include: { activity_next_step_responsibles: true },
        });

        for (const act of proximosPassos) {
            for (const resp of act.activity_next_step_responsibles) {
                await boss.send('send-notification',
                    { type: 'next-step', activityId: act.id, userId: resp.user_id },
                    { singletonKey: `nextstep-${act.id}-${resp.user_id}` }
                );
            }
        }

        if (proximosPassos.length > 0) {
            await prisma.activities.updateMany({
                where: { id: { in: proximosPassos.map(a => a.id) } },
                data: { next_step_reminder_sent: true },
            });
            console.log(`[Scan B] Enfileirados ${proximosPassos.length} próximos passos.`);
        }

        // Scan C — Gravações não notificadas
        const gravacoes = await prisma.activities.findMany({
            where: {
                recording_url: { not: null },
                recording_sent: false,
                send_recording_email: true,
            },
            include: { activity_assignees: true },
        });

        for (const act of gravacoes) {
            const userIds = [...new Set([
                act.created_by_user_id,
                ...act.activity_assignees.map(a => a.user_id),
            ].filter(Boolean))];

            for (const userId of userIds) {
                await boss.send('send-notification',
                    { type: 'recording', activityId: act.id, userId },
                    { singletonKey: `recording-${act.id}-${userId}` }
                );
            }
        }

        if (gravacoes.length > 0) {
            await prisma.activities.updateMany({
                where: { id: { in: gravacoes.map(a => a.id) } },
                data: { recording_sent: true },
            });
            console.log(`[Scan C] Enfileiradas ${gravacoes.length} gravações.`);
        }

    } catch (e) {
        console.error('[Scheduler] Erro no scan de notificações:', e.message);
    }
});

// ─── Cron: Sync de gravações Google Meet (a cada 5 minutos) ─────────────────
// Busca gravações de reuniões encerradas há mais de 10 min e vincula à atividade
cron.schedule('*/5 * * * *', async () => {
    try {
        if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return; // Google não configurado — sai silenciosamente
        const { synced } = await syncPendingRecordings(prisma, supabase);
        if (synced > 0) {
            console.log(`[Meet Sync Cron] ✅ ${synced} gravação(ões) vinculada(s)`);
        }
    } catch (err) {
        console.error('[Meet Sync Cron] ❌ Erro:', err.message);
    }
});

// ─── Middleware: Extração e sincronização de usuário Clerk ──────────────────
/**
 * Extrai o usuário logado via Clerk e sincroniza com a tabela `users` local.
 * Adiciona req.usuarioAtual = { id, nome, email, avatar, role }
 * Se o userId do Clerk não existir em `users`, cria automaticamente.
 */
async function extractUsuario(req, res, next) {
    const { userId } = getAuth(req);
    if (!userId) return res.status(401).json({ error: 'Não autenticado' });

    try {
        let usuario = await prisma.users.findUnique({ where: { id: userId } });

        if (!usuario) {
            // Sincronização on-demand: busca dados no Clerk Backend API
            const clerkUser = await fetch(
                `https://api.clerk.com/v1/users/${userId}`,
                { headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` } }
            ).then(r => r.json());

            const primeiroNome = clerkUser.first_name || '';
            const ultimoNome = clerkUser.last_name || '';
            const nomeCompleto = `${primeiroNome} ${ultimoNome}`.trim() || clerkUser.username || 'Usuário';
            const email = clerkUser.email_addresses?.[0]?.email_address || '';
            const iniciais = nomeCompleto.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();

            usuario = await prisma.users.create({
                data: {
                    id: userId,
                    nome: nomeCompleto,
                    email,
                    avatar: iniciais,
                    role: 'member',
                    user_type: 'standard', // novo campo — padrão para usuários criados pelo Clerk
                    ativo: true,
                }
            });
            console.log(`[Auth] ✅ Novo usuário sincronizado: ${nomeCompleto} (${userId})`);

        }

        req.usuarioAtual = usuario;
        next();
    } catch (err) {
        console.error('[Auth] Erro ao sincronizar usuário Clerk:', err);
        return res.status(500).json({ error: 'Erro de autenticação' });
    }
}

// ─── Endpoints de Usuário ────────────────────────────────────────────────────

// Retorna dados do usuário logado + empresas acessíveis com permissões
app.get('/api/me', extractUsuario, async (req, res) => {
    const usuario = req.usuarioAtual;
    try {
        let accessible_companies = [];

        if (usuario.user_type === 'master') {
            // master vê todas as empresas
            const companies = await prisma.companies.findMany({
                orderBy: { Nome_da_empresa: 'asc' },
                select: { id: true, Nome_da_empresa: true, company_type: true, mom_id: true, Status: true }
            });
            accessible_companies = companies.map(c => ({
                ...c,
                permissions: { can_create: true, can_edit: true, can_delete: true, can_export: true }
            }));
        } else {
            // standard → somente as vinculadas
            const memberships = await prisma.user_memberships.findMany({
                where: { user_id: usuario.id },
                include: {
                    company: {
                        select: { id: true, Nome_da_empresa: true, company_type: true, mom_id: true, Status: true }
                    }
                }
            });
            accessible_companies = memberships.map(m => ({
                ...m.company,
                permissions: {
                    can_create: m.can_create,
                    can_edit: m.can_edit,
                    can_delete: m.can_delete,
                    can_export: m.can_export,
                }
            }));
        }

        // ── Feature permissions ───────────────────────────────────────────────
        // Master: retorna todas as chaves como true (sem consulta ao banco)
        // Standard: retorna apenas as chaves com granted=true
        let feature_permissions = [];
        if (usuario.user_type === 'master') {
            const { FEATURE_PERMISSIONS } = await import('./constants/permissions.js');
            feature_permissions = Object.keys(FEATURE_PERMISSIONS);
        } else {
            const fpRows = await prisma.user_feature_permissions.findMany({
                where: { user_id: usuario.id, granted: true },
                select: { permission: true },
            });
            feature_permissions = fpRows.map(r => r.permission);
        }

        res.json({
            ...usuario,
            accessible_companies,
            feature_permissions,
        });
    } catch (err) {
        console.error('[GET /api/me] Erro ao buscar empresas acessíveis:', err);
        // fallback: retorna dados básicos sem empresas
        res.json({ ...usuario, accessible_companies: [], feature_permissions: [] });
    }
});


// Lista todos os usuários ativos (para dropdowns, filtros, etc.) — legado
app.get('/api/usuarios', extractUsuario, async (req, res) => {
    try {
        const usuarios = await prisma.users.findMany({
            where: { ativo: true },
            orderBy: { nome: 'asc' }
        });
        res.json(usuarios);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── Notificações in-app ─────────────────────────────────────────────────────

// GET /api/notifications — lista notificações do usuário logado (não lidas primeiro)
app.get('/api/notifications', extractUsuario, async (req, res) => {
    try {
        const notifs = await prisma.notifications.findMany({
            where: { user_id: req.usuarioAtual.id },
            orderBy: [{ read: 'asc' }, { created_at: 'desc' }],
            take: 50,
            include: { activity: { select: { id: true, title: true, company_id: true } } }
        });
        res.json(notifs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DEV ONLY GET /api/test-notif — insere notificações de teste
app.get('/api/test-notif', extractUsuario, async (req, res) => {
    try {
        await prisma.notifications.createMany({
            data: [
                {
                    user_id: req.usuarioAtual.id,
                    type: 'mentioned',
                    title: 'Nova Menção',
                    message: 'Alguém marcou você em um comentário de atividade.',
                    read: false
                },
                {
                    user_id: req.usuarioAtual.id,
                    type: 'next-step-assigned',
                    title: 'Ação Requistada',
                    message: 'Foi atribuído um próximo passo para você em "Acme Corp".',
                    read: false
                },
                {
                    user_id: req.usuarioAtual.id,
                    type: 'system',
                    title: 'Atualização do Sistema',
                    message: 'Nova versão lançada! Confira as novidades do Dashboard.',
                    read: false
                }
            ]
        });
        res.json({ success: true, message: 'Notificações inseridas!' });
    } catch (error) {
        res.status(500).json({ error: 'Erro interno' });
    }
});

// PUT /api/notifications/:id/read — marca uma notificação como lida
app.put('/api/notifications/:id/read', extractUsuario, async (req, res) => {
    try {
        await prisma.notifications.updateMany({
            where: { id: req.params.id, user_id: req.usuarioAtual.id },
            data: { read: true }
        });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/notifications/read-all — marca TODAS as notificações do usuário como lidas
app.put('/api/notifications/read-all', extractUsuario, async (req, res) => {
    try {
        await prisma.notifications.updateMany({
            where: { user_id: req.usuarioAtual.id, read: false },
            data: { read: true }
        });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Novas rotas de usuários e memberships ───────────────────────────────────────────────────
// featurePermissionsRouter ANTES do usersRouter para evitar conflito de captura de /:id
app.use('/api/users', extractUsuario, featurePermissionsRouter);
app.use('/api/users', extractUsuario, usersRouter);

app.use('/api/memberships', extractUsuario, membershipsRouter);
app.use('/api/invites', extractUsuario, invitesRouter);
app.use('/api/gabi', gabiRouter);
// test-runs: POST é sem auth (script ingestor local); GET/PUT protegidos via extractUsuario
app.use('/api/test-runs', testRunsRouter);
// test-schedule: agendamento e trigger manual (master only via rota)
app.use('/api/test-schedule', extractUsuario, testScheduleRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/monthly-report', monthlyReportRouter);
app.use('/api/audit-logs', extractUsuario, auditRouter);
app.use('/api/google-meet', extractUsuario, googleMeetRouter);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/email-logs', extractUsuario, emailLogsRouter);

// POST /api/emails/nps — Envia formulário NPS para os destinatários
app.post('/api/emails/nps', extractUsuario, async (req, res) => {
    try {
        const { destinatarios, tipoForm } = req.body;
        
        if (!destinatarios || !tipoForm) {
            return res.status(400).json({ error: 'Destinatários e Tipo de formulário são obrigatórios' });
        }

        // Links dos formulários 
        const formLinks = {
            'Welcome': 'https://forms.gle/3SstsjLPFCYieiaq9',
            'Kickoff': 'https://forms.gle/KZen1amS4e9GJEd17',
            'Onboarding': 'https://docs.google.com/forms/', // Link ainda não fornecido
            'NPS': 'https://forms.gle/mBJRBDMb3xmW4TXm9',
            'Reunião': 'https://docs.google.com/forms/', // Link ainda não fornecido
            'Churn': 'https://forms.gle/YpDptwjq7ytb4LG87'
        };

        const urlForm = formLinks[tipoForm] || 'https://docs.google.com/forms/';

        const result = await sendEmail({
            to: destinatarios,
            template: 'npsSurvey',
            data: { destinatario: destinatarios, tipoForm, urlForm },
            tag: `nps-${tipoForm.toLowerCase().replace('ã', 'a')}`
        });

        if (!result.sent) {
            return res.status(500).json({ error: result.error || result.blocked || 'Erro ao enviar e-mail via Resend' });
        }

        res.json({ ok: true, message: 'Pesquisa enviada com sucesso!' });
    } catch (err) {
        console.error('[POST /api/emails/nps] Erro:', err);
        res.status(500).json({ error: err.message });
    }
});



// =============================================================================
// CAMADA DE SANITIZAÇÃO — garante que nenhum campo inválido chega ao Prisma
// =============================================================================

/**
 * Lista completa de relações do modelo companies no schema Prisma.
 * NENHUM desses campos pode jamais entrar no prisma.companies.create() ou .update().
 */
const COMPANY_RELATIONS = new Set([
    'contacts', 'company_products', 'company_meetings', 'company_dashboards',
    'company_nps', 'company_notes', 'company_followups', 'company_tickets',
    'test_logs', 'test_runs', 'test_runs_triggered'  // legado + novos modelos
]);

/**
 * Resolve aliases do frontend, filtra APENAS os campos escalares válidos
 * do schema `companies` e sanitiza os valores.
 * NUNCA inclui relações, campos undefined, ou campos desconhecidos.
 * GARANTE: nenhuma chave de COMPANY_RELATIONS pode estar no objeto retornado.
 */
function sanitizeCompanyScalars(raw) {
    const s = (v) => (v !== undefined && v !== null && String(v).trim() !== '') ? String(v).trim() : null;
    const d = (...vals) => {
        for (const v of vals) { if (v) { try { return new Date(v); } catch { } } }
        return null;
    };

    // Resolver aliases: frontend pode enviar nomes diferentes dos campos do schema.
    // ATENÇÃO: handlers.js envia Tem_algum_comex (sem _) e Qual_comex → mapear para nomes do schema.
    const resolved = {
        Status: raw.Status || raw.status,
        Nome_da_empresa: raw.Nome_da_empresa || raw.nome,
        CNPJ_da_empresa: raw.CNPJ_da_empresa || raw.cnpj,
        Estado: raw.Estado || raw.estado,
        Cidade: raw.Cidade || raw.cidade,
        Site: raw.Site || raw.site,
        Tipo_de_empresa: raw.Tipo_de_empresa || raw.tipo,
        Segmento_da_empresa: raw.Segmento_da_empresa || raw.segmento,
        Modo_da_empresa: raw.Modo_da_empresa || raw.canal || raw.modo,
        Lead: raw.Lead || raw.leadSource,
        Health_Score: raw.Health_Score || raw.healthScore,
        NPS: raw.NPS || raw.nps,
        // Comercial
        Data_Interesse: raw.Data_Interesse,
        decisor_: raw.decisor_ || raw.Decisor,
        Sucesso_Extraordin_rio: raw.Sucesso_Extraordin_rio || raw['Sucesso_Extraordinário'],
        Situa__o_da_reuni_o: raw.Situa__o_da_reuni_o || raw['Situação_da_reunião'],
        Nome_do_usu_rio: raw.Nome_do_usu_rio || raw['Nome_do_usuário'],
        Data_de_follow_up: raw.Data_de_follow_up,
        Hor_rio_de_follow_up: raw.Hor_rio_de_follow_up || raw['Horário_de_follow_up'],
        // Qualificação — aliases corrigidos (handlers.js envia sem underscore final)
        ERP: raw.ERP,
        Qual_ERP_: raw.Qual_ERP_ || raw.Qual_ERP,
        Tem_algum_comex_: raw.Tem_algum_comex_ || raw.Tem_algum_comex,
        Qual___M_dulo___Lotus_: raw.Qual___M_dulo___Lotus_ || raw.Qual_comex,
        Dores_Gargalos: raw.Dores_Gargalos,
        Principal_Objetivo: raw.Principal_Objetivo,
        Expectativa_da_DATI: raw.Expectativa_da_DATI,
        // CS
        Nome_do_CS: raw.Nome_do_CS,
        In_cio_com_CS: raw.In_cio_com_CS || raw['Início_com_CS'],
        Data_de_churn: raw.Data_de_churn,
        Motivo_do_churn: raw.Motivo_do_churn,
        Data_in_cio_onboarding: raw.Data_in_cio_onboarding || raw['Data_início_onboarding'],
        Data_t_rmino_onboarding: raw.Data_t_rmino_onboarding || raw['Data_término_onboarding'],
        Fechamento_onboarding__Sim_N_o_: raw.Fechamento_onboarding__Sim_N_o_ || raw.Fechamento_onboarding,
        Usu_rio_Dati__Sim_N_o_: raw.Usu_rio_Dati__Sim_N_o_ || raw['Usuário_Dati'],
    };

    const safe = { updatedAt: new Date() };

    const requiredStr = ['Status', 'Nome_da_empresa', 'Estado', 'Cidade', 'Tipo_de_empresa', 'Segmento_da_empresa'];
    for (const f of requiredStr) {
        if (resolved[f] !== undefined) safe[f] = s(resolved[f]);
    }

    const optionalStr = [
        'CNPJ_da_empresa', 'Site', 'Modo_da_empresa', 'Lead', 'Health_Score', 'NPS',
        'decisor_', 'Sucesso_Extraordin_rio', 'Situa__o_da_reuni_o', 'Nome_do_usu_rio',
        'Hor_rio_de_follow_up', 'ERP', 'Qual_ERP_', 'Tem_algum_comex_',
        'Qual___M_dulo___Lotus_', 'Dores_Gargalos', 'Principal_Objetivo',
        'Expectativa_da_DATI', 'Nome_do_CS', 'Motivo_do_churn',
        'Fechamento_onboarding__Sim_N_o_', 'Usu_rio_Dati__Sim_N_o_',
    ];
    for (const f of optionalStr) {
        const v = resolved[f];
        if (v !== undefined) safe[f] = s(v);
    }

    const dateFields = [
        'Data_Interesse', 'Data_de_follow_up', 'In_cio_com_CS',
        'Data_de_churn', 'Data_in_cio_onboarding', 'Data_t_rmino_onboarding',
    ];
    for (const f of dateFields) {
        if (resolved[f] !== undefined) safe[f] = d(resolved[f]);
    }

    // ── GUARDA DE SEGURANÇA FINAL ──────────────────────────────────────────
    // Remove qualquer chave de relação que tenha vazado — camada de defesa dupla.
    for (const rel of COMPANY_RELATIONS) {
        if (rel in safe) {
            console.error(`[sanitize] ⛔ RELAÇÃO BLOQUEADA: key '${rel}' removida do scalarData!`);
            delete safe[rel];
        }
    }

    console.log(`[sanitize] ✅ Campos escalares enviados ao Prisma:`, Object.keys(safe).join(', '));
    return safe;
}

// GET all companies with relations
app.get('/api/companies', extractUsuario, async (req, res) => {
    try {
        const usuario = req.usuarioAtual;
        console.log(`[GET /api/companies] user: ${usuario?.email} | type: ${usuario?.user_type}`);

        // ── standard: retorna apenas as empresas com membership ──────────────
        if (usuario?.user_type === 'standard') {
            const memberships = await prisma.user_memberships.findMany({
                where: { user_id: usuario.id },
                select: { company_id: true }
            });
            const allowedIds = memberships.map(m => m.company_id);

            if (allowedIds.length === 0) {
                return res.json([]); // sem empresas vinculadas → lista vazia
            }

            const companies = await prisma.companies.findMany({
                where: { id: { in: allowedIds } },
                include: {
                    company_products: { include: { product_historico: true } },
                    contacts: true,
                    company_meetings: true,
                    company_dashboards: true,
                    company_nps: true,
                    company_tickets: true,
                    company_notes: true,
                    company_followups: true
                },
                orderBy: { Nome_da_empresa: 'asc' }
            });
            return res.json(companies);
        }

        // ── master: retorna todas ────────────────────────────────────────────
        const companies = await prisma.companies.findMany({
            include: {
                company_products: {
                    include: { product_historico: true }
                },
                contacts: true,
                company_meetings: true,
                company_dashboards: true,
                company_nps: true,
                company_tickets: true,
                company_notes: true,
                company_followups: true
            },
            orderBy: { Nome_da_empresa: 'asc' }
        });
        res.json(companies);
    } catch (error) {
        console.error('❌ ERRO REAL NA API /api/companies:');
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});


// GET /api/companies/search — busca leve para autocomplete (sem relações)
// DEVE vir antes de /api/companies/:id para não ser capturada como parâmetro
app.get('/api/companies/search', extractUsuario, async (req, res) => {
    try {
        const { q = '', limit = 20 } = req.query;
        const where = q.trim()
            ? { Nome_da_empresa: { contains: q.trim(), mode: 'insensitive' } }
            : {};
        const companies = await prisma.companies.findMany({
            where,
            select: { id: true, Nome_da_empresa: true, Status: true },
            orderBy: { Nome_da_empresa: 'asc' },
            take: parseInt(limit),
        });
        res.json(companies);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET single company

app.get('/api/companies/:id', extractUsuario, async (req, res) => {
    try {
        const { id } = req.params;
        const company = await prisma.companies.findUnique({
            where: { id },
            include: {
                company_products: {
                    include: { product_historico: true }
                },
                contacts: true,
                company_meetings: true,
                company_dashboards: true,
                company_nps: true,
                company_tickets: true,
                company_notes: true,
                company_followups: true
            }
        });
        if (!company) return res.status(404).json({ error: 'Empresa não encontrada' });
        res.json(company);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST new company 10/10 — versão blindada (mesma arquitetura do PUT)
app.post('/api/companies', extractUsuario, async (req, res) => {
    try {
        const payload = req.body;
        console.log('\n📬 [POST /api/companies] Criando nova empresa...');
        console.log('[POST] Chaves recebidas:', Object.keys(payload).join(', '));

        // ── PASSO 1: Extrair relações do payload (para tratar depois) ────────────
        const {
            Produtos, Contatos, Reunioes, Dashboards, NPS_History,
            Tickets, Notas, Follow_Ups, Log_de_Testes,
            contacts, company_products, company_meetings, company_dashboards,
            company_nps, company_notes, company_followups, company_tickets, test_logs,
            ...rawScalars
        } = payload;

        // ── PASSO 2: Sanitizar escalares (sem undefined, sem relações) ────────────
        const scalarData = sanitizeCompanyScalars(rawScalars);

        // Guarda de segurança: remover qualquer relação que tenha escapado
        for (const rel of COMPANY_RELATIONS) {
            if (rel in scalarData) {
                console.error(`[POST] ⛔ Relação '${rel}' bloqueada em scalarData!`);
                delete scalarData[rel];
            }
        }

        // ── PASSO 3: Criar empresa APENAS com campos escalares + id ───────────────
        const companyId = randomUUID();
        console.log(`[POST] Criando empresa id=${companyId} com:`, Object.keys(scalarData).join(', '));

        await prisma.companies.create({
            data: {
                id: companyId,
                ...scalarData    // ← APENAS escalares, NUNCA relações
            }
        });
        console.log(`[POST] ✅ companies.create() concluído.`);

        // ── PASSO 4: Processar cada relação em queries separadas ──────────────────

        // company_products
        const produtosPayload = Produtos ?? company_products;
        if (produtosPayload && produtosPayload.length > 0) {
            for (const p of produtosPayload) {
                const { Historico, product_historico: hist, ...pData } = p;
                const historicoItems = Historico || hist || [];
                await prisma.company_products.create({
                    data: {
                        id: randomUUID(),
                        companyId: companyId,
                        updatedAt: new Date(),
                        Produto_DATI: pData.Produto_DATI || pData.nome || 'Produto',
                        Tipo_cobranca: pData.Tipo_cobranca || pData.tipoCobranca || null,
                        Valor_unitario: pData.Valor_unitario ?? pData.valorUnitario ?? null,
                        Valor_minimo: pData.Valor_minimo ?? pData.valorMinimo ?? null,
                        Valor_total: pData.Valor_total ?? pData.valorTotal ?? null,
                        Cobranca_setup: pData.Cobranca_setup || pData.cobrancaSetup || null,
                        Valor_setup: pData.Valor_setup ?? pData.valorSetup ?? null,
                        Qtd_usuarios: (pData.Qtd_usuarios || pData.qtdUsuarios) ? String(pData.Qtd_usuarios || pData.qtdUsuarios) : null,
                        Valor_usuario_adicional: pData.Valor_usuario_adicional ?? pData.valorUserAdic ?? null,
                        Total_horas_hd: pData.Total_horas_hd != null ? parseInt(pData.Total_horas_hd) : (pData.totalHorasHd != null ? parseInt(pData.totalHorasHd) : null),
                        Valor_adic_hd: pData.Valor_adic_hd ?? pData.valorAdicHd ?? null,
                        Data_do_contrato: (pData.Data_do_contrato || pData.dataContratacao) ? new Date(pData.Data_do_contrato || pData.dataContratacao) : null,
                        Proposta_comercial: pData.Proposta_comercial || pData.propostaData || null,
                        Proposta_nome: pData.Proposta_nome || pData.propostaName || null,
                        Contrato: pData.Contrato || pData.contratoData || null,
                        Contrato_nome: pData.Contrato_nome || pData.contratoName || null,
                        product_historico: historicoItems.length > 0 ? {
                            create: historicoItems.map(h => ({
                                id: randomUUID(),
                                updatedAt: new Date(),
                                Data_faturamento: h.Data_faturamento ? new Date(h.Data_faturamento) : null,
                                Data_pagamento: h.Data_pagamento ? new Date(h.Data_pagamento) : null,
                                Anexo_NF: h.Anexo_NF || null,
                                Anexo_NF_nome: h.Anexo_NF_nome || null,
                                Anexo_pagamento: h.Anexo_pagamento || null,
                                Anexo_pagamento_nome: h.Anexo_pagamento_nome || null,
                                Outros_anexos: h.Outros_anexos || null,
                                Outros_anexos_nome: h.Outros_anexos_nome || null
                            }))
                        } : undefined
                    }
                });
            }
        }

        // contacts
        const contatosPayload = Contatos ?? contacts;
        if (contatosPayload && contatosPayload.length > 0) {
            await prisma.contacts.createMany({
                data: contatosPayload.map(c => ({
                    id: randomUUID(),
                    companyId: companyId,
                    updatedAt: new Date(),
                    Nome_do_contato: c.Nome_do_contato || c.nome || null,
                    Cargo_do_contato: c.Cargo_do_contato || c.cargo || null,
                    Departamento_do_contato: c.Departamento_do_contato || c.departamento || null,
                    Email_1: c.Email_1 || c.email1 || null,
                    WhatsApp: c.WhatsApp || c.whatsapp || null,
                    LinkedIn: c.LinkedIn || c.linkedin || null
                }))
            });
        }

        // company_meetings
        const reunioesPayload = Reunioes ?? company_meetings;
        if (reunioesPayload && reunioesPayload.length > 0) {
            await prisma.company_meetings.createMany({
                data: reunioesPayload.map(r => ({
                    id: randomUUID(),
                    companyId: companyId,
                    updatedAt: new Date(),
                    Data_reuniao: r.Data_reuniao || r.data ? new Date(r.Data_reuniao || r.data) : null,
                    Participantes: r.Participantes || r.participantes || null,
                    Temperatura: r.Temperatura || r.temperatura || null,
                    Link_gravacao: r.Link_gravacao || r.link || null,
                    Observacoes: r.Observacoes || r.observacoes || r.obs || null,
                    Tipo_reuniao: r.Tipo_reuniao || r.tipo_reuniao || 'Geral'
                }))
            });
        }

        // company_dashboards
        const dashboardsPayload = Dashboards ?? company_dashboards;
        if (dashboardsPayload && dashboardsPayload.length > 0) {
            await prisma.company_dashboards.createMany({
                data: dashboardsPayload.map(d => ({
                    id: randomUUID(),
                    companyId: companyId,
                    updatedAt: new Date(),
                    Data: d.Data || d.data ? new Date(d.Data || d.data) : null,
                    Destinatario: d.Destinatario || d.destinatario || d.destinatarios || null,
                    Link: d.Link || d.link || null
                }))
            });
        }

        // company_nps
        const npsPayload = NPS_History ?? company_nps;
        if (npsPayload && npsPayload.length > 0) {
            await prisma.company_nps.createMany({
                data: npsPayload.map(n => ({
                    id: randomUUID(),
                    companyId: companyId,
                    updatedAt: new Date(),
                    Data: n.Data || n.data ? new Date(n.Data || n.data) : null,
                    Destinatario: n.Destinatario || n.destinatario || n.destinatarios || null,
                    Formulario: n.Formulario || n.formulario || n.forms || null,
                    Score: n.Score != null ? String(n.Score) : (n.score != null ? String(n.score) : null)
                }))
            });
        }

        // company_tickets
        const ticketsPayload = Tickets ?? company_tickets;
        if (ticketsPayload && ticketsPayload.length > 0) {
            await prisma.company_tickets.createMany({
                data: ticketsPayload.map(t => ({
                    id: randomUUID(),
                    companyId: companyId,
                    updatedAt: new Date(),
                    Data: t.Data || t.data ? new Date(t.Data || t.data) : null,
                    Numero: t.Numero || t.numero || null,
                    Resumo: t.Resumo || t.resumo || null,
                    Autor: t.Autor || t.autor || null,
                    Link: t.Link || t.link || null
                }))
            });
        }

        // company_notes
        const notasPayload = Notas ?? company_notes;
        if (notasPayload && notasPayload.length > 0) {
            await prisma.company_notes.createMany({
                data: notasPayload.map(n => ({
                    id: randomUUID(),
                    companyId: companyId,
                    updatedAt: new Date(),
                    Data: n.Data || n.data || n.timestamp ? new Date(n.Data || n.data || n.timestamp) : new Date(),
                    Conteudo: n.Conteudo || n.text || null,
                    Autor: n.Autor || n.author || null
                }))
            });
        }

        // company_followups
        const followUpsPayload = Follow_Ups ?? company_followups;
        if (followUpsPayload && followUpsPayload.length > 0) {
            await prisma.company_followups.createMany({
                data: followUpsPayload.map(f => ({
                    id: randomUUID(),
                    companyId: companyId,
                    updatedAt: new Date(),
                    Data_inclusao: f.Data_inclusao || f.data ? new Date(f.Data_inclusao || f.data) : new Date(),
                    Conteudo: f.Conteudo || f.conteudo || null,
                    Usuario: f.Usuario || f.usuario || null,
                    Area: f.Area || f.area || null,
                    Data_proximo_contato: (f.Data_proximo_contato || f.proximoContato) ? new Date(f.Data_proximo_contato || f.proximoContato) : null
                }))
            });
        }

        // ── PASSO 5: Retornar empresa completa com todas as relações ──────────────
        const fullCompany = await prisma.companies.findUnique({
            where: { id: companyId },
            include: {
                company_products: { include: { product_historico: true } },
                contacts: true,
                company_meetings: true,
                company_dashboards: true,
                company_nps: true,
                company_tickets: true,
                company_notes: true,
                company_followups: true
            }
        });

        console.log(`[POST] ✅ Empresa criada: ${companyId}\n`);

        audit.log(prisma, {
            actor: req.usuarioAtual,
            action: 'CREATE',
            entity_type: 'company',
            entity_id: companyId,
            entity_name: scalarData.Nome_da_empresa ?? companyId,
            description: `Criou a empresa "${scalarData.Nome_da_empresa ?? companyId}"`,
            meta: { fields: Object.keys(scalarData) },
            company_id: companyId,
            ip_address: req.ip,
        });

        res.status(201).json(fullCompany);
    } catch (error) {
        console.error('❌ [POST /api/companies] Erro:', error.message);
        console.error(error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// PUT update company — requer ao menos uma permissão de edição
app.put('/api/companies/:id', extractUsuario, requireFeature(['company_edit.basic_data', 'company_edit.products', 'company_edit.contacts', 'company_edit.cs', 'company_edit.activities']), async (req, res) => {
    try {
        const { id } = req.params;
        const payload = req.body;

        // Snapshot antes da alteração (para diff no audit log)
        const companyBefore = await prisma.companies.findUnique({
            where: { id },
            select: {
                Nome_da_empresa: true, Status: true, Health_Score: true, NPS: true,
                CNPJ_da_empresa: true, Segmento_da_empresa: true, Tipo_de_empresa: true,
                Cidade: true, Estado: true, Site: true, ERP: true, Lead: true,
                Modo_da_empresa: true, Nome_do_CS: true, In_cio_com_CS: true,
                Data_de_churn: true, Motivo_do_churn: true, Data_de_follow_up: true,
                Principal_Objetivo: true, Expectativa_da_DATI: true,
            }
        });

        console.log(`\n🔄 [PUT /api/companies/${id}] Iniciando update...`);
        console.log(`[PUT] Chaves recebidas no payload:`, Object.keys(payload).join(', '));

        // ── PASSO 1: Extrair campos de relação do payload (para tratar depois) ──
        const {
            // Relações nomeadas pelo frontend (chaves do payload enviado pelo handlers.js)
            Produtos,
            Contatos,
            Reunioes,
            Dashboards,
            NPS_History,
            Tickets,
            Notas,
            Follow_Ups,
            Log_de_Testes,
            // Relações com nomes do schema DB (caso venham diretamente)
            contacts,
            company_products,
            company_meetings,
            company_dashboards,
            company_nps,
            company_notes,
            company_followups,
            company_tickets,
            test_logs,
            // O restante são campos escalares candidatos
            ...rawScalars
        } = payload;

        // ── PASSO 2: Sanitizar somente os escalares ──────────────────────────────
        const scalarData = sanitizeCompanyScalars(rawScalars);

        // Verificação de segurança: garantir que nenhuma relação escapou
        for (const rel of COMPANY_RELATIONS) {
            if (rel in scalarData) {
                console.error(`[PUT] ⛔ CRÍTICO: relação '${rel}' encontrada em scalarData — removendo!`);
                delete scalarData[rel];
            }
        }

        // ── PASSO 3: Atualizar empresa APENAS com campos escalares ───────────────
        console.log(`[PUT] Executando prisma.companies.update com:`, Object.keys(scalarData).join(', '));
        await prisma.companies.update({
            where: { id },
            data: scalarData   // ← APENAS escalares, NUNCA relações
        });
        console.log(`[PUT] ✅ companies.update() concluído.`);

        // ── PASSO 4: Processar cada relação em queries separadas ─────────────────

        // company_products — usa Produtos do payload (alias do frontend)
        const produtosPayload = Produtos ?? company_products;
        if (produtosPayload !== undefined) {
            console.log(`[PUT] Sincronizando company_products (${(produtosPayload || []).length} itens)...`);
            await prisma.company_products.deleteMany({ where: { companyId: id } });
            for (const p of produtosPayload || []) {
                const { Historico, product_historico: hist, ...pData } = p;
                const historicoItems = Historico || hist || [];
                await prisma.company_products.create({
                    data: {
                        id: randomUUID(),
                        companyId: id,
                        updatedAt: new Date(),
                        Produto_DATI: pData.Produto_DATI || pData.nome || 'Produto',
                        Tipo_cobranca: pData.Tipo_cobranca || pData.tipoCobranca || null,
                        Valor_unitario: pData.Valor_unitario ?? pData.valorUnitario ?? null,
                        Valor_minimo: pData.Valor_minimo ?? pData.valorMinimo ?? null,
                        Valor_total: pData.Valor_total ?? pData.valorTotal ?? null,
                        Cobranca_setup: pData.Cobranca_setup || pData.cobrancaSetup || null,
                        Valor_setup: pData.Valor_setup ?? pData.valorSetup ?? null,
                        Qtd_usuarios: (pData.Qtd_usuarios || pData.qtdUsuarios) ? String(pData.Qtd_usuarios || pData.qtdUsuarios) : null,
                        Valor_usuario_adicional: pData.Valor_usuario_adicional ?? pData.valorUserAdic ?? null,
                        Total_horas_hd: pData.Total_horas_hd != null ? parseInt(pData.Total_horas_hd) : (pData.totalHorasHd != null ? parseInt(pData.totalHorasHd) : null),
                        Valor_adic_hd: pData.Valor_adic_hd ?? pData.valorAdicHd ?? null,
                        Data_do_contrato: (pData.Data_do_contrato || pData.dataContratacao) ? new Date(pData.Data_do_contrato || pData.dataContratacao) : null,
                        Proposta_comercial: pData.Proposta_comercial || pData.propostaData || null,
                        Proposta_nome: pData.Proposta_nome || pData.propostaName || null,
                        Contrato: pData.Contrato || pData.contratoData || null,
                        Contrato_nome: pData.Contrato_nome || pData.contratoName || null,
                        product_historico: historicoItems.length > 0 ? {
                            create: historicoItems.map(h => ({
                                id: randomUUID(),
                                updatedAt: new Date(),
                                Data_faturamento: h.Data_faturamento ? new Date(h.Data_faturamento) : null,
                                Data_pagamento: h.Data_pagamento ? new Date(h.Data_pagamento) : null,
                                Anexo_NF: h.Anexo_NF || null,
                                Anexo_NF_nome: h.Anexo_NF_nome || null,
                                Anexo_pagamento: h.Anexo_pagamento || null,
                                Anexo_pagamento_nome: h.Anexo_pagamento_nome || null,
                                Outros_anexos: h.Outros_anexos || null,
                                Outros_anexos_nome: h.Outros_anexos_nome || null
                            }))
                        } : undefined
                    }
                });
            }
            console.log(`[PUT] ✅ company_products sincronizado.`);
        }

        // contacts
        const contatosPayload = Contatos ?? contacts;
        if (contatosPayload !== undefined) {
            console.log(`[PUT] Sincronizando contacts (${(contatosPayload || []).length} itens)...`);
            await prisma.contacts.deleteMany({ where: { companyId: id } });
            if ((contatosPayload || []).length > 0) {
                await prisma.contacts.createMany({
                    data: contatosPayload.map(c => ({
                        id: randomUUID(),
                        companyId: id,
                        updatedAt: new Date(),
                        Nome_do_contato: c.Nome_do_contato || c.nome || null,
                        Cargo_do_contato: c.Cargo_do_contato || c.cargo || null,
                        Departamento_do_contato: c.Departamento_do_contato || c.departamento || null,
                        Email_1: c.Email_1 || c.email1 || null,
                        WhatsApp: c.WhatsApp || c.whatsapp || null,
                        LinkedIn: c.LinkedIn || c.linkedin || null
                    }))
                });
            }
            console.log(`[PUT] ✅ contacts sincronizado.`);
        }

        // company_meetings
        const reunioesPayload = Reunioes ?? company_meetings;
        if (reunioesPayload !== undefined) {
            console.log(`[PUT] Sincronizando company_meetings (${(reunioesPayload || []).length} itens)...`);
            await prisma.company_meetings.deleteMany({ where: { companyId: id } });
            if ((reunioesPayload || []).length > 0) {
                await prisma.company_meetings.createMany({
                    data: reunioesPayload.map(r => ({
                        id: randomUUID(),
                        companyId: id,
                        updatedAt: new Date(),
                        Data_reuniao: r.Data_reuniao || r.data ? new Date(r.Data_reuniao || r.data) : null,
                        Participantes: r.Participantes || r.participantes || null,
                        Temperatura: r.Temperatura || r.temperatura || null,
                        Link_gravacao: r.Link_gravacao || r.link || null,
                        Observacoes: r.Observacoes || r.observacoes || r.obs || null,
                        Tipo_reuniao: r.Tipo_reuniao || r.tipo_reuniao || 'Geral'
                    }))
                });
            }
            console.log(`[PUT] ✅ company_meetings sincronizado.`);
        }

        // company_dashboards
        const dashboardsPayload = Dashboards ?? company_dashboards;
        if (dashboardsPayload !== undefined) {
            console.log(`[PUT] Sincronizando company_dashboards (${(dashboardsPayload || []).length} itens)...`);
            await prisma.company_dashboards.deleteMany({ where: { companyId: id } });
            if ((dashboardsPayload || []).length > 0) {
                await prisma.company_dashboards.createMany({
                    data: dashboardsPayload.map(d => ({
                        id: randomUUID(),
                        companyId: id,
                        updatedAt: new Date(),
                        Data: d.Data || d.data ? new Date(d.Data || d.data) : null,
                        Destinatario: d.Destinatario || d.destinatario || d.destinatarios || null,
                        Link: d.Link || d.link || null
                    }))
                });
            }
            console.log(`[PUT] ✅ company_dashboards sincronizado.`);
        }

        // company_nps
        const npsPayload = NPS_History ?? company_nps;
        if (npsPayload !== undefined) {
            console.log(`[PUT] Sincronizando company_nps (${(npsPayload || []).length} itens)...`);
            await prisma.company_nps.deleteMany({ where: { companyId: id } });
            if ((npsPayload || []).length > 0) {
                await prisma.company_nps.createMany({
                    data: npsPayload.map(n => ({
                        id: randomUUID(),
                        companyId: id,
                        updatedAt: new Date(),
                        Data: n.Data || n.data ? new Date(n.Data || n.data) : null,
                        Destinatario: n.Destinatario || n.destinatario || n.destinatarios || null,
                        Formulario: n.Formulario || n.formulario || n.forms || null,
                        Score: n.Score != null ? String(n.Score) : (n.score != null ? String(n.score) : null)
                    }))
                });
            }
            console.log(`[PUT] ✅ company_nps sincronizado.`);
        }

        // company_tickets
        const ticketsPayload = Tickets ?? company_tickets;
        if (ticketsPayload !== undefined) {
            console.log(`[PUT] Sincronizando company_tickets (${(ticketsPayload || []).length} itens)...`);
            await prisma.company_tickets.deleteMany({ where: { companyId: id } });
            if ((ticketsPayload || []).length > 0) {
                await prisma.company_tickets.createMany({
                    data: ticketsPayload.map(t => ({
                        id: randomUUID(),
                        companyId: id,
                        updatedAt: new Date(),
                        Data: t.Data || t.data ? new Date(t.Data || t.data) : null,
                        Numero: t.Numero || t.numero || null,
                        Resumo: t.Resumo || t.resumo || null,
                        Autor: t.Autor || t.autor || null,
                        Link: t.Link || t.link || null
                    }))
                });
            }
            console.log(`[PUT] ✅ company_tickets sincronizado.`);
        }

        // company_notes
        const notasPayload = Notas ?? company_notes;
        if (notasPayload !== undefined) {
            console.log(`[PUT] Sincronizando company_notes (${(notasPayload || []).length} itens)...`);
            await prisma.company_notes.deleteMany({ where: { companyId: id } });
            if ((notasPayload || []).length > 0) {
                await prisma.company_notes.createMany({
                    data: notasPayload.map(n => ({
                        id: randomUUID(),
                        companyId: id,
                        updatedAt: new Date(),
                        Data: n.Data || n.data || n.timestamp ? new Date(n.Data || n.data || n.timestamp) : new Date(),
                        Conteudo: n.Conteudo || n.text || null,
                        Autor: n.Autor || n.author || null
                    }))
                });
            }
            console.log(`[PUT] ✅ company_notes sincronizado.`);
        }

        // company_followups
        const followUpsPayload = Follow_Ups ?? company_followups;
        if (followUpsPayload !== undefined) {
            console.log(`[PUT] Sincronizando company_followups (${(followUpsPayload || []).length} itens)...`);
            await prisma.company_followups.deleteMany({ where: { companyId: id } });
            if ((followUpsPayload || []).length > 0) {
                await prisma.company_followups.createMany({
                    data: followUpsPayload.map(f => ({
                        id: randomUUID(),
                        companyId: id,
                        updatedAt: new Date(),
                        Data_inclusao: f.Data_inclusao || f.data ? new Date(f.Data_inclusao || f.data) : new Date(),
                        Conteudo: f.Conteudo || f.conteudo || null,
                        Usuario: f.Usuario || f.usuario || null,
                        Area: f.Area || f.area || null,
                        Data_proximo_contato: (f.Data_proximo_contato || f.proximoContato) ? new Date(f.Data_proximo_contato || f.proximoContato) : null
                    }))
                });
            }
            console.log(`[PUT] ✅ company_followups sincronizado.`);
        }

        // ── PASSO 5: Retornar dados completos atualizados ────────────────────────
        const updatedCompany = await prisma.companies.findUnique({
            where: { id },
            include: {
                company_products: { include: { product_historico: true } },
                contacts: true,
                company_meetings: true,
                company_dashboards: true,
                company_nps: true,
                company_tickets: true,
                company_notes: true,
                company_followups: true
            }
        });

        console.log(`[PUT] ✅ Update completo para empresa ${id}.\n`);

        if (companyBefore) {
            const { description, meta } = audit.diff(
                companyBefore, scalarData, 'company',
                companyBefore.Nome_da_empresa ?? id
            );
            audit.log(prisma, {
                actor: req.usuarioAtual,
                action: 'UPDATE',
                entity_type: 'company',
                entity_id: id,
                entity_name: companyBefore.Nome_da_empresa ?? id,
                description,
                meta,
                company_id: id,
                ip_address: req.ip,
            });
        }

        res.json(updatedCompany);
    } catch (error) {
        console.error(`❌ [PUT /api/companies/${req.params.id}] Erro:`, error.message);
        console.error(error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// DELETE company
app.delete('/api/companies/:id', extractUsuario, async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) return res.status(400).json({ error: 'ID obrigatório' });

        // Snapshot antes de deletar
        const companyBefore = await prisma.companies.findUnique({
            where: { id },
            select: { Nome_da_empresa: true, Status: true, CNPJ_da_empresa: true }
        });

        await prisma.companies.delete({ where: { id } });

        audit.log(prisma, {
            actor: req.usuarioAtual,
            action: 'DELETE',
            entity_type: 'company',
            entity_id: id,
            entity_name: companyBefore?.Nome_da_empresa ?? id,
            description: `Removeu a empresa "${companyBefore?.Nome_da_empresa ?? id}"`,
            meta: companyBefore ?? undefined,
            ip_address: req.ip,
        });

        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// =============================================================================
// MÓDULO DE IMPORTAÇÃO EM MASSA
// =============================================================================

import multer from 'multer';
import XLSX from 'xlsx';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: (req, file, cb) => {
        const allowed = [
            'text/csv',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
        ];
        if (allowed.includes(file.mimetype) ||
            file.originalname.endsWith('.csv') ||
            file.originalname.endsWith('.xlsx') ||
            file.originalname.endsWith('.xls')) {
            cb(null, true);
        } else {
            cb(new Error('Formato inválido. Use CSV ou XLSX.'));
        }
    },
});

// Validações por linha
// existingCnpjs: Map<cnpj_lower, nome_da_empresa>
function validateRow(row, existingNames, existingEmails, existingCnpjMap) {
    const errors = [];

    // 1. Empresa obrigatória
    const nomeEmpresa = (row.empresa || '').trim();
    if (!nomeEmpresa) {
        errors.push('Nome da empresa obrigatório');
    }

    // 2. Email — validar se presente
    if (row.contato_email && row.contato_email.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(row.contato_email.trim())) {
            errors.push('E-mail inválido');
        }
    }

    // 3. Duplicidade — nome da empresa
    const isDuplicateCompany = row.empresa &&
        existingNames.has(row.empresa.trim().toLowerCase());

    // 4. Duplicidade — CNPJ (checa mesmo que vazio para não conflitar)
    const cnpjClean = (row.cnpj || '').trim();
    const cnpjConflictName = cnpjClean && existingCnpjMap ? existingCnpjMap.get(cnpjClean.toLowerCase()) : null;

    // 5. Duplicidade — email do contato
    const isDuplicateEmail = row.contato_email &&
        existingEmails.has(row.contato_email.trim().toLowerCase());

    if (errors.length > 0) {
        return { status: 'invalid', error_message: errors.join(' | ') };
    }

    if (cnpjConflictName) {
        return {
            status: 'duplicate',
            error_message: `Não é possível cadastrar '${nomeEmpresa || row.empresa}' com o CNPJ ${cnpjClean} — este CNPJ já pertence à empresa '${cnpjConflictName}'`
        };
    }
    if (isDuplicateCompany) {
        return { status: 'duplicate', error_message: `Empresa '${row.empresa}' já existe no sistema` };
    }
    if (isDuplicateEmail) {
        return { status: 'duplicate', error_message: `E-mail '${row.contato_email}' já está cadastrado` };
    }
    return { status: 'valid', error_message: null };
}

// Mapa de normalização de status — aliases inválidos que podem vir da planilha
const STATUS_ALIAS_MAP = {
    'cliente ativo':        'Ativo',
    'ativo':                'Ativo',
    'churned':              'Inativo',
    'inativo':              'Inativo',
    'em implementação':     'Em Contrato',
    'em implementacao':     'Em Contrato',
    'em contrato':          'Em Contrato',
    'pausado':              'Suspenso',
    'suspenso':             'Suspenso',
    'prospect':             'Prospect',
    'lead':                 'Lead',
    'reunião':              'Reunião',
    'reuniao':              'Reunião',
    'proposta | andamento': 'Proposta | Andamento',
    'proposta | recusada':  'Proposta | Recusada',
};

function normalizeStatus(raw) {
    if (!raw) return '';
    const key = String(raw).trim().toLowerCase();
    return STATUS_ALIAS_MAP[key] || String(raw).trim();
}

// Sanitizar dados de uma linha — suporta modelo Journey (Empresas + Contatos + Produtos DATI)
function sanitizeRow(row) {
    const s = (v) => (typeof v === 'string' ? v.trim() : v != null ? String(v).trim() : '');
    const n = (v) => { const p = parseFloat(String(v || '').replace(',', '.')); return isNaN(p) ? null : p; };
    return {
        // ── Empresa ─────────────────────────────────────────────────────────
        empresa: s(row['Nome da Empresa'] || row.empresa || row['nome_empresa'] || ''),
        status_empresa: normalizeStatus(row['Status da Empresa'] || row['Status Empresa'] || row.status_empresa || ''),
        cnpj: s(row['CNPJ'] || row.cnpj || ''),
        tipo_empresa: s(row['Tipo de Empresa'] || row['Tipo Empresa'] || row.tipo_empresa || ''),
        estado: s(row['Estado'] || row.estado || ''),
        cidade: s(row['Cidade'] || row.cidade || ''),
        segmento: s(row['Segmento'] || row.segmento || ''),
        site: s(row['Site'] || row.site || ''),
        // ── Contato ─────────────────────────────────────────────────────────
        contato_nome: s(row['Nome do Contato'] || row.contato_nome || ''),
        cargo: s(row['Cargo'] || row.cargo || ''),
        departamento: s(row['Departamento'] || row.departamento || ''),
        contato_email: s(row['E-mail'] || row['Email'] || row.contato_email || '').toLowerCase(),
        contato_telefone: s(row['Whatsapp'] || row['WhatsApp'] || row.contato_telefone || ''),
        linkedin: s(row['Linkedin'] || row['LinkedIn'] || row.linkedin || ''),
        // ── Produto DATI ─────────────────────────────────────────────────────
        produto_dati: s(row['Produto DATI'] || row.produto_dati || ''),
        tipo_cobranca: s(row['Tipo de Cobrança'] || row['Tipo de Cobranca'] || row.tipo_cobranca || ''),
        valor_unitario: n(row['Valor Unitário'] || row['Valor Unitario'] || row.valor_unitario),
        valor_minimo: n(row['Valor Mínimo'] || row['Valor Minimo'] || row.valor_minimo),
        cobranca_setup: s(row['Cobrança de Setup'] || row['Cobranca de Setup'] || row.cobranca_setup || ''),
        valor_setup: n(row['Valor de Setup'] || row.valor_setup),
        qtd_usuarios: s(row['Quantidade de Usuários'] || row['Quantidade de Usuarios'] || row.qtd_usuarios || ''),
        valor_usuario_adic: n(row['Valor por Usuário Adicional'] || row['Valor por Usuario Adicional'] || row.valor_usuario_adic),
        total_horas_hd: n(row['Total Horas Mensais - Help Desk'] || row.total_horas_hd),
        valor_adic_hd: n(row['Valor Adicional por Hora - Help Desk'] || row.valor_adic_hd),
    };
}

// ── GET /api/import/template ─────────────────────────────────────────────────
// Serve o arquivo modelo real (template_importacao_dati.xlsx)
app.get('/api/import/template', extractUsuario, (req, res) => {
    try {
        const filePath = path.join(__dirname, 'template_importacao_dati.xlsx');
        const buffer = readFileSync(filePath);
        console.log('[IMPORT TEMPLATE] Servindo arquivo real | Size:', buffer.length);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="modelo_importacao_dati.xlsx"');
        res.setHeader('Content-Length', buffer.length);
        return res.end(buffer);
    } catch (err) {
        console.error('[IMPORT TEMPLATE] ERRO ao ler arquivo:', err.message);
        return res.status(500).json({ error: 'Template não encontrado: ' + err.message });
    }
});
// ── POST /api/import/upload ───────────────────────────────────────────────────
app.post('/api/import/upload', extractUsuario, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

        // Parse do arquivo — suporta modelo multi-aba (Empresas + Contatos + Produtos DATI)
        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });

        // Detectar abas pelo nome (case-insensitive)
        const findSheet = (...keywords) => {
            const name = wb.SheetNames.find(n =>
                keywords.every(k => n.toLowerCase().includes(k.toLowerCase()))
            );
            return name ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' }) : [];
        };

        const empresaRows = findSheet('empresa', 'preencher');
        const contatoRows = findSheet('contato', 'preencher');
        const produtoRows = findSheet('produto', 'preencher');

        // Modelo multi-aba: ao menos a aba de empresas tem dados
        const isMultiTab = empresaRows.length > 0;

        // Modelo antigo/plano: uma única aba com tudo junto
        const sheetName = wb.SheetNames.find(n =>
            n.toLowerCase().includes('empresa') && !n.toLowerCase().includes('base')
        ) || wb.SheetNames[0];
        const flatRows = isMultiTab ? [] : XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });

        // Determinar linhas base
        const baseRows = isMultiTab ? empresaRows : flatRows;

        if (baseRows.length === 0) {
            const abasDetectadas = wb.SheetNames.join(', ');
            const temAbaEmpresas = wb.SheetNames.some(n => n.toLowerCase().includes('empresa') && n.toLowerCase().includes('preencher'));
            if (temAbaEmpresas) {
                return res.status(400).json({
                    error: `A aba "Empresas - Preencher" foi encontrada mas está vazia. Preencha ao menos uma linha de empresa e tente novamente. (Abas detectadas: ${abasDetectadas})`
                });
            }
            return res.status(400).json({
                error: `Planilha sem dados reconhecíveis. Abas encontradas: "${abasDetectadas}". Use o modelo oficial com a aba "Empresas - Preencher".`
            });
        }
        if (baseRows.length > 10000) {
            return res.status(400).json({ error: `Limite de 10.000 linhas excedido. Arquivo contém ${baseRows.length} linhas.` });
        }


        // Helpers
        const s = (v) => (typeof v === 'string' ? v.trim() : v != null ? String(v).trim() : '');
        const n = (v) => { const p = parseFloat(String(v || '').replace(',', '.')); return isNaN(p) ? null : p; };
        const norm = (v) => s(v).toLowerCase(); // normaliza nome para comparação

        let sanitized;

        if (isMultiTab) {
            // ── NOVO MODELO: linkagem por Nome da Empresa ──────────────────────────
            // Agrupa contatos por nome de empresa (normalizado)
            const contatosByEmpresa = {};
            for (const ct of contatoRows) {
                const empNome = norm(ct['Nome da Empresa'] || '');
                if (!empNome) continue;
                if (!contatosByEmpresa[empNome]) contatosByEmpresa[empNome] = [];
                contatosByEmpresa[empNome].push({
                    contato_nome: s(ct['Nome do Contato'] || ct.contato_nome || ''),
                    cargo: s(ct['Cargo'] || ct.cargo || ''),
                    departamento: s(ct['Departamento'] || ct.departamento || '') || null,
                    contato_email: s(ct['E-mail'] || ct['Email'] || ct.contato_email || '').toLowerCase(),
                    contato_telefone: s(ct['Whatsapp'] || ct['WhatsApp'] || ct.contato_telefone || ''),
                    linkedin: s(ct['Linkedin'] || ct['LinkedIn'] || ct.linkedin || '') || null,
                });
            }

            // Agrupa produtos por nome de empresa (normalizado)
            const produtosByEmpresa = {};
            for (const prod of produtoRows) {
                const empNome = norm(prod['Nome da Empresa'] || '');
                if (!empNome) continue;
                if (!produtosByEmpresa[empNome]) produtosByEmpresa[empNome] = [];
                produtosByEmpresa[empNome].push({
                    produto_dati: s(prod['Produto DATI'] || ''),
                    tipo_cobranca: s(prod['Tipo de Cobrança'] || prod['Tipo de Cobranca'] || ''),
                    valor_unitario: n(prod['Valor Unitário'] || prod['Valor Unitario'] || prod.valor_unitario),
                    valor_minimo: n(prod['Valor Mínimo'] || prod['Valor Minimo'] || prod.valor_minimo),
                    cobranca_setup: s(prod['Cobrança de Setup'] || prod['Cobranca de Setup'] || ''),
                    valor_setup: n(prod['Valor de Setup'] || prod.valor_setup),
                    qtd_usuarios: s(prod['Quantidade de Usuários'] || prod['Quantidade de Usuarios'] || ''),
                    valor_usuario_adic: n(prod['Valor por Usuário Adicional'] || prod['Valor por Usuario Adicional']),
                    total_horas_hd: n(prod['Total Horas Mensais - Help Desk'] || prod.total_horas_hd),
                    valor_adic_hd: n(prod['Valor Adicional por Hora - Help Desk'] || prod.valor_adic_hd),
                });
            }

            // Montar staging por empresa (1 linha por empresa)
            sanitized = empresaRows.map((empRow, i) => {
                const empNome = s(empRow['Nome da Empresa'] || empRow.empresa || '');
                const empKey = norm(empNome);

                // Primeiro contato fica nos campos diretos; restantes ficam em JSON
                const contatos = contatosByEmpresa[empKey] || [];
                const ct0 = contatos[0] || {};
                const contatosExtra = contatos.length > 1 ? contatos.slice(1) : null;

                // Primeiro produto fica nos campos diretos; restantes ficam em JSON
                const produtos = produtosByEmpresa[empKey] || [];
                const prod0 = produtos[0] || {};
                const produtosExtra = produtos.length > 1 ? produtos.slice(1) : null;

                return {
                    rowNum: i + 2,
                    // Empresa
                    empresa: empNome,
                    status_empresa: normalizeStatus(empRow['Status da Empresa'] || empRow['Status Empresa'] || ''),
                    cnpj: s(empRow['CNPJ'] || empRow.cnpj || ''),
                    tipo_empresa: s(empRow['Tipo de Empresa'] || empRow['Tipo Empresa'] || ''),
                    estado: s(empRow['Estado'] || empRow.estado || ''),
                    cidade: s(empRow['Cidade'] || empRow.cidade || ''),
                    segmento: s(empRow['Segmento'] || empRow.segmento || ''),
                    site: s(empRow['Site'] || empRow.site || ''),
                    // Contato principal
                    contato_nome: ct0.contato_nome || '',
                    cargo: ct0.cargo || '',
                    departamento: ct0.departamento || null,
                    contato_email: ct0.contato_email || '',
                    contato_telefone: ct0.contato_telefone || '',
                    linkedin: ct0.linkedin || null,
                    // Contatos extras (JSON)
                    contatos_extra_json: contatosExtra ? JSON.stringify(contatosExtra) : null,
                    // Produto principal
                    produto_dati: prod0.produto_dati || null,
                    tipo_cobranca: prod0.tipo_cobranca || null,
                    valor_unitario: prod0.valor_unitario,
                    valor_minimo: prod0.valor_minimo,
                    cobranca_setup: prod0.cobranca_setup || null,
                    valor_setup: prod0.valor_setup,
                    qtd_usuarios: prod0.qtd_usuarios || null,
                    valor_usuario_adic: prod0.valor_usuario_adic,
                    total_horas_hd: prod0.total_horas_hd != null ? Math.round(prod0.total_horas_hd) : null,
                    valor_adic_hd: prod0.valor_adic_hd,
                    // Produtos extras (JSON)
                    produtos_extra_json: produtosExtra ? JSON.stringify(produtosExtra) : null,
                };
            });
        } else {
            // Modelo plano (aba única com tudo) — compatibilidade retroativa
            sanitized = flatRows.map((r, i) => ({ rowNum: i + 2, ...sanitizeRow(r) }));
        }


        // Criar import_job
        const job = await prisma.import_jobs.create({
            data: {
                status: 'pending',
                total_rows: sanitized.length,
                filename: req.file.originalname,
            },
        });

        // Inserir staging em batches de 500
        const BATCH = 500;
        for (let i = 0; i < sanitized.length; i += BATCH) {
            await prisma.import_staging.createMany({
                data: sanitized.slice(i, i + BATCH).map(r => ({
                    import_id: job.id,
                    row_number: r.rowNum,
                    empresa: r.empresa,
                    cnpj: r.cnpj,
                    status_empresa: r.status_empresa || null,
                    tipo_empresa: r.tipo_empresa || null,
                    segmento: r.segmento,
                    cidade: r.cidade,
                    estado: r.estado,
                    site: r.site,
                    contato_nome: r.contato_nome,
                    contato_email: r.contato_email,
                    contato_telefone: r.contato_telefone,
                    cargo: r.cargo,
                    departamento: r.departamento || null,
                    linkedin: r.linkedin || null,
                    // Produto DATI
                    produto_dati: r.produto_dati || null,
                    tipo_cobranca: r.tipo_cobranca || null,
                    valor_unitario: r.valor_unitario != null ? r.valor_unitario : null,
                    valor_minimo: r.valor_minimo != null ? r.valor_minimo : null,
                    cobranca_setup: r.cobranca_setup || null,
                    valor_setup: r.valor_setup != null ? r.valor_setup : null,
                    qtd_usuarios: r.qtd_usuarios || null,
                    valor_usuario_adic: r.valor_usuario_adic != null ? r.valor_usuario_adic : null,
                    total_horas_hd: r.total_horas_hd != null ? Math.round(r.total_horas_hd) : null,
                    valor_adic_hd: r.valor_adic_hd != null ? r.valor_adic_hd : null,
                    contatos_extra_json: r.contatos_extra_json || null,
                    produtos_extra_json: r.produtos_extra_json || null,
                    status: 'pending',
                })),
            });
        }

        res.json({ import_id: job.id, total_rows: sanitized.length, filename: req.file.originalname });
    } catch (err) {
        console.error('[import/upload]', err);
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/import/:id/validate ────────────────────────────────────────────
app.post('/api/import/:id/validate', extractUsuario, async (req, res) => {
    try {
        const { id } = req.params;
        const job = await prisma.import_jobs.findUnique({ where: { id } });
        if (!job) return res.status(404).json({ error: 'Job não encontrado' });

        // Carregar nomes, e-mails e CNPJs existentes no banco (para duplicidade)
        const [existingCompanies, existingContacts] = await Promise.all([
            prisma.companies.findMany({ select: { Nome_da_empresa: true, CNPJ_da_empresa: true } }),
            prisma.contacts.findMany({ select: { Email_1: true } }),
        ]);
        const existingNames = new Set(existingCompanies.map(c => c.Nome_da_empresa?.toLowerCase()).filter(Boolean));
        // Map: cnpj_lower -> nome da empresa (para mensagem descritiva ao usuário)
        const existingCnpjMap = new Map(
            existingCompanies
                .filter(c => c.CNPJ_da_empresa)
                .map(c => [c.CNPJ_da_empresa.toLowerCase(), c.Nome_da_empresa])
        );
        const existingEmails = new Set(existingContacts.map(c => c.Email_1?.toLowerCase()).filter(Boolean));

        // Carregar staging
        const rows = await prisma.import_staging.findMany({ where: { import_id: id } });

        let valid = 0, invalid = 0, duplicate = 0;

        // Validar e atualizar cada linha
        await Promise.all(rows.map(async (row) => {
            const result = validateRow(row, existingNames, existingEmails, existingCnpjMap);
            await prisma.import_staging.update({
                where: { id: row.id },
                data: { status: result.status, error_message: result.error_message },
            });
            if (result.status === 'valid') valid++;
            else if (result.status === 'duplicate') duplicate++;
            else invalid++;
        }));

        const score = Math.round((valid / rows.length) * 100);
        const blocked = (invalid / rows.length) > 0.20; // bloqueia se >20% inválido

        await prisma.import_jobs.update({
            where: { id },
            data: {
                status: blocked ? 'blocked' : 'ready',
                valid_rows: valid,
                error_rows: invalid,
                duplicate_rows: duplicate,
            },
        });

        res.json({ import_id: id, total: rows.length, valid, invalid, duplicate, score, blocked });
    } catch (err) {
        console.error('[import/validate]', err);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/import/:id/preview ──────────────────────────────────────────────
app.get('/api/import/:id/preview', extractUsuario, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, page = 1, pageSize = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(pageSize);

        const where = { import_id: id };
        if (status && status !== 'all') where.status = status;

        const [rows, total, job] = await Promise.all([
            prisma.import_staging.findMany({ where, skip, take: parseInt(pageSize), orderBy: { row_number: 'asc' } }),
            prisma.import_staging.count({ where }),
            prisma.import_jobs.findUnique({ where: { id } }),
        ]);

        res.json({ rows, total, job, page: parseInt(page), pageSize: parseInt(pageSize) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/import/:id/simulate ────────────────────────────────────────────
app.post('/api/import/:id/simulate', extractUsuario, async (req, res) => {
    try {
        const { id } = req.params;
        const job = await prisma.import_jobs.findUnique({ where: { id } });
        if (!job) return res.status(404).json({ error: 'Job não encontrado' });

        const { duplicate_action = 'ignore' } = req.body;

        const [validRows, duplicateRows] = await Promise.all([
            prisma.import_staging.count({ where: { import_id: id, status: 'valid' } }),
            prisma.import_staging.count({ where: { import_id: id, status: 'duplicate' } }),
        ]);

        const invalidRows = job.error_rows;

        let companies_would_create = validRows;
        let contacts_would_create = 0;
        let ignored = invalidRows;

        // Contar contatos potenciais (linhas com contato_nome ou contato_email)
        const withContact = await prisma.import_staging.count({
            where: {
                import_id: id,
                status: 'valid',
                OR: [
                    { contato_nome: { not: '' } },
                    { contato_email: { not: '' } },
                ],
            },
        });
        contacts_would_create = withContact;

        if (duplicate_action === 'ignore') {
            ignored += duplicateRows;
        } else if (duplicate_action === 'update') {
            companies_would_create += duplicateRows; // atualiza existentes
        } else if (duplicate_action === 'create') {
            companies_would_create += duplicateRows; // cria mesmo duplicado
        }

        await prisma.import_jobs.update({
            where: { id },
            data: { duplicate_action },
        });

        res.json({
            import_id: id,
            companies_would_create,
            contacts_would_create,
            duplicate_rows: duplicateRows,
            invalid_rows: invalidRows,
            ignored,
            duplicate_action,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── POST /api/import/:id/execute ─────────────────────────────────────────────
app.post('/api/import/:id/execute', extractUsuario, async (req, res) => {
    try {
        const { id } = req.params;
        const job = await prisma.import_jobs.findUnique({ where: { id } });
        if (!job) return res.status(404).json({ error: 'Job não encontrado' });
        if (job.status === 'blocked') return res.status(400).json({ error: 'Importação bloqueada por baixa qualidade dos dados.' });

        await prisma.import_jobs.update({ where: { id }, data: { status: 'executing' } });

        const duplicate_action = job.duplicate_action || 'ignore';

        // Linhas a processar
        const statusFilter = ['valid'];
        if (duplicate_action !== 'ignore') statusFilter.push('duplicate');

        const rows = await prisma.import_staging.findMany({
            where: { import_id: id, status: { in: statusFilter } },
            orderBy: { row_number: 'asc' },
        });

        const BATCH_SIZE = 100;
        let companies_created = 0;
        let contacts_created = 0;
        let errors = 0;
        let cnpj_conflicts = 0; // empresas cujo CNPJ já existia — não criadas, contato vinculado à existente

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            // try/catch por LINHA — 1 erro não derruba o batch inteiro
            for (const row of batch) {
                try {
                    await prisma.$transaction(async (tx) => {
                        let companyId;

                        if (row.status === 'duplicate' && duplicate_action === 'update') {
                            // Atualiza empresa existente por nome ou CNPJ
                            const existing = await tx.companies.findFirst({
                                where: {
                                    OR: [
                                        { Nome_da_empresa: { equals: row.empresa, mode: 'insensitive' } },
                                        ...(row.cnpj ? [{ CNPJ_da_empresa: row.cnpj }] : []),
                                    ]
                                },
                            });
                            if (existing) {
                                await tx.companies.update({
                                    where: { id: existing.id },
                                    data: {
                                        ...(row.segmento && { Segmento_da_empresa: row.segmento }),
                                        ...(row.cidade && { Cidade: row.cidade }),
                                        ...(row.estado && { Estado: row.estado }),
                                        ...(row.site && { Site: row.site }),
                                        ...(row.tipo_empresa && { Tipo_de_empresa: row.tipo_empresa }),
                                        updatedAt: new Date(),
                                    },
                                });
                                companyId = existing.id;
                                companies_created++;
                            }
                        } else if (row.status === 'duplicate' && duplicate_action === 'ignore') {
                            // Ignora a empresa, mas ainda linka o contato à empresa existente
                            const existing = await tx.companies.findFirst({
                                where: {
                                    OR: [
                                        { Nome_da_empresa: { equals: row.empresa, mode: 'insensitive' } },
                                        ...(row.cnpj ? [{ CNPJ_da_empresa: row.cnpj }] : []),
                                    ]
                                },
                            });
                            if (existing) companyId = existing.id;
                        } else {
                            // ── Segunda linha de defesa: checar CNPJ antes de criar ──
                            // Mesmo que a validação não tenha pego, o execute nunca cria duplicata de CNPJ
                            let cnpjConflict = null;
                            if (row.cnpj) {
                                cnpjConflict = await tx.companies.findFirst({
                                    where: { CNPJ_da_empresa: row.cnpj },
                                });
                            }

                            if (cnpjConflict) {
                                // CNPJ já existe — usar empresa existente e avisar
                                console.warn(`[import/execute] CNPJ ${row.cnpj} já pertence a '${cnpjConflict.Nome_da_empresa}'. Empresa '${row.empresa}' NÃO criada. Contato será vinculado à empresa existente.`);
                                companyId = cnpjConflict.id;
                                // Registrar o aviso no staging para o usuário ver
                                await prisma.import_staging.update({
                                    where: { id: row.id },
                                    data: {
                                        error_message: `Não foi possível criar '${row.empresa}' — CNPJ ${row.cnpj} já pertence à empresa '${cnpjConflict.Nome_da_empresa}'. Contato vinculado à empresa existente.`,
                                    },
                                }).catch(() => { });
                                cnpj_conflicts++;
                            } else {
                                // Cria nova empresa normalmente
                                const company = await tx.companies.create({
                                    data: {
                                        id: randomUUID(),
                                        Nome_da_empresa: row.empresa || 'Sem nome',
                                        CNPJ_da_empresa: row.cnpj || null,
                                        Tipo_de_empresa: row.tipo_empresa || null,
                                        Segmento_da_empresa: row.segmento || null,
                                        Cidade: row.cidade || null,
                                        Estado: row.estado || null,
                                        Site: row.site || null,
                                        Status: row.status_empresa || 'Prospect',
                                        updatedAt: new Date(),
                                    },
                                });
                                companyId = company.id;
                                companies_created++;
                            }
                        }

                        // ── Cria contato principal (se houver dados) ──
                        const criarContato = async (ct, cid) => {
                            if (!cid || (!ct.contato_nome && !ct.contato_email && !ct.Nome_do_contato && !ct.Email_1)) return;
                            await tx.contacts.create({
                                data: {
                                    id: randomUUID(),
                                    companyId: cid,
                                    Nome_do_contato: ct.contato_nome || ct.Nome_do_contato || null,
                                    Email_1: ct.contato_email || ct.Email_1 || null,
                                    WhatsApp: ct.contato_telefone || ct.WhatsApp || null,
                                    Cargo_do_contato: ct.cargo || ct.Cargo_do_contato || null,
                                    Departamento_do_contato: ct.departamento || ct.Departamento_do_contato || null,
                                    LinkedIn: ct.linkedin || ct.LinkedIn || null,
                                    updatedAt: new Date(),
                                },
                            });
                            contacts_created++;
                        };

                        if (companyId && (row.contato_nome || row.contato_email)) {
                            await criarContato(row, companyId);
                        }

                        // Contatos extras (múltiplos contatos por empresa)
                        if (companyId && row.contatos_extra_json) {
                            try {
                                const extras = JSON.parse(row.contatos_extra_json);
                                for (const ct of extras) {
                                    await criarContato(ct, companyId);
                                }
                            } catch (e) { console.warn('[import/execute] contatos_extra_json inválido:', e.message); }
                        }

                        // ── Cria produto DATI (principal e extras) ──
                        const criarProduto = async (prod, cid) => {
                            if (!cid || !prod.produto_dati) return;
                            try {
                                await tx.company_products.create({
                                    data: {
                                        id: randomUUID(),
                                        companyId: cid,
                                        Produto_DATI: prod.produto_dati || prod.Produto_DATI,
                                        Tipo_cobranca: prod.tipo_cobranca || prod.Tipo_cobranca || null,
                                        Valor_unitario: prod.valor_unitario != null ? prod.valor_unitario : null,
                                        Valor_minimo: prod.valor_minimo != null ? prod.valor_minimo : null,
                                        Cobranca_setup: prod.cobranca_setup || prod.Cobranca_setup || null,
                                        Valor_setup: prod.valor_setup != null ? prod.valor_setup : null,
                                        Qtd_usuarios: prod.qtd_usuarios || prod.Qtd_usuarios || null,
                                        Valor_usuario_adicional: prod.valor_usuario_adic != null ? prod.valor_usuario_adic : null,
                                        Total_horas_hd: prod.total_horas_hd != null ? Math.round(prod.total_horas_hd) : null,
                                        Valor_adic_hd: prod.valor_adic_hd != null ? prod.valor_adic_hd : null,
                                        updatedAt: new Date(),
                                    },
                                });
                            } catch (prodErr) {
                                console.warn('[import/execute] produto ignorado:', prodErr.message);
                            }
                        };

                        if (companyId && row.produto_dati) {
                            await criarProduto(row, companyId);
                        }

                        // Produtos extras (múltiplos produtos por empresa)
                        if (companyId && row.produtos_extra_json) {
                            try {
                                const extras = JSON.parse(row.produtos_extra_json);
                                for (const prod of extras) {
                                    await criarProduto(prod, companyId);
                                }
                            } catch (e) { console.warn('[import/execute] produtos_extra_json inválido:', e.message); }
                        }

                    });
                } catch (rowErr) {
                    console.error(`[import/execute] Linha ${row.row_number} (${row.empresa}) falhou:`, rowErr.message);
                    errors++;
                    // Atualizar staging com o erro para o usuário ver
                    await prisma.import_staging.update({
                        where: { id: row.id },
                        data: { error_message: `Erro ao importar: ${rowErr.message}` },
                    }).catch(() => { });
                }
            }
        }

        // Registrar log
        await prisma.import_logs.create({
            data: {
                import_id: id,
                executed_by: req.body.user || 'sistema',
                companies_created,
                contacts_created,
                errors,
            },
        });

        await prisma.import_jobs.update({
            where: { id },
            data: { status: 'done' },
        });

        // ── Audit log: importação em massa concluída ─────────────────────────
        audit.log(prisma, {
            actor:       req.usuarioAtual,
            action:      'IMPORT',
            entity_type: 'import',
            entity_id:   id,
            entity_name: `Importação #${id.slice(0, 8)}`,
            description: `Importação em massa concluída: ${companies_created} empresa(s) criada(s), ${contacts_created} contato(s), ${errors} erro(s)${cnpj_conflicts > 0 ? `, ${cnpj_conflicts} conflito(s) de CNPJ ignorado(s)` : ''}`,
            meta:        { companies_created, contacts_created, errors, cnpj_conflicts, import_id: id },
        });

        res.json({ import_id: id, companies_created, contacts_created, errors, cnpj_conflicts, status: 'done' });
    } catch (err) {
        console.error('[import/execute]', err);
        await prisma.import_jobs.update({ where: { id: req.params.id }, data: { status: 'error' } }).catch(() => { });
        res.status(500).json({ error: err.message });
    }
});

// ── DELETE /api/import/:id ────────────────────────────────────────────────────
app.delete('/api/import/:id', extractUsuario, async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.import_jobs.delete({ where: { id } });
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// =============================================================================
// MÓDULO DE ATIVIDADES
// Timeline operacional da empresa — registra interações de todos os departamentos
// =============================================================================

// ENUM de tipos de atividade permitidos
const ACTIVITY_TYPES = ['Comentário', 'Reunião', 'Chamados HD', 'Chamados CS', 'Ação necessária'];

// Include padrão para todas as queries de atividades
const ACTIVITY_INCLUDE = {
    activity_assignees: true,
    activity_next_step_responsibles: true,
    activity_attachments: true,
    activity_mentions: true,
    companies: { select: { id: true, Nome_da_empresa: true } },
};

/**
 * Enriquece uma lista de atividades com o nome dos usuários responsáveis e do criador.
 * Faz um único lookup em lote na tabela `users` para todos os IDs envolvidos.
 */
async function enrichActivitiesWithUserNames(activities) {
    if (!activities || activities.length === 0) return activities;

    // Coletar todos os user_ids únicos presentes nas atividades
    const userIds = new Set();
    for (const act of activities) {
        if (act.created_by_user_id) userIds.add(act.created_by_user_id);
        (act.activity_assignees || []).forEach(r => userIds.add(r.user_id));
        (act.activity_next_step_responsibles || []).forEach(r => userIds.add(r.user_id));
    }

    if (userIds.size === 0) return activities;

    // Buscar todos os nomes de uma vez
    const users = await prisma.users.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true, nome: true, avatar: true },
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    // Enriquecer cada atividade
    return activities.map(act => ({
        ...act,
        created_by_user: userMap[act.created_by_user_id] || null,
        activity_assignees: (act.activity_assignees || []).map(r => ({
            ...r,
            user_nome: userMap[r.user_id]?.nome || r.user_id,
            user_avatar: userMap[r.user_id]?.avatar || null,
        })),
        activity_next_step_responsibles: (act.activity_next_step_responsibles || []).map(r => ({
            ...r,
            user_nome: userMap[r.user_id]?.nome || r.user_id,
        })),
    }));
}

// ── GET /api/activities (GLOBAL — para "Minhas Tarefas") ─────────────────────
app.get('/api/activities', extractUsuario, async (req, res) => {
    try {
        const { assignee, status, priority, company_id, page = 1, pageSize = 50 } = req.query;
        const where = {};
        if (status) where.status = status;
        if (priority) where.priority = priority;
        if (company_id) where.company_id = company_id;

        if (assignee === 'me') {
            where.OR = [
                { created_by_user_id: req.usuarioAtual.id },
                { activity_assignees: { some: { user_id: req.usuarioAtual.id } } },
            ];
        } else if (assignee) {
            where.activity_assignees = { some: { user_id: assignee } };
        }

        const skip = (parseInt(page) - 1) * parseInt(pageSize);
        const activities = await prisma.activities.findMany({
            where,
            include: ACTIVITY_INCLUDE,
            orderBy: { activity_datetime: 'asc' },
            skip,
            take: parseInt(pageSize),
        });
        const enrichedActivities = await enrichActivitiesWithUserNames(activities);
        res.json(enrichedActivities);
    } catch (error) {
        console.error('[GET /api/activities]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ── POST /api/activities (GLOBAL — criação sem empresa vinculada) ─────────────
app.post('/api/activities', extractUsuario, async (req, res) => {
    try {
        const {
            activity_type,
            title,
            description,
            department,
            activity_datetime,
            status,
            time_spent_minutes,
            next_step_title,
            next_step_date,
            priority,
            reminder_at,
            reminder_email = false,
            reminder_whatsapp = false,
            google_meet_link,
            company_id = null,
            assignees = [],
            next_step_responsibles = [],
            mentions = [],
            // Novos campos
            notify_on_assign = false,
            send_invite_email = false,
            send_summary_email = false,
            send_recording_email = false,
            recording_url = null,
            next_step_reminder_email = false,
        } = req.body;

        if (!activity_type || !ACTIVITY_TYPES.includes(activity_type)) {
            return res.status(400).json({ error: `activity_type inválido. Valores aceitos: ${ACTIVITY_TYPES.join(', ')}` });
        }
        if (!title?.trim()) return res.status(400).json({ error: 'title é obrigatório' });

        const activityId = randomUUID();

        await prisma.activities.create({
            data: {
                id: activityId,
                company_id: company_id || null,
                activity_type,
                title: title.trim(),
                description: description?.trim() || null,
                department: department || null,
                created_by_user_id: req.usuarioAtual.id,
                activity_datetime: activity_datetime ? new Date(activity_datetime) : null,
                status: status || null,
                time_spent_minutes: time_spent_minutes ? parseInt(time_spent_minutes) : null,
                next_step_title: next_step_title?.trim() || null,
                next_step_date: next_step_date ? new Date(next_step_date) : null,
                priority: priority || null,
                reminder_at: reminder_at ? new Date(reminder_at) : null,
                reminder_email: !!reminder_email,
                reminder_whatsapp: !!reminder_whatsapp,
                google_meet_link: google_meet_link || null,
                // Novos campos
                notify_on_assign: !!notify_on_assign,
                send_invite_email: !!send_invite_email,
                send_summary_email: !!send_summary_email,
                send_recording_email: !!send_recording_email,
                recording_url: recording_url || null,
                next_step_reminder_email: !!next_step_reminder_email,
            }
        });

        if (assignees.length > 0) {
            await prisma.activity_assignees.createMany({
                data: assignees.map(uid => ({ id: randomUUID(), activity_id: activityId, user_id: String(uid) }))
            });
        }
        if (next_step_responsibles.length > 0) {
            await prisma.activity_next_step_responsibles.createMany({
                data: next_step_responsibles.map(uid => ({ id: randomUUID(), activity_id: activityId, user_id: String(uid) }))
            });
        }
        if (mentions.length > 0) {
            await prisma.activity_mentions.createMany({
                data: mentions.map(uid => ({ id: randomUUID(), activity_id: activityId, user_id: String(uid) }))
            });
        }

        // ── Gatilhos de Notificação Imediata ──────────────────────────────────
        const createdBy = req.usuarioAtual.id;

        // 1. Notificar ao salvar (imediato, para todos os participantes)
        if (assignees.length > 0) {
            for (const uid of assignees) {
                if (uid === createdBy) continue;
                const isDirectEmail = uid.includes('@');
                const jobOpts = isDirectEmail
                    ? {}  // E-mails diretos: sem singleton, permite reenvio
                    : { singletonKey: `assigned-${activityId}-${uid}` };
                await boss.send('send-notification', {
                    type: 'task-assigned',
                    activityId,
                    userId: uid,
                    extra: { atribuidoPorId: createdBy }
                }, jobOpts);
            }
        }

        // 2. Convite de Reunião
        const isMeeting = activity_type === 'Reunião';
        const isFuture = activity_datetime && new Date(activity_datetime) > new Date();
        if (isMeeting && send_invite_email && isFuture && assignees.length > 0) {
            for (const uid of assignees) {
                await boss.send('send-notification', {
                    type: 'meeting-invite',
                    activityId,
                    userId: uid
                }, { singletonKey: `invite-${activityId}-${uid}` });
            }
            await prisma.activities.update({
                where: { id: activityId },
                data: { invite_sent: true }
            });
        }

        const full = await prisma.activities.findUnique({ where: { id: activityId }, include: ACTIVITY_INCLUDE });

        // ── Audit log: criação de atividade global (Minhas Atividades) ──────────
        audit.log(prisma, {
            actor:       req.usuarioAtual,
            action:      'CREATE',
            entity_type: 'activity',
            entity_id:   activityId,
            entity_name: title.trim(),
            description: `Criou a atividade "${title.trim()}"`,
            company_id:  company_id || null,
        });

        console.log(`[POST /api/activities] ✅ Atividade global criada: ${activityId}`);
        const fullEnriched = (await enrichActivitiesWithUserNames([full]))[0];
        res.status(201).json(fullEnriched);
    } catch (error) {
        console.error('[POST /api/activities]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ── GET /api/companies/:id/activities ─────────────────────────────────────────
app.get('/api/companies/:id/activities', extractUsuario, async (req, res) => {
    try {
        const { id } = req.params;
        const { type, department, status, assignee, dateFrom, dateTo, page = 1, pageSize = 50 } = req.query;

        const where = { company_id: id };
        if (type) where.activity_type = type;
        if (department) where.department = department;
        if (status) where.status = status;
        if (dateFrom || dateTo) {
            where.activity_datetime = {};
            if (dateFrom) where.activity_datetime.gte = new Date(dateFrom);
            if (dateTo) where.activity_datetime.lte = new Date(dateTo + 'T23:59:59');
        }
        if (assignee) {
            where.activity_assignees = { some: { user_id: { contains: assignee, mode: 'insensitive' } } };
        }

        const skip = (parseInt(page) - 1) * parseInt(pageSize);
        const activities = await prisma.activities.findMany({
            where,
            include: ACTIVITY_INCLUDE,
            orderBy: { activity_datetime: 'desc' },
            skip,
            take: parseInt(pageSize),
        });

        const enrichedActivities = await enrichActivitiesWithUserNames(activities);
        res.json(enrichedActivities);
    } catch (error) {
        console.error('[GET /activities]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ── POST /api/companies/:id/activities ────────────────────────────────────────
app.post('/api/companies/:id/activities', extractUsuario, async (req, res) => {
    try {
        const { id: companyId } = req.params;
        const {
            activity_type,
            title,
            description,
            department,
            activity_datetime,
            status,
            time_spent_minutes,
            next_step_title,
            next_step_date,
            priority,
            reminder_at,
            reminder_email = false,
            reminder_whatsapp = false,
            google_meet_link,
            assignees = [],
            next_step_responsibles = [],
            mentions = [],
            // Novos campos
            notify_on_assign = false,
            send_invite_email = false,
            send_summary_email = false,
            send_recording_email = false,
            recording_url = null,
            next_step_reminder_email = false,
        } = req.body;

        if (!activity_type || !ACTIVITY_TYPES.includes(activity_type)) {
            return res.status(400).json({ error: `activity_type inválido. Valores aceitos: ${ACTIVITY_TYPES.join(', ')}` });
        }
        if (!title?.trim()) return res.status(400).json({ error: 'title é obrigatório' });

        const company = await prisma.companies.findUnique({ where: { id: companyId }, select: { id: true } });
        if (!company) return res.status(404).json({ error: 'Empresa não encontrada' });

        const activityId = randomUUID();

        await prisma.activities.create({
            data: {
                id: activityId,
                company_id: companyId,
                activity_type,
                title: title.trim(),
                description: description?.trim() || null,
                department: department || null,
                created_by_user_id: req.usuarioAtual.id, // sempre do usuário autenticado
                activity_datetime: activity_datetime ? new Date(activity_datetime) : null,
                status: status || null,
                time_spent_minutes: time_spent_minutes ? parseInt(time_spent_minutes) : null,
                next_step_title: next_step_title?.trim() || null,
                next_step_date: next_step_date ? new Date(next_step_date) : null,
                priority: priority || null,
                reminder_at: reminder_at ? new Date(reminder_at) : null,
                reminder_email: !!reminder_email,
                reminder_whatsapp: !!reminder_whatsapp,
                google_meet_link: google_meet_link || null,
                // Novos campos
                notify_on_assign: !!notify_on_assign,
                send_invite_email: !!send_invite_email,
                send_summary_email: !!send_summary_email,
                send_recording_email: !!send_recording_email,
                recording_url: recording_url || null,
                next_step_reminder_email: !!next_step_reminder_email,
            }
        });

        if (assignees.length > 0) {
            await prisma.activity_assignees.createMany({
                data: assignees.map(uid => ({ id: randomUUID(), activity_id: activityId, user_id: String(uid) }))
            });
        }
        if (next_step_responsibles.length > 0) {
            await prisma.activity_next_step_responsibles.createMany({
                data: next_step_responsibles.map(uid => ({ id: randomUUID(), activity_id: activityId, user_id: String(uid) }))
            });
        }
        if (mentions.length > 0) {
            await prisma.activity_mentions.createMany({
                data: mentions.map(uid => ({ id: randomUUID(), activity_id: activityId, user_id: String(uid) }))
            });
            // Enviar email imediato a cada mencionado
            if (isEmailConfigured()) {
                const mencionados = await prisma.users.findMany({ where: { id: { in: mentions }, ativo: true } });
                for (const u of mencionados) {
                    await sendEmail({
                        to:       u.email,
                        template: 'mention',
                        data:     { activity: { title, description }, mencionadoPor: req.usuarioAtual },
                        tag:      `mencao-${activityId}-${u.id}`,
                        dedupKey: `mencao-${activityId}-${u.id}`,
                    });
                }
            }
        }

        // ── Gatilhos de Notificação Imediata ──────────────────────────────────
        const createdBy = req.usuarioAtual.id;
        const createdByNome = req.usuarioAtual.nome || 'Alguém';
        const activityTitle = title.trim();

        // 1. Notificação in-app: participante marcado
        if (assignees.length > 0) {
            const notifData = assignees
                .filter(uid => uid !== createdBy)
                .map(uid => ({
                    id: randomUUID(),
                    user_id: uid,
                    type: 'mentioned',
                    activity_id: activityId,
                    title: 'Você foi marcado em uma atividade',
                    message: `${createdByNome} te marcou em: "${activityTitle}"`,
                }));
            if (notifData.length > 0) {
                await prisma.notifications.createMany({ data: notifData });
            }
        }

        // 2. Notificação in-app: responsável do próximo passo
        if (next_step_responsibles.length > 0) {
            const notifData = next_step_responsibles
                .filter(uid => uid !== createdBy)
                .map(uid => ({
                    id: randomUUID(),
                    user_id: uid,
                    type: 'next-step-assigned',
                    activity_id: activityId,
                    title: 'Você é responsável pelo próximo passo',
                    message: `${createdByNome} definiu você como responsável pelo próximo passo de: "${activityTitle}"`,
                }));
            if (notifData.length > 0) {
                await prisma.notifications.createMany({ data: notifData });
            }
        }

        // 3. Notificar ao salvar (e-mail via job queue para todos os participantes)
        if (assignees.length > 0) {
            for (const uid of assignees) {
                if (uid === createdBy) continue;
                const isDirectEmail = uid.includes('@');
                const jobOpts = isDirectEmail
                    ? {}  // E-mails diretos: sem singleton, permite reenvio
                    : { singletonKey: `assigned-${activityId}-${uid}` };
                await boss.send('send-notification', {
                    type: 'task-assigned',
                    activityId,
                    userId: uid,
                    extra: { atribuidoPorId: createdBy }
                }, jobOpts);
            }
        }

        // 2. Convite de Reunião
        const isMeeting = activity_type === 'Reunião';
        const isFuture = activity_datetime && new Date(activity_datetime) > new Date();
        if (isMeeting && send_invite_email && isFuture && assignees.length > 0) {
            for (const uid of assignees) {
                await boss.send('send-notification', {
                    type: 'meeting-invite',
                    activityId,
                    userId: uid
                }, { singletonKey: `invite-${activityId}-${uid}` });
            }
            await prisma.activities.update({
                where: { id: activityId },
                data: { invite_sent: true }
            });
        }

        const full = await prisma.activities.findUnique({ where: { id: activityId }, include: ACTIVITY_INCLUDE });

        // ── Audit log: criação de atividade vinculada à empresa ──────────────────
        audit.log(prisma, {
            actor:       req.usuarioAtual,
            action:      'CREATE',
            entity_type: 'activity',
            entity_id:   activityId,
            entity_name: title.trim(),
            description: `Criou a atividade "${title.trim()}"`,
            company_id:  companyId,
        });

        console.log(`[POST /activities] ✅ Atividade criada: ${activityId}`);
        const fullEnriched = (await enrichActivitiesWithUserNames([full]))[0];
        res.status(201).json(fullEnriched);
    } catch (error) {
        console.error('[POST /activities]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ── PUT /api/activities/:activityId ──────────────────────────────────────────
app.put('/api/activities/:activityId', extractUsuario, async (req, res) => {
    try {
        const { activityId } = req.params;
        const {
            activity_type,
            title,
            description,
            department,
            activity_datetime,
            status,
            time_spent_minutes,
            next_step_title,
            next_step_date,
            priority,
            reminder_at,
            reminder_email,
            reminder_whatsapp,
            google_meet_link,
            assignees,
            next_step_responsibles,
            mentions,
            // Novos campos
            notify_on_assign,
            send_invite_email,
            send_summary_email,
            send_recording_email,
            recording_url,
            next_step_reminder_email,
        } = req.body;

        const existing = await prisma.activities.findUnique({ 
            where: { id: activityId },
            include: { activity_assignees: true, activity_next_step_responsibles: true }
        });
        if (!existing) return res.status(404).json({ error: 'Atividade não encontrada' });

        if (activity_type && !ACTIVITY_TYPES.includes(activity_type)) {
            return res.status(400).json({ error: `activity_type inválido` });
        }

        // Se reminder_at mudou e já foi enviado, resetar reminder_sent
        const newReminderAt = reminder_at !== undefined ? (reminder_at ? new Date(reminder_at) : null) : existing.reminder_at;
        const reminderChanged = newReminderAt?.toISOString() !== existing.reminder_at?.toISOString();

        await prisma.activities.update({
            where: { id: activityId },
            data: {
                activity_type: activity_type || existing.activity_type,
                title: title?.trim() || existing.title,
                description: description !== undefined ? description?.trim() || null : existing.description,
                department: department !== undefined ? department || null : existing.department,
                activity_datetime: activity_datetime ? new Date(activity_datetime) : existing.activity_datetime,
                status: status !== undefined ? status || null : existing.status,
                time_spent_minutes: time_spent_minutes !== undefined ? (time_spent_minutes ? parseInt(time_spent_minutes) : null) : existing.time_spent_minutes,
                next_step_title: next_step_title !== undefined ? next_step_title?.trim() || null : existing.next_step_title,
                next_step_date: next_step_date !== undefined ? (next_step_date ? new Date(next_step_date) : null) : existing.next_step_date,
                priority: priority !== undefined ? priority || null : existing.priority,
                reminder_at: newReminderAt,
                reminder_email: reminder_email !== undefined ? !!reminder_email : existing.reminder_email,
                reminder_whatsapp: reminder_whatsapp !== undefined ? !!reminder_whatsapp : existing.reminder_whatsapp,
                reminder_sent: reminderChanged ? false : existing.reminder_sent,
                google_meet_link: google_meet_link !== undefined ? google_meet_link || null : existing.google_meet_link,
                // Novos campos
                notify_on_assign: notify_on_assign !== undefined ? !!notify_on_assign : existing.notify_on_assign,
                send_invite_email: send_invite_email !== undefined ? !!send_invite_email : existing.send_invite_email,
                send_summary_email: send_summary_email !== undefined ? !!send_summary_email : existing.send_summary_email,
                send_recording_email: send_recording_email !== undefined ? !!send_recording_email : existing.send_recording_email,
                recording_url: recording_url !== undefined ? recording_url || null : existing.recording_url,
                next_step_reminder_email: next_step_reminder_email !== undefined ? !!next_step_reminder_email : existing.next_step_reminder_email,
            }
        });

        if (assignees !== undefined) {
            await prisma.activity_assignees.deleteMany({ where: { activity_id: activityId } });
            if (assignees.length > 0) {
                await prisma.activity_assignees.createMany({
                    data: assignees.map(uid => ({ id: randomUUID(), activity_id: activityId, user_id: String(uid) }))
                });
            }
        }
        if (next_step_responsibles !== undefined) {
            await prisma.activity_next_step_responsibles.deleteMany({ where: { activity_id: activityId } });
            if (next_step_responsibles.length > 0) {
                await prisma.activity_next_step_responsibles.createMany({
                    data: next_step_responsibles.map(uid => ({ id: randomUUID(), activity_id: activityId, user_id: String(uid) }))
                });
            }
        }
        if (mentions !== undefined) {
            await prisma.activity_mentions.deleteMany({ where: { activity_id: activityId } });
            if (mentions.length > 0) {
                await prisma.activity_mentions.createMany({
                    data: mentions.map(uid => ({ id: randomUUID(), activity_id: activityId, user_id: String(uid) }))
                });
            }
        }

        // ── Gatilhos de Notificação no Update ────────────────────────────────
        const currentAssignees = assignees || existing.activity_assignees.map(a => a.user_id);
        const userIds = [...new Set([existing.created_by_user_id, ...currentAssignees].filter(Boolean))];

        // 1. Resumo pós-conclusão
        const isConcluida = status === 'Concluída';
        const wasNotConcluida = existing.status !== 'Concluída';
        if (isConcluida && wasNotConcluida && (send_summary_email || existing.send_summary_email) && !existing.summary_sent) {
            for (const uid of userIds) {
                await boss.send('send-notification', {
                    type: 'meeting-summary',
                    activityId,
                    userId: uid
                }, { singletonKey: `summary-${activityId}-${uid}` });
            }
            await prisma.activities.update({
                where: { id: activityId },
                data: { summary_sent: true }
            });
        }

        // 2. Gravação disponível
        const recordingNowAvailable = recording_url && !existing.recording_url;
        if (recordingNowAvailable && (send_recording_email || existing.send_recording_email)) {
            for (const uid of userIds) {
                await boss.send('send-notification', {
                    type: 'recording',
                    activityId,
                    userId: uid
                }, { singletonKey: `recording-${activityId}-${uid}` });
            }
            await prisma.activities.update({
                where: { id: activityId },
                data: { recording_sent: true }
            });
        }

        // ── Notificações in-app no Update ─────────────────────────────────────
        const updaterNome = req.usuarioAtual.nome || 'Alguém';
        const updatedTitle = (title?.trim() || existing.title);

        // Participantes novos (adicionados nesta edição)
        if (assignees !== undefined && assignees.length > 0) {
            const oldAssigneeIds = existing.activity_assignees?.map(a => a.user_id) || [];
            const newAssignees = assignees.filter(uid => !oldAssigneeIds.includes(uid) && uid !== req.usuarioAtual.id);
            if (newAssignees.length > 0) {
                await prisma.notifications.createMany({
                    data: newAssignees.map(uid => ({
                        id: randomUUID(),
                        user_id: uid,
                        type: 'mentioned',
                        activity_id: activityId,
                        title: 'Você foi marcado em uma atividade',
                        message: `${updaterNome} te marcou em: "${updatedTitle}"`,
                    }))
                });
            }
        }

        // Responsáveis do próximo passo novos (adicionados nesta edição)
        if (next_step_responsibles !== undefined && next_step_responsibles.length > 0) {
            const oldRespIds = existing.activity_next_step_responsibles?.map(r => r.user_id) || [];
            const newResps = next_step_responsibles.filter(uid => !oldRespIds.includes(uid) && uid !== req.usuarioAtual.id);
            if (newResps.length > 0) {
                await prisma.notifications.createMany({
                    data: newResps.map(uid => ({
                        id: randomUUID(),
                        user_id: uid,
                        type: 'next-step-assigned',
                        activity_id: activityId,
                        title: 'Você é responsável pelo próximo passo',
                        message: `${updaterNome} definiu você como responsável pelo próximo passo de: "${updatedTitle}"`,
                    }))
                });
            }
        }

        const full = await prisma.activities.findUnique({ where: { id: activityId }, include: ACTIVITY_INCLUDE });

        // ── Audit log: atualização de atividade (kanban drag-drop, drawer, modal) ─
        const { description: auditDesc, meta: auditMeta } = audit.diff(
            existing,
            {
                activity_type: activity_type ?? existing.activity_type,
                title:         title?.trim() ?? existing.title,
                description:   description !== undefined ? description?.trim() || null : existing.description,
                department:    department !== undefined ? department || null : existing.department,
                status:        status !== undefined ? status || null : existing.status,
                priority:      priority !== undefined ? priority || null : existing.priority,
            },
            'activity',
            existing.title,
        );
        audit.log(prisma, {
            actor:       req.usuarioAtual,
            action:      'UPDATE',
            entity_type: 'activity',
            entity_id:   activityId,
            entity_name: existing.title,
            description: auditDesc,
            meta:        auditMeta,
            company_id:  existing.company_id || null,
        });

        console.log(`[PUT /activities/${activityId}] ✅ Atividade atualizada`);
        const fullEnriched = (await enrichActivitiesWithUserNames([full]))[0];
        res.json(fullEnriched);
    } catch (error) {
        console.error('[PUT /activities]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ── DELETE /api/activities/:activityId ───────────────────────────────────────
app.delete('/api/activities/:activityId', extractUsuario, async (req, res) => {
    try {
        const { activityId } = req.params;

        // Busca antes de deletar para registrar no audit
        const toDelete = await prisma.activities.findUnique({ where: { id: activityId }, select: { title: true, company_id: true } });

        await prisma.activities.delete({ where: { id: activityId } });

        // ── Audit log: exclusão de atividade ────────────────────────────────────
        audit.log(prisma, {
            actor:       req.usuarioAtual,
            action:      'DELETE',
            entity_type: 'activity',
            entity_id:   activityId,
            entity_name: toDelete?.title || activityId,
            description: `Excluiu a atividade "${toDelete?.title || activityId}"`,
            company_id:  toDelete?.company_id || null,
        });

        console.log(`[DELETE /activities/${activityId}] ✅ Atividade excluída`);
        res.status(204).send();
    } catch (error) {
        console.error('[DELETE /activities]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ── POST /api/activities/:id/attachments (upload de arquivo) ─────────────────
const multerActivity = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

app.post('/api/activities/:id/attachments', extractUsuario, multerActivity.single('file'), async (req, res) => {
    try {
        const { id: activityId } = req.params;
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

        const activity = await prisma.activities.findUnique({ where: { id: activityId }, select: { id: true } });
        if (!activity) return res.status(404).json({ error: 'Atividade não encontrada' });

        let fileUrl = '';
        const fileName = req.file.originalname;
        const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
        const fileType = req.file.mimetype.startsWith('video') ? 'video'
            : req.file.mimetype.startsWith('image') ? 'image'
            : 'document';

        if (supabase) {
            const storagePath = `activities/${activityId}/${randomUUID()}-${fileName}`;
            const { data, error: upError } = await supabase.storage
                .from('activity-attachments')
                .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

            if (upError) throw new Error(`Supabase upload error: ${upError.message}`);
            const { data: urlData } = supabase.storage.from('activity-attachments').getPublicUrl(storagePath);
            fileUrl = urlData.publicUrl;
        } else {
            // Fallback sem Supabase: retorne aviso
            return res.status(503).json({ error: 'Supabase não configurado. Configure SUPABASE_URL e SUPABASE_SERVICE_KEY.' });
        }

        const attachment = await prisma.activity_attachments.create({
            data: {
                id: randomUUID(),
                activity_id: activityId,
                file_url: fileUrl,
                file_name: fileName,
                file_type: fileType,
                file_size: req.file.size,
                uploaded_by: req.usuarioAtual.id,
            }
        });

        console.log(`[POST /activities/${activityId}/attachments] ✅ Arquivo: ${fileName}`);
        res.status(201).json(attachment);
    } catch (error) {
        console.error('[POST /attachments]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ── DELETE /api/activities/attachments/:attachmentId ─────────────────────────
app.delete('/api/activities/attachments/:attachmentId', extractUsuario, async (req, res) => {
    try {
        const { attachmentId } = req.params;
        const att = await prisma.activity_attachments.findUnique({ where: { id: attachmentId } });
        if (!att) return res.status(404).json({ error: 'Anexo não encontrado' });

        // Deletar do Supabase Storage
        if (supabase && att.file_url) {
            const urlParts = att.file_url.split('/activity-attachments/');
            if (urlParts[1]) {
                await supabase.storage.from('activity-attachments').remove([urlParts[1]]);
            }
        }

        await prisma.activity_attachments.delete({ where: { id: attachmentId } });
        console.log(`[DELETE /attachments/${attachmentId}] ✅ Anexo removido`);
        res.status(204).send();
    } catch (error) {
        console.error('[DELETE /attachments]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ── GET /api/activities/:activityId/time-logs ─────────────────────────────────
app.get('/api/activities/:activityId/time-logs', extractUsuario, async (req, res) => {
    try {
        const { activityId } = req.params;
        const logs = await prisma.activity_time_logs.findMany({
            where: { activity_id: activityId },
            orderBy: { started_at: 'asc' },
        });
        res.json(logs);
    } catch (error) {
        console.error('[GET /time-logs]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ── POST /api/activities/:activityId/time-logs ────────────────────────────────
app.post('/api/activities/:activityId/time-logs', extractUsuario, async (req, res) => {
    try {
        const { activityId } = req.params;
        const { started_at, duration_minutes, subject } = req.body;
        if (!started_at || !duration_minutes) {
            return res.status(400).json({ error: 'started_at e duration_minutes são obrigatórios' });
        }
        const log = await prisma.activity_time_logs.create({
            data: {
                id: randomUUID(),
                activity_id: activityId,
                started_at: new Date(started_at),
                duration_minutes: parseInt(duration_minutes),
                subject: subject?.trim() || null,
                created_by: req.usuarioAtual.id,
            }
        });
        console.log(`[POST /time-logs] ✅ Sessão criada: ${log.id}`);
        res.status(201).json(log);
    } catch (error) {
        console.error('[POST /time-logs]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ── PATCH /api/activities/time-logs/:logId (editar assunto) ───────────────────
app.patch('/api/activities/time-logs/:logId', extractUsuario, async (req, res) => {
    try {
        const { logId } = req.params;
        const { subject } = req.body;
        const log = await prisma.activity_time_logs.update({
            where: { id: logId },
            data: { subject: subject?.trim() || null },
        });
        res.json(log);
    } catch (error) {
        console.error('[PATCH /time-logs]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ── DELETE /api/activities/time-logs/:logId ───────────────────────────────────
app.delete('/api/activities/time-logs/:logId', extractUsuario, async (req, res) => {
    try {
        const { logId } = req.params;
        await prisma.activity_time_logs.delete({ where: { id: logId } });
        console.log(`[DELETE /time-logs/${logId}] ✅ Removido`);
        res.status(204).send();
    } catch (error) {
        console.error('[DELETE /time-logs]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ─── SPA Fallback (produção) — qualquer rota não-API retorna o index.html ────
// DEVE vir DEPOIS de todas as rotas /api e dos statics.
// Nota: Express moderno (path-to-regexp v8+) não aceita '*' — usamos regex.
if (IS_PROD) {
    app.get(/^(?!\/api).*/, (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'index.html'));
    });
}
app.use((err, req, res, next) => {
    console.error(`[GLOBAL ERROR] ${req.method} ${req.originalUrl}`);
    console.error(`  Status:`, err.status || 500);
    console.error(`  Message:`, err.message);
    if (err.type === 'entity.parse.failed') {
        console.error(`  Raw Body Context:`, err.body?.substring(0, 100));
    }
    console.error(`  Stack:`, err.stack);
    
    res.status(err.status || 500).json({
        error: err.message,
        type: err.type,
    });
});

app.listen(PORT, async () => {
    const env = process.env.NODE_ENV || 'development';
    console.log(`\n🚀 Journey rodando na porta ${PORT} — ${env}`);
    if (IS_PROD) {
        console.log(`🌐 URL de produção: ${process.env.ALLOWED_ORIGIN || 'https://journey-dati.railway.app'}`);
    } else {
        console.log(`📍 Local: http://localhost:${PORT}`);
    }
    console.log(`📌 Banco de Dados: ${IS_PROD ? 'PostgreSQL Railway' : 'PostgreSQL Local'}\n`);

    // Inicia o scheduler de testes (node-cron)
    try {
        await initScheduler();
    } catch (err) {
        console.warn('⚠️  Scheduler não inicializado:', err.message);
    }

    // Inicia a fila de jobs pg-boss
    try {
        await initQueue();
    } catch (err) {
        console.warn('⚠️  pg-boss não inicializado:', err.message);
    }
});

