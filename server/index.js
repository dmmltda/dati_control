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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

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

// ─── Resend (email) ──────────────────────────────────────────────────────────
const resend = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

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

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ─── Servir arquivos estáticos do frontend ───────────────────────────────────
// Em desenvolvimento: serve tudo da raiz do projeto
// Em produção (Railway): serve a partir da raiz também (index.html + css/ + js/)
app.use(express.static(path.join(__dirname, '..')));

// ─── Clerk Middleware ────────────────────────────────────────────────────────
// Injeta req.auth em todas as requisições. Não bloqueia por si só.
// As rotas protegidas usam requireAuth() individualmente.
app.use(clerkMiddleware({ secretKey: process.env.CLERK_SECRET_KEY }));

// Health Check — rota pública, sem autenticação
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Servidor Journey 10/10 operando!' });
});

// ─── Scheduler de Lembretes (node-cron) ────────────────────────────────────
// Roda a cada minuto e envia alertas de atividades com lembrete vencido
cron.schedule('* * * * *', async () => {
    try {
        const agora = new Date();
        const lembretes = await prisma.activities.findMany({
            where: {
                reminder_at: { lte: agora },
                reminder_sent: false,
                OR: [{ reminder_email: true }, { reminder_whatsapp: true }],
            },
            include: {
                activity_assignees: true,
                companies: { select: { id: true, Nome_da_empresa: true } },
            },
        });

        for (const act of lembretes) {
            const userIds = [...new Set([
                act.created_by_user_id,
                ...act.activity_assignees.map(a => a.user_id),
            ].filter(Boolean))];

            const usuarios = userIds.length > 0 ? await prisma.users.findMany({
                where: { id: { in: userIds }, ativo: true },
            }) : [];

            if (act.reminder_email && process.env.RESEND_API_KEY) {
                for (const u of usuarios) {
                    await resend.emails.send({
                        from: 'DATI Journey <noreply@dati.com.br>',
                        to: u.email,
                        subject: `🔔 Lembrete: ${act.title}`,
                        html: `
                            <h2>Lembrete de Atividade</h2>
                            <p><strong>${act.title}</strong></p>
                            <p>${act.description || ''}</p>
                            <p>Empresa: ${act.companies?.Nome_da_empresa || 'Nenhuma'}</p>
                            <p>Tipo: ${act.activity_type} | Status: ${act.status || '—'}</p>
                        `,
                    }).catch(e => console.error('[Resend]', e.message));
                }
            }

            if (act.reminder_whatsapp) {
                // Fase 2: integração Z-API
                console.log(`[WhatsApp PENDENTE] Lembrete para atividade ${act.id}: ${act.title}`);
            }

            await prisma.activities.update({
                where: { id: act.id },
                data: { reminder_sent: true },
            });
            console.log(`[Scheduler] ✅ Lembrete disparado: ${act.title}`);
        }
    } catch (e) {
        console.error('[Scheduler] Erro no cron de lembretes:', e.message);
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

// Retorna dados do usuário logado (usado pelo frontend após inicializar Clerk)
app.get('/api/me', extractUsuario, (req, res) => {
    res.json(req.usuarioAtual);
});

// Lista todos os usuários ativos (para dropdowns, filtros, etc.)
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

// =============================================================================
// CAMADA DE SANITIZAÇÃO — garante que nenhum campo inválido chega ao Prisma
// =============================================================================

/**
 * Lista completa de relações do modelo companies no schema Prisma.
 * NENHUM desses campos pode jamais entrar no prisma.companies.create() ou .update().
 */
const COMPANY_RELATIONS = new Set([
    'contacts', 'company_products', 'company_meetings', 'company_dashboards',
    'company_nps', 'company_notes', 'company_followups', 'company_tickets', 'test_logs'
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
        const companies = await prisma.companies.findMany({
            include: {
                company_products: {
                    include: { product_historico: true }
                },
                contacts: true,
                test_logs: true,
                company_meetings: true,
                company_dashboards: true,
                company_nps: true,
                company_tickets: true,
                company_notes: true,
                company_followups: true
            },
            orderBy: { updatedAt: 'desc' }
        });
        res.json(companies);
    } catch (error) {
        console.error('❌ ERRO REAL NA API /api/companies:');
        console.error(error);
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
                test_logs: true,
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

        // test_logs
        const testLogsPayload = Log_de_Testes ?? test_logs;
        if (testLogsPayload && testLogsPayload.length > 0) {
            await prisma.test_logs.createMany({
                data: testLogsPayload.map(t => ({
                    ...t,
                    id: randomUUID(),
                    companyId: companyId,
                    updatedAt: new Date()
                }))
            });
        }

        // ── PASSO 5: Retornar empresa completa com todas as relações ──────────────
        const fullCompany = await prisma.companies.findUnique({
            where: { id: companyId },
            include: {
                company_products: { include: { product_historico: true } },
                contacts: true,
                test_logs: true,
                company_meetings: true,
                company_dashboards: true,
                company_nps: true,
                company_tickets: true,
                company_notes: true,
                company_followups: true
            }
        });

        console.log(`[POST] ✅ Empresa criada: ${companyId}\n`);
        res.status(201).json(fullCompany);
    } catch (error) {
        console.error('❌ [POST /api/companies] Erro:', error.message);
        console.error(error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// PUT update company — versão blindada contra nested writes no Prisma
app.put('/api/companies/:id', extractUsuario, async (req, res) => {
    try {
        const { id } = req.params;
        const payload = req.body;

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

        // test_logs
        const testLogsPayload = Log_de_Testes ?? test_logs;
        if (testLogsPayload !== undefined) {
            console.log(`[PUT] Sincronizando test_logs (${(testLogsPayload || []).length} itens)...`);
            await prisma.test_logs.deleteMany({ where: { companyId: id } });
            if ((testLogsPayload || []).length > 0) {
                await prisma.test_logs.createMany({
                    data: testLogsPayload.map(t => ({
                        ...t,
                        id: randomUUID(),
                        companyId: id,
                        updatedAt: new Date()
                    }))
                });
            }
            console.log(`[PUT] ✅ test_logs sincronizado.`);
        }

        // ── PASSO 5: Retornar dados completos atualizados ────────────────────────
        const updatedCompany = await prisma.companies.findUnique({
            where: { id },
            include: {
                company_products: { include: { product_historico: true } },
                contacts: true,
                test_logs: true,
                company_meetings: true,
                company_dashboards: true,
                company_nps: true,
                company_tickets: true,
                company_notes: true,
                company_followups: true
            }
        });

        console.log(`[PUT] ✅ Update completo para empresa ${id}.\n`);
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
        await prisma.companies.delete({ where: { id } });
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

// Sanitizar dados de uma linha — suporta modelo Journey (Empresas + Contatos + Produtos DATI)
function sanitizeRow(row) {
    const s = (v) => (typeof v === 'string' ? v.trim() : v != null ? String(v).trim() : '');
    const n = (v) => { const p = parseFloat(String(v || '').replace(',', '.')); return isNaN(p) ? null : p; };
    return {
        // ── Empresa ─────────────────────────────────────────────────────────
        empresa: s(row['Nome da Empresa'] || row.empresa || row['nome_empresa'] || ''),
        status_empresa: s(row['Status da Empresa'] || row['Status Empresa'] || row.status_empresa || ''),
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
                    status_empresa: s(empRow['Status da Empresa'] || empRow['Status Empresa'] || ''),
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

// ── GET /api/activities (GLOBAL — para "Minhas Tarefas") ─────────────────────
app.get('/api/activities', extractUsuario, async (req, res) => {
    try {
        const { nature, assignee, status, priority, company_id, page = 1, pageSize = 50 } = req.query;
        const where = {};
        if (nature) where.nature = nature;
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
        res.json(activities);
    } catch (error) {
        console.error('[GET /api/activities]', error.message);
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

        res.json(activities);
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
            nature = 'registro',
            priority,
            reminder_at,
            reminder_email = false,
            reminder_whatsapp = false,
            google_meet_link,
            assignees = [],
            next_step_responsibles = [],
            mentions = [],
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
                nature,
                priority: priority || null,
                reminder_at: reminder_at ? new Date(reminder_at) : null,
                reminder_email: !!reminder_email,
                reminder_whatsapp: !!reminder_whatsapp,
                google_meet_link: google_meet_link || null,
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
            if (process.env.RESEND_API_KEY) {
                const mencionados = await prisma.users.findMany({ where: { id: { in: mentions }, ativo: true } });
                for (const u of mencionados) {
                    await resend.emails.send({
                        from: 'DATI Journey <noreply@dati.com.br>',
                        to: u.email,
                        subject: `📣 Você foi mencionado: ${title.trim()}`,
                        html: `<h2>Você foi mencionado em uma atividade</h2><p><strong>${title.trim()}</strong></p><p>${description || ''}</p>`,
                    }).catch(e => console.error('[Resend mention]', e.message));
                }
            }
        }

        const full = await prisma.activities.findUnique({ where: { id: activityId }, include: ACTIVITY_INCLUDE });
        console.log(`[POST /activities] ✅ Atividade criada: ${activityId}`);
        res.status(201).json(full);
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
            nature,
            priority,
            reminder_at,
            reminder_email,
            reminder_whatsapp,
            google_meet_link,
            assignees,
            next_step_responsibles,
            mentions,
        } = req.body;

        const existing = await prisma.activities.findUnique({ where: { id: activityId } });
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
                nature: nature !== undefined ? nature : existing.nature,
                priority: priority !== undefined ? priority || null : existing.priority,
                reminder_at: newReminderAt,
                reminder_email: reminder_email !== undefined ? !!reminder_email : existing.reminder_email,
                reminder_whatsapp: reminder_whatsapp !== undefined ? !!reminder_whatsapp : existing.reminder_whatsapp,
                reminder_sent: reminderChanged ? false : existing.reminder_sent,
                google_meet_link: google_meet_link !== undefined ? google_meet_link || null : existing.google_meet_link,
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

        const full = await prisma.activities.findUnique({ where: { id: activityId }, include: ACTIVITY_INCLUDE });
        console.log(`[PUT /activities/${activityId}] ✅ Atividade atualizada`);
        res.json(full);
    } catch (error) {
        console.error('[PUT /activities]', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ── DELETE /api/activities/:activityId ───────────────────────────────────────
app.delete('/api/activities/:activityId', extractUsuario, async (req, res) => {
    try {
        const { activityId } = req.params;
        await prisma.activities.delete({ where: { id: activityId } });
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

// ─── SPA Fallback (produção) — qualquer rota não-API retorna o index.html ────
// DEVE vir DEPOIS de todas as rotas /api e dos statics.
if (IS_PROD) {
    app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
            res.sendFile(path.join(__dirname, '..', 'index.html'));
        }
    });
}

app.listen(PORT, () => {
    const env = process.env.NODE_ENV || 'development';
    console.log(`\n🚀 Journey rodando na porta ${PORT} — ${env}`);
    if (IS_PROD) {
        console.log(`🌐 URL de produção: ${process.env.ALLOWED_ORIGIN || 'https://journey-dati.railway.app'}`);
    } else {
        console.log(`📍 Local: http://localhost:${PORT}`);
    }
    console.log(`📌 Banco de Dados: ${IS_PROD ? 'PostgreSQL Railway' : 'PostgreSQL Local'}\n`);
});
