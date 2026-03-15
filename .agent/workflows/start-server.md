---
description: como subir o servidor local (localhost:8000)
---

// turbo-all

## Subir o servidor Journey em desenvolvimento

1. Matar qualquer processo na porta 8000 e iniciar o backend Node.js:

```bash
cd '/Users/danielmendes/Library/Mobile Documents/com~apple~CloudDocs/1. DATI/1.1. DATI > ENGENHARIA DE PRODUTO/dati_control' && bash start-dev.sh
```

> O script `start-dev.sh`:
> - Mata automaticamente qualquer processo que esteja na porta 8000 (ex: python, node antigo)
> - Sobe o servidor Node.js real em `server/index.js`
> - O sistema fica disponível em http://localhost:8000

## Verificar se está no ar

Após iniciar, confirme que aparece a mensagem:
```
🚀 Journey rodando na porta 8000 — development
```

## Matar o servidor manualmente

Se precisar parar o servidor:

```bash
lsof -ti :8000 | xargs kill -9
```
