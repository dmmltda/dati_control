export const DB_KEY = 'dati_control_companies';

export const STATUS_CONFIG = {
    'Prospect': { color: '#fbbf24', class: 'status-prospect', icon: 'ph-binoculars' },
    'Lead': { color: '#60a5fa', class: 'status-lead', icon: 'ph-magnet' },
    'Reunião': { color: '#c084fc', class: 'status-reuniao', icon: 'ph-calendar-check' },
    'Proposta | Andamento': { color: '#818cf8', class: 'status-proposta-andamento', icon: 'ph-file-text' },
    'Proposta | Recusada': { color: '#f87171', class: 'status-proposta-recusada', icon: 'ph-file-x' },
    'Em Contrato': { color: '#38bdf8', class: 'status-em-contrato', icon: 'ph-signature' },
    'Ativo': { color: '#4ade80', class: 'status-ativo', icon: 'ph-check-circle' },
    'Suspenso': { color: '#fb923c', class: 'status-suspenso', icon: 'ph-pause-circle' },
    'Inativo': { color: '#f43f5e', class: 'status-inativo', icon: 'ph-x-circle' }
};

export const CS_VISIBLE_STATUSES = ['Ativo', 'Em Contrato', 'Suspenso', 'Inativo'];
