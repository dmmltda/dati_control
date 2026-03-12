/**
 * Template: Resumo de Reunião
 */
export function meetingSummaryTemplate(activity, usuario, empresa) {
    const { title, description, updated_at, time_spent_minutes, next_step_title, next_step_date } = activity;
    const saudacao = usuario?.nome ? `Olá, ${usuario.nome.split(' ')[0]}!` : 'Olá!';
    const dataRealizada = updated_at ? new Date(updated_at).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }) : 'N/A';
    
    const nextStepDateFmt = next_step_date ? new Date(next_step_date).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }) : null;

    const subject = `Resumo: ${title}`;

    const html = `
<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4);">
    <div style="background:#6366f1;padding:20px 28px;">
      <div style="font-size:22px;font-weight:800;color:#fff;">📝 Resumo da Reunião</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">Journey CRM</div>
    </div>
    <div style="padding:28px;">
      <p style="margin:0 0 8px;font-size:15px;color:#e2e8f0;">${saudacao}</p>
      <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;">A reunião "${title}" foi concluída. Aqui está o resumo:</p>
      
      <div style="background:#0f172a;border-radius:10px;padding:16px 20px;margin:0 0 20px;border-left:3px solid #6366f1;">
        <div style="font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:8px;">${title}</div>
        <div style="font-size:13px;color:#94a3b8;margin-bottom:8px;">
          🗓️ Data: ${dataRealizada} ${time_spent_minutes ? `| ⏱️ Duração: ${time_spent_minutes} min` : ''}
        </div>
        ${description ? `<div style="font-size:13px;color:#cbd5e1;line-height:1.5;">${description}</div>` : ''}
      </div>

      ${next_step_title ? `
      <div style="background:rgba(99,102,241,0.1);border-radius:10px;padding:16px 20px;margin:0 0 20px;border:1px dashed #6366f1;">
        <div style="font-size:13px;font-weight:700;color:#a5b4fc;margin-bottom:4px;text-transform:uppercase;">Próximo Passo</div>
        <div style="font-size:14px;color:#e2e8f0;font-weight:600;">${next_step_title}</div>
        ${nextStepDateFmt ? `<div style="font-size:12px;color:#94a3b8;margin-top:4px;">📅 Prazo: ${nextStepDateFmt}</div>` : ''}
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
