# 🧪 Testes — Journey CRM

Pasta única e canônica para todos os testes do projeto.

```
tests/
├── e2e/                      ← Playwright — browser real, fluxos completos
│   ├── fixtures/             ← helpers compartilhados, setup de login, dados
│   │   ├── base.js           ← fixture com apiContext, testCompany, navegação
│   │   ├── login.setup.js    ← salva sessão autenticada (storageState)
│   │   ├── test-data.js      ← dados de teste reutilizáveis
│   │   └── auth-helper.js    ← helper de login simplificado (ngrok/externa)
│   │
│   ├── smoke-test.spec.js    ← 🔥 roda em todo commit (~30s)
│   ├── auth.spec.js          ← Autenticação / login
│   ├── navegacao.spec.js     ← Menu lateral, rotas, logout
│   ├── dashboard.spec.js     ← Dashboard (versão completa com fixtures)
│   ├── dashboard-v2.spec.js  ← Dashboard (versão simplificada — review/merge)
│   ├── empresas.spec.js      ← Lista, filtros, ações em massa
│   ├── companies.spec.js     ← CRUD completo de empresas
│   ├── company-detail.spec.js← Detalhes, atividades, contatos por empresa
│   ├── activities.spec.js    ← Atividades e tarefas
│   ├── notificacoes.spec.js  ← Notificações
│   ├── whatsapp.spec.js      ← WhatsApp inbox e configurações
│   ├── configuracoes.spec.js ← Configurações de usuários e Gabi
│   ├── monitoramento.spec.js ← Audit log, relatórios, logs
│   ├── custom-select.spec.js ← Componente custom-select (crítico)
│   ├── cs_hub.spec.js        ← CS Hub
│   ├── crud_advanced.spec.js ← CRUD avançado
│   ├── import.spec.js        ← Importação em massa (CSV/Excel)
│   └── log.spec.js           ← Histórico de alterações
│
├── functional/               ← Vitest — testa fluxos server-side sem browser
│   ├── setup.js              ← Setup global do Vitest
│   ├── activities-api.test.js
│   ├── auth-middleware.test.js
│   ├── companies-api.test.js
│   └── import-pipeline.test.js
│
├── unit/                     ← Vitest — funções puras, sem DOM
│   ├── activities.test.js
│   ├── api.test.js
│   ├── auth.test.js
│   ├── company-products.test.js
│   ├── config.test.js
│   ├── handlers.test.js
│   ├── importer.test.js
│   ├── navigation.test.js
│   ├── state.test.js
│   ├── table-manager.test.js
│   ├── ui.test.js
│   └── utils.test.js
│
└── fixtures/                 ← Fixtures compartilhadas (Vitest)
    ├── base.js
    ├── login.setup.js
    └── test-data.js
```

---

## Como rodar

| Comando | O que faz |
|---|---|
| `npm test` | Vitest — todos os testes unitários |
| `npm run test:functional` | Vitest — testes funcionais (API/server) |
| `npm run test:e2e` | Playwright — E2E completo (local, precisa do servidor) |
| `npm run test:smoke` | Playwright — smoke test rápido (~30s) |
| `npm run test:all` | Unit + Functional + E2E |
| `npm run test:e2e:ui` | Playwright UI modo visual |
| `npm run test:e2e:headed` | Playwright com browser visível |

---

## Pirâmide de testes

```
        /\ E2E (Playwright)
       /  \ 20 specs — fluxos completos no browser
      /────\
     /  FN  \ Functional (Vitest)
    / 4 specs \ server-side, API
   /────────────\
  /    UNIT      \ Unit (Vitest)
 / 12 specs       \ funções puras
/──────────────────\
```

---

## Config de cada camada

| Camada | Config | Executor |
|---|---|---|
| E2E | `playwright.config.js` (raiz) | `@playwright/test` |
| Functional | `vitest.functional.config.js` (raiz) | Vitest |
| Unit | `vitest.config.js` (raiz) | Vitest |

---

## Variáveis de ambiente

Crie `.env.local` na raiz com:

```
BASE_URL=http://localhost:3001
TEST_EMAIL=teste@dati.com
TEST_PASSWORD=senha-de-teste
DATABASE_URL_TEST=...
```

As variáveis E2E específicas vivem em `tests/e2e/.env.e2e`.
