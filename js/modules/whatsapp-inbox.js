/**
 * ============================================================================
 * WhatsApp Inbox HD — js/modules/whatsapp-inbox.js
 * ============================================================================
 *
 * Módulo frontend para o WhatsApp Inbox HD.
 * Render completamente dentro de #wa-inbox-root.
 * Conecta ao SSE /api/whatsapp/stream para mensagens em tempo real.
 * Exposto como `window.whatsappInbox` para uso pelo nav.
 * ============================================================================
 */

import { getAuthToken } from './auth.js';

// ── Helper fetch autenticado ──────────────────────────────────────────────────
async function _fetch(url, opts = {}) {
    const token = await getAuthToken();
    return fetch(url, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...opts.headers,
        },
    });
}

// ── Temperatura → visual ──────────────────────────────────────────────────────
const TEMP_CONFIG = {
    critico:   { label: 'Crítico',   color: '#ef4444', bg: 'rgba(239,68,68,0.15)',   emoji: '🔴' },
    negativo:  { label: 'Negativo',  color: '#f97316', bg: 'rgba(249,115,22,0.15)',  emoji: '🟠' },
    neutro:    { label: 'Neutro',    color: '#6b7280', bg: 'rgba(107,114,128,0.15)', emoji: '⚪' },
    positivo:  { label: 'Positivo',  color: '#10b981', bg: 'rgba(16,185,129,0.15)',  emoji: '🟢' },
    encantado: { label: 'Encantado', color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)',  emoji: '💜' },
};

function tempBadge(temp) {
    const cfg = TEMP_CONFIG[temp] || TEMP_CONFIG.neutro;
    return `<span style="
        display:inline-flex; align-items:center; gap:0.3rem;
        background:${cfg.bg}; color:${cfg.color};
        border:1px solid ${cfg.color}40;
        padding:0.18rem 0.55rem; border-radius:20px;
        font-size:0.72rem; font-weight:700; white-space:nowrap;
    ">${cfg.emoji} ${cfg.label}</span>`;
}

function timeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ── Estado global do módulo ───────────────────────────────────────────────────
let _conversations = [];
let _currentConvId = null;
let _messages = [];
let _sseSource = null;
let _filterStatus = 'open';
let _initialized = false;

