/**
 * ============================================================================
 * AuditService — Histórico de Alterações do Sistema
 * ============================================================================
 *
 * RESPONSABILIDADES:
 *  1. Resolver o "actor_label" de quem executou a ação:
 *       - null/undefined      → "Journey"  (plataforma)
 *       - user_type="master"  → "Daniel Martins"
 *       - user_type="standard"→ "Rafa via Daniel Martins"
 *         (busca o master via user_invites.invited_by)
 *
 *  2. Persistir entradas em audit_logs de forma fire-and-forget
 *     (não bloqueia a response HTTP).
 *
 *  3. Calcular diffs legíveis entre versões old/new de um objeto.
 *
 * USO:
 *   import * as audit from '../services/audit.js';
 *
 *   // Simples
 *   audit.log(prisma, { actor: req.usuarioAtual, action: 'CREATE',
 *     entity_type: 'company', entity_id: id, entity_name: nome,
 *     description: `Criou a empresa ${nome}`, company_id: id });
 *
 *   // Com diff (UPDATE)
 *   const { description, meta } = audit.diff(oldObj, newObj, 'company', nomeEmpresa);
 *   audit.log(prisma, { actor, action: 'UPDATE', entity_type: 'company',
 *     entity_id: id, entity_name: nomeEmpresa, description, meta, company_id: id });
 * ============================================================================
 */

// ─── Mapeamento de nomes de campos técnicos → português legível ──────────────
const FIELD_LABELS = {
    // Empresa
    Nome_da_empresa: 'Nome da empresa',
    Status: 'Status',
    Health_Score: 'Health Score',
    NPS: 'NPS',
    CNPJ_da_empresa: 'CNPJ',
    Segmento_da_empresa: 'Segmento',
    Tipo_de_empresa: 'Tipo',
    Cidade: 'Cidade',
    Estado: 'Estado',
    Site: 'Site',
    ERP: 'ERP',
    Qual_ERP_: 'Qual ERP',
    Lead: 'Lead',
    Modo_da_empresa: 'Modo',
    Nome_do_CS: 'Nome do CS',
    Nome_do_usu_rio: 'Nome do usuário',
    In_cio_com_CS: 'Início com CS',
    Data_de_churn: 'Data de churn',
    Motivo_do_churn: 'Motivo do churn',
    Data_de_follow_up: 'Data de follow-up',
    Hor_rio_de_follow_up: 'Horário de follow-up',
    Data_Interesse: 'Data de interesse',
    Data_in_cio_onboarding: 'Início do onboarding',
    Data_t_rmino_onboarding: 'Término do onboarding',
    Fechamento_onboarding__Sim_N_o_: 'Onboarding fechado',
    Principal_Objetivo: 'Principal objetivo',
    Expectativa_da_DATI: 'Expectativa da DATI',
    Dores_Gargalos: 'Dores/Gargalos',
    Sucesso_Extraordin_rio: 'Sucesso Extraordinário',
    Usu_rio_Dati__Sim_N_o_: 'Usuário DATI',
    Qual___M_dulo___Lotus_: 'Módulo/Lotus',
    Tem_algum_comex_: 'Tem comex?',
    decisor_: 'É decisor?',
    Situa__o_da_reuni_o: 'Situação da reunião',
    company_type: 'Tipo de conta',
    // Usuário
    nome: 'Nome',
    email: 'Email',
    user_type: 'Tipo de usuário',
    ativo: 'Ativo',
    phone: 'Telefone',
    department: 'Departamento',
    // Membership
    can_create: 'Pode criar',
    can_edit: 'Pode editar',
    can_delete: 'Pode deletar',
    can_export: 'Pode exportar',
    // Atividade
    title: 'Título',
    description: 'Descrição',
    activity_type: 'Tipo',
    status: 'Status',
    priority: 'Prioridade',
};

function labelFor(field) {
    return FIELD_LABELS[field] ?? field;
}

// ─── Campos a ignorar no diff (metadados técnicos sem valor de negócio) ───────
const IGNORED_DIFF_FIELDS = new Set([
    'id', 'createdAt', 'updatedAt', 'created_at', 'updated_at',
    'clerk_org_id', 'mom_id', 'company_type',
]);

// ─── Formata um valor bruto para exibição legível ─────────────────────────────
function formatValue(v) {
    if (v === null || v === undefined || v === '') return '(vazio)';
    if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
    // Tenta detectar datas ISO
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
        try {
            return new Date(v).toLocaleDateString('pt-BR');
        } catch { /* ignora */ }
    }
    return String(v);
}

