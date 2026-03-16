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
    z-index: 10;
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

  /* Em modo light/video, a seta deve ser branca */
  #db-rich-tooltip.db-tt-vtt-mode::before {
    background: #FFFFFF;
    border-color: rgba(0,0,0,0.1);
  }

  /* Container para alinhar perfeitamente o título com o ícone em Tabelas/Labels */
  .db-tooltip-label-wrapper {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    vertical-align: middle;
    white-space: nowrap;
  }

  /* Ícone indicador de Tooltip para Tabelas */
  .db-tooltip-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #64748B;
    background: rgba(100, 116, 139, 0.1);
    border-radius: 50%;
    width: 16px;
    height: 16px;
    font-size: 11px;
    cursor: help;
    transition: all 150ms ease;
    vertical-align: middle;
  }
  .db-tooltip-icon:hover {
    background: rgba(100, 116, 139, 0.25);
    color: #CBD5E1;
  }

  /* ── Estilos para Tooltip de Vídeo (VTT) — Modo Light Premium ── */
  #db-rich-tooltip.db-tt-vtt-mode {
    background: #FFFFFF;
    border: 1px solid rgba(0,0,0,0.1);
    box-shadow: 0 10px 40px rgba(0,0,0,0.22);
    color: #111827;
  }
  
  #db-rich-tooltip.db-tt-vtt-mode .db-tt-vtt-video-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 16/9;
    background: #111;
    overflow: hidden;
  }
  
  #db-rich-tooltip.db-tt-vtt-mode .db-tt-vtt-canvas {
    width: 100%;
    height: 100%;
    display: block;
  }
  
  #db-rich-tooltip.db-tt-vtt-mode .db-tt-vtt-progress-wrap {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: rgba(0,0,0,0.1);
  }
  
  #db-rich-tooltip.db-tt-vtt-mode .db-tt-vtt-progress-fill {
    height: 100%;
    background: #534AB7;
    width: 0%;
    transition: width 0.1s linear;
  }
  
  #db-rich-tooltip.db-tt-vtt-mode .db-tt-vtt-body {
    padding: 16px 18px;
    background: #FFFFFF;
  }
  
  #db-rich-tooltip.db-tt-vtt-mode .db-tt-vtt-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #9CA3AF;
    margin-bottom: 6px;
  }
  
  #db-rich-tooltip.db-tt-vtt-mode .db-tt-vtt-title {
    font-size: 15px;
    font-weight: 700;
    color: #111827;
    margin-bottom: 6px;
  }
  
  #db-rich-tooltip.db-tt-vtt-mode .db-tt-vtt-desc {
    font-size: 12px;
    color: #666;
    line-height: 1.55;
    margin-bottom: 16px;
  }
  
  #db-rich-tooltip.db-tt-vtt-mode .db-tt-vtt-cta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 12px;
    border-top: 1px solid rgba(0,0,0,0.06);
  }
  
  #db-rich-tooltip.db-tt-vtt-mode .db-tt-vtt-link {
    font-size: 12px;
    color: #534AB7;
    font-weight: 600;
    cursor: pointer;
  }
  
  #db-rich-tooltip.db-tt-vtt-mode .db-tt-vtt-time {
    font-size: 11px;
    color: #AAA;
    font-variant-numeric: tabular-nums;
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
 * @param {string}     [data.emoji]   - Emoji do cabeçalho
 * @param {string}     [data.titulo]  - Título do cabeçalho
 * @param {Array}      [data.items]   - Lista de { nome, badge, badgeCor, nps, dotCor }
 * @param {string}     [data.stat]  - Valor do rodapé (ex: "R$ 220k/mês")
 * @param {string}     [data.statLabel] - Label do rodapé (ex: "Valor estimado")
 * @param {boolean}    [data.simples] - Apenas texto em linha
 * @param {string}     [data.video] - URL de vídeo tutorial (para modo tutorial)
 * @param {string}     [data.desc] - Descrição abaixo do título (para modo tutorial)
 */
