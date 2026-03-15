export function npsSurveyTemplate(destinatario, tipoForm, urlForm) {
    const subject = `Pesquisa de Satisfação - ${tipoForm}`;

    const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="utf-8">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; color: #1f2937; margin: 0; padding: 40px 20px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
            
            <div style="background: linear-gradient(135deg, #0F3460 0%, #1A5276 100%); padding: 32px 40px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.025em;">Sua opinião é muito importante!</h1>
            </div>

            <div style="padding: 40px;">
                <p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px;">Olá,</p>
                <p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                    Gostaríamos muito de ouvir o seu feedback sobre a nossa interação recente relacionada ao <strong>${tipoForm}</strong>.
                </p>
                
                <p style="font-size: 16px; line-height: 1.6; margin: 0 0 32px;">
                    A pesquisa é bem rápida e nos ajuda a melhorar continuamente nossos serviços para você.
                </p>

                <div style="text-align: center; margin-bottom: 32px;">
                    <a href="${urlForm}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-weight: 600; font-size: 16px; text-decoration: none; padding: 14px 28px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);">
                        Responder Pesquisa
                    </a>
                </div>

                <p style="font-size: 14px; color: #6b7280; line-height: 1.5; margin: 0;">
                    Se o botão acima não funcionar, copie e cole este link no seu navegador:<br>
                    <a href="${urlForm}" style="color: #4f46e5; word-break: break-all;">${urlForm}</a>
                </p>
            </div>

            <div style="background-color: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                <p style="margin: 0; font-size: 13px; color: #6b7280;">Este é um e-mail automático enviado pelo Journey CRM.</p>
            </div>
            
        </div>
    </body>
    </html>
    `;

    return { subject, html };
}
