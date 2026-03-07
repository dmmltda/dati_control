# DATI Control — CRM

CRM interno da DATI para gestão de empresas, contatos, produtos e Customer Success.

## Tecnologias
- HTML5 + CSS3 (Vanilla)
- JavaScript ES Modules (sem build tool)
- localStorage para persistência
- Vitest para testes unitários
- Playwright para testes E2E

## Estrutura

```
dati_control/
├── index.html              # Ponto de entrada
├── css/                    # Estilos modularizados
│   ├── variables.css
│   ├── global.css
│   ├── components.css
│   ├── layout.css
│   └── views.css
└── js/
    ├── app.js              # Entry point principal
    ├── modules/            # Módulos ES
    │   ├── config.js
    │   ├── state.js
    │   ├── utils.js
    │   ├── ui.js
    │   ├── navigation.js
    │   ├── auth.js
    │   └── handlers.js
    └── tests/
        ├── unit/           # Testes unitários (Vitest)
        └── e2e/            # Testes E2E (Playwright)
```

## Desenvolvimento

```bash
# Servidor local
npm run dev
# Acesse: http://localhost:8000
```

## Testes

```bash
# Testes unitários
npm test

# Testes unitários (modo watch)
npm run test:watch

# Cobertura de código
npm run test:coverage

# Testes E2E (requer servidor rodando)
npm run test:e2e

# Tudo
npm run test:all
```

## CI/CD

O GitHub Actions executa automaticamente os testes a cada push ou pull request.

## Acesso
- **Usuário:** admin
- **Senha:** dati2024
