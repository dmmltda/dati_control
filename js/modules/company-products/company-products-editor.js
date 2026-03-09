/**
 * ============================================================================
 * Módulo: Company Products — Editor (Modal Glassmorphism 10/10)
 * ============================================================================
 * Modal para adicionar, editar ou editar em massa produtos de uma empresa.
 * Os dados são salvos em state.tempProdutos (local) e persistidos ao
 * salvar o formulário completo da empresa.
 *
 * Exports públicos:
 *   openProdutoEditor(prodId)      — abre o modal (null = novo, string = editar)
 *   openBulkProdutoEditor(ids)     — abre modal em modo edição em massa
 *   closeProdutoEditor()           — fecha o modal com animação
 */
import { state } from '../state.js';
import { showToast } from '../utils.js';
import { confirmar } from '../confirmar.js';
import { refreshCompanyProductsTable, getCompanyProductsManager } from './company-products-table.js';

// ============================================================================
// SEÇÃO 1: CONSTANTES (catálogo de produtos e tipos de cobrança)
// ============================================================================

const PRODUTOS_DATI = [
    'DATI Import',
    'DATI Export',
    'Smart Read',
    'Orkestra',
];

const BILLING_TYPES = [
    'Mensalidade',
    'Por processo',
    'Por documento',
    'Por DI/DUIMP',
];

// ============================================================================
// SEÇÃO 2: UTILIDADES INTERNAS
// ============================================================================

/** Converte string monetária "1.234,56" → float 1234.56 (ou null) */
function parseCurrency(id) {
    const el = document.getElementById(id);
    if (!el || !el.value.trim()) return null;
    const clean = el.value.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(clean);
    return isNaN(n) ? null : n;
}

