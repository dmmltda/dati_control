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
    'Catálogo de Produtos',
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

/** Formata float para exibição como moeda BRL "R$\u00a01.234,50" */
function fmtBRL(val) {
    if (val == null || val === '' || isNaN(Number(val))) return 'R$\u00a00,00';
    return 'R$\u00a0' + Number(val).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/** Lê valor de input monetário sem criar efeito colateral */
function readCurrencyInput(id) {
    const el = document.getElementById(id);
    if (!el || !el.value.trim()) return 0;
    const clean = el.value.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(clean);
    return isNaN(n) ? 0 : n;
}

/** Recalcula e exibe o Valor Total no preview do modal */
function updateValorTotalPreview() {
    const el = document.getElementById('prod-valor-total-preview');
    if (!el) return;
    const unitario  = readCurrencyInput('prod-valor-unitario');
    const minimo    = readCurrencyInput('prod-valor-minimo');
    const setupChk  = document.getElementById('prod-cobranca-setup')?.checked;
    const setup     = setupChk ? readCurrencyInput('prod-valor-setup') : 0;
    // Total = max(unitario, minimo) + setup
    const base  = Math.max(unitario, minimo);
    const total = base + setup;
    el.textContent = fmtBRL(total);
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

                    <!-- Valor Total calculado -->
                    <div class="valor-total-preview">
                        <span class="valor-total-label">
                            <i class="ph ph-sigma"></i> Valor Total
                        </span>
                        <span id="prod-valor-total-preview" class="valor-total-amount">R$&nbsp;0,00</span>
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

                <!-- DOCUMENTOS -->
                <div class="editor-section">
                    <div class="editor-section-title">
                        <i class="ph ph-paperclip"></i>
                        <span>Documentos</span>
                    </div>
                    <div class="editor-grid">

                        <!-- Proposta Comercial -->
                        <div class="input-group editor-file-group">
                            <label>Proposta Comercial</label>
                            ${prod?.propostaName
            ? `<div class="file-attached" id="proposta-attached">
                                    <i class="ph ph-file-pdf"></i>
                                    <span class="file-attached-name" title="${prod.propostaName}">${prod.propostaName}</span>
                                    <button type="button" class="btn-file-remove" id="btn-remove-proposta" title="Remover">
                                        <i class="ph ph-x"></i>
                                    </button>
                                   </div>`
            : ''}
                            <label class="btn-file-upload" for="prod-proposta-file" id="label-proposta-upload"
                                   style="${prod?.propostaName ? 'display:none' : ''}">
                                <i class="ph ph-upload-simple"></i>
                                <span>Selecionar arquivo</span>
                            </label>
                            <input type="file" id="prod-proposta-file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" style="display:none">
                            <span class="file-hint">PDF, Word, Excel, imagem (máx. 10 MB)</span>
                        </div>

                        <!-- Contrato -->
                        <div class="input-group editor-file-group">
                            <label>Contrato</label>
                            ${prod?.contratoName
            ? `<div class="file-attached" id="contrato-attached">
                                    <i class="ph ph-file-pdf"></i>
                                    <span class="file-attached-name" title="${prod.contratoName}">${prod.contratoName}</span>
                                    <button type="button" class="btn-file-remove" id="btn-remove-contrato" title="Remover">
                                        <i class="ph ph-x"></i>
                                    </button>
                                   </div>`
            : ''}
                            <label class="btn-file-upload" for="prod-contrato-file" id="label-contrato-upload"
                                   style="${prod?.contratoName ? 'display:none' : ''}">
                                <i class="ph ph-upload-simple"></i>
                                <span>Selecionar arquivo</span>
                            </label>
                            <input type="file" id="prod-contrato-file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" style="display:none">
                            <span class="file-hint">PDF, Word, Excel, imagem (máx. 10 MB)</span>
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

/** Lê um arquivo de input e retorna { data: base64String, name: fileName } ou null */
function readFileAsBase64(inputId) {
    return new Promise((resolve) => {
        const input = document.getElementById(inputId);
        if (!input || !input.files || !input.files[0]) { resolve(null); return; }
        const file = input.files[0];
        if (file.size > 10 * 1024 * 1024) {
            resolve({ error: `Arquivo "${file.name}" excede 10 MB.` });
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => resolve({ data: e.target.result, name: file.name });
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}

async function collectFromForm(existingProd = null) {
    const cobrancaSetup = document.getElementById('prod-cobranca-setup')?.checked;

    // Lê arquivos (se selecionados)
    const propostaFile = await readFileAsBase64('prod-proposta-file');
    const contratoFile = await readFileAsBase64('prod-contrato-file');

    // Valida tamanho
    if (propostaFile?.error) throw new Error(propostaFile.error);
    if (contratoFile?.error) throw new Error(contratoFile.error);

    // Proposta: usa novo arquivo, ou mantém existente (a menos que tenha sido removido)
    const propostaRemovida = document.getElementById('proposta-attached') === null
        && (existingProd?.propostaData || existingProd?.propostaName)
        && document.getElementById('label-proposta-upload')?.style.display !== 'none';
    const propostaData = propostaFile ? propostaFile.data
        : (propostaRemovida ? null : (existingProd?.propostaData ?? null));
    const propostaName = propostaFile ? propostaFile.name
        : (propostaRemovida ? null : (existingProd?.propostaName ?? null));

    // Contrato: idem
    const contratoRemovida = document.getElementById('contrato-attached') === null
        && (existingProd?.contratoData || existingProd?.contratoName)
        && document.getElementById('label-contrato-upload')?.style.display !== 'none';
    const contratoData = contratoFile ? contratoFile.data
        : (contratoRemovida ? null : (existingProd?.contratoData ?? null));
    const contratoName = contratoFile ? contratoFile.name
        : (contratoRemovida ? null : (existingProd?.contratoName ?? null));

    return {
        nome: document.getElementById('prod-nome')?.value || '',
        tipoCobranca: document.getElementById('prod-tipo-cobranca')?.value || '',
        valorUnitario: parseCurrency('prod-valor-unitario'),
        valorMinimo: parseCurrency('prod-valor-minimo'),
        cobrancaSetup: cobrancaSetup ? 'Sim' : 'Não',
        valorSetup: cobrancaSetup ? parseCurrency('prod-valor-setup') : null,
        qtdUsuarios: document.getElementById('prod-qtd-usuarios')?.value?.trim() || null,
        valorUserAdic: parseCurrency('prod-valor-usuario-adic'),
        totalHorasHd: parseInt(document.getElementById('prod-total-horas-hd')?.value) || null,
        valorAdicHd: parseCurrency('prod-valor-adic-hd'),
        propostaData,
        propostaName,
        contratoData,
        contratoName,
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

    // Toggle: Cobrança de Setup → mostra/oculta campo Valor Setup + atualiza total
    document.getElementById('prod-cobranca-setup')?.addEventListener('change', (e) => {
        const group = document.getElementById('prod-setup-group');
        if (group) group.style.visibility = e.target.checked ? 'visible' : 'hidden';
        updateValorTotalPreview();
    });

    // Recalcula total ao digitar nos campos de valor
    ['prod-valor-unitario', 'prod-valor-minimo', 'prod-valor-setup'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updateValorTotalPreview);
    });

    // Inicializa preview com valores existentes (modo edição)
    updateValorTotalPreview();

    // Upload: Proposta — mostra nome do arquivo ao selecionar
    document.getElementById('prod-proposta-file')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const label = document.getElementById('label-proposta-upload');
        if (label) label.querySelector('span').textContent = file.name;
    });

    // Upload: Contrato — mostra nome do arquivo ao selecionar
    document.getElementById('prod-contrato-file')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const label = document.getElementById('label-contrato-upload');
        if (label) label.querySelector('span').textContent = file.name;
    });

    // Remover proposta existente
    document.getElementById('btn-remove-proposta')?.addEventListener('click', () => {
        document.getElementById('proposta-attached')?.remove();
        const label = document.getElementById('label-proposta-upload');
        if (label) { label.style.display = ''; label.querySelector('span').textContent = 'Selecionar arquivo'; }
        const input = document.getElementById('prod-proposta-file');
        if (input) input.value = '';
    });

    // Remover contrato existente
    document.getElementById('btn-remove-contrato')?.addEventListener('click', () => {
        document.getElementById('contrato-attached')?.remove();
        const label = document.getElementById('label-contrato-upload');
        if (label) { label.style.display = ''; label.querySelector('span').textContent = 'Selecionar arquivo'; }
        const input = document.getElementById('prod-contrato-file');
        if (input) input.value = '';
    });

    // Fechar: botão ×, Cancelar, click no overlay
    document.getElementById('btn-close-produto-modal')?.addEventListener('click', closeProdutoEditor);
    document.getElementById('btn-cancelar-produto')?.addEventListener('click', closeProdutoEditor);
    document.getElementById('produto-modal-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'produto-modal-overlay') closeProdutoEditor();
    });

    // Salvar
    document.getElementById('btn-salvar-produto')?.addEventListener('click', async () => {
        let data;
        try {
            data = await collectFromForm(prod);
        } catch (err) {
            showToast(err.message, 'error');
            return;
        }

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
        if (tipoCobranca) partial.tipoCobranca = tipoCobranca;

        const valorUnitario = parseCurrency('prod-valor-unitario');
        if (valorUnitario != null) partial.valorUnitario = valorUnitario;

        const valorMinimo = parseCurrency('prod-valor-minimo');
        if (valorMinimo != null) partial.valorMinimo = valorMinimo;

        const valorSetup = parseCurrency('prod-valor-setup');
        if (valorSetup != null) partial.valorSetup = valorSetup;

        const qtdUsuarios = document.getElementById('prod-qtd-usuarios')?.value?.trim();
        if (qtdUsuarios) partial.qtdUsuarios = qtdUsuarios;

        const valorUserAdic = parseCurrency('prod-valor-usuario-adic');
        if (valorUserAdic != null) partial.valorUserAdic = valorUserAdic;

        const horasRaw = document.getElementById('prod-total-horas-hd')?.value;
        if (horasRaw !== '' && horasRaw != null) {
            const horas = parseInt(horasRaw);
            if (!isNaN(horas)) partial.totalHorasHd = horas;
        }

        const valorAdicHd = parseCurrency('prod-valor-adic-hd');
        if (valorAdicHd != null) partial.valorAdicHd = valorAdicHd;

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
