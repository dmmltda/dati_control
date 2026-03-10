/**
 * DATI Tooltip System — UX 10/10
 * ────────────────────────────────────────────────────────────────
 * Singleton global reutilizável. Nenhum tooltip deve ser feito
 * inline após este módulo existir.
 *
 * USO via HTML (atributos data-*):
 *   <span class="th-info-btn"
 *         data-th-tooltip="Texto descritivo da coluna."
 *         data-th-title="SOBRE ESTA COLUNA">
 *     <i class="ph ph-info"></i>
 *     <span class="th-pulse"></span>
 *   </span>
 *
 * USO via JS:
 *   import { showTooltip, hideTooltip } from './core/tooltip.js';
 *   showTooltip(triggerEl, { content: 'Texto', title: 'TÍTULO' });
 *
 * ────────────────────────────────────────────────────────────────
 * Comportamento:
 *  - Delay de 300ms antes de aparecer (evita tooltip piscando)
 *  - Posição inteligente: acima se couber, senão abaixo
 *  - Fade in/out 150ms
 *  - Seta aponta para o trigger
 *  - Nunca cortado por overflow (position: fixed no body)
 * ────────────────────────────────────────────────────────────────
 */

let _el = null;          // Singleton DOM element
let _showTimer = null;   // Delay timer (300ms)
let _hideTimer = null;   // Fade-out timer

const SHOW_DELAY = 300;  // ms antes de aparecer
const FADE_MS = 150;   // ms da transição

/**
 * Cria ou retorna o elemento singleton do tooltip.
 */
function _getEl() {
    if (!_el) {
        _el = document.createElement('div');
        _el.className = 'dati-tooltip';
        _el.innerHTML = `
            <div class="dati-tooltip__header">
                <i class="ph ph-info"></i>
                <span class="dati-tooltip__title">SOBRE ESTA COLUNA</span>
            </div>
            <div class="dati-tooltip__body"></div>
            <div class="dati-tooltip__arrow"></div>
        `;
        _el.style.cssText = 'display:none;opacity:0;transform:translateY(4px);';
        document.body.appendChild(_el);
    }
    return _el;
}

/**
 * Posiciona o tooltip relativo ao trigger.
 * Prefere acima; se não couber, vai abaixo.
 */
function _position(trigger) {
    const el = _getEl();
    const rect = trigger.getBoundingClientRect();
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    const GAP = 8;

    // Tenta acima
    let top = rect.top - th - GAP;
    let dir = 'top';

    if (top < GAP) {
        // Não cabe acima — coloca abaixo
        top = rect.bottom + GAP;
        dir = 'bottom';
    }

    // Centraliza horizontalmente no trigger
    let left = rect.left + rect.width / 2 - tw / 2;
    if (left < GAP) left = GAP;
    if (left + tw > window.innerWidth - GAP) left = window.innerWidth - tw - GAP;

    // Recalcula posição da seta para apontar ao trigger
    const arrowLeft = (rect.left + rect.width / 2) - left;
    const arrow = el.querySelector('.dati-tooltip__arrow');
    if (arrow) arrow.style.left = `${Math.max(10, Math.min(arrowLeft, tw - 10))}px`;

    el.classList.toggle('dati-tooltip--top', dir === 'top');
    el.classList.toggle('dati-tooltip--bottom', dir === 'bottom');

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
}

/**
 * Exibe o tooltip com delay e animação.
 * @param {HTMLElement} trigger — elemento que origina o tooltip
 * @param {{ content: string, title?: string }} opts
 */
export function showTooltip(trigger, opts = {}) {
    clearTimeout(_hideTimer);
    clearTimeout(_showTimer);

    _showTimer = setTimeout(() => {
        const el = _getEl();
        const title = opts.title || 'SOBRE ESTA COLUNA';
        const content = opts.content || '';

        // Preenche o conteúdo
        const titleEl = el.querySelector('.dati-tooltip__title');
        const bodyEl = el.querySelector('.dati-tooltip__body');
        if (titleEl) titleEl.textContent = title;
        if (bodyEl) bodyEl.textContent = content;

        // Mostra e posiciona
        el.style.display = 'block';
        el.style.opacity = '0';
        el.style.transform = 'translateY(4px)';

        // Força reflow antes da transição
        // eslint-disable-next-line no-unused-expressions
        el.offsetHeight;

        _position(trigger);

        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
    }, SHOW_DELAY);
}

/**
 * Esconde o tooltip com fade suave.
 */
export function hideTooltip() {
    clearTimeout(_showTimer);
    _hideTimer = setTimeout(() => {
        const el = _getEl();
        el.style.opacity = '0';
        el.style.transform = 'translateY(4px)';
        setTimeout(() => { if (_el) _el.style.display = 'none'; }, FADE_MS);
    }, 80);
}

/**
 * Inicializa o sistema global de tooltips via event delegation.
 * Escuta todos os elementos com [data-th-tooltip] no documento.
 * Chamar UMA VEZ no bootstrap da aplicação.
 */
export function initTooltipSystem() {
    if (document._datiTooltipInit) return;
    document._datiTooltipInit = true;

    document.addEventListener('mouseenter', (e) => {
        if (!e.target || typeof e.target.closest !== 'function') return;
        const trigger = e.target.closest('[data-th-tooltip]');
        if (!trigger) return;

        showTooltip(trigger, {
            content: trigger.dataset.thTooltip || '',
            title: trigger.dataset.thTitle || 'SOBRE ESTA COLUNA',
        });
    }, true);

    document.addEventListener('mouseleave', (e) => {
        if (!e.target || typeof e.target.closest !== 'function') return;
        const trigger = e.target.closest('[data-th-tooltip]');
        if (trigger) hideTooltip();
    }, true);
}
