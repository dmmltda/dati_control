#!/bin/bash
# ─────────────────────────────────────────────────────────
#  start-dev.sh — Inicia o servidor Journey (dati_control)
#  Uso: ./start-dev.sh
# ─────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/server"

# 1. Mata qualquer processo ocupando a porta 8000
echo "🔍 Verificando porta 8000..."
PID=$(lsof -ti :8000 2>/dev/null || true)
if [ -n "$PID" ]; then
  echo "⚠️  Matando processo na porta 8000 (PID: $PID)..."
  kill -9 $PID 2>/dev/null || true
  sleep 1
fi

# 2. Sobe o servidor Node.js
echo "🚀 Iniciando Journey na porta 8000..."
cd "$SERVER_DIR"
node index.js
