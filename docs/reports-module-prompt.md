# Prompt de Implementação — Módulo de Relatórios com Metabase Embedded

## Contexto do projeto

Stack atual:
- **Frontend:** Vanilla JS (ES modules), sem framework, CSS customizado com variáveis CSS
- **Backend:** Express.js (ESM), Prisma ORM, PostgreSQL (Railway)
- **Auth:** Clerk (`requireAuth`, `getAuth` de `@clerk/express`)
- **Fonte tipográfica:** Plus Jakarta Sans
- **Ícones:** Phosphor Icons (`ph ph-*`)
- **Cores principais:** `--primary: #4f46e5`, `--dark: #0f1423`, `--dark-surface: #1e293b`, `--dark-border: #334155`, `--text-main: #f8fafc`, `--text-muted: #94a3b8`
- **Navegação:** `switchView(viewId)` mostra/oculta `.view-section[id="view-{viewId}"]`
- **Hierarquia:** `master` acessa tudo da org; `standard` acessa apenas `company_sons` via `user_memberships`
- **Deploy:** Railway (dois serviços — dati_control já existente + Metabase novo)

## Objetivo

Integrar o **Metabase Community Edition** ao Journey/dati_control via **Signed Embedding (JWT)**, de forma que:

1. O usuário **nunca saia do sistema** — Metabase aparece embutido dentro da view "Relatórios"
2. O time interno **cria e edita** relatórios/dashboards acessando o Metabase diretamente em `metabase.seudominio.com`
3. Os relatórios são exibidos dentro do Journey **filtrados automaticamente** pela organização do usuário logado (via JWT)
4. A experiência visual segue o design system do Journey (dark theme, mesma sidebar, mesma tipografia)

---

## Parte 1 — Infraestrutura: Metabase no Railway

### 1.1 Criar novo serviço no Railway

No painel do Railway, dentro do mesmo projeto do dati_control:

1. **New Service → Docker Image**
2. Imagem: `metabase/metabase:latest`
3. Porta: `3000`
4. Configurar as variáveis de ambiente abaixo

### 1.2 Variáveis de ambiente do serviço Metabase

```env
MB_DB_TYPE=postgres
MB_DB_DBNAME=metabase          # nome do banco dedicado para o Metabase (criar separado)
MB_DB_PORT=5432
MB_DB_HOST=<host do PostgreSQL Railway>
MB_DB_USER=<usuario>
MB_DB_PASS=<senha>

MB_SITE_URL=https://metabase.seudominio.com
MB_EMBEDDING_SECRET_KEY=<string aleatória segura — mínimo 32 chars>
MB_ENABLE_EMBEDDING=true

MB_JETTY_PORT=3000
JAVA_TIMEZONE=America/Sao_Paulo
```

> **Importante:** `MB_EMBEDDING_SECRET_KEY` é a mesma chave que o backend do dati_control vai usar para assinar os JWTs. Guarde também como variável de ambiente do dati_control com o nome `METABASE_SECRET_KEY`.

### 1.3 Banco de dados do Metabase

O Metabase precisa de um banco próprio para armazenar suas configurações (dashboards, usuários, questions). Criar um segundo banco PostgreSQL no Railway dedicado para isso. **Não usar o mesmo banco do dati_control.**

### 1.4 Conectar o Metabase ao banco do dati_control

Após o Metabase subir (primeira inicialização leva ~2 min):

1. Acessar `https://metabase.seudominio.com`
2. Criar conta de admin
3. **Admin → Databases → Add Database**
   - Type: PostgreSQL
   - Host/Port/Name/User/Pass: dados do banco principal do dati_control (Railway)
   - Name: `Journey Production`
4. Metabase vai sincronizar automaticamente todas as tabelas do schema

### 1.5 Habilitar Embedding no Metabase

1. **Admin → Settings → Embedding**
2. Ativar "Enable Embedding"
3. Copiar a **Embedding Secret Key** — deve ser a mesma do `MB_EMBEDDING_SECRET_KEY`

---

## Parte 2 — Preparar os recursos no Metabase

Antes de integrar, criar no Metabase os dashboards que serão embutidos.

### 2.1 Habilitar embedding por recurso

Para cada Question ou Dashboard que será embutido:
1. Abrir o item → menu `...` → **Sharing → Embed**
2. Ativar "Enable embedding for this item"
3. Em **Parameters**, marcar os filtros que o backend vai passar via JWT como **"Locked"** (o usuário não pode alterar — ex: `company_mom_id`)
4. Copiar o **Resource ID** (número na URL, ex: `/dashboard/3`)

### 2.2 Dashboards recomendados para criar

