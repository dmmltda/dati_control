/**
 * Tooltip.js — Rich Tooltip Singleton para o Journey Dashboard
 *
 * Sistema de tooltip de nível profissional:
 *   • Posicionamento inteligente (detecta bordas do viewport e inverte)
 *   • Delay anti-flicker: 200ms para mostrar, 120ms para esconder
 *   • Persiste quando o mouse move para cima do tooltip (permite copiar)
 *   • Animação scale + fade com transform-origin dinâmico
 *   • Conteúdo rico: lista de empresas, badges, valores
 *
 * @module Tooltip
 */

// ─── Estado do singleton ────────────────────────────────────────────────────
let _el = null;   // O elemento DOM do tooltip
let _showTimer = null;   // Timer de delay antes de mostrar
let _hideTimer = null;   // Timer de delay antes de esconder
let _initiated = false;

const SHOW_DELAY = 150;   // ms antes de mostrar
const HIDE_DELAY = 250;   // ms ao sair antes de esconder (aumentado para facilitar acesso)
const OFFSET_X = 16;   // px de distância horizontal do cursor
const OFFSET_Y = 12;   // px de distância vertical do cursor
const MAX_ITEMS = 8;     // máximo de empresas listadas no tooltip

// ─── CSS do tooltip (injetado uma vez no head) ───────────────────────────────
const CSS = `
  #db-rich-tooltip {
    position: fixed;
    z-index: 99999;
    pointer-events: none;  /* não interfere com mouse por padrão */
    max-width: 300px;
    min-width: 200px;
    background: #0F172A;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    box-shadow:
      0 0 0 1px rgba(255,255,255,0.05),
      0 8px 32px rgba(0,0,0,0.45),
      0 2px 8px rgba(0,0,0,0.3);
    padding: 0;
    overflow: hidden;
    font-family: 'Plus Jakarta Sans', 'DM Sans', sans-serif;
    font-size: 12px;
    color: #E2E8F0;
    opacity: 0;
    transform: scale(0.92) translateY(4px);
    transition:
      opacity 160ms cubic-bezier(0.16, 1, 0.3, 1),
      transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
    will-change: transform, opacity;
  }

  #db-rich-tooltip.db-tooltip-visible {
    opacity: 1;
    transform: scale(1) translateY(0);
    pointer-events: auto; /* permite interação quando visível */
  }

  /* Bridge invisível para sanar o gap (abismo de mouse) e evitar flickering */
  #db-rich-tooltip::after {
    content: '';
    position: absolute;
    top: -24px;
    left: -24px;
    right: -24px;
    bottom: -24px;
    z-index: -1;
  }

  .db-tt-header {
    padding: 10px 14px 8px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .db-tt-emoji {
    font-size: 15px;
    flex-shrink: 0;
  }
  .db-tt-title {
    font-weight: 700;
    font-size: 13px;
    color: #F8FAFC;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .db-tt-count {
    background: rgba(255,255,255,0.1);
    color: #94A3B8;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 9999px;
    flex-shrink: 0;
  }

  .db-tt-list {
    padding: 6px 0;
    max-height: 220px;
    overflow-y: auto;
  }
  .db-tt-list::-webkit-scrollbar { width: 3px; }
  .db-tt-list::-webkit-scrollbar-track { background: transparent; }
  .db-tt-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }

  .db-tt-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 14px;
    transition: background 100ms;
  }
  .db-tt-item:hover { background: rgba(255,255,255,0.04); }

  .db-tt-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .db-tt-name {
    flex: 1;
    font-size: 12px;
    color: #CBD5E1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .db-tt-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 9999px;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .db-tt-nps {
    font-size: 11px;
    font-weight: 800;
    min-width: 22px;
    text-align: right;
    flex-shrink: 0;
  }

  .db-tt-more {
    padding: 4px 14px 2px;
    font-size: 11px;
    color: #64748B;
    font-style: italic;
  }

  .db-tt-footer {
    padding: 7px 14px;
    border-top: 1px solid rgba(255,255,255,0.07);
    font-size: 10px;
    color: #475569;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .db-tt-stat {
    padding: 8px 14px;
    border-top: 1px solid rgba(255,255,255,0.08);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .db-tt-stat-label { font-size: 11px; color: #64748B; }
  .db-tt-stat-value { font-size: 13px; font-weight: 800; color: #F8FAFC; }

  /* Seta do tooltip */
  #db-rich-tooltip::before {
    content: '';
    position: absolute;
    width: 8px;
    height: 8px;
    background: #0F172A;
    border: 1px solid rgba(255,255,255,0.1);
    border-right: none;
    border-bottom: none;
    transform: rotate(45deg);
    top: -5px;
    left: 20px;
  }
  #db-rich-tooltip.tt-above::before {
    top: auto;
    bottom: -5px;
    transform: rotate(225deg);
  }
  #db-rich-tooltip.tt-right::before {
    left: auto;
    right: 20px;
  }
`;

