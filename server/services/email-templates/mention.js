/**
 * Template: Menção em Atividade
 * Disparado quando um usuário é @mencionado (server/index.js)
 */

/**
 * @param {{ title, description }} activity
 * @param {{ nome }} mencionadoPor
 * @returns {{ subject: string, html: string }}
 */
export function mentionTemplate(activity, mencionadoPor) {
    const { title, description } = activity;
    const autor = mencionadoPor?.nome || 'Um colega';

    const subject = `📣 Você foi mencionado: ${title.trim()}`;

    const html = `
<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4);">
    <div style="background:#8b5cf6;padding:20px 28px;">
      <div style="font-size:22px;font-weight:800;color:#fff;">📣 Você foi mencionado</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">por ${autor}</div>
    </div>
    <div style="padding:28px;">
      <p style="margin:0 0 16px;font-size:14px;color:#94a3b8;">
        <strong style="color:#c4b5fd;">${autor}</strong> mencionou você em uma atividade:
      </p>
      <div style="background:#0f172a;border-radius:10px;padding:16px 20px;margin:0 0 20px;border-left:3px solid #8b5cf6;">
        <div style="font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:8px;">${title.trim()}</div>
        ${description ? `<div style="font-size:13px;color:#94a3b8;">${description}</div>` : ''}
      </div>
      <p style="margin:0;font-size:12px;color:#64748b;">
        Acesse <strong style="color:#818cf8;">Journey CRM</strong> para responder ou ver o contexto completo.
      </p>
    </div>
  </div>
</body></html>`;

    return { subject, html };
}
