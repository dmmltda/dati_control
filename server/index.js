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
function validateRow(row, existingNames, existingEmails) {
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

    // 3. Duplicidade — empresa
    const isDuplicateCompany = row.empresa &&
        existingNames.has(row.empresa.trim().toLowerCase());

    // 4. Duplicidade — email
    const isDuplicateEmail = row.contato_email &&
        existingEmails.has(row.contato_email.trim().toLowerCase());

    if (errors.length > 0) {
        return { status: 'invalid', error_message: errors.join(' | ') };
    }
    if (isDuplicateCompany || isDuplicateEmail) {
        return { status: 'duplicate', error_message: isDuplicateCompany ? 'Empresa já existe' : 'E-mail já cadastrado' };
    }
    return { status: 'valid', error_message: null };
}

// Sanitizar dados de uma linha — suporta modelo Journey (Empresas + Contatos + Produtos DATI)
function sanitizeRow(row) {
    const s = (v) => (typeof v === 'string' ? v.trim() : v != null ? String(v).trim() : '');
    const n = (v) => { const p = parseFloat(String(v || '').replace(',', '.')); return isNaN(p) ? null : p; };
    return {
        // ── Empresa ─────────────────────────────────────────────────────────
        empresa:        s(row['Nome da Empresa'] || row.empresa || row['nome_empresa'] || ''),
        status_empresa: s(row['Status da Empresa'] || row['Status Empresa'] || row.status_empresa || ''),
        cnpj:           s(row['CNPJ'] || row.cnpj || ''),
        tipo_empresa:   s(row['Tipo de Empresa'] || row['Tipo Empresa'] || row.tipo_empresa || ''),
        estado:         s(row['Estado'] || row.estado || ''),
        cidade:         s(row['Cidade'] || row.cidade || ''),
        segmento:       s(row['Segmento'] || row.segmento || ''),
        site:           s(row['Site'] || row.site || ''),
        // ── Contato ─────────────────────────────────────────────────────────
        contato_nome:        s(row['Nome do Contato'] || row.contato_nome || ''),
        cargo:               s(row['Cargo'] || row.cargo || ''),
        departamento:        s(row['Departamento'] || row.departamento || ''),
        contato_email:       s(row['E-mail'] || row['Email'] || row.contato_email || '').toLowerCase(),
        contato_telefone:    s(row['Whatsapp'] || row['WhatsApp'] || row.contato_telefone || ''),
        linkedin:            s(row['Linkedin'] || row['LinkedIn'] || row.linkedin || ''),
        // ── Produto DATI ─────────────────────────────────────────────────────
        produto_dati:        s(row['Produto DATI'] || row.produto_dati || ''),
        tipo_cobranca:       s(row['Tipo de Cobrança'] || row['Tipo de Cobranca'] || row.tipo_cobranca || ''),
        valor_unitario:      n(row['Valor Unitário'] || row['Valor Unitario'] || row.valor_unitario),
        valor_minimo:        n(row['Valor Mínimo'] || row['Valor Minimo'] || row.valor_minimo),
        cobranca_setup:      s(row['Cobrança de Setup'] || row['Cobranca de Setup'] || row.cobranca_setup || ''),
        valor_setup:         n(row['Valor de Setup'] || row.valor_setup),
        qtd_usuarios:        s(row['Quantidade de Usuários'] || row['Quantidade de Usuarios'] || row.qtd_usuarios || ''),
        valor_usuario_adic:  n(row['Valor por Usuário Adicional'] || row['Valor por Usuario Adicional'] || row.valor_usuario_adic),
        total_horas_hd:      n(row['Total Horas Mensais - Help Desk'] || row.total_horas_hd),
        valor_adic_hd:       n(row['Valor Adicional por Hora - Help Desk'] || row.valor_adic_hd),
    };
}

