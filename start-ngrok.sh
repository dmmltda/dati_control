#!/bin/bash

# ============================================================
# 🚇 Journey CRM - ngrok Tunnel (Domínio Fixo)
# Expõe o localhost:8000 para webhooks externos com URL permanente
# ============================================================

DOMAIN="unnephritic-spirituously-davion.ngrok-free.dev"

echo ""
echo "🚇 Iniciando túnel ngrok com domínio FIXO..."
echo ""
echo "✅ URL permanente (nunca muda):"
echo "   https://$DOMAIN"
echo ""
echo "URLs dos webhooks já configuradas:"
echo "  📱 WhatsApp:     https://$DOMAIN/api/webhook-whatsapp"
echo "  📧 Email:        https://$DOMAIN/api/webhook-email"
echo "  📋 Google Forms: https://$DOMAIN/api/webhook-google-forms"
echo "  💬 NPS:          https://$DOMAIN/api/nps"
echo ""
echo "─────────────────────────────────────────────────────"
echo "  Pressione Ctrl+C para encerrar o túnel"
echo "─────────────────────────────────────────────────────"
echo ""

ngrok http --domain=$DOMAIN 8000
