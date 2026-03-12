/**
 * Template: Convite de Reunião
 */
export function meetingInviteTemplate(activity, usuario, empresa) {
    const { title, description, activity_datetime, google_meet_link, activity_assignees } = activity;
    const saudacao = usuario?.nome ? `Olá, ${usuario.nome.split(' ')[0]}!` : 'Olá!';
    const dataFormatada = activity_datetime ? new Date(activity_datetime).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }) : 'A definir';

    const subject = `Convite: ${title}`;

    const html = `
<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4);">
    <div style="background:#6366f1;padding:20px 28px;">
      <div style="font-size:22px;font-weight:800;color:#fff;">📅 Convite de Reunião</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">Journey CRM</div>
    </div>
    <div style="padding:28px;">
      <p style="margin:0 0 8px;font-size:15px;color:#e2e8f0;">${saudacao}</p>
      <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;">Você foi convidado para uma reunião:</p>
      <div style="background:#0f172a;border-radius:10px;padding:16px 20px;margin:0 0 20px;border-left:3px solid #6366f1;">
        <div style="font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:8px;">${title}</div>
        <div style="font-size:14px;color:#cbd5e1;margin-bottom:12px;">🗓️ ${dataFormatada}</div>
        ${description ? `<div style="font-size:13px;color:#94a3b8;margin-bottom:12px;">${description}</div>` : ''}
        
        ${google_meet_link ? `
        <div style="margin:16px 0;">
          <a href="${google_meet_link}" style="display:inline-block;background:#22c55e;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Entrar no Google Meet</a>
        </div>
        ` : ''}

        <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:12px;">
          <span style="font-size:12px;background:rgba(99,102,241,0.15);color:#a5b4fc;padding:3px 10px;border-radius:20px;">🏢 ${empresa || 'Nenhuma'}</span>
        </div>
      </div>

      ${activity_assignees?.length > 0 ? `
      <div style="margin-bottom:20px;">
        <div style="font-size:13px;font-weight:600;color:#94a3b8;margin-bottom:8px;">Participantes:</div>
        <div style="font-size:13px;color:#cbd5e1;">
          ${activity_assignees.map(a => a.user_id).join(', ')}
        </div>
      </div>
      ` : ''}

      <div style="text-align:center;margin-top:32px;">
        <a href="https://journeycrm.com" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Ver no Journey CRM</a>
      </div>
    </div>
  </div>
</body></html>`;

    return { subject, html };
}