// ── Estilos do módulo (injetados uma vez) ─────────────────────────────────────
function _injectStyles() {
    if (document.getElementById('wa-inbox-styles')) return;
    const style = document.createElement('style');
    style.id = 'wa-inbox-styles';
    style.textContent = `
        #wa-inbox-root {
            font-family: 'Plus Jakarta Sans', 'DM Sans', sans-serif;
            background: var(--dark-bg, #0f1724);
            color: var(--text-main, #e2e8f0);
        }
        .wa-inbox-layout {
            display: flex;
            height: 100%;
            overflow: hidden;
        }
        /* ── SIDEBAR ───────────────────────────────────── */
        .wa-conv-list {
            width: 320px;
            min-width: 280px;
            max-width: 360px;
            border-right: 1px solid rgba(255,255,255,0.07);
            display: flex;
            flex-direction: column;
            background: rgba(255,255,255,0.02);
        }
        .wa-conv-header {
            padding: 1rem 1.1rem 0.75rem;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            display: flex;
            flex-direction: column;
            gap: 0.65rem;
        }
        .wa-conv-header h2 {
            margin: 0;
            font-size: 1rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: #e2e8f0;
        }
        .wa-conv-filter-tabs {
            display: flex;
            gap: 0.35rem;
        }
        .wa-tab-btn {
            padding: 0.3rem 0.75rem;
            border-radius: 20px;
            border: 1px solid rgba(255,255,255,0.1);
            background: transparent;
            color: var(--text-muted, #8b98b4);
            font-size: 0.75rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s;
            font-family: inherit;
        }
        .wa-tab-btn.active {
            background: rgba(99,102,241,0.2);
            border-color: #6366f1;
            color: #a5b4fc;
        }
        .wa-conv-items {
            flex: 1;
            overflow-y: auto;
            padding: 0.4rem 0;
        }
        .wa-conv-item {
            padding: 0.9rem 1.1rem;
            cursor: pointer;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            transition: background 0.15s;
            position: relative;
        }
        .wa-conv-item:hover { background: rgba(255,255,255,0.04); }
        .wa-conv-item.active { background: rgba(99,102,241,0.1); border-left: 3px solid #6366f1; }
        .wa-conv-item-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;
            margin-bottom: 0.3rem;
        }
        .wa-conv-name {
            font-size: 0.875rem;
            font-weight: 600;
            color: #e2e8f0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex: 1;
        }
        .wa-conv-time {
            font-size: 0.7rem;
            color: var(--text-muted, #8b98b4);
            flex-shrink: 0;
        }
        .wa-conv-preview {
            font-size: 0.78rem;
            color: var(--text-muted, #8b98b4);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 0.35rem;
        }
        .wa-conv-meta {
            display: flex;
            align-items: center;
            gap: 0.4rem;
            flex-wrap: wrap;
        }
        .wa-phone-chip {
            font-size: 0.68rem;
            color: #475569;
            font-family: monospace;
        }
        .wa-unread-badge {
            background: #22c55e;
            color: #fff;
            font-size: 0.65rem;
            font-weight: 800;
            min-width: 18px;
            height: 18px;
            border-radius: 10px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0 4px;
        }
        /* ── CHAT PANEL ────────────────────────────────── */
        .wa-chat-panel {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .wa-chat-empty {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: var(--text-muted, #8b98b4);
            gap: 0.75rem;
        }
        .wa-chat-empty i {
            font-size: 3rem;
            opacity: 0.25;
        }
        .wa-chat-header {
            padding: 0.85rem 1.25rem;
            border-bottom: 1px solid rgba(255,255,255,0.07);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            background: rgba(255,255,255,0.02);
        }
        .wa-chat-header-info { flex: 1; min-width: 0; }
        .wa-chat-contact-name {
            font-weight: 700;
            font-size: 0.95rem;
            color: #e2e8f0;
            margin-bottom: 0.15rem;
        }
        .wa-chat-phone {
            font-size: 0.75rem;
            color: var(--text-muted, #8b98b4);
            font-family: monospace;
        }
        .wa-chat-actions { display: flex; gap: 0.5rem; }
        .wa-btn {
            padding: 0.45rem 1rem;
            border-radius: 8px;
            border: none;
            font-family: inherit;
            font-size: 0.8rem;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 0.4rem;
            transition: all 0.15s;
        }
        .wa-btn-close {
            background: rgba(239,68,68,0.15);
            color: #f87171;
            border: 1px solid rgba(239,68,68,0.3);
        }
        .wa-btn-close:hover { background: rgba(239,68,68,0.25); }
        .wa-btn-primary {
            background: #6366f1;
            color: #fff;
        }
        .wa-btn-primary:hover { background: #5b52f6; }
        .wa-btn-secondary {
            background: rgba(255,255,255,0.06);
            color: #e2e8f0;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .wa-btn-secondary:hover { background: rgba(255,255,255,0.1); }
        .wa-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        /* ── MESSAGES ────────────────────────────────────── */
        .wa-messages {
            flex: 1;
            overflow-y: auto;
            padding: 1.25rem;
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }
        .wa-msg {
            max-width: 68%;
            display: flex;
            flex-direction: column;
        }
        .wa-msg.inbound { align-self: flex-start; }
        .wa-msg.outbound { align-self: flex-end; align-items: flex-end; }
        .wa-msg-bubble {
            padding: 0.6rem 0.9rem;
            border-radius: 14px;
            font-size: 0.875rem;
            line-height: 1.5;
            word-break: break-word;
        }
        .wa-msg.inbound .wa-msg-bubble {
            background: rgba(255,255,255,0.07);
            border-radius: 4px 14px 14px 14px;
        }
        .wa-msg.outbound .wa-msg-bubble {
            background: rgba(99,102,241,0.25);
            border-radius: 14px 4px 14px 14px;
        }
        .wa-msg.outbound[data-origin="gabi"] .wa-msg-bubble {
            background: rgba(139,92,246,0.2);
        }
        .wa-msg-meta {
            font-size: 0.68rem;
            color: #475569;
            margin-top: 0.2rem;
            display: flex;
            align-items: center;
            gap: 0.35rem;
        }
        .wa-msg-origin-gabi { color: #a78bfa; font-weight: 600; }
        /* ── INPUT ───────────────────────────────────────── */
        .wa-input-area {
            padding: 0.85rem 1.25rem;
            border-top: 1px solid rgba(255,255,255,0.07);
            display: flex;
            gap: 0.75rem;
            align-items: flex-end;
            background: rgba(255,255,255,0.02);
        }
        .wa-input {
            flex: 1;
            background: rgba(255,255,255,0.07);
            border: 1px solid rgba(255,255,255,0.12);
            border-radius: 10px;
            padding: 0.65rem 0.9rem;
            color: #e2e8f0;
            font-family: inherit;
            font-size: 0.875rem;
            resize: none;
            min-height: 44px;
            max-height: 140px;
            line-height: 1.5;
            transition: border-color 0.15s;
            overflow-y: auto;
        }
        .wa-input:focus { outline: none; border-color: rgba(99,102,241,0.5); }
        .wa-input::placeholder { color: #475569; }
        /* ── CLOSE MODAL ─────────────────────────────────── */
        .wa-close-modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
        }
        .wa-close-modal {
            background: #1a2035;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px;
            padding: 1.75rem;
            max-width: 520px;
            width: 90%;
        }
        .wa-close-modal h3 {
            margin: 0 0 1.25rem;
            font-size: 1.05rem;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            color: #e2e8f0;
        }
        .wa-gabi-result {
            background: rgba(139,92,246,0.1);
            border: 1px solid rgba(139,92,246,0.2);
            border-radius: 10px;
            padding: 1.1rem;
            margin: 1rem 0;
        }
        .wa-gabi-result-title {
            font-size: 0.75rem;
            color: #a78bfa;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 0.5rem;
        }
        .wa-close-modal-footer {
            display: flex;
            justify-content: flex-end;
            gap: 0.75rem;
            margin-top: 1.25rem;
        }
        /* ── STATS BAR ───────────────────────────────────── */
        .wa-stats-bar {
            padding: 0.6rem 1.1rem;
            background: rgba(255,255,255,0.02);
            border-bottom: 1px solid rgba(255,255,255,0.05);
            display: flex;
            gap: 1.5rem;
            font-size: 0.75rem;
            color: var(--text-muted, #8b98b4);
        }
        .wa-stats-val {
            font-weight: 700;
            color: #e2e8f0;
        }
        /* ── LOADING ─────────────────────────────────────── */
        .wa-loading {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 3rem;
            color: var(--text-muted, #8b98b4);
            gap: 0.5rem;
            font-size: 0.875rem;
        }
        @keyframes wa-spin { to { transform: rotate(360deg); } }
        .wa-spinner {
            width: 18px;
            height: 18px;
            border: 2px solid rgba(255,255,255,0.1);
            border-top-color: #6366f1;
            border-radius: 50%;
            animation: wa-spin 0.7s linear infinite;
        }
    `;
    document.head.appendChild(style);
}

