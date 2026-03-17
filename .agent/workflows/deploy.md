---
description: Como fazer um deploy seguro (Checklist de Deploy)
---
# 🚀 Workflow de Deploy Seguro (Journey CRM)

Este workflow garante que você tem **100% de controle** sobre o que vai para produção (Railway), eliminando qualquer divergência entre local e produção.

Execute este processo *sempre* antes de subir qualquer alteração.

---

### 🔍 Passo 1: O que vai mudar no Código? (Git Diff)

O comando abaixo mostra **quais arquivos** foram alterados desde o último commit. Leia com atenção para garantir que não há logs de debug, URLs fixas de teste ou arquivos de desenvolvimento.

// turbo
```bash
git diff HEAD --stat && git status
```

Se tiver arquivos indesejados no `git status`, remova-os do staging antes de seguir.

---

### 🛢️ Passo 2: O que vai mudar no Banco de Dados? (Prisma)

Confira quais migrações locais estão pendentes. Isso mostra exatamente quais tabelas ou colunas vão ser alteradas no banco de produção.

> **Como funciona automaticamente:** O Railway executa `prisma migrate deploy` via `npm run start` do server antes de subir o servidor. Ou seja, **toda migration local que você criou com `migrate dev` será aplicada automaticamente no deploy** — você não precisa rodar manualmente em produção.

// turbo
```bash
cd server && npx prisma migrate status && cd ..
```

Se o status mostrar migrações pendentes, elas serão aplicadas automaticamente no próximo deploy. Se não quiser que sejam aplicadas, não faça o push ainda.

---

### 🔐 Passo 3: Verificar Variáveis de Ambiente

As variáveis do seu `.env` local **não vão para produção automaticamente**. Sempre que adicionar uma nova variável ao `.env`, é preciso cadastrá-la manualmente no Railway também.

**Checklist de sincronização:**

1. Abra o Railway → seu serviço → **Variables**
2. Compare com o seu `server/.env` local
3. Qualquer variável nova que estiver no local e não estiver no Railway precisa ser adicionada

> **Como confirmar que está tudo certo:** Na próxima vez que o servidor subir em produção, o `startup-check.js` vai logar no console do Railway quais variáveis estão presentes e quais estão faltando. Se alguma CRÍTICA faltar, o servidor **não sobe** — você verá o erro no log antes de tudo quebrar.

**Variáveis críticas (servidor não sobe sem elas):**
| Variável | Onde obter |
|---|---|
| `DATABASE_URL` | Railway injeta automaticamente |
| `CLERK_PUBLISHABLE_KEY` | dashboard.clerk.com → API Keys |
| `CLERK_SECRET_KEY` | dashboard.clerk.com → API Keys |
| `NODE_ENV` | Definir como `production` no Railway |
| `ALLOWED_ORIGIN` | URL do frontend no Railway |

**Variáveis opcionais (features desativadas sem elas):**
| Variável | Feature afetada |
|---|---|
| `RESEND_API_KEY` | Envio de e-mails |
| `GEMINI_API_KEY` | Gabi IA |
| `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | Upload de anexos |
| `METABASE_SITE_URL` + `METABASE_SECRET_KEY` | Dashboards embutidos |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Gravações Google Meet |

---

### 🏭 Passo 4: Build Local (Garantir que não vai quebrar)

Antes de enviar, gere os artefatos locais para garantir que o build não vai falhar na nuvem.

// turbo
```bash
cd server && npm run build && cd ..
```

Se deu sucesso, o código está seguro para subir!

---

### 📤 Passo 5: Commit & Deploy

Agora é só fazer o commit e o push. Ao mandar para a branch `main`, o Railway cuida de:
1. Rodar `prisma generate` (build)
2. Rodar `prisma migrate deploy` (aplica migrations no banco de produção)
3. Subir o servidor com `node index.js`

_Substitua a mensagem abaixo pelo que foi feito:_

```bash
git add .
git commit -m "feat: [sua mensagem de deploy aqui]"
git push origin main
```

---

### ✅ Passo 6: Confirmação pós-deploy

Acompanhe o painel do Railway (https://railway.app/dashboard):

1. Verifique se o novo container subiu com status **verde**
2. Clique em **View Logs** e procure pelo log do `startup-check`:
   - `✓ Todas as variáveis estão configuradas. Ambiente 100% sincronizado!` → Tudo OK
   - `✗ FALHA: X variável(eis) CRÍTICA(S) ausente(s)` → Configurar a variável no Railways e fazer redeploy
3. Acesse a rota `/health` em produção e confirme `{ "status": "OK" }`
