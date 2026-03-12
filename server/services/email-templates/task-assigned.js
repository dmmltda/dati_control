/**
 * Template: Nova Atividade Atribuída
 */
export function taskAssignedTemplate(activity, usuario, atribuidoPor, empresa) {
    const { title, description, activity_type, priority, activity_datetime } = activity;
    const saudacao = usuario?.nome ? `Olá, ${usuario.nome.split(' ')[0]}!` : 'Olá!';
    const nomeAtribuidor = atribuidoPor?.nome || 'Um colega';
    const dataFmt = activity_datetime ? new Date(activity_datetime).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }) : null;

    const subject = `Nova atividade atribuída: ${title}`;

    const html = `
<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4);">
    <div style="background:#6366f1;padding:20px 28px;">
      <div style="font-size:22px;font-weight:800;color:#fff;">📌 Nova Atribuição</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">Journey CRM</div>
    </div>
    <div style="padding:28px;">
      <p style="margin:0 0 8px;font-size:15px;color:#e2e8f0;">${saudacao}</p>
      <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;"><strong>${nomeAtribuidor}</strong> atribuiu uma nova atividade a você:</p>
      
      <div style="background:#0f172a;border-radius:10px;padding:16px 20px;margin:0 0 20px;border-left:3px solid #f59e0b;">
        <div style="font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:8px;">${title}</div>
        <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:12px;">
          <span style="font-size:11px;background:rgba(255,255,255,0.06);color:#94a3b8;padding:2px 8px;border-radius:12px;">Type: ${activity_type}</span>
          ${priority ? `<span style="font-size:11px;background:rgba(245,158,11,0.15);color:#fbbf24;padding:2px 8px;border-radius:12px;">Prio: ${priority}</span>` : ''}
          ${dataFmt ? `<span style="font-size:11px;background:rgba(255,255,255,0.06);color:#94a3b8;padding:2px 8px;border-radius:12px;">📅 ${dataFmt}</span>` : ''}
        </div>
        ${description ? `<div style="font-size:13px;color:#cbd5e1;line-height:1.5;">${description}</div>` : ''}
      </div>

      <div style="text-align:center;margin-top:32px;">
        <a href="https://journeycrm.com" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Ver no Journey CRM</a>
      </div>
    </div>
  </div>
</body></html>`;

    return { subject, html };
}
