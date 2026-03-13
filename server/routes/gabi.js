/**
 * Rota: /api/gabi — Gabi AI Assistant
 * Google Gemini 2.0 Flash + Tool Use + Reasoning + Usage Logging
 */
import express from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, getAuth, createClerkClient } from '@clerk/express';
import { boss } from '../services/job-queue.js';
import { sendEmail, isEmailConfigured } from '../services/email.js';
import * as audit from '../services/audit.js';

const router = express.Router();
const prisma = new PrismaClient();

// Anti-spam: registra alertas já enviados neste mês para não repetir
// Formato: 'YYYY-MM_PCT80', 'YYYY-MM_LIMITE'
const _alertsEnviados = new Set();

/**
 * Delega o envio de alerta Gabi ao serviço central de e-mail
 * e registra o envio no histórico de alterações.
 * @param {PrismaClient} prismaInst - instância do Prisma (para audit.log)
 * @param {object|null}  actor      - usuário que disparou (null = sistema)
 */
async function _enviarAlertaGabi(spent, limit, pct, dedupKey, prismaInst = null, actor = null) {
    const alertEmail = process.env.GABI_ALERT_EMAIL;
    if (!alertEmail) {
        console.warn('[Gabi Alert] GABI_ALERT_EMAIL não configurada — alerta ignorado.');
        return;
    }
    await sendEmail({
        to:       alertEmail,
        template: 'gabiAlert',
        data:     { spent, limit, pct },
        tag:      'gabi-alert',
        dedupKey,
    });
    // ── Audit log: alerta disparado ───────────────────────────────────
    if (prismaInst) {
        const tipo = pct >= 100 ? 'Limite 100% atingido' : `Alerta de ${Math.round(pct)}% do limite`;
        audit.log(prismaInst, {
            actor,
            action:      'SYSTEM',
            entity_type: 'gabi_settings',
            entity_id:   'gabi',
            entity_name: 'Gabi AI',
            description: `${tipo}: gasto mensal R$${spent.toFixed(4)} / limite R$${limit.toFixed(2)} (${pct.toFixed(1)}%) — alerta enviado para ${alertEmail}`,
            meta:        { spent, limit, pct: parseFloat(pct.toFixed(2)), alert_email: alertEmail, tipo },
        });
    }
}

/**
 * Verifica se o limite/alerta foi cruzado nesta chamada e envia e-mail se necessário.
 * Detecção de cruzamento: gasto anterior estava abaixo, agora está acima.
 */
async function _verificarEEnviarAlerta(newCostUsd, prismaInst = null, actor = null) {
    try {
        const now   = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const anoMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const agg = await prisma.gabi_usage_logs.aggregate({
            _sum: { cost_usd: true },
            where: { created_at: { gte: start, lt: end } },
        });

        const totalSpent = parseFloat(agg._sum?.cost_usd || 0);
        const limit      = parseFloat(process.env.GABI_MONTHLY_LIMIT_USD || '20');
        const alertPct   = parseFloat(process.env.GABI_ALERT_PCT || '80');
        const currentPct = (totalSpent / limit) * 100;
        const prevSpent  = totalSpent - newCostUsd;
        const prevPct    = (prevSpent / limit) * 100;

        // Alerta de percentual configurado
        if (prevPct < alertPct && currentPct >= alertPct) {
            const key = `${anoMes}_PCT${Math.floor(alertPct)}`;
            if (!_alertsEnviados.has(key)) {
                _alertsEnviados.add(key);
                await _enviarAlertaGabi(totalSpent, limit, currentPct, `gabi-alert-${key}`, prismaInst, actor);
            }
        }

        // Alerta de limite 100% atingido
        if (prevSpent < limit && totalSpent >= limit) {
            const key = `${anoMes}_LIMITE`;
            if (!_alertsEnviados.has(key)) {
                _alertsEnviados.add(key);
                await _enviarAlertaGabi(totalSpent, limit, currentPct, `gabi-alert-${key}`, prismaInst, actor);
            }
        }
    } catch (alertErr) {
        console.warn('[Gabi Alert] Erro ao verificar threshold:', alertErr.message);
    }
}

/**
 * Verifica o ESTADO ATUAL do gasto (sem depender de cruzamento naquela chamada).
 * Usado quando o usuário altera o limite/percentual — pode já estar acima do novo threshold.
 * A chave de dedup garante que o mesmo alerta não seja reenviado no mesmo mês.
 */
async function _verificarEstadoAtual(prismaInst = null, actor = null) {
    try {
        const now    = new Date();
        const start  = new Date(now.getFullYear(), now.getMonth(), 1);
        const end    = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const anoMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const agg = await prisma.gabi_usage_logs.aggregate({
            _sum: { cost_usd: true },
            where: { created_at: { gte: start, lt: end } },
        });

        const totalSpent = parseFloat(agg._sum?.cost_usd || 0);
        const limit      = parseFloat(process.env.GABI_MONTHLY_LIMIT_USD || '20');
        const alertPct   = parseFloat(process.env.GABI_ALERT_PCT || '80');
        const currentPct = (totalSpent / limit) * 100;

        // Já está acima do percentual de alerta?
        if (currentPct >= alertPct) {
            const key = `${anoMes}_PCT${Math.floor(alertPct)}`;
            if (!_alertsEnviados.has(key)) {
                _alertsEnviados.add(key);
                console.log(`[Gabi Alert] ⚡ Alerta disparado ao salvar configurações: ${currentPct.toFixed(1)}% >= ${alertPct}%`);
                await _enviarAlertaGabi(totalSpent, limit, currentPct, `gabi-alert-${key}`, prismaInst, actor);
            }
        }

        // Já ultrapassou o limite (100%)?
        if (totalSpent >= limit) {
            const key = `${anoMes}_LIMITE`;
            if (!_alertsEnviados.has(key)) {
                _alertsEnviados.add(key);
                console.log(`[Gabi Alert] ⚡ Limite atingido ao salvar configurações: ${totalSpent} >= ${limit}`);
                await _enviarAlertaGabi(totalSpent, limit, currentPct, `gabi-alert-${key}`, prismaInst, actor);
            }
        }
    } catch (alertErr) {
        console.warn('[Gabi Alert] Erro ao verificar estado atual:', alertErr.message);
    }
}

const router2 = router; // alias — mantém compatibilidade com export

// ── Helpers para configurações persistidas no banco ───────────────────────────
// Lê um valor de app_settings (ou retorna o fallback)
async function getSetting(key, fallback = null) {
    try {
        const row = await prisma.app_settings.findUnique({ where: { key } });
        return row?.value || fallback;
    } catch {
        return fallback;
    }
}

// Obtém a API key do Gemini: banco tem prioridade, depois env
async function getGeminiApiKey() {
    return getSetting('gemini_api_key', process.env.GEMINI_API_KEY || null);
}

// Modelos em ordem de preferência para TEXTO + TOOL USE
const GEMINI_MODELS  = [
    'gemini-2.5-flash',          // principal: mais recente e estável
    'gemini-2.0-flash-lite',     // fallback leve e rápido
    'gemini-flash-latest',       // alias que sempre aponta para versão atual
    'gemini-2.0-flash',          // último recurso (funciona em planos legados)
    'gemini-pro-latest',         // fallback final
];

// Modelos para VISÃO (multimodal — inlineData). Estes são estritamente multimodais
// e não recebem tools para evitar conflito com inlineData.
const GEMINI_VISION_MODELS = [
    'gemini-2.0-flash',           // melhor suporte vision + mais estável
    'gemini-1.5-flash',           // excelente para visão, muito maduro
    'gemini-1.5-pro',             // fallback de alta qualidade
    'gemini-2.5-flash',           // tentativa com mais novo
    'gemini-flash-latest',        // alias genérico
];

// Preços USD por 1M tokens (Gemini 2.0 Flash)
const PRICE_INPUT  = 0.075 / 1_000_000;
const PRICE_OUTPUT = 0.30  / 1_000_000;

// Helper: gera conteúdo TEXTUAL com tool-use (sem imagem)
async function geminiGenerate(body) {
    const apiKey = await getGeminiApiKey();
    let lastErr;
    for (const model of GEMINI_MODELS) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), 15_000);
        try {
            const resp = await fetch(url, {
                method: 'POST',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            clearTimeout(timeoutId);
            if (resp.ok) {
                const data = await resp.json();
                data._model_used = model;
                return data;
            }
            const errBody = await resp.json().catch(() => ({}));
            if (resp.status === 429 || resp.status === 404 || resp.status === 503) {
                console.warn(`[Gabi] Modelo ${model} falhou (${resp.status}), tentando próximo...`);
                lastErr = errBody;
                continue;
            }
            throw new Error(`Gemini ${resp.status}: ${JSON.stringify(errBody)}`);
        } catch (e) {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') {
                console.warn(`[Gabi] Modelo ${model} timeout (>10s), tentando próximo...`);
                lastErr = { error: 'timeout' };
                continue;
            }
            throw e;
        }
    }
    throw new Error(`Gemini: todos os modelos falharam. Último erro: ${JSON.stringify(lastErr)}`);
}

// Helper: gera conteúdo MULTIMODAL (com imagem/visão) — SEM tool_use
// Os modelos de visão não recebem tools pois isso confunde o Gemini
// quando há inlineData na mesma requisição.
async function geminiGenerateVision(body) {
    const apiKey = await getGeminiApiKey();
    let lastErr;
    // Remove tools do body vision — inlineData + tools não se misturam bem
    const visionBody = { ...body };
    delete visionBody.tools;

    for (const model of GEMINI_VISION_MODELS) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), 30_000); // 30s — imagens são mais lentas
        try {
            const resp = await fetch(url, {
                method: 'POST',
                signal: controller.signal,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(visionBody),
            });
            clearTimeout(timeoutId);
            if (resp.ok) {
                const data = await resp.json();
                data._model_used = model;
                console.log(`[Gabi Vision] ✅ Modelo ${model} respondeu com visão`);
                return data;
            }
            const errBody = await resp.json().catch(() => ({}));
            console.warn(`[Gabi Vision] Modelo ${model} falhou (${resp.status}):`, JSON.stringify(errBody).substring(0, 200));
            if (resp.status === 429 || resp.status === 404 || resp.status === 503) {
                lastErr = errBody;
                continue;
            }
            throw new Error(`Gemini Vision ${resp.status}: ${JSON.stringify(errBody)}`);
        } catch (e) {
            clearTimeout(timeoutId);
            if (e.name === 'AbortError') {
                console.warn(`[Gabi Vision] Modelo ${model} timeout (>30s), tentando próximo...`);
                lastErr = { error: 'timeout' };
                continue;
            }
            throw e;
        }
    }
    throw new Error(`Gemini Vision: todos os modelos falharam. Último erro: ${JSON.stringify(lastErr)}`);
}