// ─── Render Principal ──────────────────────────────────────────────────────────
function _renderRoot() {
    const root = document.getElementById('wa-inbox-root');
    if (!root) return;

    root.innerHTML = `
        <div class="wa-inbox-layout">
            <!-- Lista de conversas -->
            <div class="wa-conv-list">
                <div class="wa-conv-header">
                    <h2>
                        <i class="ph ph-whatsapp-logo" style="color:#25D366;"></i>
                        WhatsApp HD
                        <span id="wa-sse-status" title="Stream SSE" style="width:8px;height:8px;border-radius:50%;background:#6b7280;display:inline-block;margin-left:4px;"></span>
                    </h2>
                    <div class="wa-conv-filter-tabs">
                        <button class="wa-tab-btn active" onclick="window._waSetFilter('open')" id="wa-tab-open">Abertas</button>
                        <button class="wa-tab-btn" onclick="window._waSetFilter('closed')" id="wa-tab-closed">Fechadas</button>
                        <button class="wa-tab-btn" onclick="window._waSetFilter('all')" id="wa-tab-all">Todas</button>
                    </div>
                </div>
                <div id="wa-stats-bar" class="wa-stats-bar">
                    <span>Custo/mês: <span class="wa-stats-val" id="wa-stat-cost">—</span></span>
                    <span>Abertas: <span class="wa-stats-val" id="wa-stat-open">—</span></span>
                </div>
                <div id="wa-conv-items" class="wa-conv-items">
                    <div class="wa-loading"><div class="wa-spinner"></div> Carregando...</div>
                </div>
            </div>
            <!-- Chat panel -->
            <div class="wa-chat-panel">
                <div class="wa-chat-empty" id="wa-chat-empty">
                    <i class="ph ph-chat-dots"></i>
                    <span>Selecione uma conversa</span>
                </div>
                <div id="wa-chat-main" style="display:none; flex:1; display:none; flex-direction:column; overflow:hidden;"></div>
            </div>
        </div>
    `;
}

