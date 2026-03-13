/**
 * ============================================================================
 * Gabi — AI Assistant do Journey CRM
 * ============================================================================
 * Interface de chat premium com:
 * - Avatar personalizado da Gabi
 * - Streaming de texto (word-by-word fallback)
 * - Histórico de conversa por sessão
 * - Reasoning indicator
 * - Quick actions
 * - Markdown rendering
 * ============================================================================
 */

// ── Estado interno ────────────────────────────────────────────────────────────
let _isOpen        = false;
let _isThinking    = false;
let _history       = [];       // histórico da sessão [{role, content}]
let _streamTimer   = null;
let _pendingImage  = null;     // { base64, mimeType, preview } — imagem aguardando envio
const MAX_HISTORY  = 20;       // máximo de mensagens no histórico

// ── Quick actions sugeridas ───────────────────────────────────────────────────
const QUICK_ACTIONS = [
    { icon: 'ph-calendar-check', label: 'Minhas reuniões da semana' },
    { icon: 'ph-warning-octagon', label: 'Tarefas atrasadas' },
    { icon: 'ph-chart-line-up',   label: 'Resumo do CRM hoje' },
    { icon: 'ph-buildings',       label: 'Clientes em risco' },
    { icon: 'ph-question',        label: 'Como criar uma atividade?' },
    { icon: 'ph-heart',           label: 'Clientes com NPS baixo' },
];

// ── Inicialização ─────────────────────────────────────────────────────────────
export function initGabi() {
    _injectStyles();
    _injectHTML();
    _bindEvents();
}

// ── Toggle do painel ──────────────────────────────────────────────────────────
export function toggleGabi() {
    _isOpen ? _closePanel() : _openPanel();
}

function _openPanel() {
    _isOpen = true;
    const panel = document.getElementById('gabi-panel');
    const fab   = document.getElementById('gabi-fab');
    if (panel) { panel.classList.add('gabi-open'); panel.setAttribute('aria-hidden', 'false'); }
    if (fab)   { fab.classList.add('gabi-fab-active'); }

    // Foca o input
    setTimeout(() => document.getElementById('gabi-input')?.focus(), 350);

    // Se histórico vazio, mostra boas-vindas
    if (_history.length === 0) _showWelcome();
}

function _closePanel() {
    _isOpen = false;
    const panel = document.getElementById('gabi-panel');
    const fab   = document.getElementById('gabi-fab');
    if (panel) { panel.classList.remove('gabi-open'); panel.setAttribute('aria-hidden', 'true'); }
    if (fab)   fab.classList.remove('gabi-fab-active');
}

// ── Boas-vindas ───────────────────────────────────────────────────────────────
function _showWelcome() {
    const msgs = document.getElementById('gabi-messages');
    if (!msgs) return;

    const userName = window.__usuarioAtual?.nome?.split(' ')[0] || 'você';
    msgs.innerHTML = `
        <div class="gabi-welcome">
            <div class="gabi-welcome-avatar">
                <img src="/assets/gabi-avatar-v2.png" alt="Gabi" class="gabi-avatar-img">
                <span class="gabi-status-dot"></span>
            </div>
            <div class="gabi-welcome-text">
                <h3>Olá, ${userName}! Sou a Gabi 👋</h3>
                <p>Sua assistente de IA do Journey. Posso consultar dados em tempo real, responder dúvidas sobre o sistema e ajudar no dia a dia do time.</p>
            </div>
        </div>
        <div class="gabi-quick-actions">
            ${QUICK_ACTIONS.map(a => `
                <button class="gabi-quick-btn" data-msg="${a.label}">
                    <i class="ph ${a.icon}"></i>
                    <span>${a.label}</span>
                </button>
            `).join('')}
        </div>
    `;

    // Bind quick actions
    msgs.querySelectorAll('.gabi-quick-btn').forEach(btn => {
        btn.addEventListener('click', () => sendMessage(btn.dataset.msg));
    });
}

// ── Imagem pendente ───────────────────────────────────────────────────────────
function _setPendingImage(base64, mimeType, previewUrl) {
    _pendingImage = { base64, mimeType, preview: previewUrl };
    const preview = document.getElementById('gabi-image-preview');
    if (preview) {
        preview.innerHTML = `
            <div class="gabi-img-preview-wrap">
                <img src="${previewUrl}" alt="Imagem anexada" class="gabi-img-preview-thumb">
                <button class="gabi-img-remove-btn" id="gabi-img-remove" title="Remover imagem">
                    <i class="ph ph-x"></i>
                </button>
            </div>
        `;
        preview.style.display = 'block';
        document.getElementById('gabi-img-remove')?.addEventListener('click', _clearPendingImage);
        // Atualiza placeholder do textarea
        const ta = document.getElementById('gabi-input');
        if (ta) ta.placeholder = 'Descreva o que quer saber sobre a imagem...';
    }
}

function _clearPendingImage() {
    _pendingImage = null;
    const preview = document.getElementById('gabi-image-preview');
    if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
    const ta = document.getElementById('gabi-input');
    if (ta) ta.placeholder = 'Pergunte qualquer coisa ou cole uma imagem (Ctrl+V)...';
}

