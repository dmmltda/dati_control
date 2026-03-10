/**
 * tokens.js — Design System Centralizado do Journey / DATI
 * Todas as cores, espaçamentos e sombras devem ser importadas daqui.
 * Nunca use valores hex diretamente nos componentes — use os tokens.
 */

// ─── Paleta de Cores ────────────────────────────────────────────────────────
export const colors = {
    bgBase: '#0D1B2A',  // fundo sidebar / backgrounds escuros
    bgSurface: '#F4F6F9',  // fundo área principal
    bgCard: '#FFFFFF',  // fundo dos cards
    primary: '#0F3460',  // azul DATI — cor principal
    primaryLight: '#1A5276',  // azul DATI claro — hover / estados
    accent: '#E8832A',  // laranja DATI — destaques, badges, CTAs
    success: '#10B981',  // verde — saudável, concluído, positivo
    warning: '#F59E0B',  // amarelo — atenção, vencendo hoje
    danger: '#EF4444',  // vermelho — risco, vencido, crítico
    textMain: '#1A202C',  // texto principal
    textMuted: '#64748B',  // texto secundário / labels
    border: '#E2E8F0',  // bordas de cards e divisores
};

// ─── Cores Semânticas para Próximos Passos ──────────────────────────────────
export const statusColors = {
    vencido: {
        bg: '#FEF2F2',
        border: colors.danger,
        text: colors.danger,
        badge: 'rgba(239,68,68,0.15)',
    },
    hoje: {
        bg: '#FFFBEB',
        border: colors.warning,
        text: colors.warning,
        badge: 'rgba(245,158,11,0.15)',
    },
    pendente: {
        bg: 'transparent',
        border: 'transparent',
        text: colors.textMuted,
        badge: 'rgba(100,116,139,0.12)',
    },
    concluido: {
        bg: '#F0FDF4',
        border: colors.success,
        text: colors.success,
        badge: 'rgba(16,185,129,0.15)',
    },
};

// ─── Health Score ────────────────────────────────────────────────────────────
export const healthColors = {
    'Saudável': colors.success,
    'Em Atenção': colors.warning,
    'Em Risco': colors.danger,
};

// ─── Tipografia ──────────────────────────────────────────────────────────────
export const typography = {
    fontFamily: "'Plus Jakarta Sans', 'DM Sans', sans-serif",
    h1: '1.5rem',
    kpiNumber: '2.25rem',
    body: '0.875rem',
    small: '0.75rem',
};

// ─── Cards ───────────────────────────────────────────────────────────────────
export const card = {
    borderRadius: '12px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    padding: '24px',
    hoverTransform: 'translateY(-2px)',
    transition: 'transform 200ms ease, box-shadow 200ms ease',
};

// ─── Cores das KPI Cards (borda esquerda) ───────────────────────────────────
export const kpiColors = {
    total: colors.primary,
    ativos: colors.success,
    inativos: colors.danger,
    leads: colors.accent,
    novos: colors.warning,
};

// ─── Funil de Vendas ─────────────────────────────────────────────────────────
export const funnelColors = [
    '#0F3460', // Prospects
    '#1A5276', // Leads
    '#E8832A', // Reunião
    '#10B981', // Proposta
    '#064E3B', // Clientes
];

// ─── Exportação composta para uso direto como objeto ────────────────────────
export default {
    colors,
    statusColors,
    healthColors,
    typography,
    card,
    kpiColors,
    funnelColors,
};
