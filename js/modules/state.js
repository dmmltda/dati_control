import { DB_KEY } from './config.js';

export let state = {
    companies: JSON.parse(localStorage.getItem(DB_KEY)) || [],
    currentEditingId: null,
    
    // Temporary form state
    tempContatos: [],
    editingContatoId: null,
    
    tempDashboards: [],
    tempNPSHistory: [],
    tempReunioesCS: [],
    tempChamados: [],
    tempNotes: [],
    tempReunioes: [],
    tempFollowUps: []
};

// Helper to reset temp state
export function resetTempState() {
    state.currentEditingId = null;
    state.tempContatos = [];
    state.editingContatoId = null;
    state.tempDashboards = [];
    state.tempNPSHistory = [];
    state.tempReunioesCS = [];
    state.tempChamados = [];
    state.tempNotes = [];
    state.tempReunioes = [];
    state.tempFollowUps = [];
}
