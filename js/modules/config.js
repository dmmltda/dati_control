export const DB_KEY = 'dati_control_companies';

export const STATUS_CONFIG = {
    'Prospect': { color: '#e5e7eb', class: 'status-prospect', icon: 'ph-binoculars' },
    'Lead': { color: '#c1ddee', class: 'status-lead', icon: 'ph-magnet' },
    'Reunião': { color: '#e9d5f5', class: 'status-reuniao', icon: 'ph-calendar-check' },
    'Proposta | Andamento': { color: '#9fb2d3', class: 'status-proposta-andamento', icon: 'ph-file-text' },
    'Proposta | Recusada': { color: '#fecaca', class: 'status-proposta-recusada', icon: 'ph-file-x' },
    'Cliente Ativo': { color: '#d1eeb2', class: 'status-cliente-ativo', icon: 'ph-check-circle' },
    'Cliente Suspenso': { color: '#cda36f', class: 'status-cliente-suspenso', icon: 'ph-pause-circle' },
    'Cliente Inativo': { color: '#fdceb1', class: 'status-cliente-inativo', icon: 'ph-x-circle' }
};

export const CS_VISIBLE_STATUSES = ['Cliente Ativo', 'Cliente Suspenso', 'Cliente Inativo'];