export function showTooltip(event, data) {
  clearTimeout(_showTimer);
  clearTimeout(_hideTimer);

  _showTimer = setTimeout(() => {
    if (!_el) return;
    _el.innerHTML = _buildHTML(data);
    _el.classList.remove('db-tooltip-visible', 'tt-above', 'tt-right', 'db-tt-vtt-mode');
    
    if (data.video) {
        _el.classList.add('db-tt-vtt-mode');
    }

    _el.style.display = 'block';

    // ─── Sincronização Premium de Vídeo ───
    const v = _el.querySelector('video');
    const p = _el.querySelector('.db-tt-vtt-progress-fill');
    const t = _el.querySelector('.db-tt-vtt-time');
    if (v && p) {
      v.addEventListener('timeupdate', () => {
        if (!isNaN(v.duration) && v.duration > 0) {
          const pct = (v.currentTime / v.duration) * 100;
          p.style.width = `${pct}%`;
        }
        if (t) {
          const s = Math.floor(v.currentTime);
          t.textContent = `0:${String(s).padStart(2, '0')}`;
        }
      });
    }

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

/**
 * HTML estático do ícone. 
 * Se for usar direto na mão, use-o. Mas a recomendação atual é usar `renderTitleWithTooltip`.
 */
export const tooltipIconHTML = `<i class="db-tooltip-icon ph ph-info"></i>`;

/**
 * Função utilitária para gerar o HTML do Título perfeitamente alinhado com o ícone.
 * Regra: usar no lugar de textos puros nas tabelas. O ícone sempre fica à direita.
 *
 * @param {string} title - O texto do título da coluna / seção
 * @returns {string} String HTML pronta com o envolucro span e o ícone
 */
export function renderTitleWithTooltip(title) {
  return `<span class="db-tooltip-label-wrapper">${title} ${tooltipIconHTML}</span>`;
}

/**
 * Faz o binding automático do tooltip em um elemento.
 * Respeita a regra global:
 *  - Se for um botão/elemento de ação: Dispara no hover do próprio elemento (sem ícone).
 *  - Se for uma tabela/label: O caller deve usar renderTitleWithTooltip e passar o ícone como elemento.
 *
 * @param {HTMLElement} el - Elemento que disparará o tooltip
 * @param {Object} data - Dados do tooltip (video, titulo, desc, etc)
 */
export function bindTooltip(el, data) {
  if (!el) return;
  el.addEventListener('mouseenter', (e) => showTooltip(e, data));
  el.addEventListener('mousemove', updateTooltipPosition);
  el.addEventListener('mouseleave', hideTooltip);
}

// ─── Internos ────────────────────────────────────────────────────────────────

// Motor de animação Canvas para demonstrações visuais — v2.0 Premium Ultra-Fidelity
const VTT_ENGINE = {
  activeAnim: null,
  frame: 0,
  _const: { W:300, H:169, SW:45, TH_Y:18, BT_H:16, TH_H:14, ROW_Y:48, ROW_H:16, CX_EMPRESA:58, CX_STATUS:190, CX_DATA:145 },

  start(canvas, type) {
    this.stop();
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const DPR = window.devicePixelRatio || 1;
    canvas.width = 300 * DPR; canvas.height = 169 * DPR;
    ctx.scale(DPR, DPR);
    
    let drawerFunc, colLabel;
    
    if (type === 'search') { drawerFunc = this._drawSearch; colLabel = 'BUSCA'; }
    else if (type === 'new-company') { drawerFunc = this._drawNew; colLabel = 'NOVA'; }
    else if (type === 'bulk-import') { drawerFunc = (ctx, f, lbl) => this._drawGeneric(ctx, f, this._genConfigs.import, lbl); colLabel = 'IMPORTAR'; }
    else if (type === 'bulk-edit') { drawerFunc = (ctx, f, lbl) => this._drawGeneric(ctx, f, this._genConfigs.bulkEdit, lbl); colLabel = 'EDITAR'; }
    else if (type === 'bulk-delete') { drawerFunc = (ctx, f, lbl) => this._drawGeneric(ctx, f, this._genConfigs.bulkDelete, lbl); colLabel = 'EXCLUIR'; }
    else if (type === 'bulk-clear') { drawerFunc = (ctx, f, lbl) => this._drawGeneric(ctx, f, this._genConfigs.bulkClear, lbl); colLabel = 'LIMPAR'; }
    else if (type === 'status') { drawerFunc = this._drawStatus; colLabel = 'STATUS'; }
    else if (type === 'healthScore') { drawerFunc = this._drawSaude; colLabel = 'SAÚDE'; }
    else if (type === 'nps') { drawerFunc = this._drawSaude; colLabel = 'NPS'; }
    else if (type === 'proximoPasso') { drawerFunc = (ctx, f, lbl) => this._drawGeneric(ctx, f, this._genConfigs.proximo, lbl); colLabel = 'PRÓX. PASSO'; }
    else if (type === 'produtosNames') { drawerFunc = (ctx, f, lbl) => this._drawGeneric(ctx, f, this._genConfigs.produtos, lbl); colLabel = 'PRODUTOS'; }
    else if (type === 'segmento') { drawerFunc = (ctx, f, lbl) => this._drawGeneric(ctx, f, this._genConfigs.segmento, lbl); colLabel = 'SEGMENTO'; }
    else if (type === 'maAtividade' || type === 'title') { drawerFunc = (ctx, f, lbl) => this._drawGeneric(ctx, f, this._genConfigs.maAtividade, lbl); colLabel = 'ATIVIDADE'; }
    else if (type === 'maEmpresa' || type === 'company_name') { drawerFunc = (ctx, f, lbl) => this._drawGeneric(ctx, f, this._genConfigs.maEmpresa, lbl); colLabel = 'EMPRESA'; }
    else if (type === 'maData' || type === 'activity_date') { drawerFunc = (ctx, f, lbl) => this._drawGeneric(ctx, f, this._genConfigs.maData, lbl); colLabel = 'DATA'; }
    else if (type === 'auditQuando') { drawerFunc = (ctx, f, lbl) => this._drawGeneric(ctx, f, this._genConfigs.maData, lbl); colLabel = 'QUANDO'; }
    else if (type === 'maPrazo' || type === 'displayStatus') { drawerFunc = (ctx, f, lbl) => this._drawGeneric(ctx, f, this._genConfigs.maPrazo, lbl); colLabel = 'PRAZO'; }
    else if (type === 'maSituacao' || type === 'status') { drawerFunc = (ctx, f, lbl) => this._drawGeneric(ctx, f, this._genConfigs.maSituacao, lbl); colLabel = 'SITUAÇÃO'; }
    else if (type === 'auditLog' || type === 'auditQuem') { drawerFunc = (ctx, f, lbl) => this._drawGeneric(ctx, f, this._genConfigs.auditQuem, lbl); colLabel = 'QUEM'; }
    else if (type === 'auditAcao') { drawerFunc = (ctx, f, lbl) => this._drawGeneric(ctx, f, this._genConfigs.auditAcao, lbl); colLabel = 'AÇÃO'; }
    else if (type === 'auditEntidade') { drawerFunc = (ctx, f, lbl) => this._drawGeneric(ctx, f, this._genConfigs.auditEntidade, lbl); colLabel = 'ENTIDADE'; }
    else { drawerFunc = this._drawEmpresa; colLabel = 'EMPRESA'; }

    const animate = () => {
      this.frame = (this.frame + 1) % 540;
      drawerFunc.call(this, ctx, this.frame, colLabel);
      const p = _el.querySelector('.db-tt-vtt-progress-fill');
      const t = _el.querySelector('.db-tt-vtt-time');
      if (p) p.style.width = `${(this.frame / 540) * 100}%`;
      if (t) {
        const s = Math.floor((this.frame / 540) * 15);
        t.textContent = `0:${String(s).padStart(2, '0')}`;
      }
      this.activeAnim = requestAnimationFrame(animate);
    };
    animate();
  },
  
  stop() {
    if (this.activeAnim) cancelAnimationFrame(this.activeAnim);
    this.activeAnim = null; this.frame = 0;
  },

  _lerp(a,b,t) { return a+(b-a)*t; },
  _prog(f,s,e) { return Math.max(0,Math.min(1,(f-s)/(e-s))); },
  
  _drawBg(ctx, companies, colLabel = 'STATUS', showBT = true) {
    const { W, H, SW, TH_Y, BT_H, TH_H, ROW_Y, ROW_H, CX_EMPRESA, CX_STATUS, CX_DATA } = this._const;
    const isMA = ['ATIVIDADE', 'PRAZO', 'SITUAÇÃO', 'PRÓX. PASSO'].includes(colLabel) || colLabel.startsWith('ma');
    const isAudit = colLabel === 'QUEM' || colLabel === 'AÇÃO' || colLabel === 'ENTIDADE' || colLabel === 'QUANDO' || colLabel === 'auditLog';
    
    // Base Canvas BG (Dati Dark Slate)
    ctx.fillStyle='#0f172a'; ctx.fillRect(0,0,W,H);
    
    // Premium Sidebar (Slate 950)
    ctx.fillStyle='#020617'; ctx.fillRect(0,0,SW,H);
    
    // Logo Simulation (JOURNEY)
    ctx.fillStyle='#5b52f6'; ctx.beginPath(); ctx.roundRect(8,8,28,7,2); ctx.fill();
    ctx.fillStyle='#ffffff'; ctx.font='bold 4px system-ui'; ctx.fillText('JOURNEY', 10, 13);
    
    // Sidebar items (Phosphor-like)
    const icons = ['squares-four', 'user-circle', 'square', 'wave-sine', 'rocket', 'sliders-horizontal'];
    icons.forEach((ic, i) => {
      const iy = 22 + i * 15;
      const active = i === 1; // Minhas Atividades active
      if (active) {
        ctx.fillStyle = 'rgba(91,82,246,0.15)'; ctx.fillRect(4, iy, SW - 8, 12);
        ctx.fillStyle = '#5b52f6'; ctx.fillRect(0, iy, 2, 12);
      }
      ctx.fillStyle = active ? '#ffffff' : '#64748b';
      ctx.beginPath(); ctx.arc(12, iy+6, 2.8, 0, Math.PI*2); 
      if(active) ctx.fill(); else ctx.stroke();
      ctx.fillRect(19, iy+5, active?18:14, 2);
    });

    // Top Bar (Slate 900)
    ctx.fillStyle='#0f172a'; ctx.fillRect(SW,0,W-SW,TH_Y);
    // Breadcrumb / Title sim
    ctx.fillStyle='#94a3b8'; ctx.font='bold 5px system-ui'; ctx.fillText('DASHBOARD / MINHAS ATIVIDADES', SW+10, 11);

    // Layout Divider
    ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=0.5;
    ctx.beginPath(); ctx.moveTo(SW,TH_Y); ctx.lineTo(W,TH_Y); ctx.stroke();

    // Bulk Toolbar or Header Meta
    const REAL_TH_Y = TH_Y + (showBT ? BT_H : 0);
    if (showBT) {
        ctx.fillStyle='#0f172a'; ctx.fillRect(SW, TH_Y, W-SW, BT_H);
        ctx.fillStyle='rgba(91,82,246,0.1)'; ctx.beginPath(); ctx.roundRect(SW+8, TH_Y+3, 150, 10, 4); ctx.fill(); // Fake search
        ctx.fillStyle='#64748b'; ctx.font='4px system-ui'; ctx.fillText('Buscar atividade...', SW+18, TH_Y+9.5);
    }

    // Table Header
    ctx.fillStyle='#020617'; ctx.fillRect(SW, REAL_TH_Y, W-SW, TH_H);
    ctx.fillStyle='#64748b'; ctx.font='bold 4.5px system-ui';
    
    if (isMA) {
        ctx.fillText('ATIVIDADE', CX_EMPRESA, REAL_TH_Y+9);
        ctx.fillText('DATA', CX_DATA, REAL_TH_Y+9);
        ctx.fillText(colLabel, CX_STATUS, REAL_TH_Y+9);
    } else if (isAudit) {
        ctx.fillText('QUEM', CX_EMPRESA, REAL_TH_Y+9);
        ctx.fillText('AÇÃO', CX_STATUS, REAL_TH_Y+9);
    } else {
        ctx.fillText('EMPRESA', CX_EMPRESA, REAL_TH_Y+9);
        ctx.fillText(colLabel, CX_STATUS, REAL_TH_Y+9);
    }

    // Table Rows
    companies.forEach((c,i)=>{
      const ry=REAL_TH_Y+TH_H + i*ROW_H; if(ry+ROW_H>H) return;
      ctx.fillStyle=i%2===0?'#030712':'#020617'; ctx.fillRect(SW,ry,W-SW,ROW_H);
      
      // Select indicator
      ctx.strokeStyle='rgba(255,255,255,0.1)'; ctx.strokeRect(SW+8,ry+5,6,6);
      
      // Name (Atividade or Empresa)
      ctx.fillStyle='#f8fafc'; ctx.font='5.5px system-ui'; ctx.fillText(c.name, CX_EMPRESA, ry+11);
      
      // Optional Data col
      if(isMA) {
        ctx.fillStyle='#94a3b8'; ctx.font='5px system-ui'; ctx.fillText('16/03/26', CX_DATA, ry+10);
      }

      // Value Column
      if(c.badge){
        const bW = ctx.measureText(c.badge).width + 8;
        ctx.fillStyle=c.bc || 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.roundRect(CX_STATUS-2,ry+3.5,bW,9,3); ctx.fill();
        ctx.fillStyle=c.btc || '#fff'; ctx.font='bold 4.5px system-ui'; ctx.textAlign='center';
        ctx.fillText(c.badge, CX_STATUS-2+bW/2, ry+9.5); ctx.textAlign='left';
      } else if(c.dot){
        ctx.fillStyle=c.dot; ctx.beginPath(); ctx.arc(CX_STATUS+4,ry+8,2.5,0,Math.PI*2); ctx.fill();
      } else if(c.text){
        ctx.fillStyle='#94a3b8'; ctx.font='5px system-ui'; ctx.fillText(c.text, CX_STATUS, ry+10);
      }
      
      ctx.strokeStyle='rgba(255,255,255,0.03)'; ctx.beginPath(); ctx.moveTo(SW,ry+ROW_H); ctx.lineTo(W,ry+ROW_H); ctx.stroke();
    });
  },

  _drawCursor(ctx, x,y,sc,pressing){
    ctx.save(); ctx.translate(x,y); ctx.scale(sc,sc);
    ctx.shadowColor='rgba(0,0,0,0.5)'; ctx.shadowBlur=2; ctx.shadowOffsetX=1; ctx.shadowOffsetY=1;
    ctx.fillStyle=pressing?'rgba(200,200,200,0.95)':'rgba(255,255,255,0.97)';
    ctx.strokeStyle='rgba(0,0,0,0.55)'; ctx.lineWidth=0.7;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,11); ctx.lineTo(2.4,8.6); ctx.lineTo(4,12.4); ctx.lineTo(5.6,11.7); ctx.lineTo(4.1,7.9); ctx.lineTo(6.8,7.9); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  },

  _drawEmpresa(ctx, f, label) {
    const { W, H, ROW_Y, CX_EMPRESA } = this._const;
    const COMPANIES=[{name:'AAAA3777', badge:'ATIVO',bc:'rgba(74,222,128,0.12)',btc:'#4ade80'},{name:'ABC importador', badge:'PROSPECT',bc:'rgba(251,191,36,0.12)',btc:'#fbbf24'},{name:'ACE Schmersal', badge:'ATIVO',bc:'rgba(74,222,128,0.12)',btc:'#4ade80'}];
    ctx.clearRect(0,0,W,H);
    this._drawBg(ctx, COMPANIES, label, false);
    this._drawCursor(ctx,this._lerp(230,CX_EMPRESA+20,this._prog(f,40,200)),this._lerp(140,ROW_Y+8,this._prog(f,40,200)),1,false);
  },

  _drawStatus(ctx, f, label) {
    const { W, H, ROW_Y, CX_STATUS } = this._const, BT_Y = 18, FI_X=CX_STATUS+12, FI_Y=ROW_Y+8, DD_X=CX_STATUS-5, DD_Y=ROW_Y, DD_W=55, DD_H=82, ITEM_H=12;
    const COMPANIES=[{name:'AAAA3777', badge:'ATIVO',bc:'rgba(74,222,128,0.12)',btc:'#4ade80'},{name:'ABC importador', badge:'PROSPECT',bc:'rgba(251,191,36,0.12)',btc:'#fbbf24'}];
    ctx.clearRect(0,0,W,H);
    const isF=f>=470; 
    this._drawBg(ctx, isF?[COMPANIES[0]]:COMPANIES, label, false);
    if(f>=160&&f<470){
      const scY=this._prog(f,160,240)*(1-this._prog(f,430,470));
      ctx.save(); ctx.globalAlpha=scY; ctx.translate(DD_X+DD_W/2,DD_Y); ctx.scale(1,scY); ctx.translate(-(DD_X+DD_W/2),-DD_Y);
      ctx.fillStyle='#1e293b'; ctx.beginPath(); ctx.roundRect(DD_X,DD_Y,DD_W,DD_H,4); ctx.fill();
      ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.stroke();
      ctx.fillStyle='#94a3b8'; ctx.font='bold 4.5px system-ui'; ctx.fillText('STATUS',DD_X+6,DD_Y+10);
      ['(TUDO)','ATIVO','PROSPECT','INATIVO','BLOQUEADO'].forEach((st,i)=>{
        const iy=DD_Y+16+i*ITEM_H, isH=i===1&&f>=340&&f<430, isS=i===1&&f>=430;
        if(isH||isS){ ctx.fillStyle='rgba(99,102,241,0.2)'; ctx.fillRect(DD_X+2,iy-2,DD_W-4,ITEM_H-1); }
        ctx.fillStyle=(isH||isS)?'#fff':'#94a3b8'; ctx.font='4.5px system-ui'; ctx.fillText(st,DD_X+8,iy+6);
      });
      ctx.restore();
    }
    this._drawCursor(ctx,this._lerp(80,FI_X,this._prog(f,50,150)),this._lerp(140,FI_Y,this._prog(f,50,150)),1,f>=160&&f<170);
  },

  _drawSaude(ctx, f, label) {
    const { W, H, ROW_Y, CX_STATUS } = this._const, BT_Y = 18, FI_X=CX_STATUS+12, FI_Y=ROW_Y+8, DD_X=CX_STATUS-5, DD_Y=ROW_Y, DD_W=55, DD_H=68, ITEM_H=12;
    const COMPANIES=[{name:'AAAA3777', dot:'#4ade80'},{name:'ABC importador', dot:'#f87171'}];
    ctx.clearRect(0,0,W,H);
    const isF=f>=470;
    this._drawBg(ctx, isF?[COMPANIES[0]]:COMPANIES, label, false);
    if(f>=160&&f<470){
      const scY=this._prog(f,160,240)*(1-this._prog(f,420,460));
      ctx.save(); ctx.globalAlpha=scY; ctx.translate(DD_X+DD_W/2,DD_Y); ctx.scale(1,scY); ctx.translate(-(DD_X+DD_W/2),-DD_Y);
      ctx.fillStyle='#1e293b'; ctx.beginPath(); ctx.roundRect(DD_X,DD_Y,DD_W,DD_H,4); ctx.fill(); ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.stroke();
      ctx.fillStyle='#94a3b8'; ctx.font='bold 4.5px system-ui'; ctx.fillText(label+' FILTRO',DD_X+6,DD_Y+10);
      [{l:'(TUDO)'},{l:'Saudável',d:'#4ade80'},{l:'Risco',d:'#f87171'},{l:'Atenção',d:'#fbbf24'}].forEach((it,i)=>{
        const iy=DD_Y+16+i*ITEM_H, isH=i===1&&f>=340&&f<420, isS=i===1&&f>=420, isT=i===0&&f<420;
        if(isT||isS){ ctx.fillStyle='rgba(99,102,241,0.2)'; ctx.fillRect(DD_X+2,iy-2,DD_W-4,ITEM_H-1); }
        if(it.d){ ctx.fillStyle=it.d; ctx.beginPath(); ctx.arc(DD_X+10,iy+5,3,0,Math.PI*2); ctx.fill(); }
        ctx.fillStyle=(isT||isS)?'#fff':'#94a3b8'; ctx.font='4.5px system-ui'; ctx.fillText(it.l,DD_X+(it.d?16:8),iy+6);
      });
      ctx.restore();
    }
    this._drawCursor(ctx,this._lerp(80,FI_X,this._prog(f,50,150)),this._lerp(140,FI_Y,this._prog(f,50,150)),1,false);
  },

  _drawSearch(ctx, f) {
    const { W, H, SW } = this._const;
    const COMPANIES_FULL=[{name:'ABC importador', badge:'PROSPECT',bc:'rgba(251,191,36,0.12)',btc:'#fbbf24'},{name:'ACE Schmersal', badge:'ATIVO', bc:'rgba(74,222,128,0.12)',btc:'#4ade80'}];
    ctx.clearRect(0,0,W,H);
    const isT=f>=200;
    this._drawBg(ctx, isT?[COMPANIES_FULL[0]]:COMPANIES_FULL, 'STATUS', false);
    if(f>=100&&f<400){
      const t=this._prog(f,100,200), txt="ABC";
      ctx.fillStyle='#fff'; ctx.font='bold 5.5px system-ui';
      ctx.fillText(txt.substring(0, Math.floor(t*txt.length)), SW+20, 10);
    }
    const cx=this._lerp(230,SW+16,this._prog(f,40,100)), cy=this._lerp(140,10,this._prog(f,40,100));
    this._drawCursor(ctx,cx,cy,1,false);
  },

  _drawNew(ctx, f) {
    const { W, H } = this._const;
    const COMPANIES_A=[{name:'ABC importador', badge:'PROSPECT',bc:'rgba(251,191,36,0.12)',btc:'#fbbf24'}];
    const COMPANIES_B=[{name:'NOVA EMPRESA LTDA', badge:'PROSPECT',bc:'rgba(251,191,36,0.12)',btc:'#fbbf24'},{name:'ABC importador', badge:'PROSPECT',bc:'rgba(251,191,36,0.12)',btc:'#fbbf24'}];
    ctx.clearRect(0,0,W,H);
    const isC=f>=280;
    this._drawBg(ctx, isC?COMPANIES_B:COMPANIES_A, 'STATUS', false);
    let cx=W-40, cy=10, pres=f>=230&&f<270;
    if(f<180){ cx=this._lerp(100,W-40,this._prog(f,40,180)); cy=this._lerp(140,10,this._prog(f,40,180)); }
    else { cx=W-40; cy=10; }
    this._drawCursor(ctx,cx,cy,pres?0.85:1,pres);
    if(isC&&f<450){ ctx.fillStyle='rgba(99,102,241,0.08)'; ctx.fillRect(45,34,255,16); }
  },

  _drawGeneric(ctx, f, cfg, label) {
    const { W, H, ROW_Y, CX_STATUS } = this._const, BT_Y = 18, FI_X=cfg.fX, FI_Y=BT_Y+8, DD_X=cfg.dX, DD_Y=ROW_Y, DD_W=cfg.dW, DD_H=cfg.dH, ITEM_H=12;
    ctx.clearRect(0,0,W,H);
    const isF=f>=470; this._drawBg(ctx, isF?cfg.cF:cfg.cP, label, true);
    ctx.fillStyle=f>=160&&f<470?'#6366f1':'#475569';
    if(f>=170&&f<470){
      const scY=this._prog(f,170,250)*(1-this._prog(f,430,470));
      ctx.save(); ctx.globalAlpha=scY; ctx.translate(DD_X+DD_W/2,DD_Y); ctx.scale(1,scY); ctx.translate(-(DD_X+DD_W/2),-DD_Y);
      ctx.fillStyle='#1e293b'; ctx.beginPath(); ctx.roundRect(DD_X,DD_Y,DD_W,DD_H,4); ctx.fill(); ctx.strokeStyle='rgba(255,255,255,0.08)'; ctx.stroke();
      ctx.fillStyle='#94a3b8'; ctx.font='bold 4.5px system-ui'; ctx.fillText(cfg.dT,DD_X+6,DD_Y+10);
      cfg.it.forEach((it,i)=>{
        const iy=DD_Y+16+i*ITEM_H, isH=i===1&&f>=350&&f<430, isS=i===1&&f>=430, isT=i===0&&f<430;
        if(isT||isS){ ctx.fillStyle='rgba(99,102,241,0.2)'; ctx.fillRect(DD_X+2,iy-2,DD_W-4,ITEM_H-1); }
        ctx.fillStyle=(isT||isS)?'#fff':'#94a3b8'; ctx.font='4.5px system-ui'; ctx.fillText(it,DD_X+8,iy+6);
      });
      ctx.restore();
    }
    const pres=f>=175&&f<185||f>=415&&f<430;
    this._drawCursor(ctx,this._lerp(80,FI_X,this._prog(f,55,165)),this._lerp(140,FI_Y,this._prog(f,55,165)),pres?0.88:1,pres);
  },

  _genConfigs: {
    proximo: { fX:258, dX:142, dW:152, dH:112, dT:'FILTRAR PRÓXIMO PASSO', it:['(TUDO)','Enviar proposta','Reunião agendada','Follow-up','Renovação'], cP:[{name:'ABC importador', text:'Enviar proposta'},{name:'ACE Schmersal', text:'—'},{name:'ADITEX IND.', text:'Follow-up'}], cF:[{name:'ABC importador', text:'Enviar proposta'}] },
    produtos: { fX:254, dX:142, dW:152, dH:114, dT:'FILTRAR PRODUTOS', it:['(TUDO)','DATI Export','DATI Import','Smart Read','Analytics'], cP:[{name:'AAAA3777', tagText:'DATI Export', tagBg:'#1a2a4a', tagTc:'#7dd3fc'},{name:'ABC importador', tagText:'Smart Read', tagBg:'#3a1a4a', tagTc:'#d8b4fe'}], cF:[{name:'AAAA3777', tagText:'DATI Export', tagBg:'#1a2a4a', tagTc:'#7dd3fc'}] },
    segmento: { fX:256, dX:142, dW:152, dH:114, dT:'FILTRAR SEGMENTO', it:['(TUDO)','Logística','Agronegócio','C. Exterior','Indústria'], cP:[{name:'ABC importador', text:'C. Exterior'},{name:'ALIBRA', text:'Logística'}], cF:[{name:'ALIBRA', text:'Logística'}] },
    
    // Ações em massa
    import: { fX:162, dX:142, dW:152, dH:100, dT:'IMPORTAÇÃO', it:['(TUDO)','Planilha.xlsx','Clientes.csv','Backup.json'], cP:[{name:'...'},{name:'...'}], cF:[{name:'Fila de Importação: 100%'}] },
    bulkEdit: { fX:200, dX:142, dW:152, dH:100, dT:'EDIÇÃO EM LOTE', it:['(TUDO)','Alterar Status','Mudar Segmento','Trocar Saúde'], cP:[{name:'Empresa A'},{name:'Empresa B'}], cF:[{name:'Empresa A', badge:'ATIVO',bc:'#1a4a2e',btc:'#4ade80'}] },
    bulkDelete: { fX:238, dX:142, dW:152, dH:100, dT:'EXCLUSÃO EM LOTE', it:['(TUDO)','Confirmar','Cancelar'], cP:[{name:'Excluir A'},{name:'Excluir B'}], cF:[] },
    bulkClear: { fX:276, dX:142, dW:152, dH:100, dT:'LIMPAR SELEÇÃO', it:['(TUDO)','Desmarcar todos'], cP:[{name:'ABC importador'},{name:'ACE Schmersal'}], cF:[{name:'ABC importador'},{name:'ACE Schmersal'}] },

    // Minhas Atividades
    maAtividade: { fX:258, dX:142, dW:152, dH:124, dT:'FILTRAR ATIVIDADE', it:['(TUDO)', 'Reunião', 'Comentário', 'Ação necessária', 'Chamados'], cP:[{name:'Reunião Trimestral', text:'Reunião'}, {name:'Ajustar Proposta', text:'Ação necessária'}], cF:[{name:'Reunião Trimestral', text:'Reunião'}] },
    maEmpresa: { fX:258, dX:142, dW:152, dH:112, dT:'FILTRAR EMPRESA', it:['(TUDO)', 'Dati Systems', 'Ambev', 'Coca-Cola'], cP:[{name:'Atividade A', text:'Dati Systems'}, {name:'Atividade B', text:'Ambev'}], cF:[{name:'Atividade A', text:'Dati Systems'}] },
    maData: { fX:258, dX:142, dW:152, dH:112, dT:'FILTRAR DATA', it:['(TUDO)', 'Hoje', 'Amanhã', 'Esta Semana'], cP:[{name:'Reunião', text:'16/03/2026'}, {name:'Call', text:'17/03/2026'}], cF:[{name:'Reunião', text:'16/03/2026'}] },
    maPrazo: { fX:258, dX:142, dW:152, dH:118, dT:'FILTRAR PRAZO', it:['(TUDO)', 'Atrasada', 'Hoje', 'Pendente', 'Concluída'], cP:[{name:'Atendimento', badge:'ATRASADA', bc:'rgba(239,68,68,0.12)', btc:'#ef4444'}, {name:'Revisão', badge:'HOJE', bc:'rgba(245,158,11,0.12)', btc:'#f59e0b'}], cF:[{name:'Atendimento', badge:'ATRASADA', bc:'rgba(239,68,68,0.12)', btc:'#ef4444'}] },
    maSituacao: { fX: 258, dX: 142, dW: 152, dH: 118, dT: 'FILTRAR SITUAÇÃO', it: ['(TUDO)', 'A Fazer', 'Em Andamento', 'Concluída'], cP: [{ name: 'Call de Alinhamento', badge: 'A FAZER', bc: 'rgba(99,102,241,0.12)', btc: '#818cf8' }, { name: 'Proposta', badge: 'EM ANDAMENTO', bc: 'rgba(245,158,11,0.12)', btc: '#f59e0b' }], cF: [{ name: 'Call de Alinhamento', badge: 'A FAZER', bc: 'rgba(99,102,241,0.12)', btc: '#818cf8' }] },
    auditQuem: {
      fX: 254, dX: 142, dW: 152, dH: 124, dT: 'FILTRAR USUÁRIO',
      it: ['(TUDO)', 'Daniel Martins', 'Rafaela Silva', 'Sistema Journey'],
      cP: [
        { name: 'Daniel Martins', badge: 'ALTERAÇÃO', bc: 'rgba(99,102,241,0.12)', btc: '#6366f1' },
        { name: 'Rafaela Silva', badge: 'CRIAÇÃO', bc: 'rgba(16,185,129,0.12)', btc: '#10b981' },
        { name: 'Journey', badge: 'SISTEMA', bc: 'rgba(100,116,139,0.12)', btc: '#64748b' }
      ],
      cF: [ { name: 'Daniel Martins', badge: 'ALTERAÇÃO', bc: 'rgba(99,102,241,0.12)', btc: '#6366f1' } ]
    },
    auditAcao: {
      fX: 254, dX: 142, dW: 152, dH: 124, dT: 'FILTRAR AÇÃO',
      it: ['(TUDO)', 'Criação', 'Alteração', 'Exclusão', 'Acesso', 'Sistema'],
      cP: [
        { name: 'Daniel Martins', badge: 'ALTERAÇÃO', bc: 'rgba(99,102,241,0.12)', btc: '#6366f1' },
        { name: 'Rafaela Silva', badge: 'CRIAÇÃO', bc: 'rgba(16,185,129,0.12)', btc: '#10b981' }
      ],
      cF: [ { name: 'Daniel Martins', badge: 'ALTERAÇÃO', bc: 'rgba(99,102,241,0.12)', btc: '#6366f1' } ]
    },
    auditEntidade: {
      fX: 254, dX: 142, dW: 152, dH: 114, dT: 'FILTRAR ENTIDADE',
      it: ['(TUDO)', 'Empresa', 'Usuário', 'Venda', 'Tarefa'],
      cP: [
        { name: 'Daniel Martins', text: 'Empresa' },
        { name: 'Rafaela Silva', text: 'Usuário' }
      ],
      cF: [ { name: 'Daniel Martins', text: 'Empresa' } ]
    }
  }
};

function _scheduleHide() {
  clearTimeout(_hideTimer);
  _hideTimer = setTimeout(() => {
    if (!_el) return;
    VTT_ENGINE.stop();
    _el.classList.remove('db-tooltip-visible');
    setTimeout(() => {
      if (_el && !_el.classList.contains('db-tooltip-visible')) {
        _el.style.display = 'none';
      }
    }, 180);
  }, HIDE_DELAY);
}

function _position(event) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ttW = _el.offsetWidth;
  const ttH = _el.offsetHeight;

  let x = event.clientX + OFFSET_X;
  let y = event.clientY + OFFSET_Y;

  let acima = false;
  let direita = false;

  if (x + ttW > vw - 12) { x = event.clientX - ttW - OFFSET_X; direita = true; }
  if (y + ttH > vh - 12) { y = event.clientY - ttH - OFFSET_Y; acima = true; }

  x = Math.max(8, x);
  y = Math.max(8, y);

  _el.style.left = `${x}px`;
  _el.style.top = `${y}px`;

  _el.classList.toggle('tt-above', acima);
  _el.classList.toggle('tt-right', direita);
}

function _buildHTML(data) {
  const { emoji, titulo, items = [], stat, statLabel, simples, video, desc } = data;

  if (video) {
    // Ao injetar o HTML, o showTooltip chamará VTT_ENGINE.start()
    setTimeout(() => {
        const canvas = _el.querySelector('.db-tt-vtt-canvas');
        VTT_ENGINE.start(canvas, data.type || data.colId || 'status');
    }, 0);

    return `
      <div style="width: 300px; display: flex; flex-direction: column; overflow:hidden; border-radius:14px;">
        <div class="db-tt-vtt-video-wrap">
          <canvas class="db-tt-vtt-canvas"></canvas>
          <div class="db-tt-vtt-progress-wrap">
            <div class="db-tt-vtt-progress-fill"></div>
          </div>
        </div>
        <div class="db-tt-vtt-body">
          <div class="db-tt-vtt-label">TUTORIAL · 0:15</div>
          <div class="db-tt-vtt-title">${titulo || 'Tutorial'}</div>
          <div class="db-tt-vtt-desc">${desc || 'Veja como usar este recurso para aumentar sua produtividade.'}</div>
          <div class="db-tt-vtt-cta">
            <span class="db-tt-vtt-link">Ver documentação <i class="ph ph-arrow-right"></i></span>
            <span class="db-tt-vtt-time">0:00</span>
          </div>
        </div>
      </div>
    `;
  }

  if (simples) {
    return `<div style="padding:9px 14px;display:flex;align-items:center;gap:8px;">
          ${emoji ? `<span style="font-size:14px;">${emoji}</span>` : ''}
          <span style="font-weight:700;font-size:13px;color:#F8FAFC;white-space:nowrap;">${titulo}</span>
        </div>`;
  }

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
      ${item.nps !== undefined && item.nps !== null ? `<span class="db-tt-nps" style="color:${_npsColor(item.nps)}">${item.nps}</span>` : ''}
    </div>
  `).join('');

  const maisHTML = resto > 0 ? `<div class="db-tt-more">+ ${resto} empresa${resto !== 1 ? 's' : ''}...</div>` : '';
  const footerHTML = stat ? `<div class="db-tt-stat"><span class="db-tt-stat-label">${statLabel || ''}</span><span class="db-tt-stat-value">${stat}</span></div>` : '';
  const listaSection = items.length > 0 ? `<div class="db-tt-list">${listaHTML}${maisHTML}</div>` : '';

  return header + listaSection + footerHTML;
}

function _npsColor(nps) {
  const val = parseFloat(nps);
  if (isNaN(val)) return '#94A3B8';
  if (val >= 8) return '#10B981';
  if (val >= 6) return '#F59E0B';
  return '#EF4444';
}