// ─── Render Lista de Conversas ─────────────────────────────────────────────────
function _renderConvList() {
    const el = document.getElementById('wa-conv-items');
    if (!el) return;

    if (!_conversations.length) {
        el.innerHTML = `<div class="wa-loading" style="flex-direction:column; gap:0.5rem;">
            <i class="ph ph-chat-circle" style="font-size:2rem; opacity:0.2;"></i>
            <span>Nenhuma conversa ${_filterStatus === 'open' ? 'aberta' : ''}.</span>
        </div>`;
        return;
    }

    el.innerHTML = _conversations.map(conv => {
        const nome   = conv.contact_nome || `+${conv.wa_phone_number}`;
        const empresa = conv.company_nome ? `<span style="font-size:0.7rem;color:#6366f1;">${conv.company_nome}</span>` : '';
        const preview = conv.last_message?.content
            ? `${conv.last_message.direction === 'outbound' ? '↪ ' : ''}${conv.last_message.content.substring(0, 60)}`
            : '(sem mensagens)';
        const temp = conv.gabi_temperatura ? tempBadge(conv.gabi_temperatura) : '';
        const isActive = _currentConvId === conv.id ? 'active' : '';

        return `<div class="wa-conv-item ${isActive}" onclick="window._waSelectConv('${conv.id}')">
            <div class="wa-conv-item-top">
                <span class="wa-conv-name">${nome}</span>
                <span class="wa-conv-time">${timeAgo(conv.last_message?.created_at || conv.opened_at)}</span>
            </div>
            <div class="wa-conv-preview">${preview}</div>
            <div class="wa-conv-meta">
                <span class="wa-phone-chip">+${conv.wa_phone_number}</span>
                ${empresa}
                ${temp}
            </div>
        </div>`;
    }).join('');
}