// ── GET /api/import/template ─────────────────────────────────────────────────
app.get('/api/import/template', (req, res) => {
    try {
        const wb = XLSX.utils.book_new();

        // ── Listas de validação (aba Base) ───────────────────────────────────
        const STATUS_EMPRESA   = ['Prospect','Lead','Reunião','Proposta | Andamento','Proposta | Recusada','Em Contrato','Ativo','Suspenso','Inativo'];
        const TIPO_EMPRESA     = ['Agente de Carga','Agente e Despachante','Armazém Alfandegado','Despachante Aduaneiro','Despachante e Agente','Exportador','Importador','Importador | Exportador','Trading','Transportadora Rodoviária'];
        const ESTADOS          = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RS','SC','SP','TO'];
        const SEGMENTOS        = ['Agronegócio','Alimentos e Bebidas','Armazenagem','Automotivo','Calçados','Cosméticos','Despacho Aduaneiro','Eletrodomésticos','Eletrônicos','Embalagens','Energia e Gás','Farmacêutico','Ferramentas','Ferroviário','Financeiro','Higiene','Hospitalar','Logística','Maquinário','Metalurgia','Mineração','Papel','Químico','Seguro','Têxtil','Trading','Transporte'];
        const CARGOS           = ['Estagiário','Auxiliar','Assistente','Analista','Supervisor','Gerente','Diretor','Proprietário'];
        const DEPARTAMENTOS    = ['Administrativo','Comercial','Compras','Comércio Exterior','Exportação','Financeiro','Geral','Importação','Jurídico','Logística','Operacional','Supply','Tecnologia'];
        const PRODUTOS_DATI    = ['DATI Import','DATI Export','Smart Read','Catálogo de Produtos','Orkestra','DUIMP'];
        const TIPO_COBRANCA    = ['Mensalidade','Por processo','Por documento','Por DI/DUIMP'];
        const SIM_NAO          = ['Sim','Não'];

        // ── Cor do cabeçalho: azul escuro (mesmo do modelo Journey) ─────────
        const HEADER_STYLE = {
            fill: { fgColor: { rgb: '1B2A4A' } },
            font: { bold: true, color: { rgb: 'FFFFFF' } },
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
                bottom: { style: 'thin', color: { rgb: '3B5998' } },
            },
        };

        // Helper: aplicar estilo no cabeçalho de um worksheet
        function applyHeaderStyle(ws, headers) {
            headers.forEach((_, i) => {
                const addr = XLSX.utils.encode_cell({ r: 0, c: i });
                if (ws[addr]) ws[addr].s = HEADER_STYLE;
            });
        }

        // Helper: adicionar Data Validation (dropdown) numa coluna
        function addDropdown(ws, col, list, startRow, endRow) {
            if (!ws['!dataValidation']) ws['!dataValidation'] = [];
            ws['!dataValidation'].push({
                sqref: `${col}${startRow}:${col}${endRow}`,
                type: 'list',
                formula1: `"${list.join(',')}"`,
                showDropDown: false,
                showErrorMessage: true,
                errorTitle: 'Valor inválido',
                error: `Selecione uma opção válida da lista.`,
            });
        }

        // ── ABA: Empresas - Preencher ─────────────────────────────────────────
        const empHeaders = ['Nome da Empresa','Status da Empresa','CNPJ','Tipo de Empresa','Estado','Cidade','Segmento','Site'];
        const wsEmp = XLSX.utils.aoa_to_sheet([empHeaders]);
        wsEmp['!cols'] = [{ wch: 30 },{ wch: 22 },{ wch: 20 },{ wch: 26 },{ wch: 10 },{ wch: 20 },{ wch: 22 },{ wch: 28 }];
        wsEmp['!rows'] = [{ hpt: 24 }];
        wsEmp['!freeze'] = { xSplit: 0, ySplit: 1 };
        applyHeaderStyle(wsEmp, empHeaders);
        addDropdown(wsEmp, 'B', STATUS_EMPRESA,  2, 10001);
        addDropdown(wsEmp, 'D', TIPO_EMPRESA,    2, 10001);
        addDropdown(wsEmp, 'E', ESTADOS,          2, 10001);
        addDropdown(wsEmp, 'G', SEGMENTOS,        2, 10001);
        XLSX.utils.book_append_sheet(wb, wsEmp, 'Empresas - Preencher');

        // ── ABA: Contatos - Preencher ─────────────────────────────────────────
        const cttHeaders = ['Nome do Contato','Cargo','Departamento','E-mail','Whatsapp','Linkedin'];
        const wsCtt = XLSX.utils.aoa_to_sheet([cttHeaders]);
        wsCtt['!cols'] = [{ wch: 28 },{ wch: 16 },{ wch: 20 },{ wch: 30 },{ wch: 18 },{ wch: 30 }];
        wsCtt['!rows'] = [{ hpt: 24 }];
        wsCtt['!freeze'] = { xSplit: 0, ySplit: 1 };
        applyHeaderStyle(wsCtt, cttHeaders);
        addDropdown(wsCtt, 'B', CARGOS,       2, 10001);
        addDropdown(wsCtt, 'C', DEPARTAMENTOS, 2, 10001);
        XLSX.utils.book_append_sheet(wb, wsCtt, 'Contatos - Preencher');

        // ── ABA: Produtos DATI - Preencher ────────────────────────────────────
        const prdHeaders = [
            'Produto DATI','Tipo de Cobrança','Valor Unitário','Valor Mínimo',
            'Cobrança de Setup','Valor de Setup','Quantidade de Usuários',
            'Valor por Usuário Adicional','Total Horas Mensais - Help Desk',
            'Valor Adicional por Hora - Help Desk',
        ];
        const wsPrd = XLSX.utils.aoa_to_sheet([prdHeaders]);
        wsPrd['!cols'] = Array(10).fill({ wch: 26 });
        wsPrd['!rows'] = [{ hpt: 24 }];
        wsPrd['!freeze'] = { xSplit: 0, ySplit: 1 };
        applyHeaderStyle(wsPrd, prdHeaders);
        addDropdown(wsPrd, 'A', PRODUTOS_DATI,  2, 10001);
        addDropdown(wsPrd, 'B', TIPO_COBRANCA,  2, 10001);
        addDropdown(wsPrd, 'E', SIM_NAO,        2, 10001);
        XLSX.utils.book_append_sheet(wb, wsPrd, 'Produtos DATI - Preencher');

        // ── ABA: Base - Não preencher (listas para referência) ────────────────
        const maxLen = Math.max(STATUS_EMPRESA.length, TIPO_EMPRESA.length, ESTADOS.length, SEGMENTOS.length, CARGOS.length, DEPARTAMENTOS.length, PRODUTOS_DATI.length, TIPO_COBRANCA.length, SIM_NAO.length);
        const baseRows = [
            ['Status Empresa','Tipo Empresa','Estado','Segmento','Cargo','Departamento','Produtos DATI','Tipo de Cobrança','Valor de Setup'],
        ];
        for (let i = 0; i < maxLen; i++) {
            baseRows.push([
                STATUS_EMPRESA[i]  || '',
                TIPO_EMPRESA[i]    || '',
                ESTADOS[i]         || '',
                SEGMENTOS[i]       || '',
                CARGOS[i]          || '',
                DEPARTAMENTOS[i]   || '',
                PRODUTOS_DATI[i]   || '',
                TIPO_COBRANCA[i]   || '',
                SIM_NAO[i]         || '',
            ]);
        }
        const wsBase = XLSX.utils.aoa_to_sheet(baseRows);
        wsBase['!cols'] = Array(9).fill({ wch: 26 });
        applyHeaderStyle(wsBase, baseRows[0]);
        XLSX.utils.book_append_sheet(wb, wsBase, 'Base- Não preencher');

        // ── ABA: INSTRUCOES ───────────────────────────────────────────────────
        const instrRows = [
            ['INSTRUCOES DE PREENCHIMENTO — JOURNEY · Importação em Massa'],
            [''],
            ['EMPRESAS (aba: Empresas - Preencher)'],
            ['  A - Nome da Empresa     → obrigatório'],
            ['  B - Status da Empresa   → selecione da lista'],
            ['  C - CNPJ                → formato 00.000.000/0001-00'],
            ['  D - Tipo de Empresa     → selecione da lista'],
            ['  E - Estado              → UF (ex: SP, RJ)'],
            ['  F - Cidade'],
            ['  G - Segmento            → selecione da lista'],
            ['  H - Site                → ex: https://empresa.com.br'],
            [''],
            ['CONTATOS (aba: Contatos - Preencher)'],
            ['  A - Nome do Contato     → obrigatório'],
            ['  B - Cargo               → selecione da lista'],
            ['  C - Departamento        → selecione da lista'],
            ['  D - E-mail'],
            ['  E - Whatsapp'],
            ['  F - Linkedin'],
            [''],
            ['PRODUTOS DATI (aba: Produtos DATI - Preencher)'],
            ['  A - Produto DATI        → selecione da lista'],
            ['  B - Tipo de Cobrança    → selecione da lista'],
            ['  C - Valor Unitário      → R$'],
            ['  D - Valor Mínimo        → R$'],
            ['  E - Cobrança de Setup   → Sim/Não'],
            ['  F - Valor de Setup      → R$'],
            ['  G - Quantidade de Usuários'],
            ['  H - Valor por Usuário Adicional  → R$'],
            ['  I - Total Horas Mensais Help Desk'],
            ['  J - Valor Adicional por Hora HD  → R$'],
            [''],
            ['REGRAS IMPORTANTES'],
            ['  1. NAO altere os nomes das colunas'],
            ['  2. Nome da Empresa é OBRIGATORIO'],
            ['  3. Limite: 10.000 linhas por importação'],
            ['  4. Formatos aceitos: XLSX'],
        ];
        const wsInstr = XLSX.utils.aoa_to_sheet(instrRows);
        wsInstr['!cols'] = [{ wch: 70 }];
        XLSX.utils.book_append_sheet(wb, wsInstr, 'INSTRUCOES');

        // ── Gerar e validar ───────────────────────────────────────────────────
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true });
        const test = XLSX.read(buffer, { type: 'buffer' });
        console.log('[IMPORT TEMPLATE] Sheets:', test.SheetNames, '| Size:', buffer.length);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="modelo_importacao_dati.xlsx"');
        res.setHeader('Content-Length', buffer.length);
        return res.end(buffer);
    } catch (err) {
        console.error('[IMPORT TEMPLATE] ERRO:', err.message);
        return res.status(500).json({ error: 'Erro ao gerar template: ' + err.message });
    }
});
// ── POST /api/import/upload ───────────────────────────────────────────────────
app.post('/api/import/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });

        // Parse do arquivo
        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = wb.SheetNames.find(n =>
            n.toLowerCase().includes('empresa') && !n.toLowerCase().includes('base')
        ) || wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (rawRows.length === 0) {
            return res.status(400).json({ error: 'Planilha vazia ou sem dados reconhecíveis.' });
        }
        if (rawRows.length > 10000) {
            return res.status(400).json({ error: `Limite de 10.000 linhas excedido. Arquivo contém ${rawRows.length} linhas.` });
        }

        // Sanitizar todas as linhas
        const sanitized = rawRows.map((r, i) => ({ rowNum: i + 2, ...sanitizeRow(r) }));

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
                    segmento: r.segmento,
                    cidade: r.cidade,
                    estado: r.estado,
                    site: r.site,
                    contato_nome: r.contato_nome,
                    contato_email: r.contato_email,
                    contato_telefone: r.contato_telefone,
                    cargo: r.cargo,
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
app.post('/api/import/:id/validate', async (req, res) => {
    try {
        const { id } = req.params;
        const job = await prisma.import_jobs.findUnique({ where: { id } });
        if (!job) return res.status(404).json({ error: 'Job não encontrado' });

        // Carregar nomes e emails existentes no banco (para duplicidade)
        const [existingCompanies, existingContacts] = await Promise.all([
            prisma.companies.findMany({ select: { Nome_da_empresa: true } }),
            prisma.contacts.findMany({ select: { Email_1: true } }),
        ]);
        const existingNames = new Set(existingCompanies.map(c => c.Nome_da_empresa?.toLowerCase()).filter(Boolean));
        const existingEmails = new Set(existingContacts.map(c => c.Email_1?.toLowerCase()).filter(Boolean));

        // Carregar staging
        const rows = await prisma.import_staging.findMany({ where: { import_id: id } });

        let valid = 0, invalid = 0, duplicate = 0;

        // Validar e atualizar cada linha
        await Promise.all(rows.map(async (row) => {
            const result = validateRow(row, existingNames, existingEmails);
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
app.get('/api/import/:id/preview', async (req, res) => {
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
app.post('/api/import/:id/simulate', async (req, res) => {
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
app.post('/api/import/:id/execute', async (req, res) => {
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

        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE);
            try {
                await prisma.$transaction(async (tx) => {
                    for (const row of batch) {
                        let companyId;

                        if (row.status === 'duplicate' && duplicate_action === 'update') {
                            // Atualiza empresa existente
                            const existing = await tx.companies.findFirst({
                                where: { Nome_da_empresa: { equals: row.empresa, mode: 'insensitive' } },
                            });
                            if (existing) {
                                await tx.companies.update({
                                    where: { id: existing.id },
                                    data: {
                                        ...(row.segmento && { Segmento_da_empresa: row.segmento }),
                                        ...(row.cidade && { Cidade: row.cidade }),
                                        ...(row.estado && { Estado: row.estado }),
                                        ...(row.site && { Site: row.site }),
                                        ...(row.cnpj && { CNPJ_da_empresa: row.cnpj }),
                                        updatedAt: new Date(),
                                    },
                                });
                                companyId = existing.id;
                                companies_created++;
                            }
                        } else {
                            // Cria nova empresa
                            const now = new Date();
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
                                    updatedAt: now,
                                },
                            });
                            companyId = company.id;
                            companies_created++;
                        }

                        // Cria contato se houver dados
                        if (companyId && (row.contato_nome || row.contato_email)) {
                            await tx.contacts.create({
                                data: {
                                    id: randomUUID(),
                                    companyId,
                                    Nome_do_contato:        row.contato_nome        || null,
                                    Email_1:                row.contato_email        || null,
                                    WhatsApp:               row.contato_telefone     || null,
                                    Cargo_do_contato:       row.cargo               || null,
                                    Departamento_do_contato:row.departamento         || null,
                                    LinkedIn:               row.linkedin             || null,
                                    updatedAt: new Date(),
                                },
                            });
                            contacts_created++;
                        }
                        // Cria produto DATI se houver dados
                        if (companyId && row.produto_dati) {
                            try {
                                await tx.company_products.create({
                                    data: {
                                        id: randomUUID(),
                                        companyId,
                                        Produto_DATI: row.produto_dati,
                                        Tipo_cobranca: row.tipo_cobranca || null,
                                        Valor_unitario: row.valor_unitario != null ? row.valor_unitario : null,
                                        Valor_minimo: row.valor_minimo != null ? row.valor_minimo : null,
                                        Cobranca_setup: row.cobranca_setup || null,
                                        Valor_setup: row.valor_setup != null ? row.valor_setup : null,
                                        Qtd_usuarios: row.qtd_usuarios || null,
                                        Valor_usuario_adicional: row.valor_usuario_adic != null ? row.valor_usuario_adic : null,
                                        Total_horas_hd: row.total_horas_hd != null ? Math.round(row.total_horas_hd) : null,
                                        Valor_adic_hd: row.valor_adic_hd != null ? row.valor_adic_hd : null,
                                        updatedAt: new Date(),
                                    },
                                });
                            } catch(prodErr) {
                                console.warn('[import/execute] produto ignorado:', prodErr.message);
                            }
                        }
                    }
                });
            } catch (batchErr) {
                console.error(`[import/execute] Batch ${i}-${i + BATCH_SIZE} falhou:`, batchErr);
                errors += batch.length;
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

        res.json({ import_id: id, companies_created, contacts_created, errors, status: 'done' });
    } catch (err) {
        console.error('[import/execute]', err);
        await prisma.import_jobs.update({ where: { id: req.params.id }, data: { status: 'error' } }).catch(() => { });
        res.status(500).json({ error: err.message });
    }
});

// ── DELETE /api/import/:id ────────────────────────────────────────────────────
app.delete('/api/import/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.import_jobs.delete({ where: { id } });
        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n🚀 Servidor DATI Control rodando em http://localhost:${PORT}`);
    console.log(`📌 Banco de Dados: PostgreSQL (Ativo)\n`);
});

