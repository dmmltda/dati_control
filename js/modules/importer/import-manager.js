/**
 * ============================================================================
 * Import Manager — Orquestrador do Módulo de Importação em Massa
 * ============================================================================
 */

// Utilitário de toast inline (evita dependência de import quebrado)
function showToast(msg, type = 'info') {
    const existing = document.getElementById('import-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'import-toast';
    toast.style.cssText = `
        position: fixed; bottom: 2rem; right: 2rem; z-index: 9999;
        padding: 0.85rem 1.5rem; border-radius: 10px; font-size: 0.9rem;
        font-family: inherit; font-weight: 500; max-width: 400px;
        background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : '#6366f1'};
        color: #fff; box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        animation: fadeIn 0.25s ease;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast?.remove(), 4000);
}

// ── Estado do módulo ──────────────────────────────────────────────────────────
let currentImportId = null;
let currentStep = 1;
let validationResult = null;
let simulationResult = null;
let currentFilter = 'all';
let currentPage = 1;
const PAGE_SIZE = 50;

// ── Helpers de UI ─────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function setStep(step) {
    currentStep = step;

    // Atualiza indicadores de passo
    for (let i = 1; i <= 5; i++) {
        const el = $(`import-step-${i}`);
        if (!el) continue;
        el.classList.remove('active', 'completed', 'upcoming');
        if (i < step) el.classList.add('completed');
        else if (i === step) el.classList.add('active');
        else el.classList.add('upcoming');
    }

    // Mostra painel correto
    ['upload', 'validating', 'preview', 'simulation', 'confirm'].forEach((name, idx) => {
        const panel = $(`import-panel-${name}`);
        if (panel) panel.style.display = (idx + 1 === step) ? 'block' : 'none';
    });
}

function setLoading(panelId, loading, message = 'Processando...') {
    const panel = $(panelId);
    if (!panel) return;
    const loader = panel.querySelector('.import-loader');
    const content = panel.querySelector('.import-content');
    if (loader) loader.style.display = loading ? 'flex' : 'none';
    if (content) content.style.display = loading ? 'none' : 'block';
    if (loading && loader) {
        const msg = loader.querySelector('.import-loader-msg');
        if (msg) msg.textContent = message;
    }
}

// ── STEP 1: Upload ────────────────────────────────────────────────────────────
export function initImportModule() {
    currentImportId = null;
    currentStep = 1;
    validationResult = null;
    simulationResult = null;
    currentFilter = 'all';
    currentPage = 1;

    setStep(1);
    initUploadZone();

    // Botão Baixar Modelo — é tag <a download>, não precisa de JS.
    // Apenas impede que o clique propague para o drop zone.
    $('btn-import-template')?.addEventListener('click', (e) => e.stopPropagation());

    // Botão Cancelar importação
    $('btn-import-cancel')?.addEventListener('click', cancelImport);
    $('btn-import-cancel-preview')?.addEventListener('click', cancelImport);
    $('btn-import-cancel-sim')?.addEventListener('click', cancelImport);
    $('btn-import-cancel-confirm')?.addEventListener('click', cancelImport);

    // Filtros do preview
    document.querySelectorAll('.preview-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentFilter = btn.dataset.filter || 'all';
            currentPage = 1;
            document.querySelectorAll('.preview-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadPreviewPage();
        });
    });

    // Paginação preview
    $('btn-preview-prev')?.addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; loadPreviewPage(); }
    });
    $('btn-preview-next')?.addEventListener('click', () => {
        currentPage++;
        loadPreviewPage();
    });

    // Opção de duplicados
    document.querySelectorAll('.duplicate-option').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.duplicate-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        });
    });

    // Botão Simular
    $('btn-run-simulation')?.addEventListener('click', runSimulation);

    // Botão Confirmar Importação
    $('btn-confirm-import')?.addEventListener('click', executeImport);
}

function initUploadZone() {
    const zone = $('import-drop-zone');
    const fileInput = $('import-file-input');
    if (!zone || !fileInput) return;

    zone.addEventListener('click', () => fileInput.click());

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelected(file);
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files[0]) handleFileSelected(fileInput.files[0]);
    });
}

async function handleFileSelected(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
        showToast('Formato inválido. Use CSV ou XLSX.', 'error');
        return;
    }

    // Mostrar nome do arquivo selecionado
    const label = $('import-file-label');
    if (label) label.textContent = `📄 ${file.name}`;

    // Ir para step 2 (validando)
    setStep(2);
    setLoading('import-panel-validating', true, 'Enviando arquivo e inserindo no staging...');

    try {
        // Upload
        const formData = new FormData();
        formData.append('file', file);

        const uploadRes = await fetch('/api/import/upload', { method: 'POST', body: formData });
        if (!uploadRes.ok) {
            const err = await uploadRes.json();
            throw new Error(err.error || 'Erro no upload');
        }
        const uploadData = await uploadRes.json();
        currentImportId = uploadData.import_id;

        // Atualiza loader
        const loaderMsg = document.querySelector('#import-panel-validating .import-loader-msg');
        if (loaderMsg) loaderMsg.textContent = `${uploadData.total_rows} linhas no staging. Validando...`;

        // Validar
        const validateRes = await fetch(`/api/import/${currentImportId}/validate`, { method: 'POST' });
        if (!validateRes.ok) {
            const err = await validateRes.json();
            throw new Error(err.error || 'Erro na validação');
        }
        validationResult = await validateRes.json();

        // Ir para preview (step 3)
        setStep(3);
        renderQualityScore(validationResult);
        await loadPreviewPage();

        if (validationResult.blocked) {
            showToast('⚠️ Importação bloqueada: mais de 20% dos registros são inválidos.', 'error');
        }

    } catch (err) {
        showToast(`Erro: ${err.message}`, 'error');
        setStep(1);
    }
}

// ── STEP 3: Preview ───────────────────────────────────────────────────────────
function renderQualityScore(result) {
    const score = result.score || 0;
    const total = result.total || 0;

    // Score card
    const scoreEl = $('import-score-value');
    if (scoreEl) scoreEl.textContent = `${score}%`;

    const barEl = $('import-score-bar');
    if (barEl) {
        barEl.style.width = `${score}%`;
        barEl.style.background = score >= 80 ? 'var(--success, #10b981)' : score >= 60 ? '#f59e0b' : '#ef4444';
    }

    const validEl = $('import-count-valid');
    const dupEl = $('import-count-dup');
    const invalidEl = $('import-count-invalid');

    if (validEl) validEl.textContent = `✅ ${result.valid} válidos`;
    if (dupEl) dupEl.textContent = `⚠️ ${result.duplicate} duplicados`;
    if (invalidEl) invalidEl.textContent = `❌ ${result.invalid} inválidos`;

    // Alerta de bloqueio
    const blockedAlert = $('import-blocked-alert');
    const previewCtaBtn = $('btn-go-simulation');
    if (blockedAlert) blockedAlert.style.display = result.blocked ? 'flex' : 'none';
    if (previewCtaBtn) previewCtaBtn.disabled = result.blocked;

    // Botão para avançar para simulação
    previewCtaBtn?.addEventListener('click', () => {
        setStep(4);
    });
}

async function loadPreviewPage() {
    const tbody = $('import-preview-tbody');
    const info = $('import-preview-info');
    if (!tbody || !currentImportId) return;

    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-muted);">Carregando...</td></tr>`;

    try {
        const params = new URLSearchParams({ page: currentPage, pageSize: PAGE_SIZE, status: currentFilter });
        const res = await fetch(`/api/import/${currentImportId}/preview?${params}`);
        const data = await res.json();

        const totalPages = Math.ceil(data.total / PAGE_SIZE);
        if (info) info.textContent = `${data.total} registros · Página ${data.page} de ${Math.max(1, totalPages)}`;

        // Prev/Next
        const prev = $('btn-preview-prev');
        const next = $('btn-preview-next');
        if (prev) prev.disabled = currentPage <= 1;
        if (next) next.disabled = currentPage >= totalPages;

        if (data.rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-muted);">Nenhum registro para este filtro.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.rows.map(row => {
            const statusMap = {
                valid: { cls: 'status-badge-valid', label: '✅ VÁLIDO' },
                duplicate: { cls: 'status-badge-duplicate', label: '⚠️ DUPLICADO' },
                invalid: { cls: 'status-badge-invalid', label: '❌ INVÁLIDO' },
                pending: { cls: 'status-badge-pending', label: '⏳ PENDENTE' },
            };
            const s = statusMap[row.status] || statusMap.pending;
            return `
            <tr class="preview-row preview-row-${row.status}">
                <td class="preview-cell-num">${row.row_number}</td>
                <td><strong>${row.empresa || '—'}</strong></td>
                <td>${row.cnpj || '—'}</td>
                <td>${row.contato_nome || '—'}</td>
                <td>${row.contato_email || '—'}</td>
                <td><span class="preview-status-badge ${s.cls}">${s.label}</span></td>
                <td style="font-size:0.78rem; color: var(--text-muted); max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${row.error_message || ''}">${row.error_message || '—'}</td>
            </tr>`;
        }).join('');

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" style="color: #ef4444; padding: 1rem;">${err.message}</td></tr>`;
    }
}

