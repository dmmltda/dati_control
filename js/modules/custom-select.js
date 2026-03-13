/**
 * CustomSelect — componente de dropdown premium que substitui <select> nativo.
 *
 * Features:
 *  - Campo de busca com foco automático ao abrir
 *  - Agrupamento de opções por categoria (section labels)
 *  - Item selecionado destacado com check + fundo azul suave
 *  - Scroll automático até o item selecionado ao abrir
 *  - API compatível: getValue() / setValue(val) / no HTMLSelectElement original
 *
 * Uso:
 *   const cs = new CustomSelect(selectElement, { groups: [...] });
 *   // ou sem grupos (flat):
 *   const cs = new CustomSelect(selectElement);
 *
 * O selectElement original é mantido oculto e sincronizado — o código existente
 * que faz `document.getElementById('emp-canal').value` continua funcionando.
 */

export class CustomSelect {
    /**
     * @param {HTMLSelectElement} selectEl  — O <select> nativo a ser substituído
     * @param {Object} [opts]
     * @param {Array<{label:string, options:Array<{value:string,label:string}>}>} [opts.groups]
     *   — Lista de grupos. Se omitido, usa as <option> do selectEl.
     * @param {string} [opts.placeholder]  — Texto quando nenhum item está selecionado
     */
    constructor(selectEl, opts = {}) {
        if (!selectEl) return;
        this._select = selectEl;
        this._opts = opts;
        this._open = false;
        this._groups = opts.groups || this._extractGroups();
        this._placeholder = opts.placeholder || 'Selecione...';

        this._build();
        this._bindEvents();

        // Sincroniza valor inicial
        this.setValue(selectEl.value || '');
    }

    /* ── Extrai grupos a partir das <option> do select original ── */
    _extractGroups() {
        const flat = [];
        this._select.querySelectorAll('option').forEach(o => {
            if (o.value === '') return; // skip placeholder
            flat.push({ value: o.value, label: o.textContent.trim() });
        });
        return [{ label: null, options: flat }];
    }

    /* ── Gera a estrutura DOM do componente ── */
    _build() {
        // Oculta o select nativo mas mantém no DOM para compatibilidade
        this._select.style.display = 'none';

        // Container raiz
        this._root = document.createElement('div');
        this._root.className = 'csel';
        this._root.setAttribute('tabindex', '0');
        this._root.setAttribute('role', 'combobox');
        this._root.setAttribute('aria-haspopup', 'listbox');
        this._root.setAttribute('aria-expanded', 'false');

        // Trigger (o "botão" que abre o dropdown)
        this._trigger = document.createElement('div');
        this._trigger.className = 'csel-trigger';

        this._triggerText = document.createElement('span');
        this._triggerText.className = 'csel-trigger-text csel-placeholder';
        this._triggerText.textContent = this._placeholder;

        const chevron = document.createElement('i');
        chevron.className = 'csel-chevron ph ph-caret-down';

        this._trigger.appendChild(this._triggerText);
        this._trigger.appendChild(chevron);
        
        // Verifica se o select nativo está disabled
        if (this._select.disabled) {
            this._root.classList.add('disabled');
        }

        // Dropdown panel
        this._panel = document.createElement('div');
        this._panel.className = 'csel-panel';
        this._panel.setAttribute('role', 'listbox');

        // Campo de busca
        this._searchWrapper = document.createElement('div');
        this._searchWrapper.className = 'csel-search-wrapper';

        const searchIcon = document.createElement('i');
        searchIcon.className = 'ph ph-magnifying-glass csel-search-icon';

        this._searchInput = document.createElement('input');
        this._searchInput.type = 'text';
        this._searchInput.className = 'csel-search';
        this._searchInput.placeholder = 'Buscar...';
        this._searchInput.autocomplete = 'off';

        this._searchWrapper.appendChild(searchIcon);
        this._searchWrapper.appendChild(this._searchInput);

        // Lista de opções
        this._list = document.createElement('div');
        this._list.className = 'csel-list';

        this._panel.appendChild(this._searchWrapper);
        this._panel.appendChild(this._list);

        this._root.appendChild(this._trigger);
        this._root.appendChild(this._panel);

        // Insere após o select nativo e oculta chevron nativo se estiver em um wrapper
        this._select.insertAdjacentElement('afterend', this._root);
        if (this._select.parentElement && this._select.parentElement.classList.contains('select-wrapper')) {
            this._select.parentElement.classList.add('hide-chevron');
        }

        this._renderList('');
    }

