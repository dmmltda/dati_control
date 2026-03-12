/**
 * Template: Lembrete de Atividade
 * Disparado pelo cron de lembretes (server/index.js)
 */

/**
 * @param {{ title, description, company, activity_type, status, reminder_at }} activity
 * @param {{ nome }} usuario
 * @returns {{ subject: string, html: string }}
 */
export function activityReminderTemplate(activity, usuario) {
    const { title, description, companies, activity_type, status } = activity;
    const empresa = companies?.Nome_da_empresa || 'Nenhuma';
    const saudacao = usuario?.nome ? `Olá, ${usuario.nome.split(' ')[0]}!` : 'Olá!';

    const subject = `🔔 Lembrete: ${title}`;

    const html = `
<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4);">
    <div style="background:#6366f1;padding:20px 28px;">
      <div style="font-size:22px;font-weight:800;color:#fff;">🔔 Lembrete de Atividade</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">Journey CRM</div>
    </div>
    <div style="padding:28px;">
      <p style="margin:0 0 8px;font-size:15px;color:#e2e8f0;">${saudacao}</p>
      <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;">Você tem uma atividade pendente:</p>
      <div style="background:#0f172a;border-radius:10px;padding:16px 20px;margin:0 0 20px;border-left:3px solid #6366f1;">
        <div style="font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:8px;">${title}</div>
        ${description ? `<div style="font-size:13px;color:#94a3b8;margin-bottom:12px;">${description}</div>` : ''}
        <div style="display:flex;gap:1rem;flex-wrap:wrap;">
          <span style="font-size:12px;background:rgba(99,102,241,0.15);color:#a5b4fc;padding:3px 10px;border-radius:20px;">🏢 ${empresa}</span>
          <span style="font-size:12px;background:rgba(255,255,255,0.06);color:#94a3b8;padding:3px 10px;border-radius:20px;">${activity_type}</span>
          ${status ? `<span style="font-size:12px;background:rgba(255,255,255,0.06);color:#94a3b8;padding:3px 10px;border-radius:20px;">${status}</span>` : ''}
        </div>
      </div>
      <p style="margin:0;font-size:12px;color:#64748b;">
        Acesse <strong style="color:#818cf8;">Journey CRM</strong> para ver todos os detalhes.
      </p>
    </div>
  </div>
</body></html>`;

    return { subject, html };
}
