/**
 * startup-check.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Valida as variáveis de ambiente ANTES de o servidor subir.
 * Roda automaticamente quando NODE_ENV=production (via npm run start).
 *
 * Regras:
 *   CRITICAL → Aborta o processo se ausente (o servidor NÃO sobe)
 *   WARN     → Loga aviso mas não aborta (feature opcional pode estar desativada)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const VARS = [
  // ── Banco de Dados ─────────────────────────────────────────────────────────
  { name: 'DATABASE_URL',              level: 'CRITICAL', hint: 'Connection string do PostgreSQL (Railway injeta automaticamente)' },

  // ── Autenticação ───────────────────────────────────────────────────────────
  { name: 'CLERK_PUBLISHABLE_KEY',     level: 'CRITICAL', hint: 'dashboard.clerk.com → API Keys → Publishable key' },
  { name: 'CLERK_SECRET_KEY',          level: 'CRITICAL', hint: 'dashboard.clerk.com → API Keys → Secret key' },

  // ── Servidor ───────────────────────────────────────────────────────────────
  { name: 'NODE_ENV',                  level: 'CRITICAL', hint: 'Deve ser "production" no Railway. Settings → Variables' },
  { name: 'ALLOWED_ORIGIN',            level: 'CRITICAL', hint: 'URL do frontend. Ex: https://journey-dati.railway.app' },

  // ── E-mail (Resend) ────────────────────────────────────────────────────────
  { name: 'RESEND_API_KEY',            level: 'WARN',     hint: 'resend.com → API Keys. Sem isso, e-mails ficam desativados.' },

  // ── Gabi AI (Gemini) ───────────────────────────────────────────────────────
  { name: 'GEMINI_API_KEY',            level: 'WARN',     hint: 'aistudio.google.com/app/apikey. Sem isso, Gabi IA fica desativada.' },
  { name: 'GABI_MONTHLY_LIMIT_USD',    level: 'WARN',     hint: 'Limite mensal de gasto em USD. Padrão: $20.' },
  { name: 'GABI_ALERT_EMAIL',          level: 'WARN',     hint: 'E-mail que recebe alertas de custo da Gabi.' },
  { name: 'GABI_EMAIL_FROM',           level: 'WARN',     hint: 'Remetente dos alertas de custo.' },

  // ── Supabase ───────────────────────────────────────────────────────────────
  { name: 'SUPABASE_URL',              level: 'WARN',     hint: 'supabase.com → Settings → API → URL. Sem isso, upload de anexos desativado.' },
  { name: 'SUPABASE_SERVICE_KEY',      level: 'WARN',     hint: 'supabase.com → Settings → API → service_role. Sem isso, upload de anexos desativado.' },

  // ── Metabase ───────────────────────────────────────────────────────────────
  { name: 'METABASE_SITE_URL',         level: 'WARN',     hint: 'URL do serviço Metabase no Railway. Sem isso, dashboards embutidos desativados.' },
  { name: 'METABASE_SECRET_KEY',       level: 'WARN',     hint: 'Chave de signing do Metabase (openssl rand -hex 32). Deve ser igual à MB_EMBEDDING_SECRET_KEY.' },
];

// ─────────────────────────────────────────────────────────────────────────────

const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN  = '\x1b[32m';
const CYAN   = '\x1b[36m';
const DIM    = '\x1b[2m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

export function runStartupCheck() {
  // Só exige CRITICAL em produção; localmente apenas informa.
  const isProd = process.env.NODE_ENV === 'production';

  console.log(`\n${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${CYAN}${BOLD}  Journey CRM — Verificação de Ambiente (startup-check)${RESET}`);
  console.log(`${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`  Ambiente: ${BOLD}${isProd ? '🏭 PRODUÇÃO' : '💻 DESENVOLVIMENTO'}${RESET}\n`);

  const missing_critical = [];
  const missing_warn     = [];

  for (const { name, level, hint } of VARS) {
    const value = process.env[name];
    const exists = value !== undefined && value.trim() !== '';

    if (exists) {
      // Oculta o valor real por segurança — mostra só os primeiros e últimos chars
      const masked = value.length > 8
        ? `${value.slice(0, 4)}${'*'.repeat(Math.min(value.length - 8, 20))}${value.slice(-4)}`
        : '****';
      console.log(`  ${GREEN}✓${RESET}  ${BOLD}${name}${RESET} ${DIM}= ${masked}${RESET}`);
    } else {
      if (level === 'CRITICAL') {
        console.log(`  ${RED}✗  ${BOLD}${name}${RESET} ${RED}[CRÍTICA — AUSENTE]${RESET}`);
        console.log(`     ${DIM}→ ${hint}${RESET}`);
        missing_critical.push(name);
      } else {
        console.log(`  ${YELLOW}⚠  ${BOLD}${name}${RESET} ${YELLOW}[opcional — ausente]${RESET}`);
        console.log(`     ${DIM}→ ${hint}${RESET}`);
        missing_warn.push(name);
      }
    }
  }

  console.log(`\n${CYAN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);

  if (missing_critical.length > 0) {
    console.log(`\n${RED}${BOLD}  ✗ FALHA: ${missing_critical.length} variável(eis) CRÍTICA(S) ausente(s):${RESET}`);
    missing_critical.forEach(v => console.log(`  ${RED}  • ${v}${RESET}`));

    if (isProd) {
      console.log(`\n${RED}${BOLD}  O servidor NÃO vai subir. Configure as variáveis no Railway e faça redeploy.${RESET}\n`);
      process.exit(1); // ← Aborta o processo em produção
    } else {
      console.log(`\n${YELLOW}  (Ambiente local: continuando mesmo assim, mas algumas features podem falhar.)${RESET}\n`);
    }
  } else if (missing_warn.length > 0) {
    console.log(`\n${YELLOW}  ⚠ ${missing_warn.length} variável(eis) opcional(is) ausente(s). Features relacionadas estão desativadas.${RESET}\n`);
  } else {
    console.log(`\n${GREEN}${BOLD}  ✓ Todas as variáveis estão configuradas. Ambiente 100% sincronizado!${RESET}\n`);
  }
}