// ── STEP 4: Simulação ─────────────────────────────────────────────────────────
async function runSimulation() {
    const selectedDupAction = document.querySelector('.duplicate-option.selected')?.dataset?.action || 'ignore';
    setLoading('import-panel-simulation', true, 'Simulando importação...');

    try {
        const res = await fetch(`/api/import/${currentImportId}/simulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ duplicate_action: selectedDupAction }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        simulationResult = await res.json();

        setLoading('import-panel-simulation', false);
        renderSimulationResult(simulationResult);

    } catch (err) {
        setLoading('import-panel-simulation', false);
        showToast(`Erro na simulação: ${err.message}`, 'error');
    }
}

function renderSimulationResult(result) {
    const area = $('simulation-result-area');
    if (!area) return;

    area.style.display = 'block';

    const compEl = $('sim-companies');
    const contEl = $('sim-contacts');
    const ignoredEl = $('sim-ignored');

    if (compEl) compEl.textContent = result.companies_would_create || 0;
    if (contEl) contEl.textContent = result.contacts_would_create || 0;
    if (ignoredEl) ignoredEl.textContent = result.ignored || 0;

    // Botão confirmar habilitado
    const confirmBtn = $('btn-go-confirm');
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.addEventListener('click', () => {
            setStep(5);
            renderConfirmSummary(result);
        });
    }
}

// ── STEP 5: Confirmação ───────────────────────────────────────────────────────
function renderConfirmSummary(result) {
    const el = $('confirm-summary');
    if (!el) return;
    el.innerHTML = `
        <div class="confirm-stat"><i class="ph ph-buildings"></i><span><strong>${result.companies_would_create}</strong> empresas serão criadas</span></div>
        <div class="confirm-stat"><i class="ph ph-user"></i><span><strong>${result.contacts_would_create}</strong> contatos serão criados</span></div>
        <div class="confirm-stat confirm-stat-warn"><i class="ph ph-skip-forward"></i><span><strong>${result.ignored}</strong> registros serão ignorados</span></div>
    `;
}

async function executeImport() {
    const confirmBtn = $('btn-confirm-import');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Importando...'; }

    const progressBar = $('import-progress-bar');
    const progressEl = $('import-progress-fill');
    if (progressBar) progressBar.style.display = 'block';

    try {
        // Anima a barra de progresso (simulação visual, backend é batch)
        let progress = 0;
        const interval = setInterval(() => {
            progress = Math.min(progress + Math.random() * 15, 90);
            if (progressEl) progressEl.style.width = `${progress}%`;
        }, 300);

        const res = await fetch(`/api/import/${currentImportId}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: 'usuário' }),
        });

        clearInterval(interval);
        if (progressEl) progressEl.style.width = '100%';

        if (!res.ok) throw new Error((await res.json()).error);
        const result = await res.json();

        // Mostrar resultado final
        setTimeout(() => renderFinalResult(result), 500);

    } catch (err) {
        if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirmar Importação'; }
        showToast(`Erro na execução: ${err.message}`, 'error');
    }
}

