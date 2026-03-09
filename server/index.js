import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import { fileURLToPath } from 'url';

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

// POST new company 10/10
app.post('/api/companies', async (req, res) => {
    try {
        const data = req.body;
        console.log('📬 [POST] Recebendo payload:', JSON.stringify(data, null, 2));

        // Mapeamento dinâmico do payload do frontend para o banco 10/10
        const company = await prisma.companies.create({
            data: {
                Status: data.Status || data.status,
                Nome_da_empresa: data.Nome_da_empresa || data.nome || data.name,
                CNPJ_da_empresa: data.CNPJ_da_empresa || undefined,
                Estado: data.Estado || data.estado,
                Cidade: data.Cidade || data.cidade,
                Tipo_de_empresa: data.Tipo_de_empresa || data.tipo,
                Segmento_da_empresa: data.Segmento_da_empresa || data.segmento,
                Modo_da_empresa: data.Modo_da_empresa || data.modo || data.canal,
                Lead: data.Lead || data.leadSource,
                Health_Score: data.Health_Score || data.healthScore,
                NPS: data.NPS || data.nps,
                Site: data.Site || data.site,

                // Comercial
                Data_Interesse: data.Data_Interesse ? new Date(data.Data_Interesse) : null,
                decisor_: data.Decisor || data.decisor_,
                Sucesso_Extraordin_rio: data.Sucesso_Extraordinário || data.Sucesso_Extraordin_rio,
                Situa__o_da_reuni_o: data.Situação_da_reunião || data.Situa__o_da_reuni_o,

                // Follow-up
                Nome_do_usu_rio: data.Nome_do_usu_rio || data.Nome_do_usuário,
                Data_de_follow_up: data.Data_de_follow_up ? new Date(data.Data_de_follow_up) : null,
                Hor_rio_de_follow_up: data.Horário_de_follow_up || data.Hor_rio_de_follow_up,

                // Qualificação
                ERP: data.ERP,
                Qual_ERP_: data.Qual_ERP_ || data.Qual_ERP,
                Tem_algum_comex_: data.Tem_algum_comex_ || data.Tem_algum_comex,
                Qual___M_dulo___Lotus_: data.Qual___M_dulo___Lotus_ || data.Qual_comex,
                Dores_Gargalos: data.Dores_Gargalos,
                Principal_Objetivo: data.Principal_Objetivo,
                Expectativa_da_DATI: data.Expectativa_da_DATI,

                // CS
                Nome_do_CS: data.Nome_do_CS,
                In_cio_com_CS: data.In_cio_com_CS ? new Date(data.In_cio_com_CS) : (data.Início_com_CS ? new Date(data.Início_com_CS) : null),
                Data_de_churn: data.Data_de_churn ? new Date(data.Data_de_churn) : null,
                Motivo_do_churn: data.Motivo_do_churn,
                Data_in_cio_onboarding: data.Data_in_cio_onboarding ? new Date(data.Data_in_cio_onboarding) : (data.Data_início_onboarding ? new Date(data.Data_início_onboarding) : null),
                Data_t_rmino_onboarding: data.Data_t_rmino_onboarding ? new Date(data.Data_t_rmino_onboarding) : (data.Data_término_onboarding ? new Date(data.Data_término_onboarding) : null),
                Fechamento_onboarding__Sim_N_o_: data.Fechamento_onboarding__Sim_N_o_ || data.Fechamento_onboarding,
                Usu_rio_Dati__Sim_N_o_: data.Usu_rio_Dati__Sim_N_o_ || data.Usuário_Dati,

                // Relacionamentos aninhados (Nomes exatos do schema.prisma 10/10)
                company_products: { 
                    create: (data.Produtos || data.produtos || []).map(p => {
                        const { Historico, ...pData } = p;
                        return {
                            Produto_DATI: pData.Produto_DATI || pData.nome,
                            Tipo_cobranca: pData.Tipo_cobranca || pData.tipoCobranca,
                            Valor_unitario: pData.Valor_unitario || pData.valorUnitario,
                            Valor_minimo: pData.Valor_minimo || pData.valorMinimo,
                            Valor_total: pData.Valor_total || pData.valorTotal,
                            Cobranca_setup: pData.Cobranca_setup || pData.cobrancaSetup,
                            Valor_setup: pData.Valor_setup || pData.valorSetup,
                            Qtd_usuarios: pData.Qtd_usuarios || pData.qtdUsuarios,
                            Valor_usuario_adicional: pData.Valor_usuario_adicional || pData.valorUserAdic,
                            Total_horas_hd: pData.Total_horas_hd || pData.totalHorasHd,
                            Valor_adic_hd: pData.Valor_adic_hd || pData.valorAdicHd,
                            Data_do_contrato: pData.Data_do_contrato || pData.dataContratacao ? new Date(pData.Data_do_contrato || pData.dataContratacao) : null,
                            Proposta_comercial: pData.Proposta_comercial || pData.propostaData,
                            Proposta_nome: pData.Proposta_nome || pData.propostaName,
                            Contrato: pData.Contrato || pData.contratoData,
                            Contrato_nome: pData.Contrato_nome || pData.contratoName,
                            product_historico: Historico ? { create: Historico.map(h => ({
                                Data_faturamento: h.Data_faturamento ? new Date(h.Data_faturamento) : null,
                                Data_pagamento: h.Data_pagamento ? new Date(h.Data_pagamento) : null,
                                Anexo_NF: h.Anexo_NF,
                                Anexo_NF_nome: h.Anexo_NF_nome,
                                Anexo_pagamento: h.Anexo_pagamento,
                                Anexo_pagamento_nome: h.Anexo_pagamento_nome,
                                Outros_anexos: h.Outros_anexos,
                                Outros_anexos_nome: h.Outros_anexos_nome
                            })) } : undefined
                        };
                    })
                },
                contacts: { create: (data.Contatos || data.contatos || []).map(c => ({
                    Nome_do_contato: c.Nome_do_contato || c.nome,
                    Cargo_do_contato: c.Cargo_do_contato || c.cargo,
                    Departamento_do_contato: c.Departamento_do_contato || c.departamento,
                    Email_1: c.Email_1 || c.email1,
                    WhatsApp: c.WhatsApp || c.whatsapp,
                    LinkedIn: c.LinkedIn || c.linkedin
                })) },
                test_logs: { create: data.Log_de_Testes || data.testLogs || [] },
                company_meetings: { create: (data.Reunioes || data.reunioes || []).map(r => ({
                    Data_reuniao: r.Data_reuniao ? new Date(r.Data_reuniao) : null,
                    Participantes: r.Participantes,
                    Temperatura: r.Temperatura,
                    Link_gravacao: r.Link_gravacao || r.link,
                    Observacoes: r.Observacoes || r.observacoes || r.obs,
                    Tipo_reuniao: r.Tipo_reuniao || 'Geral'
                })) },
                company_dashboards: { create: (data.Dashboards || data.dashboardsHistory || []).map(d => ({
                    Data: d.Data ? new Date(d.Data) : null,
                    Destinatario: d.Destinatario || d.destinatario,
                    Link: d.Link || d.link
                })) },
                company_nps: { create: (data.NPS_History || data.npsHistory || []).map(n => ({
                    Data: n.Data ? new Date(n.Data) : null,
                    Destinatario: n.Destinatario || n.destinatario,
                    Formulario: n.Formulario || n.formulario,
                    Score: n.Score || n.score
                })) },
                company_tickets: { create: (data.Tickets || data.chamadosHistory || []).map(t => ({
                    Data: t.Data ? new Date(t.Data) : null,
                    Numero: t.Numero || t.numero,
                    Resumo: t.Resumo || t.resumo,
                    Autor: t.Autor || t.autor,
                    Link: t.Link || t.link
                })) },
                company_notes: { create: (data.Notas || data.csNotes || []).map(n => ({
                    Data: n.Data ? new Date(n.Data) : new Date(),
                    Conteudo: n.Conteudo || n.text,
                    Autor: n.Autor || n.author
                })) },
                company_followups: { create: (data.Follow_Ups || data.followUps || []).map(f => ({
                    Data_inclusao: f.Data_inclusao ? new Date(f.Data_inclusao) : new Date(),
                    Conteudo: f.Conteudo || f.conteudo,
                    Usuario: f.Usuario || f.usuario,
                    Area: f.Area || f.area,
                    Data_proximo_contato: (f.Data_proximo_contato || f.proximoContato) ? new Date(f.Data_proximo_contato || f.proximoContato) : null
                })) }
            }
        });
        res.status(201).json(company);
    } catch (error) {
        console.error('Error creating company:', error);
        res.status(500).json({ error: error.message });
    }
});