    /* ── Renderiza a lista (com ou sem filtro) ── */
    _renderList(query) {
        this._list.innerHTML = '';
        const q = (query || '').toLowerCase().trim();
        let hasResults = false;

        this._groups.forEach(group => {
            const filtered = group.options.filter(o =>
                !q || o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
            );
            if (filtered.length === 0) return;
            hasResults = true;

            // Section label
            if (group.label) {
                const label = document.createElement('div');
                label.className = 'csel-group-label';
                label.textContent = group.label;
                this._list.appendChild(label);
            }

            // Options
            filtered.forEach(o => {
                const item = document.createElement('div');
                item.className = 'csel-option';
                item.setAttribute('role', 'option');
                item.dataset.value = o.value;

                if (o.value === this._value) {
                    item.classList.add('selected');
                    item.setAttribute('aria-selected', 'true');
                }

                const check = document.createElement('i');
                check.className = 'ph ph-check csel-check';

                const text = document.createElement('span');
                text.textContent = o.label;

                item.appendChild(check);
                item.appendChild(text);

                item.addEventListener('mousedown', (e) => {
                    e.preventDefault(); // evita blur no searchInput
                    this.setValue(o.value);
                    this._closePanel();
                });

                this._list.appendChild(item);
            });
        });

        if (!hasResults) {
            const empty = document.createElement('div');
            empty.className = 'csel-empty';
            empty.textContent = 'Nenhum resultado';
            this._list.appendChild(empty);
        }
    }

    /* ── Abre o painel ── */
    _openPanel() {
        if (this._open) return;
        this._open = true;
        this._root.classList.add('open');
        this._root.setAttribute('aria-expanded', 'true');

        // Limpa busca
        this._searchInput.value = '';
        this._renderList('');

        // Foco automático no campo de busca
        requestAnimationFrame(() => {
            this._searchInput.focus();
            // Scroll até o item selecionado
            const sel = this._list.querySelector('.csel-option.selected');
            if (sel) sel.scrollIntoView({ block: 'nearest' });
        });

        // Click fora fecha
        this._outsideHandler = (e) => {
            if (!this._root.contains(e.target)) this._closePanel();
        };
        document.addEventListener('mousedown', this._outsideHandler);
    }

    /* ── Fecha o painel ── */
    _closePanel() {
        if (!this._open) return;
        this._open = false;
        this._root.classList.remove('open');
        this._root.setAttribute('aria-expanded', 'false');
        document.removeEventListener('mousedown', this._outsideHandler);
    }

