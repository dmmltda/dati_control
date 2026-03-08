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
        const companies = await prisma.company.findMany({
            include: {
                Produtos: true,
                Contatos: true,
                Log_de_Testes: true,
                Reunioes: true,
                Dashboards: true,
                NPS_History: true,
                Tickets: true,
                Notas: true
            },
            orderBy: { updatedAt: 'desc' }
        });
        res.json(companies);
    } catch (error) {
        console.error('Error fetching companies:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET single company
app.get('/api/companies/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const company = await prisma.company.findUnique({
            where: { id },
            include: {
                Produtos: true,
                Contatos: true,
                Log_de_Testes: true,
                Reunioes: true,
                Dashboards: true,
                NPS_History: true,
                Tickets: true,
                Notas: true
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
        const company = await prisma.company.create({
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
                Decisor: data.Decisor,
                Sucesso_Extraordinário: data.Sucesso_Extraordinário,
                Situação_da_reunião: data.Situação_da_reunião,

                // Follow-up
                Nome_do_usuário: data.Nome_do_usuário,
                Data_de_follow_up: data.Data_de_follow_up ? new Date(data.Data_de_follow_up) : null,
                Horário_de_follow_up: data.Horário_de_follow_up,

                // Qualificação
                ERP: data.ERP,
                Qual_ERP: data.Qual_ERP,
                Tem_algum_comex: data.Tem_algum_comex,
                Qual_comex: data.Qual_comex,
                Dores_Gargalos: data.Dores_Gargalos,
                Principal_Objetivo: data.Principal_Objetivo,
                Expectativa_da_DATI: data.Expectativa_da_DATI,

                // CS
                Nome_do_CS: data.Nome_do_CS,
                Início_com_CS: data.Início_com_CS ? new Date(data.Início_com_CS) : null,
                Data_de_churn: data.Data_de_churn ? new Date(data.Data_de_churn) : null,
                Motivo_do_churn: data.Motivo_do_churn,
                Data_início_onboarding: data.Data_início_onboarding ? new Date(data.Data_início_onboarding) : null,
                Data_término_onboarding: data.Data_término_onboarding ? new Date(data.Data_término_onboarding) : null,
                Fechamento_onboarding: data.Fechamento_onboarding,
                Usuário_Dati: data.Usuário_Dati,

                // Relacionamentos aninhados
                Produtos: { create: data.Produtos || data.produtos || [] },
                Contatos: { create: data.Contatos || data.contatos || [] },
                Log_de_Testes: { create: data.Log_de_Testes || data.testLogs || [] },
                Reunioes: { create: data.Reunioes || data.reunioes || [] },
                Dashboards: { create: data.Dashboards || data.dashboardsHistory || [] },
                NPS_History: { create: data.NPS_History || data.npsHistory || [] },
                Tickets: { create: data.Tickets || data.chamadosHistory || [] },
                Notas: { create: data.Notas || data.csNotes || [] }
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

        const company = await prisma.company.update({
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
                Decisor: data.Decisor,
                Sucesso_Extraordinário: data.Sucesso_Extraordinário,
                Situação_da_reunião: data.Situação_da_reunião,
                Nome_do_usuário: data.Nome_do_usuário,
                Data_de_follow_up: data.Data_de_follow_up ? new Date(data.Data_de_follow_up) : null,
                Horário_de_follow_up: data.Horário_de_follow_up,
                ERP: data.ERP,
                Qual_ERP: data.Qual_ERP,
                Tem_algum_comex: data.Tem_algum_comex,
                Qual_comex: data.Qual_comex,
                Dores_Gargalos: data.Dores_Gargalos,
                Principal_Objetivo: data.Principal_Objetivo,
                Expectativa_da_DATI: data.Expectativa_da_DATI,
                Nome_do_CS: data.Nome_do_CS,
                Início_com_CS: data.Início_com_CS ? new Date(data.Início_com_CS) : null,
                Data_de_churn: data.Data_de_churn ? new Date(data.Data_de_churn) : null,
                Motivo_do_churn: data.Motivo_do_churn,
                Data_início_onboarding: data.Data_início_onboarding ? new Date(data.Data_início_onboarding) : null,
                Data_término_onboarding: data.Data_término_onboarding ? new Date(data.Data_término_onboarding) : null,
                Fechamento_onboarding: data.Fechamento_onboarding,
                Usuário_Dati: data.Usuário_Dati,

                // Relationships (Delete and Recreate for simplicity in this MVP 10/10)
                Produtos: { deleteMany: {}, create: data.Produtos || [] },
                Contatos: { deleteMany: {}, create: data.Contatos || [] },
                Log_de_Testes: { deleteMany: {}, create: data.Log_de_Testes || [] },
                Reunioes: { deleteMany: {}, create: data.Reunioes || [] },
                Dashboards: { deleteMany: {}, create: data.Dashboards || [] },
                NPS_History: { deleteMany: {}, create: data.NPS_History || [] },
                Tickets: { deleteMany: {}, create: data.Tickets || [] },
                Notas: { deleteMany: {}, create: data.Notas || [] }
            }
        });

        res.json(company);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE company
app.delete('/api/companies/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.company.delete({ where: { id } });
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n🚀 Servidor DATI Control rodando em http://localhost:${PORT}`);
    console.log(`📌 Banco de Dados: PostgreSQL (Ativo)\n`);
});
