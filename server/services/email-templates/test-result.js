/**
 * Template: Falha em Testes Automatizados
 * Disparado pelo test-runner quando uma suíte falha
 */

/**
 * @param {object} run - objeto test_runs do banco
 * @returns {{ subject: string, html: string }}
 */
export function testResultTemplate(run) {
    const { suite_type, status, total_tests, passed_tests, failed_tests, triggered_at, test_cases } = run;
    const date = new Date(triggered_at).toLocaleString('pt-BR');

    const failedCases = test_cases
        ?.filter(c => c.status !== 'PASSOU')
        ?.slice(0, 15)
        ?.map(c => `<li><strong>${c.test_name}</strong> — ${c.error_message || 'ERRO'}</li>`)
        ?.join('') || '';

    const subject = `❌ Falha nos Testes [${suite_type}] — ${failed_tests} falha(s)`;

    const html = `
<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#1e293b;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.4);">
    <div style="background:#ef4444;padding:20px 28px;">
      <div style="font-size:22px;font-weight:800;color:#fff;">⚠️ Falha nos Testes — Journey CRM</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;">${date}</div>
    </div>
    <div style="padding:28px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:1rem;background:#0f172a;border-radius:10px;overflow:hidden;">
        <tr>
          <td style="padding:10px 16px;color:#94a3b8;font-size:13px;">Suíte</td>
          <td style="padding:10px 16px;font-weight:700;color:#e2e8f0;">${suite_type}</td>
        </tr>
        <tr style="border-top:1px solid rgba(255,255,255,0.05);">
          <td style="padding:10px 16px;color:#94a3b8;font-size:13px;">Status</td>
          <td style="padding:10px 16px;color:#ef4444;font-weight:700;">${status.toUpperCase()}</td>
        </tr>
        <tr style="border-top:1px solid rgba(255,255,255,0.05);">
          <td style="padding:10px 16px;color:#94a3b8;font-size:13px;">Passou</td>
          <td style="padding:10px 16px;color:#10b981;font-weight:700;">${passed_tests}/${total_tests}</td>
        </tr>
        <tr style="border-top:1px solid rgba(255,255,255,0.05);">
          <td style="padding:10px 16px;color:#94a3b8;font-size:13px;">Falhou</td>
          <td style="padding:10px 16px;color:#ef4444;font-weight:700;">${failed_tests}</td>
        </tr>
      </table>
      ${failedCases
        ? `<h3 style="color:#f59e0b;margin:1rem 0 0.5rem;font-size:14px;">Testes que falharam:</h3>
           <ul style="color:#94a3b8;font-size:0.85rem;margin:0;padding-left:1.25rem;">${failedCases}</ul>`
        : ''}
      <p style="font-size:12px;color:#64748b;margin-top:1.5rem;">
        Enviado automaticamente por <strong style="color:#818cf8;">Journey CRM</strong> — Sistema de Testes
      </p>
    </div>
  </div>
</body></html>`;

    return { subject, html };
}
