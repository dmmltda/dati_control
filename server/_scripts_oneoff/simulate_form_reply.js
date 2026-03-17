import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    console.log("Buscando o log do e-mail 'Pesquisa de Satisfação - Churn'...");
    
    const originalEmail = await prisma.email_send_log.findFirst({
        where: { direction: 'outbound', template: 'npsSurvey' },
        orderBy: { sent_at: 'desc' }
    });

    if (!originalEmail) {
        console.log("Nenhum e-mail de pesquisa encontrado. Tentando qualquer outbound...");
        const anyEmail = await prisma.email_send_log.findFirst({
            where: { direction: 'outbound' },
            orderBy: { sent_at: 'desc' }
        });
        if (!anyEmail) { console.log("Nenhum e-mail outbound no banco."); return; }
        console.log("Usando:", anyEmail.subject, anyEmail.recipient);
        await simulateReply(anyEmail);
    } else {
        console.log(`E-mail encontrado: ${originalEmail.subject} → ${originalEmail.recipient}`);
        await simulateReply(originalEmail);
    }

    await prisma.$disconnect();
}

async function simulateReply(originalEmail) {
    const payload = {
        from: `Daniel Mendes <${originalEmail.recipient}>`,
        to: `reply+${originalEmail.dedup_key}@dati.com.br`,
        subject: `Re: ${originalEmail.subject}`,
        text: `Boa tarde! Respondi ao formulário de pesquisa que vocês enviaram. 
Minha nota foi 8/10 — no geral estou satisfeito com o suporte, 
mas tive um problema recente com o relatório de faturamento que está com erro de cálculo. 
Podem verificar para mim? Precisaria urgente para fechar o mês.`,
    };

    console.log(`\nSimulando resposta de ${originalEmail.recipient} ao formulário NPS...`);
    
    const resp = await fetch('http://localhost:8000/api/webhooks/incoming-email/incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const text = await resp.text();
    console.log(`Status HTTP: ${resp.status}`);
    console.log(`Resposta do servidor: ${text}`);
}

run().catch(console.error);
