/**
 * Template: Lembrete de Próximo Passo
 */
export function nextStepReminderTemplate(activity, usuario, empresa) {
    const { title, next_step_title, next_step_date } = activity;
    const saudacao = usuario?.nome ? `Olá, ${usuario.nome.split(' ')[0]}!` : 'Olá!';
    const dataLimite = next_step_date ? new Date(next_step_date).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }) : 'A definir';

    const subject = `Lembrete de próximo passo: ${next_step_title || 'Atividade pendente'}`;

    const html = `
<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:520px;margin:32px auto;background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4);">
    <div style="background:#f59e0b;padding:20px 28px;">
      <div style="font-size:22px;font-weight:800;color:#fff;">🚀 Próximo Passo</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">Journey CRM</div>
    </div>
    <div style="padding:28px;">
      <p style="margin:0 0 8px;font-size:15px;color:#e2e8f0;">${saudacao}</p>
      <p style="margin:0 0 20px;font-size:14px;color:#94a3b8;">Um lembrete automático sobre o próximo passo da atividade <strong>${title}</strong>:</p>
      
      <div style="background:#0f172a;border-radius:10px;padding:16px 20px;margin:0 0 20px;border-left:3px solid #f59e0b;">
        <div style="font-size:13px;font-weight:700;color:#f59e0b;margin-bottom:4px;text-transform:uppercase;">O que fazer:</div>
        <div style="font-size:16px;font-weight:700;color:#e2e8f0;margin-bottom:8px;">${next_step_title}</div>
        <div style="font-size:14px;color:#cbd5e1;">🗓️ Prazo: ${dataLimite}</div>
      </div>

      <div style="text-align:center;margin-top:32px;">
        <a href="https://journeycrm.com" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Ver no Journey CRM</a>
      </div>
    </div>
  </div>
</body></html>`;

    return { subject, html };
}