| ID | Nome | Filtro locked | Tabelas principais |
|----|------|---------------|--------------------|
| 1 | Visão Geral CS | `company_mom_id` | companies, activities |
| 2 | Pipeline Comercial | `company_mom_id` | companies, company_products |
| 3 | Health Score | `company_mom_id` | companies |
| 4 | Faturamento | `company_mom_id` | company_products, product_historico |
| 5 | NPS | `company_mom_id` | company_nps |
| 6 | Atividades & Tarefas | `company_mom_id` | activities |

---

## Parte 3 — Backend: `server/routes/reports.js`

Criar o arquivo com as rotas necessárias para o embedding.

### 3.1 Variável de ambiente necessária no dati_control

```env
METABASE_SITE_URL=https://metabase.seudominio.com
METABASE_SECRET_KEY=<mesma chave do MB_EMBEDDING_SECRET_KEY>
```

### 3.2 Instalar dependência

```bash
npm install jsonwebtoken
```

### 3.3 Código completo de `server/routes/reports.js`

```js
/**
 * Rota: /api/reports — Metabase Signed Embedding
 * Gera URLs JWT assinadas para embutir dashboards do Metabase no Journey
 */
import express from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { requireAuth, getAuth } from '@clerk/express';

const router = express.Router();
const prisma = new PrismaClient();

const METABASE_SITE_URL  = process.env.METABASE_SITE_URL;
const METABASE_SECRET_KEY = process.env.METABASE_SECRET_KEY;

// Mapeamento de slugs amigáveis para IDs de dashboard no Metabase
// Atualizar com os IDs reais após criar os dashboards no Metabase
const DASHBOARDS = {
  'visao-geral':   { id: 1, title: 'Visão Geral CS',         icon: 'ph-squares-four' },
  'pipeline':      { id: 2, title: 'Pipeline Comercial',      icon: 'ph-funnel' },
  'health-score':  { id: 3, title: 'Health Score',            icon: 'ph-heart' },
  'faturamento':   { id: 4, title: 'Faturamento',             icon: 'ph-currency-dollar' },
  'nps':           { id: 5, title: 'NPS',                     icon: 'ph-star' },
  'atividades':    { id: 6, title: 'Atividades & Tarefas',    icon: 'ph-activity' },
};

// ── GET /api/reports/dashboards — lista os dashboards disponíveis ──────────────
router.get('/dashboards', requireAuth(), (req, res) => {
  const list = Object.entries(DASHBOARDS).map(([slug, d]) => ({
    slug,
    title: d.title,
    icon:  d.icon,
  }));
  res.json(list);
});

// ── GET /api/reports/embed/:slug — gera URL JWT assinada ──────────────────────
router.get('/embed/:slug', requireAuth(), async (req, res) => {
  try {
    const { userId } = getAuth(req);
    const { slug } = req.params;

    const dashboard = DASHBOARDS[slug];
    if (!dashboard) return res.status(404).json({ error: 'Dashboard não encontrado' });

    if (!METABASE_SITE_URL || !METABASE_SECRET_KEY) {
      return res.status(500).json({ error: 'Metabase não configurado' });
    }

    // Buscar usuário e a org (company_mom) à qual pertence
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) return res.status(403).json({ error: 'Usuário não encontrado' });

    // Buscar company_mom_id — para master, vem do clerk_org_id;
    // para standard, vem pela primeira membership
    let companyMomId = null;

    if (user.user_type === 'master') {
      // Master pertence diretamente à company_mom via clerk_org_id
      const org = await prisma.companies.findFirst({
        where: { company_type: 'mom', clerk_org_id: { not: null } },
        select: { id: true },
      });
      companyMomId = org?.id ?? null;
    } else {
      // Standard: pegar a primeira company_son e subir para a mãe
      const membership = await prisma.user_memberships.findFirst({
        where: { user_id: userId },
        include: { company: { select: { mom_id: true } } },
      });
      companyMomId = membership?.company?.mom_id ?? null;
    }

    // Montar payload JWT para o Metabase
    // exp: token expira em 10 minutos (segurança — cada carregamento gera novo token)
    const payload = {
      resource: { dashboard: dashboard.id },
      params: {
        // "company_mom_id" deve ser o nome exato do filtro criado no dashboard do Metabase
        // Se o dashboard não tiver filtro, deixar params: {}
        ...(companyMomId ? { company_mom_id: companyMomId } : {}),
      },
      exp: Math.round(Date.now() / 1000) + (10 * 60), // 10 minutos
    };

    const token = jwt.sign(payload, METABASE_SECRET_KEY);
    const embedUrl = `${METABASE_SITE_URL}/embed/dashboard/${token}#bordered=false&titled=false&theme=night`;

    res.json({ url: embedUrl, title: dashboard.title });

  } catch (err) {
    console.error('[reports/embed] erro:', err);
    res.status(500).json({ error: 'Erro ao gerar URL de embedding' });
  }
});