/**
 * Calcula diff entre old e new e gera:
 *  - description: texto legível resumindo o que mudou
 *  - meta: { fields: string[], changes: { field, label, old, new }[], old, new }
 *
 * @param {object} oldObj   Snapshot anterior
 * @param {object} newObj   Dados novos (apenas os que foram enviados)
 * @param {string} entityType  'company' | 'user' | 'membership' | ...
 * @param {string} entityName  Nome legível da entidade
 * @returns {{ description: string, meta: object }}
 */
export function diff(oldObj, newObj, entityType, entityName) {
    const changes = [];

    for (const [key, newVal] of Object.entries(newObj)) {
        if (IGNORED_DIFF_FIELDS.has(key)) continue;
        if (!(key in oldObj)) continue;

        const oldVal = oldObj[key];

        // Compara como string para evitar false positives com null vs undefined
        const oldStr = oldVal === null || oldVal === undefined ? '' : String(oldVal);
        const newStr = newVal === null || newVal === undefined ? '' : String(newVal);

        if (oldStr === newStr) continue;

        changes.push({
            field: key,
            label: labelFor(key),
            old: formatValue(oldVal),
            new: formatValue(newVal),
        });
    }

    const fields = changes.map(c => c.label);
    let description;

    if (changes.length === 0) {
        description = `Salvou ${entityName} sem alterações detectadas`;
    } else if (changes.length === 1) {
        const c = changes[0];
        description = `Atualizou "${c.label}" de "${c.old}" para "${c.new}" em ${entityName}`;
    } else if (changes.length <= 3) {
        description = `Atualizou ${fields.join(', ')} de ${entityName}`;
    } else {
        description = `Atualizou ${changes.length} campos de ${entityName}`;
    }

    return {
        description,
        meta: {
            fields,
            changes,
            old: oldObj,
            new: newObj,
        },
    };
}

/**
 * Resolve o label do ator da ação de forma assíncrona.
 * É chamado internamente pelo log() — não use diretamente.
 *
 * @param {PrismaClient} prisma
 * @param {object|null}  user   - req.usuarioAtual (ou null para ações da plataforma)
 * @returns {Promise<string>}
 */
async function resolveActorLabel(prisma, user) {
    if (!user) return 'Journey (Sistema)';
    if (user.user_type === 'master') return user.nome;

    // Usuário standard: tenta encontrar quem o convidou (o master)
    try {
        const invite = await prisma.user_invites.findFirst({
            where: {
                email: user.email,
                status: { not: 'revoked' },
            },
            orderBy: { createdAt: 'desc' },
            select: { invited_by: true },
        });

        if (invite?.invited_by) {
            const master = await prisma.users.findUnique({
                where: { id: invite.invited_by },
                select: { nome: true },
            });
            if (master?.nome) {
                return `${user.nome} via ${master.nome}`;
            }
        }

        // Fallback: tenta via membership
        const membership = await prisma.user_memberships.findFirst({
            where: { user_id: user.id },
            select: { invited_by: true },
        });

        if (membership?.invited_by) {
            const master = await prisma.users.findUnique({
                where: { id: membership.invited_by },
                select: { nome: true },
            });
            if (master?.nome) {
                return `${user.nome} via ${master.nome}`;
            }
        }
    } catch (_) {
        // Falha silenciosa — não deve impedir o fluxo principal
    }

    return user.nome;
}

/**
 * Registra uma entrada no audit log.
 * FIRE-AND-FORGET: não bloqueia a response HTTP, erros são logados no console.
 *
 * @param {PrismaClient} prisma       - Instância do Prisma do chamador
 * @param {object}       params
 * @param {object|null}  params.actor       - req.usuarioAtual (null = Journey/sistema)
 * @param {string}       params.action      - CREATE | UPDATE | DELETE | INVITE | MEMBERSHIP | IMPORT | SYSTEM
 * @param {string}       params.entity_type - company | user | membership | invite | activity | import
 * @param {string}       [params.entity_id]
 * @param {string}       [params.entity_name]
 * @param {string}       params.description - Texto legível do que foi feito
 * @param {object}       [params.meta]      - { fields, changes, old, new }
 * @param {string}       [params.company_id]
 * @param {string}       [params.ip_address]
 */
export function log(prisma, {
    actor = null,
    action,
    entity_type,
    entity_id = null,
    entity_name = null,
    description,
    meta = null,
    company_id = null,
    ip_address = null,
}) {
    // Fire-and-forget: resolve o actor label e persiste sem bloquear
    resolveActorLabel(prisma, actor)
        .then(actor_label =>
            prisma.audit_logs.create({
                data: {
                    actor_id: actor?.id ?? null,
                    actor_label,
                    action,
                    entity_type,
                    entity_id,
                    entity_name,
                    description,
                    meta: meta ?? undefined,
                    company_id,
                    ip_address,
                },
            })
        )
        .catch(err =>
            console.error('[AuditLog] ❌ Erro ao registrar entrada:', err.message)
        );
}