// ── Tools disponíveis ─────────────────────────────────────────────────────────
const GABI_TOOLS = [{
    function_declarations: [
        {
            name: 'get_my_companies',
            description: 'Retorna a lista de empresas às quais o usuário atual tem acesso (vinculadas via membership para standard; todas para master). Use SEMPRE que precisar saber quais empresas o usuário pode ver, editar ou criar atividades.',
            parameters: { type: 'object', properties: {} }
        },
        {
            name: 'query_companies',
            description: 'Busca empresas com filtros. Para usuários standard, automaticamente filtra pelas empresas às quais tem acesso. Use para perguntas sobre clientes, status, health, NPS.',
            parameters: {
                type: 'object',
                properties: {
                    nome:         { type: 'string', description: 'Busca parcial no nome (case-insensitive)' },
                    starts_with:  { type: 'string', description: 'Filtra empresas cujo nome começa com esta letra/prefixo (ex: "A", "B", "AB")' },
                    status:       { type: 'string', description: 'Prospect | Lead | Reunião | Proposta | Em Contrato | Ativo | Suspenso | Inativo' },
                    health_score: { type: 'string', description: 'Saudável | Atenção | Risco' },
                    segmento:     { type: 'string' },
                    limit:        { type: 'number', description: 'Máximo de resultados (padrão: 20, máx: 100)' },
                }
            }
        },
        {
            name: 'query_activities',
            description: 'Busca atividades/tarefas. Use para perguntas sobre tarefas, reuniões, próximos passos. IMPORTANTE: Para contar atividades (ex: quantas estão Em Andamento), sempre use limit: 200 para garantir que você vê TODAS. O padrão é 50.',
            parameters: {
                type: 'object',
                properties: {
                    user_id:       { type: 'string' },
                    company_id:    { type: 'string' },
                    activity_type: { type: 'string' },
                    status:        { type: 'string', description: 'A Fazer | Em Andamento | Concluída | Cancelada' },
                    date_from:     { type: 'string' },
                    date_to:       { type: 'string' },
                    limit:         { type: 'number', description: 'Máximo de resultados. Para contagem/listagem completa use 200.' },
                }
            }
        },
        {
            name: 'get_helpdesk_stats',
            description: 'Calcula estatísticas de horas de help desk (Chamados HD e/ou Chamados CS) agrupadas por empresa/cliente. Use quando o usuário perguntar sobre total de horas, tempo gasto, horas por cliente, horas do mês, etc. Retorna total de horas e minutos gastos por empresa no período.',
            parameters: {
                type: 'object',
                properties: {
                    user_id:       { type: 'string', description: 'Filtrar por responsável (ID do usuário)' },
                    activity_type: { type: 'string', description: 'Chamados HD | Chamados CS | (vazio = ambos)' },
                    date_from:     { type: 'string', description: 'Data início ISO 8601 (ex: 2026-03-01)' },
                    date_to:       { type: 'string', description: 'Data fim ISO 8601 (ex: 2026-03-31)' },
                    group_by:      { type: 'string', description: 'empresa | tipo | usuario (padrão: empresa)' },
                }
            }
        },
        {
            name: 'get_user_schedule',
            description: 'Retorna agenda da semana (reuniões/compromissos) do usuário.',
            parameters: {
                type: 'object',
                properties: {
                    user_id:     { type: 'string' },
                    week_offset: { type: 'number', description: '0=atual, 1=próxima, -1=passada' },
                }
            }
        },
        {
            name: 'get_pending_tasks',
            description: 'Tarefas pendentes do usuário (fase: A Fazer ou Em Andamento).',
            parameters: {
                type: 'object',
                properties: {
                    user_id:      { type: 'string' },
                    overdue_only: { type: 'boolean' },
                }
            }
        },
        {
            name: 'get_summary_stats',
            description: 'Estatísticas gerais do CRM: totais de empresas, atividades, tarefas pendentes. Para usuários standard, retorna apenas dados das empresas às quais tem acesso.',
            parameters: { type: 'object', properties: {} }
        },
        {
            name: 'get_company_detail',
            description: 'Detalhes completos de uma empresa: contatos, produtos, atividades recentes.',
            parameters: {
                type: 'object',
                properties: {
                    company_name: { type: 'string' },
                    company_id:   { type: 'string' },
                }
            }
        },
        {
            name: 'query_users',
            description: 'Lista usuários do time.',
            parameters: {
                type: 'object',
                properties: {
                    user_type:  { type: 'string' },
                    department: { type: 'string' },
                }
            }
        },

        // ── TOOLS DE ESCRITA ──────────────────────────────────────────────────
        {
            name: 'create_company',
            description: 'Cria uma nova empresa no CRM. ATENÇÃO: empresa NÃO tem campo de email. Email fica em contatos (use create_contact). Campos disponíveis na empresa: nome, status, segmento, cidade, estado, site, cnpj, erp, tipo, lead, health.',
            parameters: {
                type: 'object',
                properties: {
                    nome:     { type: 'string', description: 'Nome da empresa (obrigatório)' },
                    status:   { type: 'string', description: 'Prospect | Lead | Reunião | Proposta | Em Contrato | Ativo | Suspenso | Inativo' },
                    segmento: { type: 'string', description: 'Segmento da empresa' },
                    cidade:   { type: 'string' },
                    estado:   { type: 'string' },
                    site:     { type: 'string', description: 'Site/URL da empresa' },
                    cnpj:     { type: 'string', description: 'CNPJ da empresa' },
                    erp:      { type: 'string', description: 'ERP utilizado' },
                    tipo:     { type: 'string', description: 'Tipo da empresa' },
                    lead:     { type: 'string', description: 'Origem do lead' },
                    health:   { type: 'string', description: 'Saudável | Atenção | Risco' },
                },
                required: ['nome']
            }
        },
        {
            name: 'update_company',
            description: 'Atualiza campos de uma empresa existente. ATENÇÃO: empresa NÃO tem campo de email — email fica em contatos. Campos atualizáveis: status, health, nps, segmento, cidade, estado, site, cnpj, erp, tipo, lead.',
            parameters: {
                type: 'object',
                properties: {
                    company_id:   { type: 'string', description: 'ID da empresa' },
                    company_name: { type: 'string', description: 'Nome para buscar se não tiver o ID' },
                    status:       { type: 'string' },
                    health:       { type: 'string', description: 'Saudável | Atenção | Risco' },
                    nps:          { type: 'string' },
                    segmento:     { type: 'string' },
                    cidade:       { type: 'string' },
                    estado:       { type: 'string' },
                    site:         { type: 'string' },
                    cnpj:         { type: 'string' },
                    erp:          { type: 'string' },
                    tipo:         { type: 'string' },
                    lead:         { type: 'string' },
                },
                required: []
            }
        },
        {
            name: 'create_activity',
            description: 'Cria uma nova atividade/tarefa no CRM. Use quando o usuário pedir para criar/registrar uma atividade, reunião, tarefa ou comentário.',
            parameters: {
                type: 'object',
                properties: {
                    title:         { type: 'string', description: 'Título da atividade (obrigatório)' },
                    activity_type: { type: 'string', description: 'Comentário | Reunião | Chamados HD | Chamados CS | Ação necessária (obrigatório)' },
                    department:    { type: 'string', description: 'CS | Comercial | Produto | Financeiro | TI (obrigatório)' },
                    description:   { type: 'string' },
                    company_name:  { type: 'string', description: 'Nome da empresa (para buscar o ID)' },
                    company_id:    { type: 'string' },
                    assignee_ids:  { type: 'array', items: { type: 'string' }, description: 'IDs dos responsáveis' },
                    activity_datetime: { type: 'string', description: 'ISO 8601 datetime (ex: 2026-03-15T14:00:00)' },
                    priority:      { type: 'string', description: 'Baixa | Média | Alta | Urgente' },
                    status:        { type: 'string', description: 'A Fazer | Em Andamento | Concluída | Cancelada' },
                    next_step_title: { type: 'string', description: 'Próximo passo' },
                    next_step_date:  { type: 'string', description: 'Data do próximo passo (ISO 8601)' },
                },
                required: ['title', 'activity_type', 'department']
            }
        },
        {
            name: 'update_activity',
            description: 'Atualiza uma atividade existente (fase, próximo passo, prioridade, etc.).',
            parameters: {
                type: 'object',
                properties: {
                    activity_id:     { type: 'string', description: 'ID da atividade (obrigatório)' },
                    status:          { type: 'string', description: 'A Fazer | Em Andamento | Concluída | Cancelada' },
                    priority:        { type: 'string' },
                    description:     { type: 'string' },
                    next_step_title: { type: 'string' },
                    next_step_date:  { type: 'string' },
                    time_spent_minutes: { type: 'number' },
                },
                required: ['activity_id']
            }
        },
        {
            name: 'create_contact',
            description: 'Cria um novo contato vinculado a uma empresa. CONTATOS têm: nome, cargo, departamento, email (Email_1), whatsapp, linkedin. NÃO têm telefone fixo. Para adicionar email a uma empresa, crie um contato.',
            parameters: {
                type: 'object',
                properties: {
                    company_id:    { type: 'string', description: 'ID da empresa' },
                    company_name:  { type: 'string', description: 'Nome da empresa para buscar o ID' },
                    nome:          { type: 'string', description: 'Nome do contato (obrigatório)' },
                    cargo:         { type: 'string', description: 'Cargo/função do contato' },
                    departamento:  { type: 'string', description: 'Departamento do contato' },
                    email:         { type: 'string', description: 'Email (campo Email_1 no banco)' },
                    whatsapp:      { type: 'string', description: 'WhatsApp do contato' },
                    linkedin:      { type: 'string', description: 'URL do LinkedIn do contato' },
                },
                required: ['nome']
            }
        },
        {
            name: 'update_contact',
            description: 'Atualiza campos de um contato existente (cargo, email, whatsapp, linkedin, etc.).',
            parameters: {
                type: 'object',
                properties: {
                    contact_id:   { type: 'string', description: 'ID do contato (obrigatório)' },
                    nome:         { type: 'string', description: 'Nome do contato' },
                    cargo:        { type: 'string', description: 'Cargo/função' },
                    departamento: { type: 'string', description: 'Departamento' },
                    email:        { type: 'string', description: 'Email principal' },
                    whatsapp:     { type: 'string', description: 'WhatsApp' },
                    linkedin:     { type: 'string', description: 'URL do LinkedIn' },
                },
                required: ['contact_id']
            }
        },
        {
            name: 'delete_contact',
            description: 'Exclui permanentemente um contato. Use apenas quando o usuário confirmar explicitamente a exclusão. Solicite o ID do contato — se não souber, use get_company_detail para listar os contatos da empresa.',
            parameters: {
                type: 'object',
                properties: {
                    contact_id:   { type: 'string', description: 'ID do contato a excluir (obrigatório)' },
                    contact_name: { type: 'string', description: 'Nome do contato (para confirmação na resposta)' },
                },
                required: ['contact_id']
            }
        },
        {
            name: 'delete_activity',
            description: 'Exclui permanentemente uma atividade/tarefa/registro. Use apenas quando o usuário confirmar explicitamente. ATENÇÃO: esta ação é irreversível.',
            parameters: {
                type: 'object',
                properties: {
                    activity_id: { type: 'string', description: 'ID da atividade a excluir (obrigatório)' },
                },
                required: ['activity_id']
            }
        },
        {
            name: 'delete_company',
            description: 'Exclui permanentemente uma empresa e TODOS os seus dados (contatos, atividades, produtos). Use APENAS quando o usuário confirmar explicitamente. ATENÇÃO: ação irreversível. Solicite o nome ou ID da empresa e peça confirmação antes de executar.',
            parameters: {
                type: 'object',
                properties: {
                    company_id:   { type: 'string', description: 'ID da empresa' },
                    company_name: { type: 'string', description: 'Nome para buscar se não tiver o ID' },
                    confirmed:    { type: 'boolean', description: 'true = usuário confirmou a exclusão explicitamente' },
                },
                required: ['confirmed']
            }
        },

        // ── TOOL DE ACESSO GENÉRICO AO BANCO ────────────────────────────────
        {
            name: 'query_database',
            description: `Acessa QUALQUER tabela do banco de dados Journey. Use para perguntas que não são cobertas pelas outras tools: gastos da Gabi, configurações, histórico de alterações, contratos/produtos de empresas, follow-ups, notas, reuniões, tickets, NPS histórico, catálogo de produtos, convites, testes, importações, etc.

Tabelas disponíveis:
- gabi_usage_logs     → gastos de API, tokens, custo por chamada (campos: user_id, input_tokens, output_tokens, cost_usd, created_at)
- audit_logs          → histórico completo de TODAS as alterações do sistema (campos: actor_id, actor_label, action, entity_type, entity_id, entity_name, description, meta, company_id, created_at)
- company_products    → produtos/contratos de empresas (campos: companyId, Produto_DATI, Tipo_cobranca, Valor_unitario, Valor_total, Data_do_contrato, Qtd_usuarios, Total_horas_hd, Valor_setup)
- company_followups   → histórico de follow-ups (campos: companyId, Conteudo, Usuario, Area, Data_inclusao, Data_proximo_contato)
- company_meetings    → reuniões por empresa (campos: companyId, Data_reuniao, Participantes, Temperatura, Link_gravacao, Observacoes, Tipo_reuniao)
- company_notes       → notas internas de empresas (campos: companyId, Conteudo, Autor, Data)
- company_nps         → scores NPS históricos (campos: companyId, Data, Destinatario, Score, Formulario)
- company_tickets     → tickets/chamados por empresa (campos: companyId, Data, Numero, Resumo, Autor, Link)
- product_catalog     → catálogo de produtos DATI (campos: nome, descricao, categoria, status, beneficios, publico_alvo)
- product_historico   → histórico de faturamento/pagamento (campos: productId, Data_faturamento, Data_pagamento, Anexo_NF)
- user_memberships    → vínculos usuário↔empresa (campos: user_id, company_id, can_create, can_edit, can_delete, can_export, invited_by, joined_at)
- user_invites        → convites pendentes (campos: email, company_mom_id, user_type, status, expires_at, accepted_at)
- test_runs           → execuções de testes (campos: suite_type, status, total_tests, passed_tests, failed_tests, duration_ms, triggered_at)
- test_cases          → casos de teste individuais (campos: test_name, status, duration_ms, error_message, suite_file, module)
- import_jobs         → jobs de importação em massa (campos: status, total_rows, valid_rows, error_rows, filename, created_at)
- email_send_log      → log de e-mails enviados (campos: dedup_key, recipient, subject, template, sent_at)

Permissões aplicadas automaticamente conforme perfil do usuário.`,
            parameters: {
                type: 'object',
                properties: {
                    table:      { type: 'string', description: 'Nome da tabela (ex: gabi_usage_logs, audit_logs, company_products, etc.)' },
                    filters:    { type: 'object', description: 'Filtros como objeto chave-valor (ex: {"companyId": "abc", "status": "Ativo"}). Para datas use {"date_from": "2026-03-01", "date_to": "2026-03-31"}.' },
                    order_by:   { type: 'string', description: 'Campo para ordenar (ex: created_at, Data_faturamento). Padrão: created_at desc.' },
                    order_dir:  { type: 'string', description: 'asc | desc (padrão: desc)' },
                    limit:      { type: 'number',  description: 'Máximo de registros (padrão: 50, máx: 500)' },
                    company_name: { type: 'string', description: 'Nome da empresa para resolver company_id automaticamente (quando a tabela exige companyId/company_id)' },
                },
                required: ['table']
            }
        },

        // ── CONFIGURAÇÕES E GASTOS DA GABI ───────────────────────────────────
        {
            name: 'get_gabi_settings',
            description: 'Retorna as configurações atuais da Gabi AI: limite mensal de gasto (USD), percentual de alerta, e-mail de alerta. Também retorna o gasto atual do mês corrente. Use quando o usuário perguntar sobre custos, limites ou configurações da Gabi.',
            parameters: { type: 'object', properties: {} }
        },

        // ── WHATSAPP ──────────────────────────────────────────────────────────
        {
            name: 'send_whatsapp_message',
            description: 'Envia uma mensagem de WhatsApp para um contato cadastrado no Journey. Use quando o usuário pedir para enviar uma mensagem via WhatsApp para um contato.',
            parameters: {
                type: 'object',
                properties: {
                    contact_id: { type: 'string', description: 'ID do contato no Journey' },
                    message:    { type: 'string', description: 'Texto da mensagem a enviar' },
                },
                required: ['contact_id', 'message'],
            }
        },
        {
            name: 'get_whatsapp_history',
            description: 'Busca o histórico de conversas WhatsApp de um contato cadastrado no Journey.',
            parameters: {
                type: 'object',
                properties: {
                    contact_id: { type: 'string', description: 'ID do contato no Journey' },
                    limit:      { type: 'number', description: 'Máximo de mensagens a retornar (padrão: 20)' },
                },
                required: ['contact_id'],
            }
        },
    ]
}];