function _processImageFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const dataUrl = e.target.result;
        // dataUrl: "data:image/png;base64,AAAA..."
        const [header, base64] = dataUrl.split(',');
        const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
        _setPendingImage(base64, mimeType, dataUrl);
    };
    reader.readAsDataURL(file);
}

// ── Enviar mensagem ───────────────────────────────────────────────────────────
export async function sendMessage(text) {
    const raw = (text || document.getElementById('gabi-input')?.value || '').trim();
    const hasImage = !!_pendingImage;
    if ((!raw && !hasImage) || _isThinking) return;

    // Captura imagem antes de limpar
    const imageToBeSent = _pendingImage ? { ...  _pendingImage } : null;

    // Limpa input e preview
    const input = document.getElementById('gabi-input');
    if (input) { input.value = ''; input.style.height = 'auto'; }
    _clearPendingImage();

    // Mensagem displayável
    const displayText = raw || '📷 Imagem enviada para análise';

    // Renderiza mensagem do usuário (com preview se houver imagem)
    _appendMessage('user', displayText, imageToBeSent?.preview);
    _history.push({ role: 'user', content: displayText });

    // Mostra thinking
    _showThinking();

    try {
        const res = await fetch('/api/gabi/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...await _getAuthHeaders(),
            },
            body: JSON.stringify({
                message: raw || 'Analise esta imagem.',
                history:  _history.slice(-MAX_HISTORY).slice(0, -1), // sem a última (acabamos de adicionar)
                image: imageToBeSent ? { base64: imageToBeSent.base64, mimeType: imageToBeSent.mimeType } : undefined,
            }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
            throw new Error(err.error || `Erro ${res.status}`);
        }

        const data = await res.json();
        _hideThinking();

        if (data.reply) {
            await _appendMessageAnimated('assistant', data.reply);
            _history.push({ role: 'assistant', content: data.reply });
            // Trunca histórico
            if (_history.length > MAX_HISTORY) _history = _history.slice(-MAX_HISTORY);
        }

        // Se a Gabi criou/atualizou atividades, notifica o board para recarregar
        if (data.activityChanged) {
            window.dispatchEvent(new CustomEvent('journey:activity-changed', {
                detail: { source: 'gabi', actions: data.actionsPerformed || [] }
            }));
        }

        // Se a Gabi criou/atualizou/excluiu empresas, atualiza state.companies
        if (data.companyChanged) {
            _refreshCompaniesInState(data.companiesAffected || []);
        }

        // Se a Gabi executou ações que geram audit log, notifica o Histórico
        if (data.actionsPerformed?.length > 0) {
            // Delay de 1.5s para garantir que o backend registrou o audit log
            setTimeout(() => window.auditLog?.notifyChange?.(), 1500);
        }

        // ── Auto-start timer quando pedido junto com criação de atividade ────────
        // Detecta palavras-chave de timer na mensagem do usuário
        const timerKeywords = /timer|cronômetro|cronometro|crono|tempo\s+inicia|iniciar\s+tempo|com\s+timer/i;
        if (timerKeywords.test(raw)) {
            // Pega a primeira atividade criada nessa resposta
            const createdAct = (data.actionsPerformed || []).find(a => a.tool === 'create_activity' && a.id);
            if (createdAct) {
                // Extrai o título da resposta (se disponível) ou usa genérico
                const titleMatch = data.reply?.match(/\[([^\]]+)\]\(#gabi-open\/activity\//);
                const actTitle = titleMatch ? titleMatch[1] : 'Atividade via Gabi';
                // Importa o global-timer dinamicamente para não criar dependência circular
                import('../core/global-timer.js').then(gt => {
                    // Se já há um timer rodando para OUTRA atividade, não substitui
                    const current = gt.getTimerState();
                    if (current.state !== 'idle' && current.activityId !== createdAct.id) return;
                    gt.startTimer(createdAct.id, actTitle, 0);
                    // Toast informativo
                    if (window.utils?.showToast) {
                        window.utils.showToast('⏱ Cronômetro iniciado automaticamente pela Gabi!', 'success');
                    }
                }).catch(() => {});
            }
        }

    } catch (err) {
        _hideThinking();
        _appendMessage('assistant', `⚠️ **Erro ao conectar com a Gabi:** ${err.message}\n\nVerifique se a chave Gemini está configurada em Configurações.`);
    }
}

// ── Append de mensagem (instantâneo) ─────────────────────────────────────────
function _appendMessage(role, content, imagePreviewUrl = null) {
    const msgs = document.getElementById('gabi-messages');
    if (!msgs) return;

    // Remove boas-vindas se ainda visível
    const welcome = msgs.querySelector('.gabi-welcome');
    if (welcome) welcome.closest('.gabi-welcome')?.parentElement === msgs && welcome.remove();

    const div = document.createElement('div');
    div.className = `gabi-msg gabi-msg-${role}`;

    const isUser = role === 'user';
    const imageHtml = imagePreviewUrl
        ? `<div class="gabi-msg-image-wrap"><img src="${imagePreviewUrl}" alt="Imagem enviada" class="gabi-msg-image"></div>`
        : '';

    div.innerHTML = `
        ${!isUser ? `<div class="gabi-msg-avatar"><img src="/assets/gabi-avatar-v2.png" alt="Gabi"></div>` : ''}
        <div class="gabi-msg-bubble">
            ${imageHtml}
            <div class="gabi-msg-content">${_renderMarkdown(content)}</div>
            <div class="gabi-msg-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        ${isUser ? `<div class="gabi-msg-avatar gabi-msg-avatar-user">${_getUserInitials()}</div>` : ''}
    `;

    msgs.appendChild(div);
    _scrollToBottom();
    // Bind links internos
    div.querySelectorAll('.gabi-link-internal').forEach(a => {
        a.addEventListener('click', _handleGabiLinkClick);
    });
    return div;
}

// ── Append animado (word-by-word para sensação de streaming) ──────────────────
async function _appendMessageAnimated(role, content) {
    const msgs = document.getElementById('gabi-messages');
    if (!msgs) return;

    const div = document.createElement('div');
    div.className = `gabi-msg gabi-msg-${role}`;
    div.innerHTML = `
        <div class="gabi-msg-avatar"><img src="/assets/gabi-avatar-v2.png" alt="Gabi"></div>
        <div class="gabi-msg-bubble">
            <div class="gabi-msg-content" id="gabi-stream-content"></div>
            <div class="gabi-msg-time">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
    `;
    msgs.appendChild(div);
    _scrollToBottom();

    const contentEl = div.querySelector('#gabi-stream-content');

    // Anima word-by-word apenas se o conteúdo for longo (>100 chars)
    // Para respostas curtas, exibe instantaneamente
    if (content.length < 100) {
        contentEl.innerHTML = _renderMarkdown(content);
        return;
    }

    // Word-by-word animation
    const words = content.split(/(\s+)/);
    let displayed = '';
    const delay   = Math.max(10, Math.min(40, 2000 / words.length)); // adaptativo

    for (const word of words) {
        displayed += word;
        contentEl.innerHTML = _renderMarkdown(displayed + '▋');
        _scrollToBottom();
        await new Promise(r => setTimeout(r, delay));
    }
    contentEl.innerHTML = _renderMarkdown(content);
    // Bind links internos após animação
    contentEl.querySelectorAll('.gabi-link-internal').forEach(a => {
        a.addEventListener('click', _handleGabiLinkClick);
    });
}

// ── Thinking indicator ────────────────────────────────────────────────────────
function _showThinking() {
    _isThinking = true;
    const msgs  = document.getElementById('gabi-messages');
    const input = document.getElementById('gabi-input');
    const btn   = document.getElementById('gabi-send-btn');

    if (input) input.disabled = true;
    if (btn)   { btn.disabled = true; btn.innerHTML = '<i class="ph ph-stop-circle"></i>'; }

    const thinking = document.createElement('div');
    thinking.id    = 'gabi-thinking';
    thinking.className = 'gabi-msg gabi-msg-assistant';
    thinking.innerHTML = `
        <div class="gabi-msg-avatar"><img src="/assets/gabi-avatar-v2.png" alt="Gabi"></div>
        <div class="gabi-msg-bubble gabi-thinking-bubble">
            <div class="gabi-thinking-content">
                <div class="gabi-reasoning-badge"><i class="ph ph-brain"></i> Analisando...</div>
                <div class="gabi-dots"><span></span><span></span><span></span></div>
            </div>
        </div>
    `;
    msgs?.appendChild(thinking);
    _scrollToBottom();
}

function _hideThinking() {
    _isThinking = false;
    document.getElementById('gabi-thinking')?.remove();
    const input = document.getElementById('gabi-input');
    const btn   = document.getElementById('gabi-send-btn');
    if (input) { input.disabled = false; input.focus(); }
    if (btn)   { btn.disabled = false; btn.innerHTML = '<i class="ph ph-paper-plane-tilt"></i>'; }
}

// ── Markdown renderer (com suporte a links) ───────────────────────────────────
function _renderMarkdown(text) {
    if (!text) return '';
    return text
        // Escape HTML primeiro
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        // Headers
        .replace(/^### (.+)$/gm, '<h4 class="gabi-md-h4">$1</h4>')
        .replace(/^## (.+)$/gm, '<h3 class="gabi-md-h3">$1</h3>')
        .replace(/^# (.+)$/gm, '<h2 class="gabi-md-h2">$1</h2>')
        // Bold e italic
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        // Code
        .replace(/`([^`]+)`/g, '<code class="gabi-md-code">$1</code>')
        // Links markdown [texto](url) — internos (#gabi-open/...) ou externos
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
            const isInternal = url.startsWith('#gabi-open/');
            if (isInternal) {
                return `<a href="javascript:void(0)" class="gabi-link gabi-link-internal" data-gabi-href="${url}" title="Abrir no Journey"><i class="ph ph-arrow-square-out" style="font-size:0.8em;margin-right:3px;"></i>${label}</a>`;
            }
            return `<a href="${url}" target="_blank" rel="noopener" class="gabi-link">${label} <i class="ph ph-arrow-square-out" style="font-size:0.8em;"></i></a>`;
        })
        // Listas não-ordenadas
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>\n?)+/g, '<ul class="gabi-md-ul">$&</ul>')
        // Linhas horizontais
        .replace(/^---$/gm, '<hr class="gabi-md-hr">')
        // Quebras de linha duplas → parágrafo
        .replace(/\n\n+/g, '</p><p class="gabi-md-p">')
        // Quebras simples
        .replace(/\n/g, '<br>')
        // Wrapping inicial
        .replace(/^/, '<p class="gabi-md-p">')
        .replace(/$/, '</p>');
}

// ── Handler de links internos da Gabi ─────────────────────────────────────────
function _handleGabiLinkClick(e) {
    const link = e.target.closest('.gabi-link-internal');
    if (!link) return;
    e.preventDefault();
    const href = link.dataset.gabiHref || '';
    // Formato: #gabi-open/activity/ID ou #gabi-open/company/ID
    const match = href.match(/^#gabi-open\/(activity|company)\/(.+)$/);
    if (!match) return;
    const [, type, id] = match;
    if (type === 'activity') {
        // Navega para Minhas Tarefas e abre o drawer da atividade
        // Usa os módulos já carregados via window, com fallback para import
        if (window.tasksBoard && window.nav) {
            window.nav.switchView('minhas-tarefas');
            window.tasksBoard.initTasksBoard().then(() => {
                setTimeout(() => window.tasksBoard.openActivityDetail(id), 350);
            }).catch(() => setTimeout(() => window.tasksBoard.openActivityDetail(id), 350));
        } else {
            import('./tasks-board.js').then(tb => {
                import('./navigation.js').then(nav => {
                    nav.switchView('minhas-tarefas');
                    tb.initTasksBoard().then(() => {
                        setTimeout(() => tb.openActivityDetail(id), 350);
                    }).catch(() => setTimeout(() => tb.openActivityDetail(id), 350));
                });
            });
        }
    } else if (type === 'company') {
        // Abre o formulário da empresa
        if (window.nav) {
            window.nav.switchView('company-list');
            setTimeout(() => window.nav.openCompanyForm(id), 400);
        } else {
            import('./navigation.js').then(nav => {
                nav.switchView('company-list');
                setTimeout(() => nav.openCompanyForm(id), 400);
            });
        }
    }
}

// ── Scroll ────────────────────────────────────────────────────────────────────
function _scrollToBottom() {
    const msgs = document.getElementById('gabi-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

// ── Atualiza empresas no state após ação da Gabi ──────────────────────────────
async function _refreshCompaniesInState(affectedIds = []) {
    try {
        // Importa state e api de forma dinâmica para evitar dependência circular
        const [{ state }, { api }, uiMod, navMod] = await Promise.all([
            import('./state.js'),
            import('./api.js'),
            import('./ui.js'),
            import('./navigation.js'),
        ]);

        // Recarrega lista completa de empresas do servidor
        const companies = await api.getCompanies();
        if (!companies) return;

        state.companies = companies;

        // Re-renderiza a lista de empresas
        if (uiMod?.renderCompanyList) uiMod.renderCompanyList();

        // Se o formulário de empresa estiver aberto para uma das empresas afetadas,
        // recarrega o formulário com os dados novos (sem fechar a tela)
        if (affectedIds.length > 0 && navMod?.openCompanyForm) {
            const currentId = document.getElementById('company-id')?.value;
            if (currentId && affectedIds.includes(currentId)) {
                // Pequeno delay para garantir que state.companies já foi atualizado
                setTimeout(() => navMod.openCompanyForm(currentId), 100);
            }
        }
    } catch (err) {
        console.warn('[Gabi] Não foi possível atualizar state.companies:', err.message);
    }
}


// ── Auth headers ──────────────────────────────────────────────────────────────
async function _getAuthHeaders() {
    try {
        if (window.Clerk?.session) {
            const token = await window.Clerk.session.getToken();
            if (token) return { Authorization: `Bearer ${token}` };
        }
    } catch {}
    return {};
}

// ── Iniciais do usuário ───────────────────────────────────────────────────────
function _getUserInitials() {
    const user = window.__usuarioAtual;
    if (user?.avatar) return user.avatar;
    if (user?.nome) return user.nome.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
    return 'U';
}

// ── Limpar conversa ───────────────────────────────────────────────────────────
function _clearChat() {
    _history = [];
    const msgs = document.getElementById('gabi-messages');
    if (msgs) msgs.innerHTML = '';
    _showWelcome();
}

// ── Bind de eventos ───────────────────────────────────────────────────────────
function _bindEvents() {
    // FAB
    document.getElementById('gabi-fab')?.addEventListener('click', toggleGabi);

    // Fechar painel
    document.getElementById('gabi-close-btn')?.addEventListener('click', _closePanel);

    // Enviar
    document.getElementById('gabi-send-btn')?.addEventListener('click', () => sendMessage());

    // Enter para enviar, Shift+Enter para nova linha
    document.getElementById('gabi-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Auto-resize do textarea
    document.getElementById('gabi-input')?.addEventListener('input', (e) => {
        const el = e.target;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    });

    // Limpar chat
    document.getElementById('gabi-clear-btn')?.addEventListener('click', _clearChat);

    // Colar imagem (Ctrl+V no textarea)
    document.getElementById('gabi-input')?.addEventListener('paste', (e) => {
        const items = e.clipboardData?.items || [];
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                _processImageFile(item.getAsFile());
                return;
            }
        }
    });

    // Upload via botão
    document.getElementById('gabi-img-input')?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) _processImageFile(file);
        // Reseta o input para permitir selecionar o mesmo arquivo novamente
        e.target.value = '';
    });
    document.getElementById('gabi-img-btn')?.addEventListener('click', () => {
        document.getElementById('gabi-img-input')?.click();
    });

    // ── Drag & Drop no painel da Gabi ────────────────────────────────────────
    const panel = document.getElementById('gabi-panel');
    if (panel) {
        let _dragCounter = 0; // conta entradas/saídas de filhos para evitar flicker

        panel.addEventListener('dragenter', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Só mostra overlay se houver arquivo de imagem no drag
            const hasImg = [...(e.dataTransfer?.items || [])].some(i => i.kind === 'file' && i.type.startsWith('image/'));
            if (!hasImg) return;
            _dragCounter++;
            panel.classList.add('gabi-drag-over');
        });

        panel.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
        });

        panel.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            _dragCounter--;
            if (_dragCounter <= 0) {
                _dragCounter = 0;
                panel.classList.remove('gabi-drag-over');
            }
        });

        panel.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            _dragCounter = 0;
            panel.classList.remove('gabi-drag-over');
            const files = [...(e.dataTransfer?.files || [])];
            const imgFile = files.find(f => f.type.startsWith('image/'));
            if (imgFile) _processImageFile(imgFile);
        });
    }

    // Fechar ao clicar fora (no overlay)
    document.addEventListener('click', (e) => {
        if (!_isOpen) return;
        const panel = document.getElementById('gabi-panel');
        const fab   = document.getElementById('gabi-fab');
        if (panel && !panel.contains(e.target) && fab && !fab.contains(e.target)) {
            _closePanel();
        }
    });

    // ESC para fechar
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _isOpen) _closePanel();
    });
}

// ── Inject HTML ───────────────────────────────────────────────────────────────
function _injectHTML() {
    const existing = document.getElementById('gabi-panel');
    if (existing) return;

    // FAB button
    const fab = document.createElement('button');
    fab.id = 'gabi-fab';
    fab.className = 'gabi-fab';
    fab.setAttribute('aria-label', 'Abrir Gabi AI');
    fab.setAttribute('title', 'Gabi — Assistente de IA');
    fab.innerHTML = `
        <div class="gabi-fab-inner">
            <img src="/assets/gabi-avatar-v2.png" alt="Gabi" class="gabi-fab-avatar">
            <span class="gabi-fab-pulse"></span>
        </div>
        <span class="gabi-fab-label">Gabi AI</span>
    `;
    document.body.appendChild(fab);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'gabi-panel';
    panel.className = 'gabi-panel';
    panel.setAttribute('aria-hidden', 'true');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Gabi — Assistente de IA');
    panel.innerHTML = `
        <!-- Header -->
        <div class="gabi-header">
            <div class="gabi-header-left">
                <div class="gabi-header-avatar">
                    <img src="/assets/gabi-avatar-v2.png" alt="Gabi">
                    <span class="gabi-status-dot"></span>
                </div>
                <div>
                    <div class="gabi-header-name">Gabi</div>
                    <div class="gabi-header-status">
                        <span class="gabi-status-indicator"></span>
                        Assistente de IA · Journey
                    </div>
                </div>
            </div>
            <div class="gabi-header-actions">
                <button class="gabi-icon-btn" id="gabi-clear-btn" title="Limpar conversa">
                    <i class="ph ph-eraser"></i>
                </button>
                <button class="gabi-icon-btn" id="gabi-close-btn" title="Fechar">
                    <i class="ph ph-x"></i>
                </button>
            </div>
        </div>

        <!-- Messages -->
        <div class="gabi-messages" id="gabi-messages"></div>

        <!-- Drag & Drop overlay (visível apenas ao arrastar imagem) -->
        <div class="gabi-drag-overlay" id="gabi-drag-overlay">
            <div class="gabi-drag-overlay-inner">
                <i class="ph ph-image-square"></i>
                <span>Solte a imagem aqui</span>
            </div>
        </div>

        <!-- Input area -->
        <div class="gabi-input-area">
            <!-- Preview da imagem pendente -->
            <div class="gabi-image-preview" id="gabi-image-preview" style="display:none"></div>
            <div class="gabi-input-wrapper">
                <!-- Botão de imagem -->
                <button id="gabi-img-btn" class="gabi-img-btn" title="Anexar imagem (ou cole com Ctrl+V)">
                    <i class="ph ph-image"></i>
                </button>
                <input type="file" id="gabi-img-input" accept="image/*" style="display:none">
                <textarea
                    id="gabi-input"
                    class="gabi-textarea"
                    placeholder="Pergunte qualquer coisa ou cole uma imagem (Ctrl+V)..."
                    rows="1"
                    maxlength="2000"
                ></textarea>
                <button id="gabi-send-btn" class="gabi-send-btn" title="Enviar (Enter)">
                    <i class="ph ph-paper-plane-tilt"></i>
                </button>
            </div>
            <div class="gabi-footer-hint">
                <i class="ph ph-sparkle"></i> Powered by Gemini 2.5 Flash · <kbd>Enter</kbd> para enviar · <i class="ph ph-image"></i> Cole imagens com Ctrl+V
            </div>
        </div>
    `;
    document.body.appendChild(panel);
}

// ── Inject Styles ─────────────────────────────────────────────────────────────
function _injectStyles() {
    if (document.getElementById('gabi-styles')) return;
    const style = document.createElement('style');
    style.id = 'gabi-styles';
    style.textContent = `
/* ── Gabi FAB ─────────────────────────────────────────────────────────── */
.gabi-fab {
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    z-index: 8000;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1);
}
.gabi-fab:hover { transform: scale(1.08) translateY(-2px); }
.gabi-fab-active .gabi-fab-inner { box-shadow: 0 0 0 4px rgba(99,102,241,0.4), 0 8px 32px rgba(99,102,241,0.5); }

.gabi-fab-inner {
    width: 90px;
    height: 90px;
    border-radius: 50%;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    box-shadow: 0 4px 20px rgba(99,102,241,0.45), 0 2px 8px rgba(0,0,0,0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: box-shadow 0.3s;
    overflow: hidden;
}
.gabi-fab-avatar {
    width: 84px;
    height: 84px;
    border-radius: 50%;
    object-fit: cover;
}
.gabi-fab-pulse {
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    border: 2px solid rgba(99,102,241,0.6);
    animation: gabi-pulse 2s ease-in-out infinite;
}
@keyframes gabi-pulse {
    0%, 100% { opacity: 0.8; transform: scale(1); }
    50%       { opacity: 0.3; transform: scale(1.15); }
}
.gabi-fab-label {
    font-family: 'Plus Jakarta Sans', 'DM Sans', sans-serif;
    font-size: 0.65rem;
    font-weight: 700;
    color: #8b98b4;
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

/* ── Gabi Panel ───────────────────────────────────────────────────────── */
.gabi-panel {
    position: fixed;
    bottom: 6rem;
    right: 2rem;
    width: 420px;
    max-height: 72vh;
    z-index: 8001;
    display: flex;
    flex-direction: column;
    background: linear-gradient(160deg, rgba(13,17,30,0.98) 0%, rgba(17,22,40,0.98) 100%);
    border: 1px solid rgba(99,102,241,0.25);
    border-radius: 20px;
    box-shadow: 0 24px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(99,102,241,0.1), 0 0 80px rgba(99,102,241,0.08);
    backdrop-filter: blur(20px);
    transform: scale(0.92) translateY(20px);
    opacity: 0;
    pointer-events: none;
    transition: transform 0.35s cubic-bezier(0.34,1.56,0.64,1), opacity 0.25s ease;
    font-family: 'Plus Jakarta Sans', 'DM Sans', sans-serif;
    overflow: hidden;
}
.gabi-panel.gabi-open {
    transform: scale(1) translateY(0);
    opacity: 1;
    pointer-events: all;
}

/* ── Drag & Drop ──────────────────────────────────────────────────────── */
.gabi-panel.gabi-drag-over {
    border-color: rgba(99,102,241,0.8) !important;
    box-shadow: 0 0 0 3px rgba(99,102,241,0.3), 0 24px 60px rgba(0,0,0,0.55) !important;
}
.gabi-drag-overlay {
    display: none;
    position: absolute;
    inset: 0;
    z-index: 20;
    background: rgba(10,13,30,0.88);
    backdrop-filter: blur(6px);
    border-radius: 20px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    pointer-events: none;
}
.gabi-panel.gabi-drag-over .gabi-drag-overlay {
    display: flex;
}
.gabi-drag-overlay-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    animation: gabi-fadeIn 0.15s ease;
}
.gabi-drag-overlay-inner i {
    font-size: 3rem;
    color: #818cf8;
    animation: gabi-drag-bounce 0.7s ease-in-out infinite alternate;
}
.gabi-drag-overlay-inner span {
    font-size: 1rem;
    font-weight: 700;
    color: #c7d2fe;
    letter-spacing: -0.01em;
}
@keyframes gabi-drag-bounce {
    from { transform: translateY(0); }
    to   { transform: translateY(-10px); }
}

/* ── Header ───────────────────────────────────────────────────────────── */
.gabi-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    background: linear-gradient(90deg, rgba(99,102,241,0.08) 0%, transparent 100%);
    flex-shrink: 0;
}
.gabi-header-left { display: flex; align-items: center; gap: 0.75rem; }
.gabi-header-avatar {
    position: relative;
    width: 63px;
    height: 63px;
    border-radius: 50%;
    overflow: visible;
}
.gabi-header-avatar img {
    width: 63px;
    height: 63px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(99,102,241,0.5);
}
.gabi-status-dot {
    position: absolute;
    bottom: 1px;
    right: 1px;
    width: 10px;
    height: 10px;
    background: #10b981;
    border-radius: 50%;
    border: 2px solid rgba(13,17,30,0.98);
    animation: gabi-dot-blink 2s ease-in-out infinite;
}
@keyframes gabi-dot-blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.5; }
}
.gabi-header-name {
    font-weight: 700;
    font-size: 0.95rem;
    color: #e2e8f0;
    letter-spacing: -0.01em;
}
.gabi-header-status {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.72rem;
    color: #64748b;
}
.gabi-status-indicator {
    width: 6px;
    height: 6px;
    background: #10b981;
    border-radius: 50%;
}
.gabi-header-actions { display: flex; gap: 0.25rem; }
.gabi-icon-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: rgba(255,255,255,0.05);
    border-radius: 8px;
    color: #64748b;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    transition: all 0.2s;
}
.gabi-icon-btn:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }

