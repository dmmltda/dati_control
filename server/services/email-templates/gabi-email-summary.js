/**
 * Template: Resumo da Gabi
 */
export function gabiSummaryTemplate(data) {
    const { subject: subjectParam, body, solicitadoPor } = data;
    
    // O subject já vem pronto da Gabi
    const subject = subjectParam || 'Resumo Journey CRM';

    const html = `
<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4);">
    <div style="background:linear-gradient(135deg, #6366f1 0%, #a855f7 100%);padding:24px 32px;text-align:center;">
      <div style="font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.5px;">✨ Gabi Intelligence</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:4px;text-transform:uppercase;font-weight:600;">Journey CRM</div>
    </div>
    <div style="padding:32px;">
      <div style="color:#e2e8f0;font-size:15px;line-height:1.6;">
        ${body}
      </div>
      
      <div style="margin-top:40px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
        <p style="margin:0;font-size:12px;color:#64748b;">
          Este e-mail foi gerado pela IA Gabi sob solicitação ${solicitadoPor?.nome ? `de ${solicitadoPor.nome}` : ''}.
        </p>
        <p style="margin:8px 0 0;font-size:11px;color:#475569;font-weight:600;">
          ENVIADO VIA GABI — JOURNEY CRM
        </p>
      </div>
    </div>
  </div>
</body></html>`;

    return { subject, html };
}
