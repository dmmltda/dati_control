/**
 * ============================================================================
 * GlobalTimer — Cronômetro Persistente
 * ============================================================================
 * Mantém o timer rodando mesmo quando o modal é fechado.
 * Usa localStorage para persistir o estado entre sessões da mesma aba.
 * Exibe um indicador flutuante no topo da tela quando o timer estiver ativo.
 * ============================================================================
 */

const STORAGE_KEY = 'journey_active_timer';

// Estado em memória (sincronizado com localStorage)
let _interval = null;
let _state = null; // { activityId, activityTitle, startedAt (timestamp ms), pausedAt (ms|null), accumulated (ms) }

// ── Leitura / Escrita no localStorage ────────────────────────────────────────

function _save(state) {
    if (state) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }
}

function _load() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

// ── Cálculo do tempo decorrido em segundos ────────────────────────────────────

function _elapsedSeconds(state) {
    if (!state) return 0;
    const accumulated = state.accumulated || 0;
    if (state.pausedAt !== null && state.pausedAt !== undefined) {
        // Pausado — retorna só o acumulado
        return Math.floor(accumulated / 1000);
    }
    // Rodando — acumulado + tempo desde o último startedAt
    const now = Date.now();
    return Math.floor((accumulated + (now - state.startedAt)) / 1000);
}

// ── Formata HH:MM:SS ─────────────────────────────────────────────────────────

export function fmtTimer(totalSec) {
    const h   = Math.floor(totalSec / 3600);
    const m   = Math.floor((totalSec % 3600) / 60);
    const sec = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

// ── Indicador flutuante ───────────────────────────────────────────────────────

function _ensureIndicator() {
    if (document.getElementById('gTimer-indicator')) return;

    const el = document.createElement('div');
    el.id = 'gTimer-indicator';
    el.style.cssText = [
        'position:fixed',
        'top:0',
        'left:50%',
        'transform:translateX(-50%)',
        'z-index:99999',
        'display:flex',
        'align-items:center',
        'gap:0.55rem',
        'padding:0.32rem 1.1rem 0.32rem 0.75rem',
        'background:linear-gradient(135deg,rgba(99,102,241,0.92),rgba(139,92,246,0.92))',
        'backdrop-filter:blur(12px)',
        '-webkit-backdrop-filter:blur(12px)',
        'border:1px solid rgba(255,255,255,0.15)',
        'border-top:none',
        'border-radius:0 0 14px 14px',
        'box-shadow:0 6px 30px rgba(99,102,241,0.5)',
        'cursor:pointer',
        'animation:gTimerDrop 0.35s cubic-bezier(0.34,1.56,0.64,1) both',
        'font-family:inherit',
        'max-width:90vw',
    ].join(';');

    el.innerHTML = `
        <style>
          @keyframes gTimerDrop { from{opacity:0;transform:translateX(-50%) translateY(-100%)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
          @keyframes gTimerPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.55;transform:scale(0.85)} }
          #gTimer-dot { width:8px;height:8px;border-radius:50%;background:#4ade80;box-shadow:0 0 8px #4ade80;animation:gTimerPulse 1.4s ease-in-out infinite;flex-shrink:0; }
          #gTimer-lbl { font-size:0.71rem;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.07em;line-height:1; }
          #gTimer-clk { font-size:1rem;font-weight:800;font-family:monospace;color:#fff;letter-spacing:0.1em;line-height:1; }
          #gTimer-title { font-size:0.72rem;color:rgba(255,255,255,0.65);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1;margin-top:1px; }
          #gTimer-stop-btn { background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);border-radius:6px;padding:0.22rem 0.55rem;cursor:pointer;color:#fff;font-size:0.68rem;font-weight:700;letter-spacing:0.04em;transition:background 0.15s;white-space:nowrap;flex-shrink:0; }
          #gTimer-stop-btn:hover { background:rgba(255,50,50,0.35); }
          #gTimer-open-btn { background:none;border:none;cursor:pointer;padding:0;display:flex;align-items:center;gap:0.45rem;flex:1;min-width:0;text-align:left; }
        </style>
        <span id="gTimer-dot"></span>
        <button id="gTimer-open-btn" title="Clique para abrir a atividade">
          <div>
            <div id="gTimer-lbl">Cronômetro ativo</div>
            <div id="gTimer-clk">00:00:00</div>
            <div id="gTimer-title"></div>
          </div>
        </button>
        <button id="gTimer-stop-btn" title="Parar cronômetro">■ Parar</button>
    `;

    document.body.appendChild(el);

    // Clicar no indicador abre o modal da atividade direto na aba Tempo
    document.getElementById('gTimer-open-btn').addEventListener('click', () => {
        const s = _load();
        if (!s) return;
        // Dispara evento para que o tasks-board abra o drawer já na aba "tempo"
        window.dispatchEvent(new CustomEvent('journey:timer-open-activity', {
            detail: { activityId: s.activityId, tab: 'tempo' }
        }));
    });

    // Botão de parar
    document.getElementById('gTimer-stop-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        stopTimer();
    });
}

