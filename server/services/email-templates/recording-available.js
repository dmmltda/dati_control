/**
 * Template: Gravação Disponível
 */
export function recordingAvailableTemplate(activity, usuario, empresa) {
    const { title, activity_datetime, recording_url } = activity;
    const saudacao = usuario?.nome ? `Olá, ${usuario.nome.split(' ')[0]}!` : 'Olá!';
    const dataReuniao = activity_datetime ? new Date(activity_datetime).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }) : 'N/A';

    const subject = `Gravação disponível: ${title}`;

    const html = `
<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4);">
    <div style="background:#6366f1;padding:20px 28px;">
      <div style="font-size:22px;font-weight:800;color:#fff;">🎥 Gravação Disponível</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">Journey CRM</div>
    </div>
    <div style="padding:28px;">
      <p style="margin:0 0 8px;font-size:15px;color:#e2e8f0;">${saudacao}</p>
      <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;">A gravação da reunião "${title}" (realizada em ${dataReuniao}) já está disponível para visualização.</p>
      
      <div style="text-align:center;margin:32px 0;">
        <a href="${recording_url}" style="display:inline-block;background:#22c55e;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;box-shadow:0 4px 12px rgba(34,197,94,0.3);">Assistir Gravação</a>
      </div>

      <div style="text-align:center;margin-top:24px;">
        <a href="https://journeycrm.com" style="display:inline-block;color:#818cf8;text-decoration:none;font-size:14px;font-weight:600;">Ver detalhes no Journey CRM</a>
      </div>
    </div>
  </div>
</body></html>`;

    return { subject, html };
}