/* ── Messages ─────────────────────────────────────────────────────────── */
.gabi-messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    scroll-behavior: smooth;
}
.gabi-messages::-webkit-scrollbar { width: 4px; }
.gabi-messages::-webkit-scrollbar-track { background: transparent; }
.gabi-messages::-webkit-scrollbar-thumb { background: rgba(99,102,241,0.3); border-radius: 2px; }

/* ── Welcome ──────────────────────────────────────────────────────────── */
.gabi-welcome {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 1rem;
    background: rgba(99,102,241,0.06);
    border: 1px solid rgba(99,102,241,0.15);
    border-radius: 16px;
    animation: gabi-fadeIn 0.4s ease;
}
.gabi-welcome-avatar {
    position: relative;
    flex-shrink: 0;
}
.gabi-welcome-avatar img {
    width: 78px;
    height: 78px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(99,102,241,0.4);
}
.gabi-welcome-text h3 {
    margin: 0 0 0.4rem;
    font-size: 0.95rem;
    font-weight: 700;
    color: #e2e8f0;
}
.gabi-welcome-text p {
    margin: 0;
    font-size: 0.82rem;
    color: #8b98b4;
    line-height: 1.5;
}

/* ── Quick actions ────────────────────────────────────────────────────── */
.gabi-quick-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    animation: gabi-fadeIn 0.5s ease;
}
.gabi-quick-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 0.75rem;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 10px;
    color: #94a3b8;
    font-size: 0.75rem;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    line-height: 1.3;
}
.gabi-quick-btn:hover {
    background: rgba(99,102,241,0.1);
    border-color: rgba(99,102,241,0.3);
    color: #e2e8f0;
    transform: translateY(-1px);
}
.gabi-quick-btn i { font-size: 1rem; color: #6366f1; flex-shrink: 0; }

/* ── Mensagens ────────────────────────────────────────────────────────── */
.gabi-msg {
    display: flex;
    align-items: flex-end;
    gap: 0.6rem;
    animation: gabi-slideIn 0.3s ease;
}
.gabi-msg-assistant { flex-direction: row; }
.gabi-msg-user      { flex-direction: row-reverse; }

.gabi-msg-avatar {
    width: 45px;
    height: 45px;
    border-radius: 50%;
    flex-shrink: 0;
    overflow: hidden;
}
.gabi-msg-avatar img { width: 100%; height: 100%; object-fit: cover; }
.gabi-msg-avatar-user {
    background: linear-gradient(135deg, #4f46e5, #6d28d9);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.65rem;
    font-weight: 700;
    color: #fff;
    font-family: inherit;
}

.gabi-msg-bubble {
    max-width: 85%;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}
.gabi-msg-assistant .gabi-msg-bubble { align-items: flex-start; }
.gabi-msg-user      .gabi-msg-bubble { align-items: flex-end; }

.gabi-msg-content {
    padding: 0.75rem 1rem;
    border-radius: 16px;
    font-size: 0.84rem;
    line-height: 1.6;
    color: #e2e8f0;
    word-break: break-word;
}
.gabi-msg-assistant .gabi-msg-content {
    background: rgba(30,41,60,0.8);
    border: 1px solid rgba(255,255,255,0.07);
    border-bottom-left-radius: 4px;
}
.gabi-msg-user .gabi-msg-content {
    background: linear-gradient(135deg, rgba(79,70,229,0.55), rgba(109,40,217,0.45));
    border: 1px solid rgba(99,102,241,0.3);
    border-bottom-right-radius: 4px;
    color: #f1f5f9;
}

.gabi-msg-time {
    font-size: 0.65rem;
    color: #475569;
    padding: 0 0.25rem;
}

/* ── Thinking ─────────────────────────────────────────────────────────── */
.gabi-thinking-bubble .gabi-msg-content {
    background: rgba(30,41,60,0.6) !important;
    border-color: rgba(99,102,241,0.2) !important;
}
.gabi-thinking-content {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0 !important;
}
.gabi-reasoning-badge {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.75rem;
    color: #818cf8;
    font-weight: 600;
    white-space: nowrap;
}
.gabi-reasoning-badge i { animation: gabi-spin 1.5s linear infinite; }
.gabi-dots {
    display: flex;
    gap: 4px;
    align-items: center;
}
.gabi-dots span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #6366f1;
    animation: gabi-bounce 1.4s ease-in-out infinite;
}
.gabi-dots span:nth-child(2) { animation-delay: 0.2s; }
.gabi-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes gabi-bounce {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
    40%           { transform: scale(1); opacity: 1; }
}
@keyframes gabi-spin { to { transform: rotate(360deg); } }

/* ── Input ────────────────────────────────────────────────────────────── */
.gabi-input-area {
    padding: 0.875rem;
    border-top: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0;
    background: rgba(8,12,22,0.4);
}

/* ── Image preview (pendente de envio) ───────────────────────────────── */
.gabi-image-preview {
    margin-bottom: 0.5rem;
    animation: gabi-fadeIn 0.2s ease;
}
.gabi-img-preview-wrap {
    position: relative;
    display: inline-block;
}
.gabi-img-preview-thumb {
    max-height: 80px;
    max-width: 160px;
    border-radius: 10px;
    border: 2px solid rgba(99,102,241,0.4);
    object-fit: cover;
    display: block;
}
.gabi-img-remove-btn {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: none;
    background: #ef4444;
    color: #fff;
    font-size: 0.7rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
    line-height: 1;
}
.gabi-img-remove-btn:hover { background: #dc2626; }

/* ── Imagem dentro da mensagem ───────────────────────────────────────── */
.gabi-msg-image-wrap {
    margin-bottom: 0.4rem;
}
.gabi-msg-image {
    max-width: 100%;
    max-height: 200px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.1);
    object-fit: cover;
    cursor: pointer;
    transition: opacity 0.2s;
    display: block;
}
.gabi-msg-image:hover { opacity: 0.9; }

.gabi-input-wrapper {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 14px;
    padding: 0.5rem 0.5rem 0.5rem 0.75rem;
    transition: border-color 0.2s, box-shadow 0.2s;
}
.gabi-input-wrapper:focus-within {
    border-color: rgba(99,102,241,0.5);
    box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
}
.gabi-textarea {
    flex: 1;
    background: none;
    border: none;
    outline: none;
    color: #e2e8f0;
    font-family: inherit;
    font-size: 0.86rem;
    line-height: 1.5;
    resize: none;
    min-height: 22px;
    max-height: 120px;
    overflow-y: auto;
}
.gabi-textarea::placeholder { color: #475569; }

/* ── Botão de imagem ─────────────────────────────────────────────────── */
.gabi-img-btn {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: none;
    background: rgba(255,255,255,0.06);
    color: #64748b;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    flex-shrink: 0;
    transition: all 0.2s;
}
.gabi-img-btn:hover {
    background: rgba(99,102,241,0.15);
    color: #818cf8;
    transform: scale(1.05);
}

.gabi-send-btn {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: none;
    background: linear-gradient(135deg, #4f46e5, #6d28d9);
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    flex-shrink: 0;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(79,70,229,0.4);
}
.gabi-send-btn:hover:not(:disabled) {
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(79,70,229,0.5);
}
.gabi-send-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

.gabi-footer-hint {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    margin-top: 0.5rem;
    font-size: 0.65rem;
    color: #334155;
}
.gabi-footer-hint i { font-size: 0.75rem; color: #6366f1; }
.gabi-footer-hint kbd {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    padding: 0.05rem 0.3rem;
    font-size: 0.6rem;
    font-family: inherit;
}

/* ── Markdown styles ──────────────────────────────────────────────────── */
.gabi-md-p    { margin: 0 0 0.5rem; }
.gabi-md-p:last-child { margin-bottom: 0; }
.gabi-md-h2   { font-size: 1rem; font-weight: 700; margin: 0.75rem 0 0.4rem; color: #c7d2fe; }
.gabi-md-h3   { font-size: 0.9rem; font-weight: 700; margin: 0.6rem 0 0.35rem; color: #c7d2fe; }
.gabi-md-h4   { font-size: 0.85rem; font-weight: 700; margin: 0.5rem 0 0.3rem; color: #a5b4fc; }
.gabi-md-ul   { margin: 0.3rem 0 0.5rem 1.1rem; padding: 0; }
.gabi-md-ul li { margin-bottom: 0.2rem; }
.gabi-md-code { background: rgba(99,102,241,0.15); color: #a5b4fc; padding: 0.1rem 0.4rem; border-radius: 4px; font-size: 0.8rem; font-family: monospace; }
.gabi-md-hr   { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 0.5rem 0; }
.gabi-msg-content strong { color: #f1f5f9; }
.gabi-msg-content em { color: #94a3b8; font-style: italic; }

/* ── Links da Gabi ────────────────────────────────────────────────── */
.gabi-link {
    color: #818cf8;
    text-decoration: none;
    border-bottom: 1px dotted rgba(129,140,248,0.5);
    transition: color 0.15s, border-color 0.15s;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 2px;
}
.gabi-link:hover { color: #a5b4fc; border-bottom-color: #a5b4fc; }
.gabi-link-internal {
    background: rgba(99,102,241,0.12);
    border: 1px solid rgba(99,102,241,0.3);
    border-radius: 6px;
    padding: 0.05rem 0.45rem;
    font-size: 0.82em;
    font-weight: 600;
    color: #a5b4fc;
    border-bottom: none;
    transition: background 0.15s, color 0.15s, box-shadow 0.15s;
    white-space: nowrap;
}
.gabi-link-internal:hover {
    background: rgba(99,102,241,0.22);
    color: #c7d2fe;
    box-shadow: 0 2px 8px rgba(99,102,241,0.2);
    border-color: rgba(129,140,248,0.5);
}

/* ── Animations ───────────────────────────────────────────────────────── */
@keyframes gabi-fadeIn  { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes gabi-slideIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* ── Responsive ───────────────────────────────────────────────────────── */
@media (max-width: 480px) {
    .gabi-panel { right: 0.75rem; left: 0.75rem; width: auto; bottom: 5.5rem; max-height: 80vh; }
    .gabi-fab   { right: 1rem; bottom: 1rem; }
}
    `;
    document.head.appendChild(style);
}

// ── Expose globals ────────────────────────────────────────────────────────────
window.gabi = { toggle: toggleGabi, send: sendMessage };
