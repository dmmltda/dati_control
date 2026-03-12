/**
 * Template: Alerta de Consumo Gabi AI
 * Disparado quando o gasto mensal cruza o threshold configurado
 */

/**
 * @param {{ spent, limit, pct }} data
 * @returns {{ subject: string, html: string }}
 */
export function gabiAlertTemplate({ spent, limit, pct }) {
    const isLimite  = spent >= limit;
    const restante  = Math.max(0, limit - spent);
    const mes       = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const corHeader = isLimite ? '#ef4444' : pct >= 90 ? '#ef4444' : '#f59e0b';
    const emoji     = isLimite ? '🚨' : '⚠️';

    const subject = isLimite
        ? `🚨 Limite Gabi AI atingido — US$ ${spent.toFixed(4)} de US$ ${limit.toFixed(0)} (${mes})`
        : `⚠️ Gabi AI: ${pct.toFixed(0)}% do limite consumido — US$ ${spent.toFixed(4)} de US$ ${limit.toFixed(0)}`;

    const html = `
<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4);">
    <div style="background:${corHeader};padding:20px 28px;">
      <div style="font-size:22px;font-weight:800;color:#fff;">${emoji} Gabi AI — Alerta de Consumo</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">${mes}</div>
    </div>
    <div style="padding:28px;">
      <p style="margin:0 0 16px;font-size:15px;color:#e2e8f0;">
        ${isLimite
            ? '<strong style="color:#fca5a5;">O limite mensal foi atingido!</strong> A Gabi está pausada. Aumente o limite ou aguarde o próximo mês.'
            : `O consumo atingiu <strong style="color:#fcd34d;">${pct.toFixed(0)}%</strong> do limite configurado.`
        }
      </p>
      <div style="background:#0f172a;border-radius:10px;padding:16px 20px;margin:0 0 20px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="color:#94a3b8;font-size:13px;">Gasto atual</span>
          <span style="color:#e2e8f0;font-weight:700;font-family:monospace;">US$ ${spent.toFixed(4)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="color:#94a3b8;font-size:13px;">Limite mensal</span>
          <span style="color:#e2e8f0;font-weight:700;font-family:monospace;">US$ ${limit.toFixed(2)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
          <span style="color:#94a3b8;font-size:13px;">Restante</span>
          <span style="color:${restante <= 0 ? '#ef4444' : '#10b981'};font-weight:700;font-family:monospace;">US$ ${restante.toFixed(4)}</span>
        </div>
        <div style="background:rgba(255,255,255,0.06);border-radius:6px;height:8px;overflow:hidden;">
          <div style="height:100%;width:${Math.min(100, pct).toFixed(1)}%;background:${corHeader};border-radius:6px;"></div>
        </div>
        <div style="text-align:right;font-size:11px;color:#64748b;margin-top:4px;">${pct.toFixed(1)}% consumido</div>
      </div>
      <p style="margin:0;font-size:12px;color:#64748b;">
        Acesse <strong style="color:#818cf8;">Journey → Configurações → Gabi AI</strong> para ajustar o limite.
      </p>
    </div>
  </div>
</body></html>`;

    return { subject, html };
}