// ─── Render Chat Panel ─────────────────────────────────────────────────────────
function _renderChatPanel(conv) {
    const chatMain = document.getElementById('wa-chat-main');
    const chatEmpty = document.getElementById('wa-chat-empty');
    if (!chatMain || !chatEmpty) return;

    if (!conv) {
        chatEmpty.style.display = 'flex';
        chatMain.style.display = 'none';
        return;
    }

    chatEmpty.style.display = 'none';
    chatMain.style.display = 'flex';
    chatMain.style.flexDirection = 'column';
    chatMain.style.flex = '1';
    chatMain.style.overflow = 'hidden';

    const nome    = conv.contacts?.Nome_do_contato || conv.contact_nome || `+${conv.wa_phone_number}`;
    const empresa = conv.companies?.Nome_da_empresa || conv.company_nome || '';
    const isClosed = conv.status === 'closed';

    chatMain.innerHTML = `
        <div class="wa-chat-header">
            <div style="display:flex;align-items:center;gap:0.85rem;">
                <div style="width:38px;height:38px;border-radius:50%;background:rgba(37,211,102,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <i class="ph ph-user" style="color:#25D366;font-size:1.1rem;"></i>
                </div>
                <div class="wa-chat-header-info">
                    <div class="wa-chat-contact-name">${nome}${empresa ? ` <span style="font-size:0.75rem;color:#6366f1;font-weight:500;">· ${empresa}</span>` : ''}</div>
                    <div class="wa-chat-phone">+${conv.wa_phone_number}</div>
                </div>
            </div>
            <div class="wa-chat-actions">
                ${isClosed ? tempBadge(conv.gabi_temperatura || 'neutro') : ''}
                ${!isClosed ? `<button class="wa-btn wa-btn-close" id="wa-btn-close-conv" onclick="window._waAskClose()">
                    <i class="ph ph-x-circle"></i> Encerrar
                </button>` : ''}
            </div>
        </div>
        <div class="wa-messages" id="wa-messages-list">
            <div class="wa-loading"><div class="wa-spinner"></div> Carregando mensagens...</div>
        </div>
        ${!isClosed ? `
        <div class="wa-input-area">
            <textarea class="wa-input" id="wa-msg-input" placeholder="Digite sua mensagem..." rows="1"
                onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window._waSendMsg()}"
                oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"></textarea>
            <button class="wa-btn wa-btn-primary" onclick="window._waSendMsg()" id="wa-send-btn">
                <i class="ph ph-paper-plane-tilt"></i>
            </button>
        </div>` : `
        <div style="padding:0.75rem 1.25rem; background:rgba(0,0,0,0.2); display:flex; align-items:center; gap:0.5rem; font-size:0.8rem; color:var(--text-muted);">
            <i class="ph ph-lock-simple"></i>
            Conversa encerrada em ${conv.closed_at ? new Date(conv.closed_at).toLocaleString('pt-BR') : 'data desconhecida'}
        </div>`}
    `;
}

function _renderMessages() {
    const el = document.getElementById('wa-messages-list');
    if (!el) return;

    if (!_messages.length) {
        el.innerHTML = `<div class="wa-loading" style="flex-direction:column; gap:0.5rem;">
            <i class="ph ph-chat-circle-dots" style="font-size:2rem; opacity:0.2;"></i>
            <span>Nenhuma mensagem ainda.</span>
        </div>`;
        return;
    }

    el.innerHTML = _messages.map(msg => {
        const dir    = msg.direction;
        const isGabi = msg.origin === 'gabi';
        const originLabel = isGabi ? `<span class="wa-msg-origin-gabi">✦ Gabi</span>` : '';

        return `<div class="wa-msg ${dir}" data-origin="${msg.origin}">
            <div class="wa-msg-bubble">${msg.content.replace(/\n/g, '<br>')}</div>
            <div class="wa-msg-meta">${formatTime(msg.created_at)} ${originLabel}</div>
        </div>`;
    }).join('');

    // Scroll para o final
    el.scrollTop = el.scrollHeight;
}

// ─── API calls ────────────────────────────────────────────────────────────────
async function _loadConversations() {
    try {
        const resp = await _fetch(`/api/whatsapp/conversations?status=${_filterStatus}&limit=50`);
        if (!resp.ok) return;
        const data = await resp.json();
        _conversations = data.data || [];
        _renderConvList();
    } catch (err) {
        console.error('[WhatsApp HD] Erro ao carregar conversas:', err.message);
    }
}

async function _loadStats() {
    try {
        const resp = await _fetch('/api/whatsapp/stats');
        if (!resp.ok) return;
        const data = await resp.json();
        const costEl = document.getElementById('wa-stat-cost');
        const openEl = document.getElementById('wa-stat-open');
        if (costEl) costEl.textContent = `$${data.current_month_cost_usd}`;
        if (openEl) openEl.textContent = data.open_conversations ?? '—';
    } catch {}
}

