/**
 * @file nps-form.js — Template de e-mail para envio de pesquisa NPS (Google Forms)
 */

export function npsFormTemplate(empresa, tipo, formLink) {
    const tiposMap = {
        kickoff: 'Kickoff do Projeto',
        onboarding: 'Onboarding',
        nps_mensal: 'Acompanhamento Mensal',
        churn: 'Encerramento de Parceria'
    };

    const tipoNome = tiposMap[tipo] || 'Satisfação';
    const subject = `Pesquisa de ${tipoNome} — ${empresa.Nome_da_empresa}`;

    const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; line-height: 1.6;">
        <div style="text-align: center; margin-bottom: 30px;">
            <img src="https://lh3.googleusercontent.com/d/1vC3z9z9X0-qXJ8LpX0Z9YvP7B3Z4e8K1" alt="DATI" style="height: 40px;">
        </div>
        
        <h2 style="color: #6366f1; margin-bottom: 20px;">Olá! Como foi sua experiência?</h2>
        
        <p>Gostaríamos de saber sua opinião sobre o <strong>${tipoNome}</strong> da <strong>${empresa.Nome_da_empresa}</strong> realizado recentemente.</p>
        
        <p>Sua avaliação é fundamental para que possamos melhorar continuamente nossos serviços e garantir o sucesso da sua jornada conosco.</p>
        
        <div style="text-align: center; margin: 40px 0;">
            <a href="${formLink}" style="background-color: #6366f1; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
                Responder Pesquisa de Satisfação
            </a>
        </div>
        
        <p style="font-size: 14px; color: #666;">O formulário leva menos de 1 minuto para ser respondido.</p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 40px 0;">
        
        <p style="font-size: 12px; color: #999; text-align: center;">
            Este é um e-mail automático enviado pela DATI em nome da ${empresa.Nome_da_empresa}.<br>
            DATI — Inteligência em Comércio Exterior
        </p>
    </div>
    `;

    return { subject, html };
}
