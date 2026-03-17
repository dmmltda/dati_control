---
description: Como expor o localhost para testar webhooks (WhatsApp, Google Forms) sem deploy
---

# 🚇 Workflow: Tunnel Local com ngrok

Use este workflow quando precisar **testar webhooks externos localmente**, sem precisar fazer deploy no Railway a cada mudança.

## Quando usar?
- Testando mudanças no webhook do **WhatsApp**
- Testando o webhook de **Google Forms / email**
- Qualquer serviço externo que precisa chamar o seu servidor

---

## Passo 1: Garantir que o servidor local está rodando

Verifique se o servidor está rodando em `localhost:8000`. Se não estiver, use o workflow `/start-server`.

---

## Passo 2: Subir o túnel ngrok

// turbo
```bash
./start-ngrok.sh
```

O terminal vai mostrar uma URL pública, como:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:8000
```

---

## Passo 3: Copiar a URL e atualizar o webhook

Com a URL gerada (ex: `https://abc123.ngrok-free.app`), atualize temporariamente no serviço externo:

| Serviço | URL do Webhook |
|---------|---------------|
| WhatsApp (Meta) | `https://XXXX.ngrok-free.app/api/webhook-whatsapp` |
| Google Forms / Email | `https://XXXX.ngrok-free.app/api/webhook-email` |

---

## ⚠️ Atenção

- A URL muda **a cada vez** que você reinicia o ngrok (plano grátis)
- Quando terminar de testar, **restaure a URL de produção** nos webhooks:
  `https://journeycontrol.up.railway.app/api/...`
- O ngrok é **só para desenvolvimento** — nunca use como URL permanente

---

## Passo 4: Encerrar o túnel

Pressione `Ctrl+C` no terminal onde o ngrok está rodando.
Após encerrar, lembre de **voltar a URL de produção** nos serviços externos.