async function _loadMessages(convId) {
    const el = document.getElementById('wa-messages-list');
    if (el) el.innerHTML = `<div class="wa-loading"><div class="wa-spinner"></div></div>`;

    try {
        const resp = await _fetch(`/api/whatsapp/conversations/${convId}/messages`);
        if (!resp.ok) return;
        const data = await resp.json();
        _messages = data.messages || [];
        _renderMessages();

        // Atualiza header com dados completos da conversa
        _renderChatPanel(data.conversation);
        _renderMessages(); // re-render after header is set
    } catch (err) {
        console.error('[WhatsApp HD] Erro ao carregar mensagens:', err.message);
    }
}

// ─── Ações ────────────────────────────────────────────────────────────────────
window._waSetFilter = function(status) {
    _filterStatus = status;
    ['open', 'closed', 'all'].forEach(s => {
        document.getElementById(`wa-tab-${s}`)?.classList.toggle('active', s === status);
    });
    _currentConvId = null;
    _renderChatPanel(null);
    _loadConversations();
};

window._waSelectConv = async function(convId) {
    _currentConvId = convId;
    _renderConvList(); // Atualiza seleção ativa
    await _loadMessages(convId);
};

window._waSendMsg = async function() {
    const input = document.getElementById('wa-msg-input');
    const text  = input?.value.trim();
    if (!text || !_currentConvId) return;

    const btn = document.getElementById('wa-send-btn');
    if (btn) btn.disabled = true;
    input.value = '';
    input.style.height = 'auto';

    try {
        const resp = await _fetch('/api/whatsapp/send', {
            method: 'POST',
            body: JSON.stringify({ conversationId: _currentConvId, text }),
        });
        const data = await resp.json();
        if (!resp.ok) {
            alert(`Erro ao enviar: ${data.error}`);
        } else {
            _messages.push(data.message);
            _renderMessages();
        }
    } catch (err) {
        console.error('[WhatsApp HD] Erro ao enviar:', err.message);
    } finally {
        if (btn) btn.disabled = false;
        input.focus();
    }
};