// ── Executores das tools ───────────────────────────────────────────────────────
// Contexto do usuário corrente injetado antes de cada chamada
let _currentUser = null;

async function execTool(name, args = {}) {
    const isMaster = _currentUser?.user_type === 'master';
    const userId   = _currentUser?.id;

    // ── get_my_companies ──────────────────────────────────────────────────────
    if (name === 'get_my_companies') {
        if (isMaster) {
            // Master vê todas
            const rows = await prisma.companies.findMany({
                select: { id: true, Nome_da_empresa: true, Status: true, Health_Score: true, Segmento_da_empresa: true },
                orderBy: { Nome_da_empresa: 'asc' },
                take: 200,
            });
            return { role: 'master', total: rows.length, companies: rows.map(c => ({ id: c.id, nome: c.Nome_da_empresa, status: c.Status, health: c.Health_Score, segmento: c.Segmento_da_empresa })) };
        }
        // Standard — retorna apenas as empresas vinculadas via membership
        const memberships = await prisma.user_memberships.findMany({
            where: { user_id: userId },
            include: { company: { select: { id: true, Nome_da_empresa: true, Status: true, Health_Score: true, Segmento_da_empresa: true } } },
        });
        return {
            role: 'standard',
            total: memberships.length,
            companies: memberships.map(m => ({
                id: m.company.id, nome: m.company.Nome_da_empresa, status: m.company.Status,
                health: m.company.Health_Score, segmento: m.company.Segmento_da_empresa,
                permissoes: { criar: m.can_create, editar: m.can_edit, excluir: m.can_delete, exportar: m.can_export },
            }))
        };
    }

    if (name === 'query_companies') {
        const where = {};
        if (args.nome)         where.Nome_da_empresa    = { contains: args.nome,   mode: 'insensitive' };
        if (args.starts_with)  where.Nome_da_empresa    = { startsWith: args.starts_with, mode: 'insensitive' };
        if (args.status)       where.Status             = { contains: args.status, mode: 'insensitive' };
        if (args.health_score) where.Health_Score       = { contains: args.health_score, mode: 'insensitive' };
        if (args.segmento)     where.Segmento_da_empresa= { contains: args.segmento, mode: 'insensitive' };

        // Standard: restringe às empresas do membership
        if (!isMaster && userId) {
            const memberships = await prisma.user_memberships.findMany({ where: { user_id: userId }, select: { company_id: true } });
            const allowedIds  = memberships.map(m => m.company_id);
            where.id = { in: allowedIds };
        }

        const rows = await prisma.companies.findMany({
            where, take: Math.min(args.limit || 20, 100),
            select: { id: true, Nome_da_empresa: true, Status: true, Health_Score: true, NPS: true, Segmento_da_empresa: true, Cidade: true, Estado: true, Data_de_follow_up: true },
            orderBy: { Nome_da_empresa: 'asc' },
        });
        return rows.map(c => ({ id: c.id, nome: c.Nome_da_empresa, status: c.Status, health: c.Health_Score, nps: c.NPS, segmento: c.Segmento_da_empresa, cidade: c.Cidade, estado: c.Estado, followUp: c.Data_de_follow_up ? new Date(c.Data_de_follow_up).toLocaleDateString('pt-BR') : null }));
    }

    if (name === 'query_activities') {
        const where = {};
        if (args.company_id)    where.company_id    = args.company_id;
        if (args.activity_type) where.activity_type = args.activity_type;
        if (args.status)        where.status        = args.status;
        if (args.user_id)       where.activity_assignees = { some: { user_id: args.user_id } };
        if (args.date_from || args.date_to) {
            where.activity_datetime = {};
            if (args.date_from) where.activity_datetime.gte = new Date(args.date_from);
            if (args.date_to)   where.activity_datetime.lte = new Date(args.date_to);
        }
        const rows = await prisma.activities.findMany({
            where, take: Math.min(args.limit || 50, 200),
            orderBy: { activity_datetime: 'desc' },
            include: { companies: { select: { Nome_da_empresa: true } }, activity_assignees: { select: { user_id: true } } }
        });
        const result = rows.map(a => ({ id: a.id, tipo: a.activity_type, titulo: a.title, empresa: a.companies?.Nome_da_empresa || null, status: a.status, prioridade: a.priority, data: a.activity_datetime ? new Date(a.activity_datetime).toLocaleDateString('pt-BR') : null, responsaveis: a.activity_assignees.map(r => r.user_id), proximoPasso: a.next_step_title, prazo: a.next_step_date ? new Date(a.next_step_date).toLocaleDateString('pt-BR') : null, tempo_minutos: a.time_spent_minutes || null }));
        return { total: result.length, atividades: result };
    }

    // ── get_helpdesk_stats ────────────────────────────────────────────────────
    if (name === 'get_helpdesk_stats') {
        const where = {};
        // Filtra por tipo: Chamados HD, Chamados CS, ou ambos
        if (args.activity_type) {
            where.activity_type = args.activity_type;
        } else {
            where.activity_type = { in: ['Chamados HD', 'Chamados CS'] };
        }
        // Filtro por período
        if (args.date_from || args.date_to) {
            where.activity_datetime = {};
            if (args.date_from) where.activity_datetime.gte = new Date(args.date_from);
            if (args.date_to)   where.activity_datetime.lte = new Date(args.date_to);
        }
        // Filtro por responsável
        if (args.user_id) where.activity_assignees = { some: { user_id: args.user_id } };
        // Restrição standard
        if (!isMaster && userId) {
            const memberships = await prisma.user_memberships.findMany({ where: { user_id: userId }, select: { company_id: true } });
            const allowedIds  = memberships.map(m => m.company_id);
            where.company_id  = { in: allowedIds };
        }
        const rows = await prisma.activities.findMany({
            where,
            take: 500,
            select: {
                id: true,
                activity_type: true,
                title: true,
                time_spent_minutes: true,
                activity_datetime: true,
                company_id: true,
                companies: { select: { Nome_da_empresa: true } },
                activity_assignees: { select: { user_id: true } },
            },
            orderBy: { activity_datetime: 'desc' },
        });
        // Agrupa por empresa, tipo ou usuário
        const groupBy = args.group_by || 'empresa';
        const grouped = {};
        let totalMinutos = 0;
        for (const a of rows) {
            const minutos = a.time_spent_minutes || 0;
            totalMinutos += minutos;
            let key;
            if (groupBy === 'tipo') {
                key = a.activity_type || 'Sem tipo';
            } else if (groupBy === 'usuario') {
                const ids = a.activity_assignees.map(r => r.user_id).join(', ');
                key = ids || 'Sem responsável';
            } else {
                key = a.companies?.Nome_da_empresa || 'Sem empresa';
            }
            if (!grouped[key]) grouped[key] = { minutos: 0, registros: 0 };
            grouped[key].minutos   += minutos;
            grouped[key].registros += 1;
        }
        const resultado = Object.entries(grouped)
            .map(([chave, v]) => ({
                [groupBy]: chave,
                total_minutos: v.minutos,
                total_horas: parseFloat((v.minutos / 60).toFixed(2)),
                horas_formatadas: `${Math.floor(v.minutos / 60)}h${String(v.minutos % 60).padStart(2, '0')}min`,
                registros: v.registros,
            }))
            .sort((a, b) => b.total_minutos - a.total_minutos);
        return {
            periodo: {
                inicio: args.date_from || 'início',
                fim:    args.date_to   || 'agora',
            },
            total_registros: rows.length,
            total_minutos: totalMinutos,
            total_horas: parseFloat((totalMinutos / 60).toFixed(2)),
            total_horas_formatado: `${Math.floor(totalMinutos / 60)}h${String(totalMinutos % 60).padStart(2, '0')}min`,
            agrupado_por: groupBy,
            dados: resultado,
        };
    }

    if (name === 'get_user_schedule') {
        const offset   = args.week_offset || 0;
        const now      = new Date();
        const dow      = now.getDay();
        const monday   = new Date(now);
        monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1) + offset * 7);
        monday.setHours(0, 0, 0, 0);
        const sunday   = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        const where    = { activity_datetime: { gte: monday, lte: sunday }, activity_type: { in: ['Reunião', 'Ação necessária'] } };
        if (args.user_id) where.activity_assignees = { some: { user_id: args.user_id } };
        const items = await prisma.activities.findMany({ where, orderBy: { activity_datetime: 'asc' }, include: { companies: { select: { Nome_da_empresa: true } } } });
        return {
            semana: `${monday.toLocaleDateString('pt-BR')} – ${sunday.toLocaleDateString('pt-BR')}`,
            total: items.length,
            itens: items.map(a => ({ tipo: a.activity_type, titulo: a.title, empresa: a.companies?.Nome_da_empresa || null, data: a.activity_datetime ? new Date(a.activity_datetime).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null, status: a.status, meet: a.google_meet_link }))
        };
    }

    if (name === 'get_pending_tasks') {
        const now   = new Date();
        const where = { status: { in: ['A Fazer', 'Em Andamento'] } };
        if (args.user_id)     where.activity_assignees = { some: { user_id: args.user_id } };
        if (args.overdue_only) where.next_step_date    = { lt: now };
        const tasks = await prisma.activities.findMany({ where, orderBy: [{ next_step_date: 'asc' }], take: 20, include: { companies: { select: { Nome_da_empresa: true } } } });
        return {
            total: tasks.length,
            atrasadas: tasks.filter(t => t.next_step_date && new Date(t.next_step_date) < now).length,
            tarefas: tasks.map(t => ({ id: t.id, titulo: t.title, empresa: t.companies?.Nome_da_empresa || null, prioridade: t.priority, status: t.status, prazo: t.next_step_date ? new Date(t.next_step_date).toLocaleDateString('pt-BR') : null, atrasada: t.next_step_date ? new Date(t.next_step_date) < now : false }))
        };
    }

    if (name === 'get_summary_stats') {
        if (!isMaster && userId) {
            // Standard: apenas stats das empresas do seu membership
            const memberships = await prisma.user_memberships.findMany({ where: { user_id: userId }, select: { company_id: true } });
            const allowedIds  = memberships.map(m => m.company_id);
            const [total, rows, totalActs, pendingTasks] = await Promise.all([
                prisma.companies.count({ where: { id: { in: allowedIds } } }),
                prisma.companies.findMany({ where: { id: { in: allowedIds } }, select: { Status: true, Health_Score: true } }),
                prisma.activities.count({ where: { company_id: { in: allowedIds } } }),
                prisma.activities.count({ where: { company_id: { in: allowedIds }, status: { in: ['A Fazer', 'Em Andamento'] } } }),

            ]);
            const byStatus = {}; rows.forEach(r => { byStatus[r.Status || 'N/A'] = (byStatus[r.Status || 'N/A'] || 0) + 1; });
            const byHealth = {}; rows.forEach(r => { byHealth[r.Health_Score || 'N/A'] = (byHealth[r.Health_Score || 'N/A'] || 0) + 1; });
            return {
                scope: 'minhas_empresas',
                empresas: { total, porStatus: Object.entries(byStatus).map(([status, t]) => ({ status, total: t })), porSaude: Object.entries(byHealth).map(([saude, t]) => ({ saude, total: t })) },
                atividades: { total: totalActs, tarefasPendentes: pendingTasks },
            };
        }
        const [total, byStatus, byHealth, totalActs, pendingTasks] = await Promise.all([
            prisma.companies.count(),
            prisma.companies.groupBy({ by: ['Status'], _count: { id: true } }),
            prisma.companies.groupBy({ by: ['Health_Score'], _count: { id: true } }),
            prisma.activities.count(),
            prisma.activities.count({ where: { status: { in: ['A Fazer', 'Em Andamento'] } } }),

        ]);
        return {
            scope: 'todas_as_empresas',
            empresas: { total, porStatus: byStatus.map(s => ({ status: s.Status || 'N/A', total: s._count.id })), porSaude: byHealth.map(h => ({ saude: h.Health_Score || 'N/A', total: h._count.id })) },
            atividades: { total: totalActs, tarefasPendentes: pendingTasks },
        };
    }

    if (name === 'get_company_detail') {
        const company = await prisma.companies.findFirst({
            where: args.company_id ? { id: args.company_id } : { Nome_da_empresa: { contains: args.company_name || '', mode: 'insensitive' } },
            include: { contacts: { take: 5 }, company_products: true, activities: { take: 5, orderBy: { created_at: 'desc' } } }
        });
        if (!company) return { error: 'Empresa não encontrada' };
        return {
            id: company.id, nome: company.Nome_da_empresa, status: company.Status, health: company.Health_Score, nps: company.NPS,
            segmento: company.Segmento_da_empresa, cidade: company.Cidade, estado: company.Estado, site: company.Site,
            contatos: company.contacts.map(c => ({ nome: c.Nome_do_contato, cargo: c.Cargo_do_contato, email: c.Email_1 })),
            produtos: company.company_products.map(p => ({ nome: p.Produto_DATI, tipo: p.Tipo_cobranca })),
            ultimasAtividades: company.activities.map(a => ({ tipo: a.activity_type, titulo: a.title, data: a.created_at?.toLocaleDateString('pt-BR') })),
        };
    }

    if (name === 'query_users') {
        const where = {};
        if (args.user_type)  where.user_type  = args.user_type;
        if (args.department) where.department = { contains: args.department, mode: 'insensitive' };
        return prisma.users.findMany({ where, select: { id: true, nome: true, email: true, user_type: true, department: true, ativo: true }, orderBy: { nome: 'asc' } });
    }

    // ── create_company ────────────────────────────────────────────────────────
    if (name === 'create_company') {
        // Apenas usuários Master podem criar empresas
        if (!isMaster) {
            return { error: 'permission_denied', message: 'Você não tem permissão para criar empresas. Apenas usuários Master podem realizar esta operação. Solicite ao administrador do sistema.' };
        }
        const { randomUUID } = await import('crypto');
        const company = await prisma.companies.create({
            data: {
                id:                 randomUUID(),
                Nome_da_empresa:    args.nome,
                Status:             args.status    || 'Prospect',
                Segmento_da_empresa:args.segmento  || null,
                Cidade:             args.cidade    || null,
                Estado:             args.estado    || null,
                Site:               args.site      || null,
                Health_Score:       args.health    || 'Saudável',
                updatedAt:          new Date(),
            }
        });
        // ── Audit log: empresa criada pela Gabi ───────────────────────────────────
        audit.log(prisma, {
            actor:       _currentUser,
            action:      'CREATE',
            entity_type: 'company',
            entity_id:   company.id,
            entity_name: company.Nome_da_empresa,
            description: `Gabi: criou a empresa "${company.Nome_da_empresa}" (via assistente de IA)`,
            meta:        { status: company.Status, health: company.Health_Score, via: 'gabi' },
        });
        return { success: true, id: company.id, nome: company.Nome_da_empresa, status: company.Status, message: `Empresa "${company.Nome_da_empresa}" criada com sucesso!` };
    }

    // ── update_company ────────────────────────────────────────────────────────
    if (name === 'update_company') {
        // Apenas usuários Master podem editar empresas (por enquanto)
        if (!isMaster) {
            return { error: 'permission_denied', message: 'Você não tem permissão para editar empresas. Apenas usuários Master podem realizar esta operação.' };
        }
        let company;
        if (args.company_id) {
            company = await prisma.companies.findUnique({ where: { id: args.company_id } });
        } else if (args.company_name) {
            company = await prisma.companies.findFirst({ where: { Nome_da_empresa: { contains: args.company_name, mode: 'insensitive' } } });
        }
        if (!company) return { error: 'Empresa não encontrada. Informe o nome ou ID.' };
        const data = { updatedAt: new Date() };
        if (args.status   !== undefined) data.Status             = args.status;
        if (args.health   !== undefined) data.Health_Score       = args.health;
        if (args.nps      !== undefined) data.NPS                = args.nps;
        if (args.segmento !== undefined) data.Segmento_da_empresa= args.segmento;
        if (args.cidade   !== undefined) data.Cidade             = args.cidade;
        if (args.estado   !== undefined) data.Estado             = args.estado;
        if (args.site     !== undefined) data.Site               = args.site;
        if (args.cnpj     !== undefined) data.CNPJ_da_empresa    = args.cnpj;
        if (args.erp      !== undefined) data.ERP                = args.erp;
        if (args.tipo     !== undefined) data.Tipo_de_empresa     = args.tipo;
        if (args.lead     !== undefined) data.Lead               = args.lead;
        const updated = await prisma.companies.update({ where: { id: company.id }, data });
        // ── Audit log: empresa editada pela Gabi ────────────────────────────────
        const { description: diffDesc, meta: diffMeta } = audit.diff(company, data, 'company', company.Nome_da_empresa);
        audit.log(prisma, {
            actor:       _currentUser,
            action:      'UPDATE',
            entity_type: 'company',
            entity_id:   updated.id,
            entity_name: updated.Nome_da_empresa,
            description: `Gabi: ${diffDesc}`,
            meta:        { ...diffMeta, via: 'gabi' },
        });
        return { success: true, id: updated.id, nome: updated.Nome_da_empresa, message: `Empresa "${updated.Nome_da_empresa}" atualizada com sucesso!` };
    }

    // ── create_activity ───────────────────────────────────────────────────────
    if (name === 'create_activity') {
        const { randomUUID } = await import('crypto');
        // Resolve company_id se só vieram nome
        let company_id = args.company_id || null;
        if (!company_id && args.company_name) {
            const c = await prisma.companies.findFirst({ where: { Nome_da_empresa: { contains: args.company_name, mode: 'insensitive' } } });
            company_id = c?.id || null;
        }
        const actId = randomUUID();
        const activity = await prisma.activities.create({
            data: {
                id:                actId,
                title:             args.title,
                activity_type:     args.activity_type,
                department:        args.department,
                description:       args.description    || null,
                company_id:        company_id,
                activity_datetime: args.activity_datetime ? new Date(args.activity_datetime) : new Date(),
                priority:          args.priority       || 'Média',
                status:            args.status         || 'A Fazer',
                next_step_title:   args.next_step_title|| null,
                next_step_date:    args.next_step_date ? new Date(args.next_step_date) : null,
                created_by_user_id: null, // criada pela Gabi
                ...(args.assignee_ids?.length ? {
                    activity_assignees: { create: args.assignee_ids.map(uid => ({ id: randomUUID(), user_id: uid })) }
                } : {})
            }
        });
        // ── Audit log: atividade criada pela Gabi ────────────────────────────
        audit.log(prisma, {
            actor:       _currentUser,
            action:      'CREATE',
            entity_type: 'activity',
            entity_id:   activity.id,
            entity_name: activity.title,
            description: `Gabi: criou a atividade "${activity.title}" (${activity.activity_type})`,
            meta:        { type: activity.activity_type, status: activity.status, company_id, via: 'gabi' },
            company_id,
        });
        return { success: true, id: activity.id, titulo: activity.title, message: `Atividade "${activity.title}" criada com sucesso! ID: ${activity.id}` };
    }

    // ── update_activity ───────────────────────────────────────────────────────
    if (name === 'update_activity') {
        const activity = await prisma.activities.findUnique({ where: { id: args.activity_id } });
        if (!activity) return { error: `Atividade com ID "${args.activity_id}" não encontrada.` };
        const data = { updated_at: new Date() };
        if (args.status             !== undefined) data.status              = args.status;
        if (args.priority           !== undefined) data.priority            = args.priority;
        if (args.description        !== undefined) data.description         = args.description;
        if (args.next_step_title    !== undefined) data.next_step_title     = args.next_step_title;
        if (args.next_step_date     !== undefined) data.next_step_date      = new Date(args.next_step_date);
        if (args.time_spent_minutes !== undefined) data.time_spent_minutes  = args.time_spent_minutes;
        const updated = await prisma.activities.update({ where: { id: args.activity_id }, data });
        // ── Audit log: atividade editada pela Gabi ───────────────────────────
        const { description: actDiffDesc, meta: actDiffMeta } = audit.diff(activity, data, 'activity', activity.title);
        audit.log(prisma, {
            actor:       _currentUser,
            action:      'UPDATE',
            entity_type: 'activity',
            entity_id:   updated.id,
            entity_name: updated.title,
            description: `Gabi: ${actDiffDesc}`,
            meta:        { ...actDiffMeta, via: 'gabi' },
            company_id:  updated.company_id || null,
        });
        return { success: true, id: updated.id, titulo: updated.title, status: updated.status, message: `Atividade "${updated.title}" atualizada com sucesso!` };
    }

    // ── create_contact ────────────────────────────────────────────────────────
    if (name === 'create_contact') {
        const { randomUUID } = await import('crypto');
        let company_id = args.company_id || null;
        if (!company_id && args.company_name) {
            const c = await prisma.companies.findFirst({ where: { Nome_da_empresa: { contains: args.company_name, mode: 'insensitive' } } });
            company_id = c?.id || null;
        }
        if (!company_id) return { error: 'Empresa não encontrada. Informe o nome ou ID da empresa.' };
        const contact = await prisma.contacts.create({
            data: {
                id:                     randomUUID(),
                companyId:              company_id,
                Nome_do_contato:        args.nome,
                Cargo_do_contato:       args.cargo        || null,
                Departamento_do_contato:args.departamento || null,
                Email_1:                args.email        || null,
                WhatsApp:               args.whatsapp     || null,
                LinkedIn:               args.linkedin     || null,
                updatedAt:              new Date(),
            }
        });
        // ── Audit log: contato criado pela Gabi ──────────────────────────────
        audit.log(prisma, {
            actor:       _currentUser,
            action:      'CREATE',
            entity_type: 'contact',
            entity_id:   contact.id,
            entity_name: contact.Nome_do_contato,
            description: `Gabi: criou o contato "${contact.Nome_do_contato}" (${contact.Email_1 || 'sem email'})`,
            meta:        { email: contact.Email_1, cargo: contact.Cargo_do_contato, company_id, via: 'gabi' },
            company_id,
        });
        return { success: true, id: contact.id, nome: contact.Nome_do_contato, email: contact.Email_1, message: `Contato "${contact.Nome_do_contato}" criado com sucesso! Email: ${contact.Email_1 || 'não informado'}` };
    }

    // ── update_contact ────────────────────────────────────────────────────────
    if (name === 'update_contact') {
        const contact = await prisma.contacts.findUnique({ where: { id: args.contact_id } });
        if (!contact) return { error: `Contato com ID "${args.contact_id}" não encontrado.` };
        const data = { updatedAt: new Date() };
        if (args.nome         !== undefined) data.Nome_do_contato         = args.nome;
        if (args.cargo        !== undefined) data.Cargo_do_contato        = args.cargo;
        if (args.departamento !== undefined) data.Departamento_do_contato = args.departamento;
        if (args.email        !== undefined) data.Email_1                 = args.email;
        if (args.whatsapp     !== undefined) data.WhatsApp                = args.whatsapp;
        if (args.linkedin     !== undefined) data.LinkedIn                = args.linkedin;
        const updated = await prisma.contacts.update({ where: { id: args.contact_id }, data });
        // ── Audit log: contato editado pela Gabi ─────────────────────────────
        const { description: ctDiffDesc, meta: ctDiffMeta } = audit.diff(contact, data, 'contact', contact.Nome_do_contato);
        audit.log(prisma, {
            actor:       _currentUser,
            action:      'UPDATE',
            entity_type: 'contact',
            entity_id:   updated.id,
            entity_name: updated.Nome_do_contato,
            description: `Gabi: ${ctDiffDesc}`,
            meta:        { ...ctDiffMeta, via: 'gabi' },
            company_id:  updated.companyId || null,
        });
        return { success: true, id: updated.id, nome: updated.Nome_do_contato, message: `Contato "${updated.Nome_do_contato}" atualizado com sucesso!` };
    }

    // ── delete_contact ────────────────────────────────────────────────────────
    if (name === 'delete_contact') {
        if (!isMaster) {
            return { error: 'permission_denied', message: 'Você não tem permissão para excluir contatos. Apenas usuários Master podem realizar esta operação.' };
        }
        const contact = await prisma.contacts.findUnique({ where: { id: args.contact_id } });
        if (!contact) return { error: `Contato com ID "${args.contact_id}" não encontrado.` };
        await prisma.contacts.delete({ where: { id: args.contact_id } });
        const nome = args.contact_name || contact.Nome_do_contato || args.contact_id;
        // ── Audit log: contato excluído pela Gabi ──────────────────────────
        audit.log(prisma, {
            actor:       _currentUser,
            action:      'DELETE',
            entity_type: 'contact',
            entity_id:   args.contact_id,
            entity_name: nome,
            description: `Gabi: excluiu o contato "${nome}"`,
            meta:        { email: contact.Email_1, company_id: contact.companyId, via: 'gabi' },
            company_id:  contact.companyId || null,
        });
        return { success: true, message: `Contato "${nome}" excluído com sucesso.` };
    }

    // ── delete_activity ───────────────────────────────────────────────────────
    if (name === 'delete_activity') {
        const activity = await prisma.activities.findUnique({
            where: { id: args.activity_id },
            include: { activity_assignees: { select: { user_id: true } } }
        });
        if (!activity) return { error: `Atividade com ID "${args.activity_id}" não encontrada.` };
        // Standard só pode excluir atividades que ele mesmo é responsável
        if (!isMaster) {
            const isAssignee = activity.activity_assignees.some(a => a.user_id === userId);
            if (!isAssignee) {
                return { error: 'permission_denied', message: 'Você não tem permissão para excluir esta atividade. Apenas o responsável ou um usuário Master pode excluí-la.' };
            }
        }
        // Remove assignees primeiro (FK), depois a atividade
        await prisma.activity_assignees.deleteMany({ where: { activity_id: args.activity_id } });
        await prisma.activities.delete({ where: { id: args.activity_id } });
        // ── Audit log: atividade excluída pela Gabi ────────────────────────
        audit.log(prisma, {
            actor:       _currentUser,
            action:      'DELETE',
            entity_type: 'activity',
            entity_id:   args.activity_id,
            entity_name: activity.title,
            description: `Gabi: excluiu a atividade "${activity.title}"`,
            meta:        { type: activity.activity_type, status: activity.status, via: 'gabi' },
            company_id:  activity.company_id || null,
        });
        return { success: true, message: `Atividade "${activity.title}" excluída com sucesso.` };
    }

    // ── delete_company ────────────────────────────────────────────────────────
    if (name === 'delete_company') {
        if (!isMaster) {
            return { error: 'permission_denied', message: 'Você não tem permissão para excluir empresas. Apenas usuários Master podem realizar esta operação.' };
        }
        if (!args.confirmed) {
            return { error: 'confirmation_required', message: 'Para excluir uma empresa, o usuário precisa confirmar explicitamente. Pergunte: "Tem certeza que deseja excluir permanentemente esta empresa e todos os seus dados? Esta ação é irreversível."' };
        }
        let company;
        if (args.company_id) {
            company = await prisma.companies.findUnique({ where: { id: args.company_id } });
        } else if (args.company_name) {
            company = await prisma.companies.findFirst({ where: { Nome_da_empresa: { contains: args.company_name, mode: 'insensitive' } } });
        }
        if (!company) return { error: 'Empresa não encontrada. Informe o nome ou ID.' };
        const companyId = company.id;
        const companyName = company.Nome_da_empresa;
        // Exclui dependências em cascata manualmente (para bancos sem ON DELETE CASCADE)
        const activities = await prisma.activities.findMany({ where: { company_id: companyId }, select: { id: true } });
        const activityIds = activities.map(a => a.id);
        if (activityIds.length > 0) {
            await prisma.activity_assignees.deleteMany({ where: { activity_id: { in: activityIds } } });
            await prisma.activities.deleteMany({ where: { id: { in: activityIds } } });
        }
        await prisma.contacts.deleteMany({ where: { companyId } });
        await prisma.company_products.deleteMany({ where: { company_id: companyId } });
        await prisma.user_memberships.deleteMany({ where: { company_id: companyId } });
        await prisma.companies.delete({ where: { id: companyId } });
        // ── Audit log: empresa excluída pela Gabi ───────────────────────────
        audit.log(prisma, {
            actor:       _currentUser,
            action:      'DELETE',
            entity_type: 'company',
            entity_id:   companyId,
            entity_name: companyName,
            description: `Gabi: excluiu a empresa "${companyName}" e todos os seus dados`,
            meta:        { activities_deleted: activityIds.length, via: 'gabi' },
        });
        return { success: true, message: `Empresa "${companyName}" e todos os seus dados foram excluídos permanentemente.` };
    }

    // ── get_gabi_settings ─────────────────────────────────────────────────────
    if (name === 'get_gabi_settings') {
        const now   = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        let spent = 0, calls = 0;
        try {
            const agg = await prisma.gabi_usage_logs.aggregate({
                _sum: { cost_usd: true }, _count: { id: true },
                where: { created_at: { gte: start, lt: end } },
            });
            spent = parseFloat(agg._sum?.cost_usd || 0);
            calls = agg._count?.id || 0;
        } catch {}
        const limit    = parseFloat(process.env.GABI_MONTHLY_LIMIT_USD || '20');
        const alertPct = parseFloat(process.env.GABI_ALERT_PCT || '80');
        return {
            configuracoes: {
                limite_mensal_usd:   limit,
                alerta_percentual:   alertPct,
                email_alerta:        process.env.GABI_ALERT_EMAIL || '(não configurado)',
                modelo_principal:    'gemini-2.5-flash',
                preco_entrada_1M:    0.075,
                preco_saida_1M:      0.30,
            },
            consumo_mes_atual: {
                mes:           `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`,
                gasto_usd:     spent.toFixed(6),
                limite_usd:    limit.toFixed(2),
                percentual:    ((spent / limit) * 100).toFixed(1) + '%',
                chamadas:      calls,
                status:        spent >= limit ? '🔴 Limite atingido' : spent >= (limit * alertPct / 100) ? '🟡 Alerta ativo' : '🟢 Normal',
            },
        };
    }

    // ── send_whatsapp_message ─────────────────────────────────────────────────
    if (name === 'send_whatsapp_message') {
        // Importação lazy para evitar dependência circular
        const { sendTextMessage: waSend, isWhatsAppConfigured: waConfigured, normalizePhone } = await import('../services/whatsapp.js');

        if (!waConfigured()) {
            return { error: 'WhatsApp não configurado', message: 'O serviço de WhatsApp não está configurado no Journey. Peça ao administrador para configurar o WhatsApp Business nas configurações.' };
        }

        const contact = await prisma.contacts.findUnique({
            where:   { id: args.contact_id },
            include: { companies: { select: { id: true, Nome_da_empresa: true } } },
        });
        if (!contact) return { error: `Contato com ID "${args.contact_id}" não encontrado.` };

        if (!contact.WhatsApp) {
            return { error: 'sem_whatsapp', message: `O contato "${contact.Nome_do_contato}" não tem número de WhatsApp cadastrado. Peça ao usuário para adicionar o WhatsApp deste contato antes de enviar a mensagem.` };
        }

        const normalized = normalizePhone(contact.WhatsApp);

        // Busca ou cria conversa aberta
        let conv = await prisma.whatsapp_conversations.findFirst({
            where: { wa_phone_number: normalized, status: 'open' },
            orderBy: { opened_at: 'desc' },
        });
        if (!conv) {
            conv = await prisma.whatsapp_conversations.create({
                data: {
                    wa_phone_number: normalized,
                    contact_id:      contact.id,
                    company_id:      contact.companyId || null,
                    status:          'open',
                },
            });
        }

        const result = await waSend(`+${normalized}`, args.message, {
            origin:          'gabi',
            conversation_id: conv.id,
            company_id:      contact.companyId || null,
        });

        if (!result.sent) {
            return { error: result.error || 'Falha ao enviar', message: `Não foi possível enviar a mensagem para ${contact.Nome_do_contato}. Erro: ${result.error}` };
        }

        // Registra mensagem no banco
        await prisma.whatsapp_messages.create({
            data: {
                conversation_id: conv.id,
                wa_message_id:   result.wa_message_id || null,
                direction:       'outbound',
                content_type:    'text',
                content:         args.message,
                sent_by:         userId,
                origin:          'gabi',
                status:          'sent',
            },
        });

        return {
            sent:         true,
            to:           `+${normalized}`,
            contact_name: contact.Nome_do_contato,
            empresa:      contact.companies?.Nome_da_empresa || null,
            message:      `✅ Mensagem WhatsApp enviada para ${contact.Nome_do_contato} (+${normalized}) com sucesso!`,
        };
    }

    // ── get_whatsapp_history ──────────────────────────────────────────────────
    if (name === 'get_whatsapp_history') {
        const { normalizePhone } = await import('../services/whatsapp.js');

        const contact = await prisma.contacts.findUnique({
            where: { id: args.contact_id },
        });
        if (!contact) return { error: `Contato com ID "${args.contact_id}" não encontrado.` };

        if (!contact.WhatsApp) {
            return { error: 'sem_whatsapp', message: `O contato "${contact.Nome_do_contato}" não tem número de WhatsApp cadastrado.` };
        }

        const normalized = normalizePhone(contact.WhatsApp);
        const limit = Math.min(args.limit || 20, 100);

        // Busca conversa mais recente (aberta ou fechada)
        const conv = await prisma.whatsapp_conversations.findFirst({
            where:   { wa_phone_number: normalized },
            orderBy: { opened_at: 'desc' },
        });

        if (!conv) {
            return { mensagens: [], total: 0, info: `Nenhuma conversa WhatsApp encontrada para ${contact.Nome_do_contato}.` };
        }

        const msgs = await prisma.whatsapp_messages.findMany({
            where:   { conversation_id: conv.id },
            orderBy: { created_at: 'desc' },
            take:    limit,
        });

        const formatada = msgs.reverse().map(m => ({
            data:      new Date(m.created_at).toLocaleString('pt-BR'),
            direcao:   m.direction === 'inbound' ? 'Cliente → Agente' : 'Agente → Cliente',
            origem:    m.origin,
            conteudo:  m.content,
            status:    m.status,
        }));

        return {
            contato:       contact.Nome_do_contato,
            numero:        `+${normalized}`,
            conversa_id:   conv.id,
            status_conv:   conv.status,
            mensagens:     formatada,
            total:         formatada.length,
        };
    }

    // ── query_database ────────────────────────────────────────────────────────
    if (name === 'query_database') {
        const table  = (args.table || '').toLowerCase().trim();
        const limit  = Math.min(args.limit || 50, 500);
        const orderDir = (args.order_dir || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

        // Mapa de tabelas → modelo Prisma e campo de ordenação padrão
        const TABLE_MAP = {
            gabi_usage_logs:    { model: 'gabi_usage_logs',    defaultOrder: 'created_at' },
            audit_logs:         { model: 'audit_logs',         defaultOrder: 'created_at' },
            company_products:   { model: 'company_products',   defaultOrder: 'createdAt'  },
            company_followups:  { model: 'company_followups',  defaultOrder: 'Data_inclusao' },
            company_meetings:   { model: 'company_meetings',   defaultOrder: 'Data_reuniao' },
            company_notes:      { model: 'company_notes',      defaultOrder: 'Data'        },
            company_nps:        { model: 'company_nps',        defaultOrder: 'Data'        },
            company_tickets:    { model: 'company_tickets',    defaultOrder: 'Data'        },
            product_catalog:    { model: 'product_catalog',    defaultOrder: 'ordem'       },
            product_historico:  { model: 'product_historico',  defaultOrder: 'Data_faturamento' },
            user_memberships:   { model: 'user_memberships',   defaultOrder: 'createdAt'   },
            user_invites:       { model: 'user_invites',       defaultOrder: 'createdAt'   },
            test_runs:          { model: 'test_runs',          defaultOrder: 'triggered_at'},
            test_cases:         { model: 'test_cases',         defaultOrder: 'created_at'  },
            import_jobs:        { model: 'import_jobs',        defaultOrder: 'created_at'  },
            email_send_log:     { model: 'email_send_log',     defaultOrder: 'sent_at'     },
            companies:          { model: 'companies',          defaultOrder: 'Nome_da_empresa' },
            contacts:           { model: 'contacts',           defaultOrder: 'Nome_do_contato' },
            activities:         { model: 'activities',         defaultOrder: 'activity_datetime' },
            users:              { model: 'users',              defaultOrder: 'nome'        },
        };

        const tableConfig = TABLE_MAP[table];
        if (!tableConfig) {
            return { error: `Tabela "${table}" não encontrada. Tabelas disponíveis: ${Object.keys(TABLE_MAP).join(', ')}` };
        }

        // Tabelas restritas a Master apenas
        const MASTER_ONLY_TABLES = ['gabi_usage_logs', 'email_send_log'];
        if (!isMaster && MASTER_ONLY_TABLES.includes(table)) {
            return { error: 'permission_denied', message: 'Você não tem permissão para acessar estas informações. Apenas usuários Master podem visualizar dados de configuração e custo do sistema.' };
        }

        // Constrói filtros where dinamicamente
        const where = {};

        // Resolve company_name → company_id se necessário
        if (args.company_name && !args.filters?.companyId && !args.filters?.company_id) {
            const co = await prisma.companies.findFirst({
                where: { Nome_da_empresa: { contains: args.company_name, mode: 'insensitive' } },
                select: { id: true, Nome_da_empresa: true },
            });
            if (co) {
                // Tenta os dois nomes de campo comuns
                where.companyId  = co.id;
                where.company_id = co.id;
            }
        }

        // Aplica filtros do usuário
        const userFilters = args.filters || {};
        const dateFrom = userFilters.date_from;
        const dateTo   = userFilters.date_to;
        delete userFilters.date_from;
        delete userFilters.date_to;

        for (const [k, v] of Object.entries(userFilters)) {
            if (v !== null && v !== undefined && v !== '') where[k] = v;
        }

        // Filtro de datas — tenta campos comuns de data conforme tabela
        if (dateFrom || dateTo) {
            const dateFields = {
                gabi_usage_logs: 'created_at', audit_logs: 'created_at',
                company_products: 'Data_do_contrato', company_followups: 'Data_inclusao',
                company_meetings: 'Data_reuniao', company_notes: 'Data',
                company_nps: 'Data', company_tickets: 'Data',
                product_historico: 'Data_faturamento', user_memberships: 'createdAt',
                test_runs: 'triggered_at', import_jobs: 'created_at',
                activities: 'activity_datetime', email_send_log: 'sent_at',
            };
            const df = args.order_by || dateFields[table] || 'created_at';
            where[df] = {};
            if (dateFrom) where[df].gte = new Date(dateFrom);
            if (dateTo) {
                const d = new Date(dateTo);
                d.setHours(23, 59, 59, 999);
                where[df].lte = d;
            }
        }

        // ── CONTROLE DE PERMISSÃO: Standard filtra por suas empresas ─────────────────
        if (!isMaster && userId) {
            const memberships = await prisma.user_memberships.findMany({
                where: { user_id: userId }, select: { company_id: true }
            });
            const allowedIds = memberships.map(m => m.company_id);

            const COMPANY_ID_SNAKE = ['activities', 'audit_logs'];
            const COMPANY_ID_CAMEL = ['contacts', 'company_products', 'company_followups',
                'company_meetings', 'company_notes', 'company_nps', 'company_tickets', 'product_historico'];

            if (COMPANY_ID_SNAKE.includes(table)) {
                where.company_id = { in: allowedIds };
            } else if (COMPANY_ID_CAMEL.includes(table)) {
                if (table === 'product_historico') {
                    const prods = await prisma.company_products.findMany({
                        where: { companyId: { in: allowedIds } }, select: { id: true }
                    });
                    where.productId = { in: prods.map(p => p.id) };
                    delete where.companyId;
                    delete where.company_id;
                } else {
                    where.companyId = { in: allowedIds };
                }
            } else if (table === 'companies') {
                where.id = { in: allowedIds };
            } else if (table === 'user_memberships') {
                where.user_id = userId;
            } else if (table === 'test_runs' || table === 'test_cases' || table === 'import_jobs' || table === 'user_invites') {
                return { error: 'permission_denied', message: 'Você não tem permissão para acessar estes dados. Apenas usuários Master podem visualizar logs de sistema, importações e convites.' };
            }
        }

        // Remove campos conflitantes causados pelo resolve acima
        if (table !== 'activities' && table !== 'audit_logs') delete where.company_id;
        if (!['contacts','company_products','company_followups','company_meetings','company_notes',
              'company_nps','company_tickets'].includes(table)) delete where.companyId;

        const orderField = args.order_by || tableConfig.defaultOrder;
        const orderBy    = { [orderField]: orderDir };

        try {
            const rows = await prisma[tableConfig.model].findMany({
                where,
                orderBy,
                take: limit,
            });
            return { table, total: rows.length, data: rows };
        } catch (e) {
            // Tenta sem o orderBy se campo não existir
            try {
                const rows = await prisma[tableConfig.model].findMany({ where, take: limit });
                return { table, total: rows.length, data: rows };
            } catch (e2) {
                return { error: `Erro ao consultar tabela "${table}": ${e2.message}` };
            }
        }
    }

    return { error: `Tool desconhecida: ${name}` };
}