// PUT update company
app.put('/api/companies/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;
        console.log(`📬 [PUT] Atualizando empresa ${id}. Payload Reunioes:`, JSON.stringify(data.Reunioes, null, 2));

        const company = await prisma.companies.update({
            where: { id },
            data: {
                Status: data.Status,
                Nome_da_empresa: data.Nome_da_empresa,
                CNPJ_da_empresa: data.CNPJ_da_empresa || undefined,
                Estado: data.Estado,
                Cidade: data.Cidade,
                Tipo_de_empresa: data.Tipo_de_empresa,
                Segmento_da_empresa: data.Segmento_da_empresa,
                Modo_da_empresa: data.Modo_da_empresa || data.canal,
                Lead: data.Lead,
                Health_Score: data.Health_Score,
                NPS: data.NPS,
                Site: data.Site,
                Data_Interesse: data.Data_Interesse ? new Date(data.Data_Interesse) : null,
                decisor_: data.decisor_ || data.Decisor,
                Sucesso_Extraordin_rio: data.Sucesso_Extraordin_rio || data.Sucesso_Extraordinário,
                Situa__o_da_reuni_o: data.Situa__o_da_reuni_o || data.Situação_da_reunião,
                Nome_do_usu_rio: data.Nome_do_usu_rio || data.Nome_do_usuário,
                Data_de_follow_up: data.Data_de_follow_up ? new Date(data.Data_de_follow_up) : null,
                Hor_rio_de_follow_up: data.Hor_rio_de_follow_up || data.Horário_de_follow_up,
                ERP: data.ERP,
                Qual_ERP_: data.Qual_ERP_ || data.Qual_ERP,
                Tem_algum_comex_: data.Tem_algum_comex_ || data.Tem_algum_comex,
                Qual___M_dulo___Lotus_: data.Qual___M_dulo___Lotus_ || data.Qual_comex,
                Dores_Gargalos: data.Dores_Gargalos,
                Principal_Objetivo: data.Principal_Objetivo,
                Expectativa_da_DATI: data.Expectativa_da_DATI,
                Nome_do_CS: data.Nome_do_CS,
                In_cio_com_CS: data.In_cio_com_CS ? new Date(data.In_cio_com_CS) : (data.Início_com_CS ? new Date(data.Início_com_CS) : null),
                Data_de_churn: data.Data_de_churn ? new Date(data.Data_de_churn) : null,
                Motivo_do_churn: data.Motivo_do_churn,
                Data_in_cio_onboarding: data.Data_in_cio_onboarding ? new Date(data.Data_in_cio_onboarding) : (data.Data_início_onboarding ? new Date(data.Data_início_onboarding) : null),
                Data_t_rmino_onboarding: data.Data_t_rmino_onboarding ? new Date(data.Data_t_rmino_onboarding) : (data.Data_término_onboarding ? new Date(data.Data_término_onboarding) : null),
                Fechamento_onboarding__Sim_N_o_: data.Fechamento_onboarding__Sim_N_o_ || data.Fechamento_onboarding,
                Usu_rio_Dati__Sim_N_o_: data.Usu_rio_Dati__Sim_N_o_ || data.Usuário_Dati,

                // Relationship Deep Sync (Delete-and-Recreate pattern)
                company_products: { 
                    deleteMany: {}, 
                    create: (data.Produtos || []).map(p => {
                        const { Historico, ...pData } = p;
                        return {
                            Produto_DATI: pData.Produto_DATI || pData.nome,
                            Tipo_cobranca: pData.Tipo_cobranca || pData.tipoCobranca,
                            Valor_unitario: pData.Valor_unitario || pData.valorUnitario,
                            Valor_minimo: pData.Valor_minimo || pData.valorMinimo,
                            Valor_total: pData.Valor_total || pData.valorTotal,
                            Cobranca_setup: pData.Cobranca_setup || pData.cobrancaSetup,
                            Valor_setup: pData.Valor_setup || pData.valorSetup,
                            Qtd_usuarios: pData.Qtd_usuarios || pData.qtdUsuarios,
                            Valor_usuario_adicional: pData.Valor_usuario_adicional || pData.valorUserAdic,
                            Total_horas_hd: pData.Total_horas_hd || pData.totalHorasHd,
                            Valor_adic_hd: pData.Valor_adic_hd || pData.valorAdicHd,
                            Data_do_contrato: pData.Data_do_contrato || pData.dataContratacao ? new Date(pData.Data_do_contrato || pData.dataContratacao) : null,
                            Proposta_comercial: pData.Proposta_comercial || pData.propostaData,
                            Proposta_nome: pData.Proposta_nome || pData.propostaName,
                            Contrato: pData.Contrato || pData.contratoData,
                            Contrato_nome: pData.Contrato_nome || pData.contratoName,
                            product_historico: Historico ? { create: Historico.map(h => ({
                                Data_faturamento: h.Data_faturamento ? new Date(h.Data_faturamento) : null,
                                Data_pagamento: h.Data_pagamento ? new Date(h.Data_pagamento) : null,
                                Anexo_NF: h.Anexo_NF,
                                Anexo_NF_nome: h.Anexo_NF_nome,
                                Anexo_pagamento: h.Anexo_pagamento,
                                Anexo_pagamento_nome: h.Anexo_pagamento_nome,
                                Outros_anexos: h.Outros_anexos,
                                Outros_anexos_nome: h.Outros_anexos_nome
                            })) } : undefined
                        };
                    })
                },
                contacts: { deleteMany: {}, create: (data.Contatos || []).map(c => ({
                    Nome_do_contato: c.Nome_do_contato || c.nome,
                    Cargo_do_contato: c.Cargo_do_contato || c.cargo,
                    Departamento_do_contato: c.Departamento_do_contato || c.departamento,
                    Email_1: c.Email_1 || c.email1,
                    WhatsApp: c.WhatsApp || c.whatsapp,
                    LinkedIn: c.LinkedIn || c.linkedin
                })) },
                test_logs: { deleteMany: {}, create: data.Log_de_Testes || [] },
                company_meetings: { deleteMany: {}, create: (data.Reunioes || []).map(r => ({
                    Data_reuniao: r.Data_reuniao ? new Date(r.Data_reuniao) : null,
                    Participantes: r.Participantes,
                    Temperatura: r.Temperatura,
                    Link_gravacao: r.Link_gravacao || r.link,
                    Observacoes: r.Observacoes || r.observacoes || r.obs,
                    Tipo_reuniao: r.Tipo_reuniao || 'Geral'
                })) },
                company_dashboards: { deleteMany: {}, create: (data.Dashboards || []).map(d => ({
                    Data: d.Data ? new Date(d.Data) : null,
                    Destinatario: d.Destinatario || d.destinatario,
                    Link: d.Link || d.link
                })) },
                company_nps: { deleteMany: {}, create: (data.NPS_History || []).map(n => ({
                    Data: n.Data ? new Date(n.Data) : null,
                    Destinatario: n.Destinatario || n.destinatario,
                    Formulario: n.Formulario || n.formulario,
                    Score: n.Score || n.score
                })) },
                company_tickets: { deleteMany: {}, create: (data.Tickets || []).map(t => ({
                    Data: t.Data ? new Date(t.Data) : null,
                    Numero: t.Numero || t.numero,
                    Resumo: t.Resumo || t.resumo,
                    Autor: t.Autor || t.autor,
                    Link: t.Link || t.link
                })) },
                company_notes: { deleteMany: {}, create: (data.Notas || []).map(n => ({
                    Data: n.Data ? new Date(n.Data) : new Date(),
                    Conteudo: n.Conteudo || n.text,
                    Autor: n.Autor || n.author
                })) },
                company_followups: { deleteMany: {}, create: (data.Follow_Ups || []).map(f => ({
                    Data_inclusao: f.Data_inclusao ? new Date(f.Data_inclusao) : new Date(),
                    Conteudo: f.Conteudo || f.conteudo,
                    Usuario: f.Usuario || f.usuario,
                    Area: f.Area || f.area,
                    Data_proximo_contato: (f.Data_proximo_contato || f.proximoContato) ? new Date(f.Data_proximo_contato || f.proximoContato) : null
                })) }
            }
        });

        res.json(company);
    } catch (error) {
        console.error('❌ Erro ao atualizar empresa:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE company
app.delete('/api/companies/:id', async (req, res) => {
    try {
        const { id } = req.params;
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
