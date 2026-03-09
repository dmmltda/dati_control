import { DB_KEY } from './config.js';

export let state = {
    companies: JSON.parse(localStorage.getItem(DB_KEY)) || [],
    currentEditingId: null,
    bulkEditIds: [],    // IDs para edição em massa

    // Temporary form state
    tempProdutos: [],
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
    state.bulkEditIds = [];
    state.tempProdutos = [];
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