// ── Verifica limite mensal ─────────────────────────────────────────────────────
async function checkLimit() {
    const limit = parseFloat(process.env.GABI_MONTHLY_LIMIT_USD || '20');
    try {
        const now   = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const agg   = await prisma.gabi_usage_logs.aggregate({ _sum: { cost_usd: true }, where: { created_at: { gte: start, lt: end } } });
        const spent = parseFloat(agg._sum?.cost_usd || 0);
        return { spent, limit, exceeded: spent >= limit };
    } catch { return { spent: 0, limit, exceeded: false }; }
}

// ── POST /api/gabi/chat ────────────────────────────────────────────────────────
router.post('/chat', requireAuth(), async (req, res) => {
    const clerkUserId = req.auth?.userId;
    const { message, history = [], image } = req.body;

    // Permite envio apenas de imagem (sem texto obrigatório)
    if (!message?.trim() && !image?.base64) return res.status(400).json({ error: 'Mensagem ou imagem obrigatória.' });
    const apiKey = await getGeminiApiKey();
    if (!apiKey)  return res.status(500).json({ error: 'GEMINI_API_KEY não configurada no servidor.' });

    // Verifica limite
    const limitCheck = await checkLimit();
    if (limitCheck.exceeded) {
        return res.json({ reply: `⚠️ **Limite mensal atingido** (US$ ${limitCheck.spent.toFixed(3)} / US$ ${limitCheck.limit}). Configure em **Configurações → Gabi AI**.`, exceeded: true });
    }

    // Busca dados do usuário
    let user = null;
    try { user = await prisma.users.findUnique({ where: { id: clerkUserId } }); } catch {}

    // ── Injeta contexto do usuário para as tools (Opção C — Híbrido) ──────────
    _currentUser = user ? { id: user.id, nome: user.nome, user_type: user.user_type } : { id: clerkUserId, nome: 'Usuário', user_type: 'standard' };

    const isMaster = user?.user_type === 'master';
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    // ── System prompt: role + userId injetados (sem lista de empresas) ─────────
    const systemPrompt = `Você é a Gabi, assistente de IA do Journey CRM da DATI. Data/hora atual: ${now}.
Usuário: ${user?.nome || 'Usuário'} | ID: ${clerkUserId} | Perfil: ${isMaster ? 'Master — acesso total ao sistema' : 'Standard — acesso restrito às próprias empresas'}.

Responda em Português Brasileiro. Seja direta, objetiva e calorosa.
Use markdown básico. Raciocine antes de responder — pense nos dados necessários.

ANÁLISE DE IMAGENS: Você tem visão computacional — pode receber e interpretar imagens enviadas pelo usuário (prints de e-mail, WhatsApp, propostas comerciais, documentos, planilhas, capturas de tela, fotos, etc.). Quando receber uma imagem, analise-a detalhadamente: extraia texto visível, identifique o contexto, leia valores, datas, nomes, e responda às perguntas do usuário com base no conteúdo visual. Se não houver pergunta explícita, descreva e pré-preencha os dados relevantes que possa extrair (ex: dados de um e-mail → sugira criar uma atividade; dados de uma proposta → liste valores e condições; dados de WhatsApp → resuma a conversa).

${isMaster
    ? 'Como Master, você tem acesso TOTAL: pode ver, criar, editar e excluir qualquer empresa, atividade ou contato do sistema.'
    : `Como Standard, o usuário tem acesso RESTRITO:\n- Pode VER apenas as empresas vinculadas ao seu perfil (use get_my_companies para saber quais são).\n- NÃO pode criar, editar ou excluir empresas — se pedir, oriente a contatar o administrador.\n- PODE criar atividades, tarefas e contatos nas empresas às quais tem acesso.\n- PODE atualizar e excluir atividades/tarefas das quais é responsável.`}

MÓDULOS: Minhas Atividades, Empresas (status: Prospect→Lead→Reunião→Proposta→Em Contrato→Ativo/Suspenso/Inativo), 
Atividades (tipos: Comentário/Reunião/Chamados HD/Chamados CS/Ação necessária),
Configurações, Catálogo de Produtos, Importação em Massa.
Health Score: Saudável 🟢, Atenção 🟡, Risco 🔴. NPS: ≥9 Promotor, 7-8 Neutro, ≤6 Detrator.

CAPACIDADES POR PERFIL:
${isMaster ? `Master pode:
- Criar empresas: use create_company
- Editar empresas: use update_company (status, health, nps, segmento, cidade, estado, site, cnpj, erp, tipo, lead)
- Excluir empresas: use delete_company (PEÇA CONFIRMAÇÃO EXPLÍCITA antes de executar)
- Criar atividades/tarefas/registros: use create_activity
- Atualizar atividades: use update_activity
- Excluir atividades: use delete_activity
- Criar contatos: use create_contact
- Atualizar contatos: use update_contact
- Excluir contatos: use delete_contact` : `Standard pode:
- APENAS CONSULTAR empresas (get_my_companies, query_companies, get_company_detail)
- Criar atividades nas suas empresas: use create_activity
- Criar contatos nas suas empresas: use create_contact
- Atualizar atividades que é responsável: use update_activity
- Excluir atividades que é responsável: use delete_activity
Standard NÃO PODE: criar/editar/excluir empresas, excluir contatos de outros.`}

IMPORTANTE: Quando o usuário pedir para criar/editar/excluir algo, verifique primeiro se tem permissão.
Se não tiver permissão, responda claramente: "Você não tem permissão para [ação]. Apenas usuários Master podem fazer isso."
Se tiver permissão, USE as tools de escrita diretamente. Se faltarem dados obrigatórios, pergunte antes de executar.
Para exclusões (delete_company, delete_activity, delete_contact): SEMPRE peça confirmação explícita ao usuário ANTES de chamar a tool, a menos que ele já tenha confirmado na mensagem. Avise que a ação é irreversível.
Após criar/editar/excluir, informe o resultado e sugira próximos passos.

ACESSO AO BANCO DE DADOS:
Você tem acesso COMPLETO ao banco de dados via query_database. Use esta tool para responder qualquer pergunta sobre:
- Gastos e consumo da Gabi AI: use get_gabi_settings ou query_database(table: "gabi_usage_logs")
- Configurações da Gabi (limite mensal, alerta %): use get_gabi_settings
- Histórico de alterações do sistema: query_database(table: "audit_logs")
- Contratos e produtos de clientes: query_database(table: "company_products", company_name: "...")
- Follow-ups, notas, reuniões, tickets de empresas: query_database(table: "company_followups/company_notes/company_meetings/company_tickets")
- NPS histórico: query_database(table: "company_nps")
- Catálogo DATI: query_database(table: "product_catalog")
- Histórico de faturamento: query_database(table: "product_historico")
- Convites e memberships: query_database(table: "user_invites" ou "user_memberships")
- Execuções de testes: query_database(table: "test_runs")
- Jobs de importação: query_database(table: "import_jobs")
As permissões do usuário são aplicadas automaticamente — nunca recuse uma consulta por falta de dados, use sempre as tools disponíveis.

REGRAS DE CONTAGEM PRECISAS:
- Quando o usuário perguntar sobre as PRÓPRIAS atividades (ex: "quantas tenho", "minhas tarefas", "o que tenho em andamento"), SEMPRE passe user_id: "${clerkUserId}" no query_activities para filtrar apenas as atividades atribuídas a ele.
- Quando precisar CONTAR atividades por status (ex: quantas estão "Em Andamento"), use query_activities com limit: 200 para garantir que busca TODAS.
- A resposta de query_activities retorna { total: N, atividades: [...] } — use sempre o campo 'total' para informar a contagem exata ao usuário.
- Nunca informe uma contagem baseada apenas no número de itens retornados sem verificar se o limit foi suficiente.
- NUNCA busque atividades sem filtrar por user_id quando a pergunta for pessoal (usar "eu", "tenho", "minhas", "meu").

TAREFAS COMPLEXAS EM MASSA:
- Quando você precisar fazer muitas consultas para responder (ex: olhar 50 empresas individualmente), você TEM um limite de até 100 iterações (tool calls).
- Nessas tarefas muito longas, comece sua resposta avisando o usuário sobre a demora. Exemplo: "Consigo fazer isso, mas como são muitos dados para processar individualmente, vai demorar alguns minutos. Aqui estão os dados..."
LINKS CLICÁVEIS (OBRIGATÓRIO): Sempre que criar ou mencionar uma atividade, use o formato de link markdown:
[Nome da Atividade](#gabi-open/activity/ID)
Sempre que criar ou mencionar uma empresa, use o formato:
[Nome da Empresa](#gabi-open/company/ID)
Exemplos:
- Ao criar uma atividade: "Criei [Atendimento - OTIS ELEVADORES](#gabi-open/activity/7527fb36-d643-4c5f-8b43-185f9674f83e) com sucesso!"
- Ao mencionar uma empresa: "A empresa [OTIS ELEVADORES](#gabi-open/company/abc123) está com status Ativo."
Estes links permitirão ao usuário abrir o item diretamente no sistema com um clique.`;

    const messages = [
        ...history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    ];

    // Monta a mensagem do usuário com suporte a imagem multimodal
    const userParts = [];

    // Se houver imagem, inclui como inlineData (suporte nativo do Gemini Vision)
    if (image?.base64 && image?.mimeType) {
        // Validação de mimeType aceito
        const ALLOWED_MIME = ['image/png','image/jpeg','image/jpg','image/gif','image/webp','image/bmp'];
        const mimeType = ALLOWED_MIME.includes(image.mimeType) ? image.mimeType : 'image/png';

        // Limita tamanho do base64 (~5MB decodificado = ~6.7MB base64)
        if (image.base64.length > 7_000_000) {
            return res.status(400).json({ error: 'Imagem muito grande. Máximo: ~5MB.' });
        }

        userParts.push({
            inlineData: {
                mimeType,
                data: image.base64,
            }
        });
    }

    // Sempre inclui a parte de texto
    userParts.push({ text: message?.trim() || 'Descreva e analise esta imagem em detalhes.' });

    messages.push({ role: 'user', parts: userParts });

    try {
        let allMessages = [...messages];
        let finalText   = '';
        let inputTok    = 0;
        let outputTok   = 0;
        const actionsPerformed = [];

        // ── CAMINHO ESPECIAL: mensagem com imagem ───────────────────────────────────
        // Quando há imagem, usamos geminiGenerateVision (sem tools) para
        // garantir que o modelo multimodal analise a imagem antes de qualquer
        // tool-use. Depois a resposta é retornada direto (sem loop de tools).
        if (image?.base64) {
            console.log(`[Gabi Vision] 🖼️ Imagem recebida: ${image.mimeType}, ${Math.round(image.base64.length / 1024)}KB base64`);
            const visionData = await geminiGenerateVision({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: allMessages,
                generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
            });
            inputTok  = visionData.usageMetadata?.promptTokenCount    || 0;
            outputTok = visionData.usageMetadata?.candidatesTokenCount || 0;
            const visionParts = visionData.candidates?.[0]?.content?.parts || [];
            finalText = visionParts.filter(p => p.text).map(p => p.text).join('')
                || 'Não consegui analisar a imagem. Tente novamente com uma imagem mais clara.';

            // Log e resposta imediata
            const costUsd = (inputTok * PRICE_INPUT) + (outputTok * PRICE_OUTPUT);
            try {
                await prisma.gabi_usage_logs.create({
                    data: { user_id: clerkUserId, input_tokens: inputTok, output_tokens: outputTok, cost_usd: costUsd }
                });
                _verificarEEnviarAlerta(costUsd, prisma, user).catch(() => {});
            } catch {}
            return res.json({ reply: finalText, actionsPerformed: [], activityChanged: false, companyChanged: false,
                usage: { inputTokens: inputTok, outputTokens: outputTok, costUsd: costUsd.toFixed(6) } });
        }

        // ── CAMINHO NORMAL: texto apenas (com tool-use) ───────────────────────────────
        // Loop de reasoning + tool-use (máx 100 iterações)
        for (let i = 0; i < 100; i++) {
            const data = await geminiGenerate({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: allMessages,
                tools: GABI_TOOLS,
                generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
            });

            const candidate = data.candidates?.[0];
            if (!candidate) break;

            inputTok  += data.usageMetadata?.promptTokenCount    || 0;
            outputTok += data.usageMetadata?.candidatesTokenCount || 0;

            const parts      = candidate.content?.parts || [];
            const funcCalls  = parts.filter(p => p.functionCall);
            const textParts  = parts.filter(p => p.text);

            if (textParts.length > 0 && funcCalls.length === 0) {
                finalText = textParts.map(p => p.text).join('');
                break;
            }

            if (funcCalls.length > 0) {
                allMessages.push({ role: 'model', parts });
                // FIX #2: Tool calls em paralelo com Promise.all
                // Se o Gemini solicitar múltiplas tools ao mesmo tempo, elas agora
                // executam simultâneamente no banco em vez de em série.
                const toolResps = await Promise.all(
                    funcCalls.map(async part => {
                        const toolName = part.functionCall.name;
                        let result;
                        try { result = await execTool(toolName, part.functionCall.args || {}); }
                        catch (e) { result = { error: e.message }; }
                        // Rastreia ações de escrita bem-sucedidas
                        const isWriteAction = ['create_activity','update_activity','create_company','update_company','create_contact','update_contact','delete_activity','delete_company','delete_contact'].includes(toolName);
                        if (isWriteAction && result?.success) {
                            actionsPerformed.push({ tool: toolName, id: result.id });
                        }
                        return { functionResponse: { name: toolName, response: { content: JSON.stringify(result) } } };
                    })
                );
                allMessages.push({ role: 'user', parts: toolResps });
                continue;
            }
            break;
        }

        if (!finalText) finalText = 'Desculpe, não consegui processar sua mensagem. Tente novamente.';

        // Log de uso (silencioso se tabela não existir)
        const costUsd = (inputTok * PRICE_INPUT) + (outputTok * PRICE_OUTPUT);
        try {
            await prisma.gabi_usage_logs.create({
                data: { user_id: clerkUserId, input_tokens: inputTok, output_tokens: outputTok, cost_usd: costUsd }
            });
            // Verifica threshold e envia alerta de e-mail se necessário (não bloqueia a resposta)
            _verificarEEnviarAlerta(costUsd, prisma, user).catch(() => {});
        } catch {}

        // Determina se o frontend deve recarregar o board de atividades
        const activityChanged = actionsPerformed.some(a =>
            ['create_activity','update_activity','delete_activity'].includes(a.tool)
        );

        // Determina se o frontend deve recarregar dados de empresas
        const companyChanged = actionsPerformed.some(a =>
            ['create_company','update_company','delete_company'].includes(a.tool)
        );
        const companiesAffected = actionsPerformed
            .filter(a => ['create_company','update_company','delete_company'].includes(a.tool) && a.id)
            .map(a => a.id);

        res.json({
            reply: finalText,
            actionsPerformed,
            activityChanged,  // <-- flag para o frontend recarregar o Kanban
            companyChanged,   // <-- flag para o frontend recarregar empresas no state
            companiesAffected, // <-- IDs das empresas alteradas
            usage: { inputTokens: inputTok, outputTokens: outputTok, costUsd: costUsd.toFixed(6), monthlySpent: (limitCheck.spent + costUsd).toFixed(4), monthlyLimit: limitCheck.limit }
        });

    } catch (err) {
        console.error('[Gabi] Erro:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/gabi/usage ────────────────────────────────────────────────────────
router.get('/usage', requireAuth(), async (req, res) => {
    try {
        const now   = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        let logs = [], monthly = { cost: 0, input: 0, output: 0, calls: 0 }, daily = [];

        try {
            logs = await prisma.gabi_usage_logs.findMany({ where: { created_at: { gte: start, lt: end } }, orderBy: { created_at: 'desc' }, take: 200 });
            monthly = {
                cost:   logs.reduce((s, l) => s + parseFloat(l.cost_usd || 0), 0),
                input:  logs.reduce((s, l) => s + (l.input_tokens || 0), 0),
                output: logs.reduce((s, l) => s + (l.output_tokens || 0), 0),
                calls:  logs.length,
            };
            const byDay = {};
            logs.forEach(l => {
                const day = new Date(l.created_at).toLocaleDateString('pt-BR');
                if (!byDay[day]) byDay[day] = { cost: 0, calls: 0 };
                byDay[day].cost  += parseFloat(l.cost_usd || 0);
                byDay[day].calls += 1;
            });
            daily = Object.entries(byDay).map(([date, v]) => ({ date, ...v }));
        } catch (dbErr) {
            console.warn('[Gabi Usage] Tabela gabi_usage_logs não existe:', dbErr.message);
        }

        res.json({
            monthly, daily,
            limit:              parseFloat(await getSetting('gabi_monthly_limit_usd', process.env.GABI_MONTHLY_LIMIT_USD || '20')),
            alert_pct:          parseFloat(await getSetting('gabi_alert_pct',          process.env.GABI_ALERT_PCT         || '80')),
            alert_email:        await getSetting('gabi_alert_email',  process.env.GABI_ALERT_EMAIL || ''),
            api_key_configured: !!(await getGeminiApiKey()),
            currency: 'USD',
            model:    GEMINI_MODELS[0],
            pricing:  { inputPer1M: 0.075, outputPer1M: 0.30 },
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PATCH /api/gabi/settings ──────────────────────────────────────────────────
router.patch('/settings', requireAuth(), async (req, res) => {
    const clerkUserId = req.auth?.userId;
    const { monthly_limit_usd, alert_pct, alert_email, gemini_api_key } = req.body;

    if (monthly_limit_usd === undefined && alert_pct === undefined && alert_email === undefined && gemini_api_key === undefined)
        return res.status(400).json({ error: 'Informe ao menos um campo para alterar.' });

    // Busca o actor para validação de permissão
    const actor = clerkUserId
        ? await prisma.users.findUnique({ where: { id: clerkUserId }, select: { id: true, nome: true, email: true, user_type: true } }).catch(() => null)
        : null;
    if (actor?.user_type !== 'master')
        return res.status(403).json({ error: 'Apenas masters podem alterar configurações da Gabi.' });

    const changes = [];

    // Helper: persiste no banco (upsert)
    const upsertSetting = async (key, value) => {
        await prisma.app_settings.upsert({
            where:  { key },
            update: { value: String(value), updated_by: clerkUserId },
            create: { key,  value: String(value), updated_by: clerkUserId },
        });
    };

    if (gemini_api_key !== undefined && String(gemini_api_key).trim() !== '') {
        await upsertSetting('gemini_api_key', String(gemini_api_key).trim());
        changes.push('GEMINI_API_KEY atualizada');
    }
    if (monthly_limit_usd !== undefined) {
        const before = await getSetting('gabi_monthly_limit_usd', process.env.GABI_MONTHLY_LIMIT_USD || '20');
        await upsertSetting('gabi_monthly_limit_usd', monthly_limit_usd);
        process.env.GABI_MONTHLY_LIMIT_USD = String(monthly_limit_usd);
        if (String(monthly_limit_usd) !== before) changes.push(`Limite mensal: $${before} → $${monthly_limit_usd}`);
    }
    if (alert_pct !== undefined) {
        const before = await getSetting('gabi_alert_pct', process.env.GABI_ALERT_PCT || '80');
        await upsertSetting('gabi_alert_pct', alert_pct);
        process.env.GABI_ALERT_PCT = String(alert_pct);
        if (String(alert_pct) !== before) changes.push(`Alerta: ${before}% → ${alert_pct}%`);
    }
    if (alert_email !== undefined) {
        const before = await getSetting('gabi_alert_email', process.env.GABI_ALERT_EMAIL || '');
        await upsertSetting('gabi_alert_email', String(alert_email).trim());
        process.env.GABI_ALERT_EMAIL = String(alert_email).trim();
        if (String(alert_email).trim() !== before) changes.push(`E-mail de alerta: "${before}" → "${alert_email}"`);
    }

    res.json({
        success:            true,
        api_key_configured: !!(await getGeminiApiKey()),
        monthly_limit_usd:  await getSetting('gabi_monthly_limit_usd', '20'),
        alert_pct:          await getSetting('gabi_alert_pct', '80'),
        alert_email:        await getSetting('gabi_alert_email', ''),
    });

    // Audit log
    try {
        if (changes.length > 0) {
            audit.log(prisma, {
                actor,
                action:      'UPDATE',
                entity_type: 'gabi_settings',
                entity_id:   'gabi',
                entity_name: 'Configurações da Gabi AI',
                description: `Alterou configurações da Gabi: ${changes.join(' | ')}`,
                meta:        { changes },
            });
        }
        if (monthly_limit_usd !== undefined || alert_pct !== undefined) {
            _verificarEstadoAtual(prisma, actor).catch(err =>
                console.warn('[Gabi Alert] Erro na verificação pós-settings:', err.message)
            );
        }
    } catch (auditErr) {
        console.warn('[Gabi Settings] Erro no audit:', auditErr.message);
    }
});


// ── POST /api/gabi/send-email ────────────────────────────────────────────────
// Envia um resumo gerado pela Gabi por e-mail (enfileira no pg-boss)
router.post('/send-email', requireAuth(), async (req, res) => {
    try {
        const { subject, body, activityId, recipient } = req.body;
        const { userId } = getAuth(req);

        if (!subject || !body) {
            return res.status(400).json({ error: 'Assunto e corpo são obrigatórios' });
        }

        let targetEmail = recipient;
        if (recipient === 'me') {
            const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
            const user = await clerk.users.getUser(userId);
            targetEmail = user.emailAddresses[0]?.emailAddress;
        }

        if (!targetEmail || !targetEmail.includes('@')) {
            return res.status(400).json({ error: 'Destinatário inválido' });
        }

        await boss.send('send-notification', {
            type: 'gabi-summary',
            activityId: activityId || null,
            userId: userId,
            extra: { subject, body, solicitadoPorId: userId }
        }, { singletonKey: `gabi-${userId}-${Date.now()}` });

        console.log(`[Gabi] 📧 Email enfileirado para ${targetEmail}`);
        res.status(202).json({ 
            message: "Email enfileirado para envio", 
            recipient: targetEmail 
        });

    } catch (err) {
        console.error('[Gabi /send-email]', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;