export default router;
```

### 3.4 Registrar a rota em `server/index.js`

```js
import reportsRouter from './routes/reports.js';
// ...
app.use('/api/reports', reportsRouter);
```

---

## Parte 4 — Frontend: `js/modules/reports.js`

Criar o arquivo completo do módulo frontend.

```js
/**
 * Módulo: Relatórios — Metabase Embedded
 * Carrega dashboards do Metabase via Signed JWT dentro do Journey
 */
import { getAuthToken } from './auth.js';

// Estado do módulo
const state = {
  dashboards: [],       // lista de dashboards disponíveis
  activeSlug: null,     // slug do dashboard ativo
  iframeCache: {},      // cache de URLs já geradas { slug: url }
  loading: false,
};

// ── Inicialização ────────────────────────────────────────────────────────────
export async function initReports() {
  if (state.dashboards.length > 0) return; // já inicializado
  await loadDashboardList();
}

// ── Carrega lista de dashboards disponíveis ──────────────────────────────────
async function loadDashboardList() {
  try {
    const token = await getAuthToken();
    const res = await fetch('/api/reports/dashboards', {
      headers: { Authorization: `Bearer ${token}` },
    });
    state.dashboards = await res.json();
    renderSideTabs();
    // Abre o primeiro dashboard automaticamente
    if (state.dashboards.length > 0) {
      openDashboard(state.dashboards[0].slug);
    }
  } catch (err) {
    console.error('[reports] erro ao carregar dashboards:', err);
    showError('Não foi possível carregar os relatórios.');
  }
}

// ── Renderiza as abas laterais de navegação ──────────────────────────────────
function renderSideTabs() {
  const nav = document.getElementById('reports-nav');
  if (!nav) return;
  nav.innerHTML = state.dashboards.map(d => `
    <button
      class="report-nav-item"
      id="rnav-${d.slug}"
      onclick="openDashboard('${d.slug}')"
    >
      <i class="ph ${d.icon}"></i>
      <span>${d.title}</span>
    </button>
  `).join('');
}