window._waAskClose = function() {
    const conv = _conversations.find(c => c.id === _currentConvId);
    const nome = conv?.contact_nome || `+${conv?.wa_phone_number}`;

    const overlay = document.createElement('div');
    overlay.className = 'wa-close-modal-overlay';
    overlay.id = 'wa-close-overlay';
    overlay.innerHTML = `
        <div class="wa-close-modal">
            <h3><i class="ph ph-sparkle" style="color:#a78bfa;"></i> Encerrar e Analisar com Gabi</h3>
            <p style="font-size:0.875rem; color:#8b98b4; margin:0 0 0.75rem;">
                Gabi irá analisar o transcript da conversa com <strong style="color:#e2e8f0;">${nome}</strong>,
                classificar a temperatura do cliente e criar uma atividade automaticamente.
            </p>
            <div id="wa-close-status" style="font-size:0.85rem; color:#a78bfa; display:flex; align-items:center; gap:0.5rem; min-height:28px;">
                Aguardando confirmação...
            </div>
            <div class="wa-close-modal-footer">
                <button class="wa-btn wa-btn-secondary" onclick="document.getElementById('wa-close-overlay')?.remove()">Cancelar</button>
                <button class="wa-btn wa-btn-primary" id="wa-confirm-close-btn" onclick="window._waConfirmClose()">
                    <i class="ph ph-check-circle"></i> Confirmar Encerramento
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
};

window._waConfirmClose = async function() {
    const statusEl = document.getElementById('wa-close-status');
    const btn      = document.getElementById('wa-confirm-close-btn');
    if (btn) btn.disabled = true;
    if (statusEl) statusEl.innerHTML = `<div class="wa-spinner"></div> Gabi está analisando o atendimento...`;

    try {
        const resp = await _fetch(`/api/whatsapp/conversations/${_currentConvId}/close`, {
            method: 'POST',
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);

        const { analise, activity } = data;
        const cfg = TEMP_CONFIG[analise.temperatura] || TEMP_CONFIG.neutro;

        if (statusEl) {
            statusEl.innerHTML = `
                <div style="width:100%;">
                    <div class="wa-gabi-result">
                        <div class="wa-gabi-result-title">✦ Análise Gabi</div>
                        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.6rem;">
                            ${tempBadge(analise.temperatura)}
                            <span style="font-size:0.8rem;color:#8b98b4;">${analise.temperatura_score}/5</span>
                        </div>
                        <div style="font-size:0.85rem;color:#e2e8f0;margin-bottom:0.5rem;">${analise.resumo}</div>
                        ${analise.acoes_sugeridas?.length ? `
                        <div style="font-size:0.75rem;color:#a78bfa;font-weight:700;margin-bottom:0.3rem;">Ações Sugeridas:</div>
                        <ul style="margin:0;padding-left:1.1rem;font-size:0.78rem;color:#8b98b4;">
                            ${analise.acoes_sugeridas.map(a => `<li>${a}</li>`).join('')}
                        </ul>` : ''}
                    </div>
                    <div style="font-size:0.8rem;color:#10b981;display:flex;align-items:center;gap:0.4rem;">
                        <i class="ph ph-check-circle"></i>
                        Atividade criada: <strong>${activity?.title || 'Chamados HD'}</strong>
                    </div>
                </div>
            `;
        }
        if (btn) {
            btn.textContent = 'Fechar';
            btn.disabled = false;
            btn.onclick = () => {
                document.getElementById('wa-close-overlay')?.remove();
                // Atualiza lista de conversas
                _currentConvId = null;
                _renderChatPanel(null);
                _loadConversations();
                _loadStats();
            };
        }
    } catch (err) {
        if (statusEl) statusEl.innerHTML = `<span style="color:#ef4444;">❌ Erro: ${err.message}</span>`;
        if (btn) { btn.disabled = false; }
    }
};

// ─── SSE ──────────────────────────────────────────────────────────────────────
async function _connectSSE() {
    if (_sseSource) {
        _sseSource.close();
        _sseSource = null;
    }

    const token = await getAuthToken();
    const url   = `/api/whatsapp/stream${token ? `?token=${token}` : ''}`;

    // Usa fetch SSE (compatível com Clerk Auth Bearer)
    // Fallback: EventSource não suporta headers customizados
    _sseSource = new EventSource(url);

    const statusDot = document.getElementById('wa-sse-status');

    _sseSource.onopen = () => {
        if (statusDot) { statusDot.style.background = '#22c55e'; statusDot.title = 'Conectado ao stream'; }
        console.log('[WhatsApp HD] SSE conectado');
    };

    _sseSource.onmessage = (evt) => {
        try {
            const data = JSON.parse(evt.data);
            if (data.type === 'new_message') {
                // Atualiza conversa na lista
                _loadConversations();
                // Se é a conversa aberta, adiciona mensagem
                if (data.conversationId === _currentConvId) {
                    _messages.push(data.message);
                    _renderMessages();
                }
            } else if (data.type === 'conversation_closed') {
                _loadConversations();
                if (data.conversationId === _currentConvId) {
                    _loadMessages(_currentConvId);
                }
            }
        } catch {}
    };

    _sseSource.onerror = () => {
        if (statusDot) { statusDot.style.background = '#f59e0b'; statusDot.title = 'Reconectando...'; }
        // EventSource reconecta automaticamente
    };
}

// ─── Init ─────────────────────────────────────────────────────────────────────
async function init() {
    _injectStyles();
    _renderRoot();
    await _loadConversations();
    await _loadStats();
    await _connectSSE();
    _initialized = true;
}

// ─── Expose ───────────────────────────────────────────────────────────────────
window.whatsappInbox = { init };

// Auto-init se a view já estiver visível (caso raro)
document.addEventListener('DOMContentLoaded', () => {
    // A nav.js chama init() via onclick no nav-item
});
