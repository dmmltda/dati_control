# tests/ — Smoke Tests de Produção

Suíte leve de testes E2E voltada a validar o app em **produção** ou via **ngrok**,
sem precisar subir o servidor local.

## Como rodar

```bash
# URL padrão configurada em cada spec (ngrok)
npx playwright test --config=tests/playwright.config.js

# Contra URL customizada
BASE_URL=https://seu-app.ngrok.io npx playwright test --config=tests/playwright.config.js

# Só um spec
npx playwright test tests/smoke-test.spec.js --config=tests/playwright.config.js
```

## Estrutura

```
tests/
├── playwright.config.js      ← config desta suíte
├── helpers/
│   └── auth.js               ← login() e navegarPara() compartilhados
├── smoke-test.spec.js        ← validação mínima (~30s, roda em todo commit)
├── dashboard.spec.js
├── empresas.spec.js
├── configuracoes.spec.js
├── custom-select.spec.js
├── monitoramento.spec.js
├── navegacao.spec.js
├── notificacoes.spec.js
└── whatsapp.spec.js
```

## Diferença dos testes em `js/tests/e2e/`

| | `tests/` (este diretório) | `js/tests/e2e/` |
|---|---|---|
| **Tipo** | Smoke / black-box | Integração completa |
| **Target** | Produção / ngrok | Servidor local (porta 3001) |
| **Auth** | Login simples via form | Fixtures com storageState |
| **Config** | `tests/playwright.config.js` | `playwright.config.js` (raiz) |
| **Módulos** | CommonJS (`require`) | ESM (`import`) |

## Variáveis de ambiente

```bash
BASE_URL=https://...ngrok-free.dev   # URL do app
TEST_EMAIL=usuario@exemplo.com
TEST_PASSWORD=senha-aqui
```
