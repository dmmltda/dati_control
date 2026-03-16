---
description: Como fazer um deploy seguro (Checklist de Deploy)
---
# 🚀 Workflow de Deploy Seguro (Journey CRM)

Este workflow garante que você tem **100% de controle** sobre o que vai para produção (Railway), evitando aquele problema de "empresas de teste" ou schemas quebrados.

Execute este processo *sempre* antes de subir qualquer alteração.

### 🔍 Passo 1: O que vai mudar no Código? (Git Diff)

O comando abaixo mostra **quais arquivos** foram alterados desde o último commit e suas diferenças. Leia atentamente para ter certeza de que você não deixou logs ou URLs de teste fixas no código.

// turbo
```bash
git diff HEAD --stat
```

```bash
git status
```

Se tiver arquivos indesejados no `git status`, remova-os do staging ou faça checkout antes de seguir.

---

### 🛢️ Passo 2: O que vai mudar no Banco de Dados? (Prisma)

Confira quais são as migrações locais pendentes. Isso diz a você exatamente quais tabelas ou colunas vão mudar no banco. 

_**Nota:** Lembre-se, o comando de aplicar no banco de produção (`prisma migrate deploy`) será rodado automaticamente pelo Railway no deploy._

// turbo
```bash
cd server && npx prisma migrate status && cd ..
```

Se o status estiver correto (ou nenhuma migração pendente se for apenas mudança de front), avance.

---

### 🏭 Passo 3: Build Local (Garantir que não vai quebrar)

Antes de enviar, vamos gerar os artefatos locais para ter certeza de que o Build não vai jogar um erro na nuvem (o famoso "só substitui o container se passar").

// turbo
```bash
cd server && npm run build && cd ..
```

Se deu sucesso, o código está seguro para subir!

---

### 📤 Passo 4: Commit & Deploy

Agora é só fazer o commit e o push clássico! Ao mandar para a branch `main`, o Railway cuida de atualizar o banco com segurança (`migrate deploy`) e levantar o container atômico.

_Substitua a mensagem abaixo pelo o que foi feito:_

```bash
git add .
git commit -m "feat: [sua mensagem de deploy aqui]"
git push origin main
```

---

### ✅ Passo 5: Confirmação pós-deploy

Acompanhe o painel do seu Railway (https://railway.app/dashboard). Verifique se o novo container subiu indicando verde.
Se no futuro construirmos o menu "Deploy" na UI, esse último passo poderá ser feito e auditado de dentro do próprio Journey.