    /* ── Events ── */
    _bindEvents() {
        // Trigger click
        this._trigger.addEventListener('mousedown', (e) => {
            e.preventDefault();
            if (this._select.disabled || this._root.classList.contains('disabled')) return;
            if (this._open) {
                this._closePanel();
            } else {
                this._openPanel();
            }
        });

        // Search input
        this._searchInput.addEventListener('input', () => {
            this._renderList(this._searchInput.value);
        });

        // Keyboard navigation
        this._root.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { this._closePanel(); this._root.focus(); }
            if (e.key === 'Enter' || e.key === ' ') {
                if (!this._open) this._openPanel();
            }
        });
    }

    /* ── API pública ── */

    /** Retorna o valor selecionado */
    getValue() { return this._value || ''; }

    /** Define o valor selecionado e atualiza o select nativo */
    setValue(val) {
        this._value = val;

        // Sincroniza select nativo para compatibilidade com o código existente
        if (this._select) {
            this._select.value = val;
            // Dispara change event para que listeners existentes funcionem
            this._select.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Atualiza trigger
        const option = this._findOption(val);
        if (option) {
            this._triggerText.textContent = option.label;
            this._triggerText.classList.remove('csel-placeholder');
        } else {
            this._triggerText.textContent = this._placeholder;
            this._triggerText.classList.add('csel-placeholder');
        }

        // Re-renderiza lista para atualizar check
        this._renderList(this._searchInput ? this._searchInput.value : '');
    }

    /** Destrói o componente e restaura o select nativo */
    destroy() {
        this._closePanel();
        this._root.remove();
        this._select.style.display = '';
    }

    _findOption(val) {
        for (const group of this._groups) {
            const found = group.options.find(o => o.value === val);
            if (found) return found;
        }
        return null;
    }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Factory helpers — cria instâncias pré-configuradas para os selects do sistema
 * ───────────────────────────────────────────────────────────────────────────── */

/**
 * Cria o CustomSelect para o campo Canal da empresa.
 * Agrupa os canais por categoria.
 */
export function createCanalSelect(selectEl) {
    if (!selectEl) return null;

    const groups = [
        {
            label: 'DATI',
            options: [
                { value: 'DATI > Indica',   label: 'DATI > Indica' },
                { value: 'DATI > Vendedor', label: 'DATI > Vendedor' },
                { value: 'DATI > Mailing',  label: 'DATI > Mailing' },
            ]
        },
        {
            label: 'Google',
            options: [
                { value: 'Google > Orgânico', label: 'Google > Orgânico' },
                { value: 'Google > Pago',     label: 'Google > Pago' },
            ]
        },
        {
            label: 'Gerador de Leads',
            options: [
                { value: 'Gerador de Leads > Scotto', label: 'Gerador de Leads > Scotto' },
            ]
        },
        {
            label: 'Mailing',
            options: [
                { value: 'Mailing > Asia', label: 'Mailing > Asia' },
                { value: 'Mailing > DATI', label: 'Mailing > DATI' },
            ]
        },
        {
            label: 'Parceiros',
            options: [
                { value: 'Parceiros > Asia',    label: 'Parceiros > Asia' },
                { value: 'Parceiros > Cliente', label: 'Parceiros > Cliente' },
                { value: 'Parceiros > DMM',     label: 'Parceiros > DMM' },
            ]
        },
        {
            label: 'Outros',
            options: [
                { value: 'Redes Sociais',  label: 'Redes Sociais' },
                { value: 'SDR DATI',       label: 'SDR DATI' },
                { value: 'Site',           label: 'Site' },
                { value: 'Vendedor DATI',  label: 'Vendedor DATI' },
            ]
        },
    ];

    return new CustomSelect(selectEl, { groups, placeholder: 'Selecione...' });
}

/**
 * Cria o CustomSelect para o campo Estado (UF).
 * Agrupa os estados por Região no formato: "SC · Santa Catarina".
 */
export function createEstadoSelect(selectEl) {
    if (!selectEl) return null;

    const groups = [
        {
            label: 'SUL',
            options: [
                { value: 'PR', label: 'PR · Paraná' },
                { value: 'RS', label: 'RS · Rio Grande do Sul' },
                { value: 'SC', label: 'SC · Santa Catarina' },
            ]
        },
        {
            label: 'SUDESTE',
            options: [
                { value: 'ES', label: 'ES · Espírito Santo' },
                { value: 'MG', label: 'MG · Minas Gerais' },
                { value: 'RJ', label: 'RJ · Rio de Janeiro' },
                { value: 'SP', label: 'SP · São Paulo' },
            ]
        },
        {
            label: 'CENTRO-OESTE',
            options: [
                { value: 'DF', label: 'DF · Distrito Federal' },
                { value: 'GO', label: 'GO · Goiás' },
                { value: 'MT', label: 'MT · Mato Grosso' },
                { value: 'MS', label: 'MS · Mato Grosso do Sul' },
            ]
        },
        {
            label: 'NORDESTE',
            options: [
                { value: 'AL', label: 'AL · Alagoas' },
                { value: 'BA', label: 'BA · Bahia' },
                { value: 'CE', label: 'CE · Ceará' },
                { value: 'MA', label: 'MA · Maranhão' },
                { value: 'PB', label: 'PB · Paraíba' },
                { value: 'PE', label: 'PE · Pernambuco' },
                { value: 'PI', label: 'PI · Piauí' },
                { value: 'RN', label: 'RN · Rio Grande do Norte' },
                { value: 'SE', label: 'SE · Sergipe' },
            ]
        },
        {
            label: 'NORTE',
            options: [
                { value: 'AC', label: 'AC · Acre' },
                { value: 'AP', label: 'AP · Amapá' },
                { value: 'AM', label: 'AM · Amazonas' },
                { value: 'PA', label: 'PA · Pará' },
                { value: 'RO', label: 'RO · Rondônia' },
                { value: 'RR', label: 'RR · Roraima' },
                { value: 'TO', label: 'TO · Tocantins' },
            ]
        }
    ];

    return new CustomSelect(selectEl, { groups, placeholder: 'Selecione o Estado...' });
}

/**
 * Auto-inicializa o CustomSelect em todos os selects do painel,
 * escutando o DOM para inicializar instantaneamente forms carregados via JS (modais).
 */
export function setupGlobalCustomSelects() {
    // Selector universal: pega qualquer select que seja .input-control ou .status-select ou de filtros,
    // exceto os dashboard-selects.
    const EXPECTED_SELECTORS = [
        'select.input-control',
        'select.status-select',
        'select.cs-status-select',
        'select[id^="rpt-filter-"]',
        'select[id^="audit-filter-"]',
        'select[id^="filter-"]'
    ].join(', ');

    const initAll = () => {
        document.querySelectorAll(EXPECTED_SELECTORS).forEach(selectEl => {
            if (
                !selectEl._customSelectInstance && 
                !selectEl.classList.contains('dashboard-select') &&
                !selectEl.classList.contains('native-only') &&
                !selectEl.hasAttribute('multiple')
            ) {
                // Impede loop: o CustomSelect não deve iniciar 2x
                selectEl._customSelectInstance = new CustomSelect(selectEl);
            }
        });
    };

    // Inicializa a primeira vez nos elementos já existentes
    initAll();

    // Cria observer para checar se modais injetaram selects novos e converte de imediato
    let mutationTimeout;
    const observer = new MutationObserver(mutations => {
        let shouldCheck = false;
        for (const m of mutations) {
            if (m.addedNodes.length > 0) {
                // Apenas checa se adicionaram nó do tipo Elemento (1)
                shouldCheck = Array.from(m.addedNodes).some(n => n.nodeType === 1);
                if (shouldCheck) break;
            }
        }

        if (shouldCheck) {
            cancelAnimationFrame(mutationTimeout);
            mutationTimeout = requestAnimationFrame(() => {
                initAll();
            });
        }
    });

    // Inicia observação no elemento root
    observer.observe(document.body, { childList: true, subtree: true });
}
