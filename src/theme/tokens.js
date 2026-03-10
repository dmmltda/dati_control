/**
 * tokens.js — Design System Centralizado do Journey / DATI
 * Tema Dark — paleta baseada no referencial visual aprovado.
 * Todas as cores, espaçamentos e sombras devem ser importadas daqui.
 * Nunca use valores hex diretamente nos componentes — use os tokens.
 */

// ─── Paleta de Cores — Dark Theme ────────────────────────────────────────────
export const colors = {
    bgBase:        '#0f1423',   // fundo principal (app bg)
    bgSurface:     '#0f1423',   // mesma base — área de conteúdo
    bgCard:        '#171e32',   // fundo dos cards / painéis
    bgSubtle:      '#1d2642',   // fundo de seções internas (thead, sub-cards)
    primary:       '#5b52f6',   // roxo marca — CTAs, destaques, filtros ativos
    primaryLight:  '#4b43db',   // hover do primary
    accent:        '#f59e0b',   // laranja / amarelo — atenção, Próximos Passos
    success:       '#10B981',   // verde — saudável, concluído, positivo
    warning:       '#f59e0b',   // amarelo — vencendo hoje
    danger:        '#EF4444',   // vermelho — risco, vencido, crítico
    textMain:      '#e2e8f0',   // texto principal (claro sobre dark)
    textMuted:     '#8b98b4',   // texto secundário / labels
    border:        '#26314a',   // bordas de cards e divisores
};

// ─── Cores Semânticas para Próximos Passos ───────────────────────────────────
// Backgrounds escuros (tinted) para as linhas da tabela no tema dark
export const statusColors = {
    vencido: {
        bg: 'rgba(239,68,68,0.07)',
        border: colors.danger,
        text: colors.danger,
        badge: 'rgba(239,68,68,0.15)',
    },
    hoje: {
        bg: 'rgba(245,158,11,0.07)',
        border: colors.warning,
        text: colors.warning,
        badge: 'rgba(245,158,11,0.15)',
    },
    pendente: {
        bg: 'transparent',
        border: 'transparent',
        text: colors.textMuted,
        badge: 'rgba(139,152,180,0.12)',
    },
    concluido: {
        bg: 'rgba(16,185,129,0.05)',
        border: colors.success,
        text: colors.success,
        badge: 'rgba(16,185,129,0.15)',
    },
};

// ─── Health Score ─────────────────────────────────────────────────────────────
export const healthColors = {
    'Saudável':   colors.success,
    'Em Atenção': colors.warning,
    'Em Risco':   colors.danger,
};

// ─── Tipografia ───────────────────────────────────────────────────────────────
export const typography = {
    fontFamily: "'Plus Jakarta Sans', 'DM Sans', 'Inter', sans-serif",
    h1: '1.5rem',
    kpiNumber: '2.25rem',
    body: '0.875rem',
    small: '0.75rem',
};

// ─── Cards ────────────────────────────────────────────────────────────────────
export const card = {
    borderRadius: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
    hoverShadow: '0 4px 20px rgba(0,0,0,0.5)',
    padding: '24px',
    hoverTransform: 'translateY(-2px)',
    transition: 'transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease',
};

// ─── Cores das KPI Cards (sem borda esquerda colorida no dark — usa border glow) ─
export const kpiColors = {
    total:   colors.primary,
    ativos:  colors.success,
    inativos: colors.danger,
    leads:   colors.accent,
    novos:   colors.warning,
};

// ─── Funil de Vendas — cores mais vibrantes sobre fundo dark ─────────────────
export const funnelColors = [
    '#8b98b4',  // Prospects — cinza azulado
    '#5b52f6',  // Leads — roxo primary
    '#f59e0b',  // Reunião — amarelo
    '#10B981',  // Proposta — verde
    '#22d3ee',  // Clientes Ativos — ciano
];

// ─── Exportação composta para uso direto como objeto ─────────────────────────
export default {
    colors,
    statusColors,
    healthColors,
    typography,
    card,
    kpiColors,
    funnelColors,
};
