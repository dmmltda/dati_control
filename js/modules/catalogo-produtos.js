/**
 * catalogo-produtos.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo de Catálogo de Produtos DATI
 * Gerencia o portfólio de produtos: CRUD completo com modal de edição,
 * busca em tempo real e gestão de status.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as auth from './auth.js';
import * as utils from './utils.js';

// ── Estado local ─────────────────────────────────────────────────────────────
let _produtos = [];
let _filtrado = [];
let _editingId = null;

// Ícones disponíveis por categoria
const ICONES_DISPONIVEIS = [
    'ph-cube', 'ph-package', 'ph-airplane', 'ph-ship', 'ph-truck',
    'ph-file-doc', 'ph-note', 'ph-chart-line-up', 'ph-barcode',
    'ph-magnifying-glass', 'ph-globe', 'ph-star', 'ph-lightning',
    'ph-shield-check', 'ph-robot', 'ph-database', 'ph-cloud',
    'ph-gear', 'ph-puzzle-piece', 'ph-handshake'
];

// Paleta de cores para badges
const CORES_BADGE = [
    '#5b52f6', '#10B981', '#F59E0B', '#EF4444', '#3B82F6',
    '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316'
];

// ── API helpers ───────────────────────────────────────────────────────────────

async function getHeaders() {
    const token = await auth.getAuthToken();
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
    };
}

async function fetchCatalogo() {
    const headers = await getHeaders();
    const res = await fetch('/api/catalogo-produtos', { headers });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

async function saveProduto(data, id = null) {
    const headers = await getHeaders();
    const url = id ? `/api/catalogo-produtos/${id}` : '/api/catalogo-produtos';
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers, body: JSON.stringify(data) });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

async function deleteProduto(id) {
    const headers = await getHeaders();
    const res = await fetch(`/api/catalogo-produtos/${id}`, { method: 'DELETE', headers });
    if (!res.ok) throw new Error(await res.text());
}

// ── Render da lista ───────────────────────────────────────────────────────────

function renderCards(lista) {
    const grid = document.getElementById('catalogo-grid');
    if (!grid) return;

    if (!lista || lista.length === 0) {
        grid.innerHTML = `
            <div class="catalogo-empty" style="grid-column:1/-1; text-align:center; padding:4rem; color:var(--text-muted);">
                <i class="ph ph-package" style="font-size:3rem; display:block; margin-bottom:1rem; opacity:0.4;"></i>
                <h3 style="margin:0 0 0.5rem; color:var(--text-secondary);">Nenhum produto cadastrado</h3>
                <p style="font-size:0.85rem;">Clique em "+ Novo Produto" para adicionar o primeiro produto ao catálogo.</p>
            </div>`;
        return;
    }

    grid.innerHTML = lista.map(p => {
        const cor = p.cor_badge || '#5b52f6';
        const icone = p.icone || 'ph-cube';
        const statusCfg = {
            'Ativo': { cls: 'status-ativo', label: '● Ativo' },
            'Inativo': { cls: 'status-inativo', label: '● Inativo' },
            'Em desenvolvimento': { cls: 'status-dev', label: '⚙ Em dev' },
        }[p.status] || { cls: '', label: p.status || '—' };

        return `
        <div class="catalogo-card" id="catalogo-card-${p.id}" data-id="${p.id}">
            <div class="catalogo-card-header" style="border-top: 3px solid ${cor};">
                <div class="catalogo-card-icon" style="background: ${cor}22; color: ${cor};">
                    <i class="ph ${icone}"></i>
                </div>
                <div class="catalogo-card-meta">
                    <span class="catalogo-badge-categoria">${p.categoria || 'Geral'}</span>
                    <span class="catalogo-status ${statusCfg.cls}">${statusCfg.label}</span>
                </div>
            </div>
            <div class="catalogo-card-body">
                <h3 class="catalogo-card-nome">${p.nome}</h3>
                ${p.descricao ? `<p class="catalogo-card-desc">${p.descricao}</p>` : ''}
                ${p.publico_alvo ? `<div class="catalogo-card-tag"><i class="ph ph-users"></i> ${p.publico_alvo}</div>` : ''}
                ${p.beneficios ? `<div class="catalogo-card-beneficios"><i class="ph ph-check-circle"></i> ${p.beneficios}</div>` : ''}
            </div>
            <div class="catalogo-card-footer">
                ${p.site_url ? `<a href="${p.site_url}" target="_blank" class="catalogo-link" title="Ver site do produto"><i class="ph ph-globe"></i></a>` : ''}
                ${p.video_url ? `<a href="${p.video_url}" target="_blank" class="catalogo-link" title="Ver vídeo do produto"><i class="ph ph-play-circle"></i></a>` : ''}
                <div style="margin-left:auto; display:flex; gap:0.5rem;">
                    <button class="btn-icon-sm" data-action="edit" data-id="${p.id}" title="Editar produto">
                        <i class="ph ph-pencil-simple"></i>
                    </button>
                    <button class="btn-icon-sm btn-icon-danger" data-action="delete" data-id="${p.id}" title="Excluir produto">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');

    // Delegação de eventos nos cards
    grid.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.onclick = (e) => { e.stopPropagation(); abrirModal(btn.dataset.id); };
    });
    grid.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.onclick = (e) => { e.stopPropagation(); confirmarExclusao(btn.dataset.id); };
    });
}

function renderStats() {
    const total = _produtos.length;
    const ativos = _produtos.filter(p => p.status === 'Ativo').length;
    const inativos = _produtos.filter(p => p.status === 'Inativo').length;
    const emDev = _produtos.filter(p => p.status === 'Em desenvolvimento').length;

    const el = id => document.getElementById(id);
    if (el('cat-stat-total')) el('cat-stat-total').textContent = total;
    if (el('cat-stat-ativos')) el('cat-stat-ativos').textContent = ativos;
    if (el('cat-stat-inativos')) el('cat-stat-inativos').textContent = inativos;
    if (el('cat-stat-emdev')) el('cat-stat-emdev').textContent = emDev;
}

// ── Busca/Filtro ──────────────────────────────────────────────────────────────

export function handleCatalogoBusca(termo) {
    const t = (termo || '').toLowerCase().trim();
    _filtrado = t
        ? _produtos.filter(p =>
            (p.nome || '').toLowerCase().includes(t) ||
            (p.descricao || '').toLowerCase().includes(t) ||
            (p.categoria || '').toLowerCase().includes(t) ||
            (p.status || '').toLowerCase().includes(t) ||
            (p.publico_alvo || '').toLowerCase().includes(t)
        )
        : [..._produtos];

    const btnClear = document.getElementById('cat-clear-busca');
    if (btnClear) btnClear.style.display = t ? 'flex' : 'none';

    renderCards(_filtrado);
    renderResultCount(_filtrado.length, t);
}

function renderResultCount(count, termo) {
    const el = document.getElementById('cat-result-count');
    if (!el) return;
    el.textContent = termo
        ? `${count} resultado${count !== 1 ? 's' : ''} para "${termo}"`
        : `${count} produto${count !== 1 ? 's' : ''} no catálogo`;
}

export function filterByStatus(status) {
    document.querySelectorAll('[data-cat-filter]').forEach(btn => btn.classList.remove('active'));
    const btn = document.querySelector(`[data-cat-filter="${status}"]`);
    if (btn) btn.classList.add('active');

    _filtrado = status === 'todos'
        ? [..._produtos]
        : _produtos.filter(p => p.status === status);

    renderCards(_filtrado);
    renderResultCount(_filtrado.length, '');
}

// ── Modal de edição ───────────────────────────────────────────────────────────

function renderIconePicker(selected) {
    return ICONES_DISPONIVEIS.map(ic => `
        <button type="button" class="icone-picker-btn ${ic === selected ? 'selected' : ''}"
            data-icone="${ic}" title="${ic}" onclick="window._catalogoSelecionarIcone('${ic}')">
            <i class="ph ${ic}"></i>
        </button>`).join('');
}

function renderCorPicker(selected) {
    return CORES_BADGE.map(cor => `
        <button type="button" class="cor-picker-btn ${cor === selected ? 'selected' : ''}"
            data-cor="${cor}" style="background:${cor};"
            onclick="window._catalogoSelecionarCor('${cor}')">
            ${cor === selected ? '<i class="ph ph-check" style="color:white;font-size:12px;"></i>' : ''}
        </button>`).join('');
}

export function abrirModal(id = null) {
    _editingId = id;
    const produto = id ? _produtos.find(p => p.id === id) : null;

    const overlay = document.getElementById('catalogo-modal-overlay');
    if (!overlay) return;

    // Popula campos
    document.getElementById('cat-modal-title').textContent = produto ? 'Editar Produto' : 'Novo Produto';
    document.getElementById('cat-nome').value = produto?.nome || '';
    document.getElementById('cat-descricao').value = produto?.descricao || '';
    document.getElementById('cat-categoria').value = produto?.categoria || '';
    document.getElementById('cat-status').value = produto?.status || 'Ativo';
    document.getElementById('cat-site-url').value = produto?.site_url || '';
    document.getElementById('cat-video-url').value = produto?.video_url || '';
    document.getElementById('cat-beneficios').value = produto?.beneficios || '';
    document.getElementById('cat-publico-alvo').value = produto?.publico_alvo || '';
    document.getElementById('cat-ordem').value = produto?.ordem ?? 0;

    // Icone e cor selecionados
    window.__catIconeSelecionado = produto?.icone || 'ph-cube';
    window.__catCorSelecionada = produto?.cor_badge || '#5b52f6';

    document.getElementById('cat-icone-picker').innerHTML = renderIconePicker(window.__catIconeSelecionado);
    document.getElementById('cat-cor-picker').innerHTML = renderCorPicker(window.__catCorSelecionada);
    _atualizarPreview();

    overlay.classList.add('open');
    document.getElementById('cat-nome').focus();
}

export function fecharModal() {
    const overlay = document.getElementById('catalogo-modal-overlay');
    if (overlay) overlay.classList.remove('open');
    _editingId = null;
}

function _atualizarPreview() {
    const icone = window.__catIconeSelecionado || 'ph-cube';
    const cor = window.__catCorSelecionada || '#5b52f6';
    const nome = document.getElementById('cat-nome')?.value || 'Produto';

    const preview = document.getElementById('cat-icone-preview');
    if (preview) {
        preview.style.background = `${cor}22`;
        preview.style.color = cor;
        preview.innerHTML = `<i class="ph ${icone}"></i>`;
    }
    const previewNome = document.getElementById('cat-preview-nome');
    if (previewNome) previewNome.textContent = nome;
    const previewBorder = document.getElementById('cat-preview-card');
    if (previewBorder) previewBorder.style.borderTopColor = cor;
}

window._catalogoSelecionarIcone = function (icone) {
    window.__catIconeSelecionado = icone;
    document.querySelectorAll('.icone-picker-btn').forEach(btn => {
        btn.classList.toggle('selected', btn.dataset.icone === icone);
    });
    _atualizarPreview();
};

window._catalogoSelecionarCor = function (cor) {
    window.__catCorSelecionada = cor;
    document.querySelectorAll('.cor-picker-btn').forEach(btn => {
        btn.classList.remove('selected');
        btn.innerHTML = '';
    });
    const btn = document.querySelector(`.cor-picker-btn[data-cor="${cor}"]`);
    if (btn) {
        btn.classList.add('selected');
        btn.innerHTML = '<i class="ph ph-check" style="color:white;font-size:12px;"></i>';
    }
    _atualizarPreview();
};

export async function salvarProduto() {
    const nome = document.getElementById('cat-nome')?.value?.trim();
    if (!nome) {
        utils.showToast('Nome do produto é obrigatório.', 'error');
        document.getElementById('cat-nome')?.focus();
        return;
    }

    const data = {
        nome,
        descricao: document.getElementById('cat-descricao')?.value?.trim() || null,
        categoria: document.getElementById('cat-categoria')?.value?.trim() || null,
        status: document.getElementById('cat-status')?.value || 'Ativo',
        site_url: document.getElementById('cat-site-url')?.value?.trim() || null,
        video_url: document.getElementById('cat-video-url')?.value?.trim() || null,
        beneficios: document.getElementById('cat-beneficios')?.value?.trim() || null,
        publico_alvo: document.getElementById('cat-publico-alvo')?.value?.trim() || null,
        ordem: parseInt(document.getElementById('cat-ordem')?.value) || 0,
        icone: window.__catIconeSelecionado || 'ph-cube',
        cor_badge: window.__catCorSelecionada || '#5b52f6',
    };

    const btn = document.getElementById('cat-btn-salvar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner-gap"></i> Salvando...'; }

    try {
        const saved = await saveProduto(data, _editingId);
        if (_editingId) {
            const idx = _produtos.findIndex(p => p.id === _editingId);
            if (idx !== -1) _produtos[idx] = saved;
        } else {
            _produtos.unshift(saved);
        }
        _filtrado = [..._produtos];
        renderCards(_filtrado);
        renderStats();
        renderResultCount(_filtrado.length, '');
        fecharModal();
        utils.showToast(_editingId ? 'Produto atualizado com sucesso!' : 'Produto criado com sucesso!', 'success');
    } catch (err) {
        utils.showToast('Erro ao salvar produto: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ph ph-floppy-disk"></i> Salvar'; }
    }
}

async function confirmarExclusao(id) {
    const produto = _produtos.find(p => p.id === id);

    // Usa o sistema confirmar.js se disponível, caso contrário confirm() nativo
    const executar = async () => {
        try {
            await deleteProduto(id);
            _produtos = _produtos.filter(p => p.id !== id);
            _filtrado = _filtrado.filter(p => p.id !== id);
            renderCards(_filtrado);
            renderStats();
            renderResultCount(_filtrado.length, '');
            utils.showToast('Produto removido do catálogo.', 'success');
        } catch (err) {
            utils.showToast('Erro ao excluir produto: ' + err.message, 'error');
        }
    };

    if (window.confirmar) {
        window.confirmar(`Excluir permanentemente o produto "${produto?.nome || 'produto'}" do catálogo?`, executar);
    } else if (confirm(`Excluir o produto "${produto?.nome || 'produto'}"?`)) {
        await executar();
    }
}

// ── Inicialização ─────────────────────────────────────────────────────────────

let _iniciado = false;

export async function initCatalogoProdutos() {
    if (_iniciado) {
        // Já iniciou — apenas atualiza dados
        await _carregarDados();
        return;
    }
    _iniciado = true;

    // Wiring do modal
    document.getElementById('catalogo-modal-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'catalogo-modal-overlay') fecharModal();
    });
    document.getElementById('cat-btn-cancelar')?.addEventListener('click', fecharModal);
    document.getElementById('cat-btn-fechar-modal')?.addEventListener('click', fecharModal);
    document.getElementById('cat-btn-salvar')?.addEventListener('click', salvarProduto);

    // Botão novo produto (header)
    document.getElementById('btn-novo-produto-catalogo')?.addEventListener('click', () => abrirModal());

    // Busca
    const inputBusca = document.getElementById('cat-busca');
    if (inputBusca) {
        inputBusca.addEventListener('input', (e) => handleCatalogoBusca(e.target.value));
    }

    // Limpar busca
    document.getElementById('cat-clear-busca')?.addEventListener('click', () => {
        const inp = document.getElementById('cat-busca');
        if (inp) inp.value = '';
        handleCatalogoBusca('');
    });

    // Filtros por status
    document.querySelectorAll('[data-cat-filter]').forEach(btn => {
        btn.addEventListener('click', () => filterByStatus(btn.dataset.catFilter));
    });

    // Preview ao digitar nome
    document.getElementById('cat-nome')?.addEventListener('input', _atualizarPreview);

    await _carregarDados();
}

async function _carregarDados() {
    const grid = document.getElementById('catalogo-grid');
    if (grid) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:3rem; color:var(--text-muted);">
                <i class="ph ph-spinner-gap" style="font-size:2rem; display:block; margin-bottom:0.75rem; animation:spin 1s linear infinite;"></i>
                Carregando catálogo...
            </div>`;
    }

    try {
        _produtos = await fetchCatalogo();
        _filtrado = [..._produtos];
        renderCards(_filtrado);
        renderStats();
        renderResultCount(_filtrado.length, '');
    } catch (err) {
        console.error('[Catálogo] Erro ao carregar:', err);
        if (grid) {
            grid.innerHTML = `
                <div style="grid-column:1/-1; text-align:center; padding:3rem; color:#ef4444;">
                    <i class="ph ph-warning-circle" style="font-size:2rem; display:block; margin-bottom:0.75rem;"></i>
                    Erro ao carregar catálogo: ${err.message}
                </div>`;
        }
        utils.showToast('Erro ao carregar catálogo de produtos.', 'error');
    }
}