// ── Abre um dashboard específico ─────────────────────────────────────────────
export async function openDashboard(slug) {
  if (state.loading) return;

  // Atualiza aba ativa na nav
  document.querySelectorAll('.report-nav-item').forEach(b => b.classList.remove('active'));
  const activeBtn = document.getElementById(`rnav-${slug}`);
  if (activeBtn) activeBtn.classList.add('active');

  state.activeSlug = slug;
  const frame = document.getElementById('reports-iframe');
  const title = document.getElementById('reports-dashboard-title');
  const loader = document.getElementById('reports-loader');
  const errorEl = document.getElementById('reports-error');

  if (!frame) return;

  errorEl.style.display = 'none';
  frame.style.display = 'none';

  // Usar cache se disponível (evita recriar JWT a cada clique)
  if (state.iframeCache[slug]) {
    frame.src = state.iframeCache[slug];
    frame.style.display = 'block';
    loader.style.display = 'none';
    const d = state.dashboards.find(x => x.slug === slug);
    if (title && d) title.textContent = d.title;
    return;
  }

  loader.style.display = 'flex';
  state.loading = true;

  try {
    const token = await getAuthToken();
    const res = await fetch(`/api/reports/embed/${slug}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro desconhecido');
    }

    const { url, title: dashTitle } = await res.json();

    // Guardar em cache (válido por ~9 min — o JWT expira em 10)
    state.iframeCache[slug] = url;
    setTimeout(() => { delete state.iframeCache[slug]; }, 9 * 60 * 1000);

    frame.src = url;
    if (title) title.textContent = dashTitle;

    frame.onload = () => {
      loader.style.display = 'none';
      frame.style.display = 'block';
      state.loading = false;
    };

  } catch (err) {
    console.error('[reports] erro ao carregar dashboard:', err);
    loader.style.display = 'none';
    state.loading = false;
    showError(err.message);
  }
}

// ── Recarrega o dashboard ativo (limpa cache) ────────────────────────────────
export function refreshDashboard() {
  if (!state.activeSlug) return;
  delete state.iframeCache[state.activeSlug];
  openDashboard(state.activeSlug);
}

// ── Abre o Metabase em nova aba para editar ──────────────────────────────────
export function openMetabaseEditor() {
  window.open(
    `${window.__METABASE_SITE_URL || ''}/browse`,
    '_blank',
    'noopener,noreferrer'
  );
}

// ── Exibe mensagem de erro na área de conteúdo ───────────────────────────────
function showError(msg) {
  const el = document.getElementById('reports-error');
  if (el) {
    el.style.display = 'flex';
    el.querySelector('.reports-error-msg').textContent = msg;
  }
}
```

---

## Parte 5 — HTML: adicionar em `index.html`

### 5.1 Item no nav sidebar

Inserir junto aos outros itens de navegação:

```html
<a class="nav-item" data-view="reports">
  <i class="ph ph-chart-bar"></i> Relatórios
</a>
```

### 5.2 View section completa

```html
<div id="view-reports" class="view-section" style="display:none">
  <div class="reports-layout">

    <!-- SIDEBAR DE NAVEGAÇÃO DOS DASHBOARDS -->
    <aside class="reports-sidebar">
      <div class="reports-sidebar-header">
        <span>Dashboards</span>
      </div>
      <nav id="reports-nav" class="reports-nav">
        <!-- populado via JS -->
      </nav>
      <div class="reports-sidebar-footer">
        <button class="report-nav-item report-nav-edit" onclick="openMetabaseEditor()">
          <i class="ph ph-pencil-simple"></i>
          <span>Editar no Metabase</span>
          <i class="ph ph-arrow-square-out" style="margin-left:auto; font-size:12px;"></i>
        </button>
      </div>
    </aside>

    <!-- ÁREA PRINCIPAL -->
    <div class="reports-main">

      <!-- HEADER -->
      <div class="reports-header">
        <div>
          <h2 id="reports-dashboard-title">Relatórios</h2>
          <p>Análise e visualização dos dados do Journey</p>
        </div>
        <div class="reports-header-actions">
          <button class="btn-ghost btn-sm" onclick="refreshDashboard()">
            <i class="ph ph-arrows-clockwise"></i> Atualizar
          </button>
          <button class="btn-ghost btn-sm" onclick="openMetabaseEditor()">
            <i class="ph ph-pencil-simple"></i> Editar
            <i class="ph ph-arrow-square-out" style="font-size:11px;"></i>
          </button>
        </div>
      </div>

      <!-- LOADER -->
      <div id="reports-loader" class="reports-loader" style="display:flex">
        <div class="reports-loader-spinner"></div>
        <span>Carregando dashboard...</span>
      </div>

      <!-- ERRO -->
      <div id="reports-error" class="reports-error" style="display:none">
        <i class="ph ph-warning" style="font-size:32px; color:#f59e0b;"></i>
        <p class="reports-error-msg"></p>
        <button class="btn-ghost btn-sm" onclick="refreshDashboard()">Tentar novamente</button>
      </div>

      <!-- IFRAME DO METABASE -->
      <iframe
        id="reports-iframe"
        class="reports-iframe"
        frameborder="0"
        allowtransparency="true"
        style="display:none"
      ></iframe>

    </div>
  </div>
</div>
```

---

## Parte 6 — CSS: adicionar em `css/views.css`

```css
/* ══════════════════════════════════════════════════════════════════════════════
   RELATÓRIOS — Metabase Embedded
══════════════════════════════════════════════════════════════════════════════ */

/* Layout geral da view */
#view-reports {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0;
}

.reports-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  height: 100%;
  overflow: hidden;
}

/* Sidebar de navegação dos dashboards */
.reports-sidebar {
  background: var(--dark-surface);
  border-right: 1px solid var(--dark-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.reports-sidebar-header {
  padding: 20px 16px 12px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--dark-border);
}

.reports-nav {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.report-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  background: none;
  border: none;
  width: 100%;
  text-align: left;
  font-family: 'Plus Jakarta Sans', sans-serif;
  transition: all 0.2s;
}

.report-nav-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-main);
}

.report-nav-item.active {
  background: rgba(79, 70, 229, 0.15);
  color: #818cf8;
  font-weight: 600;
}

.report-nav-item.active i { color: var(--primary); }
.report-nav-item i { font-size: 16px; flex-shrink: 0; }

.reports-sidebar-footer {
  padding: 8px;
  border-top: 1px solid var(--dark-border);
}

.report-nav-edit {
  color: var(--text-muted);
  font-size: 12px;
}

.report-nav-edit:hover {
  color: var(--text-main);
  background: rgba(255, 255, 255, 0.04);
}

/* Área principal */
.reports-main {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--dark);
}

.reports-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--dark-border);
  flex-shrink: 0;
}

.reports-header h2 {
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 2px;
  color: var(--text-main);
}

.reports-header p {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}

.reports-header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-sm {
  padding: 6px 12px !important;
  font-size: 12px !important;
}

/* Loader */
.reports-loader {
  flex: 1;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 16px;
  color: var(--text-muted);
  font-size: 13px;
}

.reports-loader-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--dark-border);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* Erro */
.reports-error {
  flex: 1;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 12px;
  color: var(--text-muted);
  font-size: 13px;
  text-align: center;
  padding: 40px;
}

/* Iframe do Metabase */
.reports-iframe {
  flex: 1;
  width: 100%;
  border: none;
  background: transparent;
}
```

---

## Parte 7 — Integração no `app.js` / `handlers.js`

### 7.1 Import do módulo

```js
import * as reports from './modules/reports.js';
```

### 7.2 Expor funções globalmente

```js
window.openDashboard     = reports.openDashboard;
window.refreshDashboard  = reports.refreshDashboard;
window.openMetabaseEditor = reports.openMetabaseEditor;
```

### 7.3 Chamar `initReports` ao entrar na view

Na função `switchView` (em `navigation.js`), adicionar:

```js
if (viewId === 'reports') reports.initReports();
```

---

## Parte 8 — Segurança

### O que é garantido pelo JWT

O token assinado pelo backend do dati_control contém:
- O **ID exato do dashboard** do Metabase (recurso específico, não navegação livre)
- O filtro `company_mom_id` **locked** — o usuário não consegue alterar via URL nem via UI
- Expiração de **10 minutos** — URL usurpada após esse tempo não funciona
- Assinatura HMAC com `METABASE_SECRET_KEY` — qualquer adulteração invalida o token

### O que configurar no Metabase para garantir isolamento

Para cada dashboard:
1. **Sharing → Embed → Parameters**
2. O parâmetro `company_mom_id` deve estar como **"Locked"**
3. Parâmetros de data ou outros filtros opcionais podem ficar como **"Enabled"** (usuário pode filtrar) ou **"Disabled"**

### Variáveis de ambiente obrigatórias no dati_control

```env
METABASE_SITE_URL=https://metabase.seudominio.com
METABASE_SECRET_KEY=<string aleatória segura, mínimo 32 caracteres>
```

---

## Parte 9 — Configuração do tema do Metabase (dark mode)

A URL do iframe suporta parâmetros de aparência. Usar sempre:

```
#bordered=false&titled=false&theme=night
```

- `bordered=false` — remove a borda do Metabase
- `titled=false` — remove o título interno do Metabase (usamos o nosso próprio)
- `theme=night` — tema escuro, compatível com o design do Journey

---

## Parte 10 — Checklist de implementação

### Infraestrutura
- [ ] Criar segundo banco PostgreSQL no Railway para o Metabase
- [ ] Criar serviço Metabase no Railway com a imagem `metabase/metabase:latest`
- [ ] Configurar todas as variáveis de ambiente do Metabase
- [ ] Conectar o Metabase ao banco do dati_control (read-only recomendado)
- [ ] Habilitar Embedding em Admin → Settings → Embedding

### Metabase
- [ ] Criar os 6 dashboards listados na Parte 2
- [ ] Adicionar filtro `company_mom_id` em cada dashboard
- [ ] Marcar `company_mom_id` como **Locked** no embedding de cada dashboard
- [ ] Anotar os IDs reais dos dashboards e atualizar o objeto `DASHBOARDS` em `reports.js`

### Backend
- [ ] `npm install jsonwebtoken`
- [ ] Criar `server/routes/reports.js` com o código da Parte 3
- [ ] Adicionar `METABASE_SITE_URL` e `METABASE_SECRET_KEY` no `.env` e no Railway
- [ ] Registrar a rota em `server/index.js`

### Frontend
- [ ] Criar `js/modules/reports.js` com o código da Parte 4
- [ ] Adicionar item `Relatórios` no nav sidebar em `index.html`
- [ ] Adicionar `view-reports` completo em `index.html`
- [ ] Adicionar CSS da Parte 6 em `css/views.css`
- [ ] Integrar no `app.js` / `handlers.js` conforme Parte 7

### Verificação final
- [ ] JWT expira em 10 min e cache do frontend limpa após 9 min
- [ ] Filtro `company_mom_id` locked — testar que não é possível alterar via URL
- [ ] Usuário `standard` sem `user_memberships` vê tela de erro amigável
- [ ] Tema `night` aplicado — visual consistente com o Journey
- [ ] Botão "Editar no Metabase" abre nova aba e não interfere na sessão