/** Formata float para exibição no input monetário "1234.5" → "1.234,50" */
function fmtForInput(val) {
    if (val == null || val === '' || isNaN(Number(val))) return '';
    return Number(val).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/** Gera options HTML para um select */
function buildOptions(list, selected, placeholder = 'Selecione...') {
    const opts = list.map(opt =>
        `<option value="${opt}" ${selected === opt ? 'selected' : ''}>${opt}</option>`
    ).join('');
    return `<option value="">${placeholder}</option>${opts}`;
}

// ============================================================================
// SEÇÃO 3: CONSTRUÇÃO DO MODAL
// ============================================================================

function buildModalHTML(prod) {
    const isEdit = !!prod;

    return `
    <div id="produto-modal-overlay" class="produto-modal-overlay">
        <div class="produto-modal" role="dialog" aria-modal="true" aria-labelledby="prod-modal-title">

            <!-- ── Header ── -->
            <div class="produto-modal-header">
                <h2 id="prod-modal-title" class="produto-modal-title">
                    <i class="ph ph-package"></i>
                    ${isEdit ? 'Editar Produto na Proposta' : 'Adicionar Produto na Proposta'}
                </h2>
                <button type="button" id="btn-close-produto-modal" class="btn-modal-close" title="Fechar">
                    <i class="ph ph-x"></i>
                </button>
            </div>

            <!-- ── Body ── -->
            <div class="produto-modal-body">

                <!-- PRODUTO -->
                <div class="editor-section">
                    <div class="input-group">
                        <label for="prod-nome">Produto <span class="required-star">*</span></label>
                        <select id="prod-nome" class="input-control">
                            ${buildOptions(PRODUTOS_DATI, prod?.nome, 'Selecione o produto...')}
                        </select>
                    </div>
                </div>

                <!-- VALORES DO PRODUTO -->
                <div class="editor-section">
                    <div class="editor-section-title">
                        <i class="ph ph-currency-circle-dollar"></i>
                        <span>Valores do Produto</span>
                    </div>
                    <div class="editor-grid">

                        <div class="input-group">
                            <label for="prod-tipo-cobranca">Tipo de Cobrança</label>
                            <select id="prod-tipo-cobranca" class="input-control">
                                ${buildOptions(BILLING_TYPES, prod?.tipoCobranca)}
                            </select>
                        </div>

                        <div class="input-group">
                            <label for="prod-valor-unitario">Valor Unitário</label>
                            <div class="input-currency-wrapper">
                                <span class="input-currency-prefix">R$</span>
                                <input type="text" id="prod-valor-unitario" class="input-control"
                                    placeholder="0,00" value="${fmtForInput(prod?.valorUnitario)}">
                            </div>
                        </div>

                        <div class="input-group">
                            <label for="prod-valor-minimo">Valor Mínimo</label>
                            <div class="input-currency-wrapper">
                                <span class="input-currency-prefix">R$</span>
                                <input type="text" id="prod-valor-minimo" class="input-control"
                                    placeholder="0,00" value="${fmtForInput(prod?.valorMinimo)}">
                            </div>
                        </div>

                        <div class="input-group editor-checkbox-group">
                            <label class="checkbox-label" for="prod-cobranca-setup">
                                <input type="checkbox" id="prod-cobranca-setup"
                                    ${prod?.cobrancaSetup === 'Sim' ? 'checked' : ''}>
                                <span>Cobrança de Setup</span>
                            </label>
                        </div>

                        <div class="input-group" id="prod-setup-group"
                             style="${prod?.cobrancaSetup === 'Sim' ? '' : 'visibility:hidden;'}">
                            <label for="prod-valor-setup">Valor Setup</label>
                            <div class="input-currency-wrapper">
                                <span class="input-currency-prefix">R$</span>
                                <input type="text" id="prod-valor-setup" class="input-control"
                                    placeholder="0,00" value="${fmtForInput(prod?.valorSetup)}">
                            </div>
                        </div>

                    </div>
                </div>

                <!-- USUÁRIOS -->
                <div class="editor-section">
                    <div class="editor-section-title">
                        <i class="ph ph-users"></i>
                        <span>Usuários</span>
                    </div>
                    <div class="editor-grid">

                        <div class="input-group">
                            <label for="prod-qtd-usuarios">Quantidade de Usuários</label>
                            <input type="text" id="prod-qtd-usuarios" class="input-control"
                                placeholder="Ex: 10 ou Ilimitado"
                                value="${prod?.qtdUsuarios || ''}">
                        </div>

                        <div class="input-group">
                            <label for="prod-valor-usuario-adic">Valor por Usuário Adicional</label>
                            <div class="input-currency-wrapper">
                                <span class="input-currency-prefix">R$</span>
                                <input type="text" id="prod-valor-usuario-adic" class="input-control"
                                    placeholder="0,00" value="${fmtForInput(prod?.valorUserAdic)}">
                            </div>
                        </div>

                    </div>
                </div>

                <!-- HELP DESK -->
                <div class="editor-section">
                    <div class="editor-section-title">
                        <i class="ph ph-headset"></i>
                        <span>Help Desk</span>
                    </div>
                    <div class="editor-grid">

                        <div class="input-group">
                            <label for="prod-total-horas-hd">Total Horas Mensais</label>
                            <input type="number" id="prod-total-horas-hd" class="input-control"
                                placeholder="Ex: 20" min="0"
                                value="${prod?.totalHorasHd ?? ''}">
                        </div>

                        <div class="input-group">
                            <label for="prod-valor-adic-hd">Valor Adicional por Hora</label>
                            <div class="input-currency-wrapper">
                                <span class="input-currency-prefix">R$</span>
                                <input type="text" id="prod-valor-adic-hd" class="input-control"
                                    placeholder="0,00" value="${fmtForInput(prod?.valorAdicHd)}">
                            </div>
                        </div>

                    </div>
                </div>

            </div><!-- /modal-body -->

            <!-- ── Footer ── -->
            <div class="produto-modal-footer">
                ${isEdit
                    ? `<button type="button" id="btn-excluir-produto" class="btn btn-danger-outline">
                            <i class="ph ph-trash"></i> Excluir Produto
                       </button>`
                    : '<span></span>'}
                <div class="produto-modal-footer-right">
                    <button type="button" id="btn-cancelar-produto" class="btn btn-secondary">Cancelar</button>
                    <button type="button" id="btn-salvar-produto" class="btn btn-primary">
                        <i class="ph ph-floppy-disk"></i> Salvar
                    </button>
                </div>
            </div>

        </div><!-- /produto-modal -->
    </div><!-- /produto-modal-overlay -->`;
}

// ============================================================================
// SEÇÃO 4: COLETA DE DADOS DO FORMULÁRIO
// ============================================================================

function collectFromForm() {
    const cobrancaSetup = document.getElementById('prod-cobranca-setup')?.checked;
    return {
        nome:          document.getElementById('prod-nome')?.value || '',
        tipoCobranca:  document.getElementById('prod-tipo-cobranca')?.value || '',
        valorUnitario: parseCurrency('prod-valor-unitario'),
        valorMinimo:   parseCurrency('prod-valor-minimo'),
        cobrancaSetup: cobrancaSetup ? 'Sim' : 'Não',
        valorSetup:    cobrancaSetup ? parseCurrency('prod-valor-setup') : null,
        qtdUsuarios:   document.getElementById('prod-qtd-usuarios')?.value?.trim() || null,
        valorUserAdic: parseCurrency('prod-valor-usuario-adic'),
        totalHorasHd:  parseInt(document.getElementById('prod-total-horas-hd')?.value) || null,
        valorAdicHd:   parseCurrency('prod-valor-adic-hd'),
    };
}

// ============================================================================
// SEÇÃO 5: CONTROLE DO MODAL
// ============================================================================

/** Fecha o modal com animação de saída (250ms) */
export function closeProdutoEditor() {
    const overlay = document.getElementById('produto-modal-overlay');
    if (!overlay) return;
    overlay.classList.remove('visible');
    overlay.style.opacity = '0';
    setTimeout(() => overlay?.remove(), 250);
}

/**
 * Abre o modal editor de produto.
 * @param {string|null} prodId - ID do produto a editar, null para adicionar novo
 */
export function openProdutoEditor(prodId = null) {
    // Remove modal anterior
    document.getElementById('produto-modal-overlay')?.remove();

    // Encontra produto existente (edição) ou null (criação)
    const prod = prodId != null
        ? (state.tempProdutos || []).find(p => String(p.id) === String(prodId))
        : null;

    // Injeta no body, FORA do <form> da empresa (evita submit aninhado)
    document.body.insertAdjacentHTML('beforeend', buildModalHTML(prod));

    // Animação de entrada (fade + scale)
    requestAnimationFrame(() => {
        const overlay = document.getElementById('produto-modal-overlay');
        if (overlay) overlay.classList.add('visible');
    });

    // ── Event listeners ──────────────────────────────────────────────────────

    // Toggle: Cobrança de Setup → mostra/oculta campo Valor Setup
    document.getElementById('prod-cobranca-setup')?.addEventListener('change', (e) => {
        const group = document.getElementById('prod-setup-group');
        if (group) group.style.visibility = e.target.checked ? 'visible' : 'hidden';
    });

    // Fechar: botão ×, Cancelar, click no overlay
    document.getElementById('btn-close-produto-modal')?.addEventListener('click', closeProdutoEditor);
    document.getElementById('btn-cancelar-produto')?.addEventListener('click', closeProdutoEditor);
    document.getElementById('produto-modal-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'produto-modal-overlay') closeProdutoEditor();
    });

    // Salvar
    document.getElementById('btn-salvar-produto')?.addEventListener('click', () => {
        const data = collectFromForm();

        if (!data.nome) {
            showToast('Selecione um produto.', 'error');
            document.getElementById('prod-nome')?.focus();
            return;
        }

        if (!state.tempProdutos) state.tempProdutos = [];

        if (prod) {
            // ── Editar existente ──
            const idx = state.tempProdutos.findIndex(p => String(p.id) === String(prod.id));
            if (idx >= 0) state.tempProdutos[idx] = { ...state.tempProdutos[idx], ...data };
            showToast(`Produto "${data.nome}" atualizado!`, 'success');
        } else {
            // ── Adicionar novo ──
            data.id = crypto.randomUUID?.() ?? `prod-${Date.now()}`;
            state.tempProdutos.push(data);
            showToast(`Produto "${data.nome}" adicionado!`, 'success');
        }

        refreshCompanyProductsTable();
        closeProdutoEditor();
    });

    // Excluir (apenas no modo edição)
    document.getElementById('btn-excluir-produto')?.addEventListener('click', () => {
        confirmar(
            `Remover o produto "${prod?.nome}" desta empresa?`,
            () => {
                state.tempProdutos = (state.tempProdutos || [])
                    .filter(p => String(p.id) !== String(prod.id));
                refreshCompanyProductsTable();
                closeProdutoEditor();
                showToast('Produto removido.', 'success');
            }
        );
    });
}