function renderFinalResult(result) {
    const panel = $('import-panel-confirm');
    if (!panel) return;

    panel.innerHTML = `
        <div class="import-final-result">
            <div class="import-final-icon"><i class="ph ph-check-circle"></i></div>
            <h2>Importação concluída!</h2>
            <div class="import-final-stats">
                <div class="final-stat final-stat-ok">
                    <i class="ph ph-buildings"></i>
                    <span><strong>${result.companies_created}</strong> empresas criadas</span>
                </div>
                <div class="final-stat final-stat-ok">
                    <i class="ph ph-user"></i>
                    <span><strong>${result.contacts_created}</strong> contatos criados</span>
                </div>
                ${result.errors > 0 ? `
                <div class="final-stat final-stat-warn">
                    <i class="ph ph-warning"></i>
                    <span><strong>${result.errors}</strong> registros com erro</span>
                </div>` : ''}
            </div>
            <button id="btn-import-done" class="btn btn-primary" style="margin-top: 2rem;">
                <i class="ph ph-arrow-left"></i> Voltar para Empresas
            </button>
        </div>
    `;

    $('btn-import-done')?.addEventListener('click', () => {
        // Recarrega a lista de empresas e vai para a view de empresas
        import('../../../app.js').then(app => app.loadCompanies?.()).catch(() => { });
        document.querySelector('[data-view="company-list"]')?.click();
    });
}

function downloadTemplate() {
    const a = document.createElement('a');
    a.href = '/api/import/template';
    a.download = 'template_importacao_dati.xlsx';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 100);
}

async function cancelImport() {
    if (currentImportId) {
        await fetch(`/api/import/${currentImportId}`, { method: 'DELETE' }).catch(() => { });
        currentImportId = null;
    }
    setStep(1);
    const fileInput = $('import-file-input');
    if (fileInput) fileInput.value = '';
    const label = $('import-file-label');
    if (label) label.textContent = '';
}
