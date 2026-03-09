import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
});
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// Servir arquivos estáticos do frontend (10/10 logic)
app.use(express.static(path.join(__dirname, '..')));

// Health Check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Servidor DATI Control 10/10 operando!' });
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
app.get('/api/companies', async (req, res) => {
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
app.get('/api/companies/:id', async (req, res) => {
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
app.post('/api/companies', async (req, res) => {
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
app.put('/api/companies/:id', async (req, res) => {
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
app.delete('/api/companies/:id', async (req, res) => {
    try {
        const id = req.params.id;
        if (!id) return res.status(400).json({ error: 'ID obrigatório' });
        await prisma.companies.delete({ where: { id } });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n🚀 Servidor DATI Control rodando em http://localhost:${PORT}`);
    console.log(`📌 Banco de Dados: PostgreSQL (Ativo)\n`);
});