// ============================================================================
// SEÇÃO 6: EDIÇÃO EM MASSA
// ============================================================================

/**
 * Abre o modal em modo "edição em massa".
 * Campos em branco = não editar. Apenas os preenchidos serão aplicados.
 * @param {string[]} ids  — IDs dos produtos selecionados
 */
export function openBulkProdutoEditor(ids) {
    if (!ids?.length) return;
    document.getElementById('produto-modal-overlay')?.remove();

    const count = ids.length;

    // Monta modal com todos os campos em branco + banner de aviso
    const html = `
    <div id="produto-modal-overlay" class="produto-modal-overlay">
        <div class="produto-modal" role="dialog" aria-modal="true" aria-labelledby="prod-modal-title">

            <!-- Header -->
            <div class="produto-modal-header">
                <h2 id="prod-modal-title" class="produto-modal-title">
                    <i class="ph ph-pencil-simple"></i>
                    Editar ${count} Produto${count !== 1 ? 's' : ''} em Massa
                </h2>
                <button type="button" id="btn-close-produto-modal" class="btn-modal-close" title="Fechar">
                    <i class="ph ph-x"></i>
                </button>
            </div>

            <!-- Banner informativo -->
            <div class="bulk-edit-banner" style="
                margin: 0.75rem 1.75rem 0;
                padding: 0.6rem 1rem;
                border-radius: 8px;
            ">
                <i class="ph ph-info"></i>
                <span>Apenas os campos preenchidos serão aplicados a todos os
                    <strong>${count} produto${count !== 1 ? 's' : ''}</strong> selecionados.</span>
            </div>

            <!-- Body (campos em branco) -->
            <div class="produto-modal-body">

                <!-- VALORES DO PRODUTO -->
                <div class="editor-section">
                    <div class="editor-section-title">
                        <i class="ph ph-currency-circle-dollar"></i>
                        <span>Valores do Produto</span>
                    </div>
                    <div class="editor-grid">

                        <div class="input-group">
                            <label for="prod-tipo-cobranca">Tipo de Cobrança</label>
                            <select id="prod-tipo-cobranca" class="input-control">
                                ${buildOptions(BILLING_TYPES, '', '— não alterar —')}
                            </select>
                        </div>

                        <div class="input-group">
                            <label for="prod-valor-unitario">Valor Unitário</label>
                            <div class="input-currency-wrapper">
                                <span class="input-currency-prefix">R$</span>
                                <input type="text" id="prod-valor-unitario" class="input-control" placeholder="— não alterar —">
                            </div>
                        </div>

                        <div class="input-group">
                            <label for="prod-valor-minimo">Valor Mínimo</label>
                            <div class="input-currency-wrapper">
                                <span class="input-currency-prefix">R$</span>
                                <input type="text" id="prod-valor-minimo" class="input-control" placeholder="— não alterar —">
                            </div>
                        </div>

                        <div class="input-group">
                            <label for="prod-valor-setup">Valor Setup</label>
                            <div class="input-currency-wrapper">
                                <span class="input-currency-prefix">R$</span>
                                <input type="text" id="prod-valor-setup" class="input-control" placeholder="— não alterar —">
                            </div>
                        </div>

                    </div>
                </div>

                <!-- USUÁRIOS -->
                <div class="editor-section">
                    <div class="editor-section-title">
                        <i class="ph ph-users"></i>
                        <span>Usuários</span>
                    </div>
                    <div class="editor-grid">

                        <div class="input-group">
                            <label for="prod-qtd-usuarios">Quantidade de Usuários</label>
                            <input type="text" id="prod-qtd-usuarios" class="input-control"
                                placeholder="— não alterar —">
                        </div>

                        <div class="input-group">
                            <label for="prod-valor-usuario-adic">Valor por Usuário Adicional</label>
                            <div class="input-currency-wrapper">
                                <span class="input-currency-prefix">R$</span>
                                <input type="text" id="prod-valor-usuario-adic" class="input-control" placeholder="— não alterar —">
                            </div>
                        </div>

                    </div>
                </div>

                <!-- HELP DESK -->
                <div class="editor-section">
                    <div class="editor-section-title">
                        <i class="ph ph-headset"></i>
                        <span>Help Desk</span>
                    </div>
                    <div class="editor-grid">

                        <div class="input-group">
                            <label for="prod-total-horas-hd">Total Horas Mensais</label>
                            <input type="number" id="prod-total-horas-hd" class="input-control"
                                placeholder="— não alterar —" min="0">
                        </div>

                        <div class="input-group">
                            <label for="prod-valor-adic-hd">Valor Adicional por Hora</label>
                            <div class="input-currency-wrapper">
                                <span class="input-currency-prefix">R$</span>
                                <input type="text" id="prod-valor-adic-hd" class="input-control" placeholder="— não alterar —">
                            </div>
                        </div>

                    </div>
                </div>

            </div><!-- /modal-body -->

            <!-- Footer -->
            <div class="produto-modal-footer">
                <span style="font-size:0.85rem; color:var(--text-muted);">
                    <i class="ph ph-selection" style="margin-right:0.25rem;"></i>
                    ${count} produto${count !== 1 ? 's' : ''} selecionado${count !== 1 ? 's' : ''}
                </span>
                <div class="produto-modal-footer-right">
                    <button type="button" id="btn-cancelar-produto" class="btn btn-secondary">Cancelar</button>
                    <button type="button" id="btn-salvar-produto" class="btn btn-primary">
                        <i class="ph ph-floppy-disk"></i> Aplicar a todos
                    </button>
                </div>
            </div>

        </div><!-- /produto-modal -->
    </div><!-- /produto-modal-overlay -->`;

    document.body.insertAdjacentHTML('beforeend', html);

    // Animação de entrada
    requestAnimationFrame(() => {
        const overlay = document.getElementById('produto-modal-overlay');
        if (overlay) overlay.classList.add('visible');
    });

    // ── Event listeners ──────────────────────────────────────────────────────

    // Fechar
    document.getElementById('btn-close-produto-modal')?.addEventListener('click', closeProdutoEditor);
    document.getElementById('btn-cancelar-produto')?.addEventListener('click', closeProdutoEditor);
    document.getElementById('produto-modal-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'produto-modal-overlay') closeProdutoEditor();
    });

    // Salvar em massa — aplica apenas campos preenchidos
    document.getElementById('btn-salvar-produto')?.addEventListener('click', () => {
        // Coleta partial payload: inclui só o que o usuário digitou
        const partial = {};

        const tipoCobranca = document.getElementById('prod-tipo-cobranca')?.value;
        if (tipoCobranca)                              partial.tipoCobranca  = tipoCobranca;

        const valorUnitario = parseCurrency('prod-valor-unitario');
        if (valorUnitario != null)                     partial.valorUnitario = valorUnitario;

        const valorMinimo = parseCurrency('prod-valor-minimo');
        if (valorMinimo != null)                       partial.valorMinimo   = valorMinimo;

        const valorSetup = parseCurrency('prod-valor-setup');
        if (valorSetup != null)                        partial.valorSetup    = valorSetup;

        const qtdUsuarios = document.getElementById('prod-qtd-usuarios')?.value?.trim();
        if (qtdUsuarios)                               partial.qtdUsuarios   = qtdUsuarios;

        const valorUserAdic = parseCurrency('prod-valor-usuario-adic');
        if (valorUserAdic != null)                     partial.valorUserAdic = valorUserAdic;

        const horasRaw = document.getElementById('prod-total-horas-hd')?.value;
        if (horasRaw !== '' && horasRaw != null) {
            const horas = parseInt(horasRaw);
            if (!isNaN(horas))                         partial.totalHorasHd  = horas;
        }

        const valorAdicHd = parseCurrency('prod-valor-adic-hd');
        if (valorAdicHd != null)                       partial.valorAdicHd   = valorAdicHd;

        if (Object.keys(partial).length === 0) {
            showToast('Preencha pelo menos um campo para aplicar.', 'warning');
            return;
        }

        // Aplica a cada produto selecionado
        const idSet = new Set(ids.map(String));
        state.tempProdutos = (state.tempProdutos || []).map(p =>
            idSet.has(String(p.id)) ? { ...p, ...partial } : p
        );

        // Limpa seleção
        getCompanyProductsManager?.()?.clearSelection();

        refreshCompanyProductsTable();
        closeProdutoEditor();
        showToast(
            `${count} produto${count !== 1 ? 's' : ''} atualizado${count !== 1 ? 's' : ''}!`,
            'success'
        );
    });
}
