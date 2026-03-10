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
function getModal() { return document.getElementById('contato-editor-modal'); }
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

    const cont = id ? state.tempContatos.find(c => String(c.id) === String(id)) : null;
    const isNew = !cont;

    // Atualiza título
    const titleEl = overlay.querySelector('.contato-editor-title');
    if (titleEl) titleEl.textContent = isNew ? 'Novo Contato' : 'Editar Contato';

    // Monta corpo do formulário
    const body = overlay.querySelector('.contato-editor-body');
    if (body) body.innerHTML = `
        <div class="ce-form-grid">

            <div class="input-group ce-span-3">
                <label for="cef-nome">Nome do Contato <span class="required-star">*</span> <span class="th-info-btn" data-th-title="NOME DO CONTATO" data-th-tooltip="Nome completo da pessoa. Máx. 20 caracteres alfanuméricos. Será exibido na tabela de contatos e em atividades."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
                <input type="text" id="cef-nome" class="input-control"
                    placeholder="Nome completo" maxlength="20"
                    value="${cont?.nome || ''}">
                <small class="input-hint">Máx. 20 caracteres alfanuméricos</small>
            </div>

            <div class="input-group">
                <label for="cef-cargo">Cargo <span class="th-info-btn" data-th-title="CARGO" data-th-tooltip="Posição hierárquica do contato: Estagiário, Auxiliar, Analista, Supervisor, Gerente, Diretor ou Proprietário."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
                ${buildSelect('cef-cargo', CARGOS, cont?.cargo || '')}
            </div>

            <div class="input-group ce-span-2">
                <label for="cef-departamento">Departamento <span class="th-info-btn" data-th-title="DEPARTAMENTO" data-th-tooltip="Área da empresa onde o contato atua: Comercial, Compras, Comex, Financeiro, Logística, TI, etc."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
                ${buildSelect('cef-departamento', DEPARTAMENTOS, cont?.departamento || '')}
            </div>

            <div class="input-group ce-span-3">
                <label for="cef-email1">E-mail <span class="th-info-btn" data-th-title="E-MAIL CORPORATIVO" data-th-tooltip="Endereço de e-mail corporativo do contato. Será usado em comunicações e campanhas de marketing."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
                <input type="email" id="cef-email1" class="input-control"
                    placeholder="exemplo@empresa.com.br"
                    value="${cont?.email1 || ''}">
            </div>

            <div class="input-group">
                <label for="cef-whatsapp">WhatsApp <span class="th-info-btn" data-th-title="WHATSAPP" data-th-tooltip="Número de WhatsApp com DDD no formato (11) 99999-9999. Permite contato rápido via app."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
                <input type="tel" id="cef-whatsapp" class="input-control"
                    placeholder="(11) 99999-9999"
                    value="${cont?.whatsapp || cont?.telefone || ''}">
            </div>

            <div class="input-group ce-span-2">
                <label for="cef-linkedin">LinkedIn <span class="th-info-btn" data-th-title="LINKEDIN" data-th-tooltip="URL completa do perfil LinkedIn. Ex: https://linkedin.com/in/nome. Útil para pesquisa antes de reuniões."><i class="ph ph-info"></i><span class="th-pulse"></span></span></label>
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
        cargo: document.getElementById('cef-cargo')?.value || '',
        departamento: document.getElementById('cef-departamento')?.value || '',
        email1: document.getElementById('cef-email1')?.value.trim() || '',
        whatsapp: document.getElementById('cef-whatsapp')?.value.trim() || '',
        linkedin: document.getElementById('cef-linkedin')?.value.trim() || '',
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

// ============================================================================
// EDIÇÃO EM MASSA
// ============================================================================

/**
 * Abre um modal em modo "edição em massa" para contatos.
 * Campos em branco = não alterar. Apenas os preenchidos são aplicados.
 * @param {string[]} ids — IDs dos contatos selecionados
 */
export function openBulkContatoEditor(ids) {
    if (!ids?.length) return;

    // Remove modal anterior se existir
    document.getElementById('contato-bulk-modal-overlay')?.remove();

    const count = ids.length;

    const html = `
    <div id="contato-bulk-modal-overlay" class="produto-modal-overlay">
        <div class="produto-modal" role="dialog" aria-modal="true" aria-labelledby="cont-bulk-title">

            <!-- Header -->
            <div class="produto-modal-header">
                <h2 id="cont-bulk-title" class="produto-modal-title">
                    <i class="ph ph-pencil-simple"></i>
                    Editar ${count} Contato${count !== 1 ? 's' : ''} em Massa
                </h2>
                <button type="button" id="btn-close-cont-bulk" class="btn-modal-close" title="Fechar">
                    <i class="ph ph-x"></i>
                </button>
            </div>

            <!-- Banner informativo -->
            <div class="bulk-edit-banner" style="margin: 0.75rem 1.75rem 0; padding: 0.6rem 1rem; border-radius: 8px;">
                <i class="ph ph-info"></i>
                <span>Apenas os campos preenchidos serão aplicados a todos os
                    <strong>${count} contato${count !== 1 ? 's' : ''}</strong> selecionados.</span>
            </div>

            <!-- Body -->
            <div class="produto-modal-body">
                <div class="editor-section">
                    <div class="ce-form-grid">

                        <div class="input-group">
                            <label for="cbf-cargo">Cargo</label>
                            <select class="input-control" id="cbf-cargo">
                                <option value="">— não alterar —</option>
                                ${CARGOS.map(o => `<option value="${o}">${o}</option>`).join('')}
                            </select>
                        </div>

                        <div class="input-group ce-span-2">
                            <label for="cbf-departamento">Departamento</label>
                            <select class="input-control" id="cbf-departamento">
                                <option value="">— não alterar —</option>
                                ${DEPARTAMENTOS.map(o => `<option value="${o}">${o}</option>`).join('')}
                            </select>
                        </div>

                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div class="produto-modal-footer">
                <span style="font-size:0.85rem; color:var(--text-muted);">
                    <i class="ph ph-selection" style="margin-right:0.25rem;"></i>
                    ${count} contato${count !== 1 ? 's' : ''} selecionado${count !== 1 ? 's' : ''}
                </span>
                <div class="produto-modal-footer-right">
                    <button type="button" id="btn-cancelar-cont-bulk" class="btn btn-secondary">Cancelar</button>
                    <button type="button" id="btn-salvar-cont-bulk" class="btn btn-primary">
                        <i class="ph ph-floppy-disk"></i> Aplicar a todos
                    </button>
                </div>
            </div>

        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', html);

    // Animação de entrada
    requestAnimationFrame(() => {
        document.getElementById('contato-bulk-modal-overlay')?.classList.add('visible');
    });

    // Fechar
    const closeBulk = () => {
        const overlay = document.getElementById('contato-bulk-modal-overlay');
        if (!overlay) return;
        overlay.classList.remove('visible');
        overlay.style.opacity = '0';
        setTimeout(() => overlay?.remove(), 250);
    };

    document.getElementById('btn-close-cont-bulk')?.addEventListener('click', closeBulk);
    document.getElementById('btn-cancelar-cont-bulk')?.addEventListener('click', closeBulk);
    document.getElementById('contato-bulk-modal-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'contato-bulk-modal-overlay') closeBulk();
    });

    // Aplicar em massa
    document.getElementById('btn-salvar-cont-bulk')?.addEventListener('click', () => {
        const partial = {};

        const cargo = document.getElementById('cbf-cargo')?.value;
        if (cargo) partial.cargo = cargo;

        const depto = document.getElementById('cbf-departamento')?.value;
        if (depto) partial.departamento = depto;

        if (Object.keys(partial).length === 0) {
            showToast('Preencha pelo menos um campo para aplicar.', 'error');
            return;
        }

        const idSet = new Set(ids.map(String));
        state.tempContatos = (state.tempContatos || []).map(c =>
            idSet.has(String(c.id)) ? { ...c, ...partial } : c
        );

        closeBulk();
        refreshCompanyContactsTable();
        showToast(
            `${count} contato${count !== 1 ? 's' : ''} atualizado${count !== 1 ? 's' : ''}!`,
            'success'
        );
    });
}