// ─── Inicialização ────────────────────────────────────────────────────────────

/**
 * Inicializa o sistema de tooltip (chamar uma vez no init do dashboard)
 */
export function initTooltipSystem() {
  if (_initiated) return;
  _initiated = true;

  // Injeta CSS
  if (!document.getElementById('db-tooltip-css')) {
    const st = document.createElement('style');
    st.id = 'db-tooltip-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // Cria o elemento
  _el = document.createElement('div');
  _el.id = 'db-rich-tooltip';
  _el.setAttribute('role', 'tooltip');
  _el.setAttribute('aria-live', 'polite');
  document.body.appendChild(_el);

  // Mantém visível quando mouse está sobre o tooltip
  _el.addEventListener('mouseenter', () => {
    clearTimeout(_hideTimer);
  });
  _el.addEventListener('mouseleave', () => {
    _scheduleHide();
  });
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Mostra o tooltip com conteúdo rico perto do cursor
 *
 * @param {MouseEvent} event  - Evento de mouse (para posicionamento)
 * @param {Object}     data   - Dados do tooltip
 * @param {string}     data.emoji   - Emoji do cabeçalho
 * @param {string}     data.titulo  - Título do cabeçalho
 * @param {Array}      data.items   - Lista de { nome, badge, badgeCor, nps, dotCor }
 * @param {string}     [data.stat]  - Valor do rodapé (ex: "R$ 220k/mês")
 * @param {string}     [data.statLabel] - Label do rodapé (ex: "Valor estimado")
 */
export function showTooltip(event, data) {
  clearTimeout(_showTimer);
  clearTimeout(_hideTimer);

  _showTimer = setTimeout(() => {
    if (!_el) return;
    _el.innerHTML = _buildHTML(data);
    _el.classList.remove('db-tooltip-visible', 'tt-above', 'tt-right');
    _el.style.display = 'block';

    // Posiciona antes de mostrar (precisa de display:block para medir)
    _position(event);

    // Força reflow para a transição funcionar
    void _el.offsetWidth;
    _el.classList.add('db-tooltip-visible');
  }, SHOW_DELAY);
}

/**
 * Esconde o tooltip com delay anti-flicker
 */
export function hideTooltip() {
  clearTimeout(_showTimer);
  _scheduleHide();
}

/**
 * Atualiza a posição do tooltip durante o movimento do mouse
 * (chamar no mousemove do elemento pai)
 */
export function updateTooltipPosition(event) {
  if (_el && _el.classList.contains('db-tooltip-visible')) {
    _position(event);
  }
}

// ─── Internos ────────────────────────────────────────────────────────────────

function _scheduleHide() {
  clearTimeout(_hideTimer);
  _hideTimer = setTimeout(() => {
    if (!_el) return;
    _el.classList.remove('db-tooltip-visible');
    // Remove depois da transição
    setTimeout(() => {
      if (_el && !_el.classList.contains('db-tooltip-visible')) {
        _el.style.display = 'none';
      }
    }, 180);
  }, HIDE_DELAY);
}

/**
 * Posiciona o tooltip de forma inteligente evitando bordas do viewport
 */
function _position(event) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ttW = _el.offsetWidth;
  const ttH = _el.offsetHeight;

  let x = event.clientX + OFFSET_X;
  let y = event.clientY + OFFSET_Y;

  let acima = false;
  let direita = false;

  // Verifica se overflow pela direita
  if (x + ttW > vw - 12) {
    x = event.clientX - ttW - OFFSET_X;
    direita = true;
  }

  // Verifica se overflow por baixo
  if (y + ttH > vh - 12) {
    y = event.clientY - ttH - OFFSET_Y;
    acima = true;
  }

  // Garante que não sai pela esquerda/cima
  x = Math.max(8, x);
  y = Math.max(8, y);

  _el.style.left = `${x}px`;
  _el.style.top = `${y}px`;

  // Atualiza classes de posição para a seta
  _el.classList.toggle('tt-above', acima);
  _el.classList.toggle('tt-right', direita);
}

function _buildHTML(data) {
  const { emoji, titulo, items = [], stat, statLabel, simples } = data;

  // ── Modo simples: apenas nome (avatar de usuário) ──────────────────────────
  if (simples) {
    return `<div style="padding:9px 14px;display:flex;align-items:center;gap:8px;">
          ${emoji ? `<span style="font-size:14px;">${emoji}</span>` : ''}
          <span style="font-weight:700;font-size:13px;color:#F8FAFC;white-space:nowrap;">${titulo}</span>
        </div>`;
  }

  // ── Modo rico: cabeçalho + lista + rodapé ──────────────────────────────────
  const emojiHTML = emoji ? `<span class="db-tt-emoji">${emoji}</span>` : '';
  const countHTML = items.length > 0 ? `<span class="db-tt-count">${items.length}</span>` : '';

  const header = `<div class="db-tt-header">${emojiHTML}<span class="db-tt-title">${titulo}</span>${countHTML}</div>`;

  const visiveis = items.slice(0, MAX_ITEMS);
  const resto = items.length - visiveis.length;

  const listaHTML = visiveis.map(item => `
      <div class="db-tt-item">
        <span class="db-tt-dot" style="background:${item.dotCor || '#64748B'};"></span>
        <span class="db-tt-name" title="${item.nome}">${item.nome}</span>
        ${item.badge ? `<span class="db-tt-badge" style="background:${item.badgeBg || 'rgba(100,116,139,0.2)'};color:${item.badgeCor || '#94A3B8'}">${item.badge}</span>` : ''}
        ${item.nps !== undefined && item.nps !== null
      ? `<span class="db-tt-nps" style="color:${_npsColor(item.nps)}">${item.nps}</span>`
      : ''}
      </div>
    `).join('');

  const maisHTML = resto > 0 ? `<div class="db-tt-more">+ ${resto} empresa${resto !== 1 ? 's' : ''}...</div>` : '';
  const footerHTML = stat
    ? `<div class="db-tt-stat"><span class="db-tt-stat-label">${statLabel || ''}</span><span class="db-tt-stat-value">${stat}</span></div>`
    : '';

  const listaSection = items.length > 0 ? `<div class="db-tt-list">${listaHTML}${maisHTML}</div>` : '';

  return header + listaSection + footerHTML;
}


function _npsColor(nps) {
  // Trata caso seja string com % (ex: "75%")
  if (typeof nps === 'string' && nps.includes('%')) {
    const p = parseFloat(nps);
    if (!isNaN(p)) {
      if (p >= 75) return '#10B981';
      if (p >= 40) return '#F59E0B';
      return '#EF4444';
    }
  }

  // Trata caso normal (nota 0 a 10)
  const val = parseFloat(nps);
  if (!isNaN(val)) {
    if (val >= 8) return '#10B981';
    if (val >= 6) return '#F59E0B';
    return '#EF4444';
  }

  return '#94A3B8';
}
