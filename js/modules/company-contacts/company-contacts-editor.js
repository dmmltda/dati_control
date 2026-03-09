/**
 * ============================================================================
 * Módulo: Company Contacts — Editor Modal (Standard 10/10)
 * ============================================================================
 * Abre um modal para adicionar ou editar um contato.
 *
 * Exports:
 *   openContatoEditor(id?)     — abre modal (null = novo, id = editar)
 *   saveContatoEditor()        — salva e fecha (chamado pelo botão do modal)
 *   closeContatoEditor()       — fecha sem salvar
 */
import { state } from '../state.js';
import { showToast } from '../utils.js';
import { refreshCompanyContactsTable } from './company-contacts-table.js';

// ── Listas de seleção ────────────────────────────────────────────────────────
const CARGOS = [
    'Estagiário', 'Auxiliar', 'Assistente', 'Analista',
    'Supervisor', 'Gerente', 'Diretor', 'Proprietário'
];

const DEPARTAMENTOS = [
    'Administrativo', 'Comercial', 'Compras', 'Comércio Exterior',
    'Exportação', 'Financeiro', 'Geral', 'Importação',
    'Jurídico', 'Logística', 'Operacional', 'Supply', 'Tecnologia'
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function getModal()   { return document.getElementById('contato-editor-modal'); }
function getOverlay() { return document.getElementById('contato-editor-overlay'); }

function buildSelect(fieldId, options, value = '') {
    return `
        <select class="input-control" id="${fieldId}">
            <option value="">— Selecionar —</option>
            ${options.map(o => `<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`).join('')}
        </select>`;
}

// ============================================================================
// API PRINCIPAL
// ============================================================================

export function openContatoEditor(id = null) {
    const overlay = getOverlay();
    if (!overlay) return;

    const cont  = id ? state.tempContatos.find(c => String(c.id) === String(id)) : null;
    const isNew = !cont;

    // Atualiza título
    const titleEl = overlay.querySelector('.contato-editor-title');
    if (titleEl) titleEl.textContent = isNew ? 'Novo Contato' : 'Editar Contato';

    // Monta corpo do formulário
    const body = overlay.querySelector('.contato-editor-body');
    if (body) body.innerHTML = `
        <div class="ce-form-grid">

            <div class="input-group ce-span-3">
                <label for="cef-nome">Nome do Contato <span class="required-star">*</span></label>
                <input type="text" id="cef-nome" class="input-control"
                    placeholder="Nome completo" maxlength="20"
                    value="${cont?.nome || ''}">
                <small class="input-hint">Máx. 20 caracteres alfanuméricos</small>
            </div>

            <div class="input-group">
                <label for="cef-cargo">Cargo</label>
                ${buildSelect('cef-cargo', CARGOS, cont?.cargo || '')}
            </div>

            <div class="input-group ce-span-2">
                <label for="cef-departamento">Departamento</label>
                ${buildSelect('cef-departamento', DEPARTAMENTOS, cont?.departamento || '')}
            </div>

            <div class="input-group ce-span-3">
                <label for="cef-email1">E-mail</label>
                <input type="email" id="cef-email1" class="input-control"
                    placeholder="exemplo@empresa.com.br"
                    value="${cont?.email1 || ''}">
            </div>

            <div class="input-group">
                <label for="cef-whatsapp">WhatsApp</label>
                <input type="tel" id="cef-whatsapp" class="input-control"
                    placeholder="(11) 99999-9999"
                    value="${cont?.whatsapp || cont?.telefone || ''}">
            </div>

            <div class="input-group ce-span-2">
                <label for="cef-linkedin">LinkedIn</label>
                <input type="url" id="cef-linkedin" class="input-control"
                    placeholder="https://linkedin.com/in/..."
                    value="${cont?.linkedin || ''}">
            </div>

        </div>
        <input type="hidden" id="cef-editing-id" value="${id || ''}">
    `;

    // Abre o modal
    overlay.classList.add('visible');
    overlay.querySelector('#cef-nome')?.focus();
}

export function saveContatoEditor() {
    const nome = document.getElementById('cef-nome')?.value.trim();
    if (!nome) {
        showToast('O Nome do Contato é obrigatório!', 'error');
        return;
    }

    const editingId = document.getElementById('cef-editing-id')?.value;

    const data = {
        nome,
        cargo:        document.getElementById('cef-cargo')?.value       || '',
        departamento: document.getElementById('cef-departamento')?.value || '',
        email1:       document.getElementById('cef-email1')?.value.trim()    || '',
        whatsapp:     document.getElementById('cef-whatsapp')?.value.trim()  || '',
        linkedin:     document.getElementById('cef-linkedin')?.value.trim()  || '',
    };
    // Compatibilidade retroativa (campo `telefone` legado)
    data.telefone = data.whatsapp;

    if (editingId) {
        const cont = state.tempContatos.find(c => String(c.id) === String(editingId));
        if (cont) Object.assign(cont, data);
        showToast('Contato atualizado!', 'success');
    } else {
        state.tempContatos.push({
            id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(),
            ...data,
        });
        showToast('Contato adicionado!', 'success');
    }

    closeContatoEditor();
    refreshCompanyContactsTable();
}

export function closeContatoEditor() {
    getOverlay()?.classList.remove('visible');
}