function _removeIndicator() {
    const el = document.getElementById('gTimer-indicator');
    if (!el) return;
    el.style.animation = 'none';
    el.style.transition = 'all 0.25s ease';
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(-100%)';
    setTimeout(() => el.remove(), 260);
}

function _updateIndicator(sec) {
    const clk   = document.getElementById('gTimer-clk');
    const title = document.getElementById('gTimer-title');
    if (clk) clk.textContent = fmtTimer(sec);
    if (title && _state) title.textContent = _state.activityTitle || '';
}

// ── Loop de tick ─────────────────────────────────────────────────────────────

function _startInterval() {
    if (_interval) return;
    _interval = setInterval(() => {
        const s    = _load();
        if (!s || s.pausedAt !== null && s.pausedAt !== undefined) return;
        const sec  = _elapsedSeconds(s);
        _updateIndicator(sec);
        // Dispara evento para atualizar o display dentro do modal (se aberto)
        window.dispatchEvent(new CustomEvent('journey:timer-tick', { detail: { sec } }));
    }, 1000);
}

function _stopInterval() {
    if (_interval) { clearInterval(_interval); _interval = null; }
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Inicia o cronômetro para uma atividade.
 * @param {string} activityId
 * @param {string} activityTitle
 * @param {number} [alreadySeconds=0] Segundos já acumulados (tempo salvo no banco)
 */
export function startTimer(activityId, activityTitle, alreadySeconds = 0) {
    // Converte segundos já acumulados em ms
    const accumulated = alreadySeconds * 1000;
    _state = {
        activityId,
        activityTitle,
        startedAt: Date.now(),
        pausedAt: null,
        accumulated,
    };
    _save(_state);
    _ensureIndicator();
    _updateIndicator(_elapsedSeconds(_state));
    _startInterval();
}

/**
 * Pausa o cronômetro (mantém no localStorage como pausado).
 */
export function pauseTimer() {
    const s = _load();
    if (!s || s.pausedAt !== null) return;
    const now = Date.now();
    s.accumulated = s.accumulated + (now - s.startedAt);
    s.pausedAt = now;
    _state = s;
    _save(_state);
    // Indica visualmente que está pausado
    const dot = document.getElementById('gTimer-dot');
    if (dot) dot.style.animationPlayState = 'paused';
    window.dispatchEvent(new CustomEvent('journey:timer-paused', { detail: { sec: _elapsedSeconds(s) } }));
}

/**
 * Retoma o cronômetro pausado.
 */
export function resumeTimer() {
    const s = _load();
    if (!s || s.pausedAt === null || s.pausedAt === undefined) return;
    s.startedAt = Date.now();
    s.pausedAt  = null;
    _state = s;
    _save(_state);
    const dot = document.getElementById('gTimer-dot');
    if (dot) dot.style.animationPlayState = 'running';
    _startInterval();
    window.dispatchEvent(new CustomEvent('journey:timer-resumed', { detail: { sec: _elapsedSeconds(s) } }));
}

/**
 * Para o cronômetro e retorna os segundos totais acumulados.
 * @returns {number} segundos totais
 */
export function stopTimer() {
    const s = _load();
    const sec = _elapsedSeconds(s);
    _stopInterval();
    _state = null;
    _save(null);
    _removeIndicator();
    window.dispatchEvent(new CustomEvent('journey:timer-stopped', { detail: { sec } }));
    return sec;
}

/**
 * Retorna o estado atual do timer.
 * @returns {{ activityId, sec, state: 'running'|'paused'|'idle' } | null}
 */
export function getTimerState() {
    const s = _load();
    if (!s) return { state: 'idle', sec: 0, activityId: null, sessionStartedAt: null };
    const running = s.pausedAt === null || s.pausedAt === undefined;
    return {
        activityId: s.activityId,
        sec: _elapsedSeconds(s),
        state: running ? 'running' : 'paused',
        sessionStartedAt: s.startedAt || null, // timestamp ms de início da sessão
    };
}

/**
 * Inicializa o módulo (chame no DOMContentLoaded ou equivalente).
 * Restaura um timer que estava rodando antes de um refresh da página.
 */
export function initGlobalTimer() {
    const s = _load();
    if (!s) return;
    _state = s;
    _ensureIndicator();
    _updateIndicator(_elapsedSeconds(s));
    // Só inicia o tick se estava rodando (não pausado)
    if (s.pausedAt === null || s.pausedAt === undefined) {
        _startInterval();
    } else {
        const dot = document.getElementById('gTimer-dot');
        if (dot) dot.style.animationPlayState = 'paused';
        window.dispatchEvent(new CustomEvent('journey:timer-paused', { detail: { sec: _elapsedSeconds(s) } }));
    }
}
