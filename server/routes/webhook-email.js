import express from 'express';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as audit from '../services/audit.js';
import { sendEmail } from '../services/email.js';

const router = express.Router();
const prisma = new PrismaClient();

// Rota para receber respostas de email via Webhook (Ex: Resend, SendGrid)
router.post('/incoming', async (req, res) => {
    try {
        console.log('[Webhook Email] Requisição recebida:', JSON.stringify(req.body).substring(0, 200));

        // Resend envia um formato específico, ajuste conforme o provedor real
        // Webhooks do Resend chegam encapsulados em "req.body.data"
        const payloadData = req.body.data || req.body;
        const { from, to, subject } = payloadData;
        // Resend pode usar diferentes campos para o corpo — normalizar aqui
        const text = payloadData.text || payloadData.plain_text || payloadData.text_body || '';
        const html = payloadData.html || payloadData.html_body || payloadData.html_content || '';
        
        let recipientRaw = '';
        if (Array.isArray(to)) recipientRaw = to.join(',');
        else if (typeof to === 'string') recipientRaw = to;

        if (!from) {
            console.warn('[Webhook Email] Abortando: payload inválido (sem field.from)');
            return res.status(400).json({ error: 'Parâmetro "from" é obrigatório.' });
        }

        // Extrair o dedup_key original do endereço de envio (ex: reply+abc12345@dominio.com.br)
        const match = recipientRaw.match(/reply\+([^@]+)@/i);
        const parentDedupKey = match ? match[1] : null;

        let parentEmailLog = null;
        let companyId = null;
        let clientId = null;
        let assigneeId = null; // Dono da empresa/atividade

        if (parentDedupKey) {
            parentEmailLog = await prisma.email_send_log.findUnique({
                where: { dedup_key: parentDedupKey }
            });
        }

        // Tentar descobrir a empresa a partir do email de origem/destino (remetente = cliente)
        const cleanEmail = from.match(/<([^>]+)>/)?.[1] || from;
        const contato = await prisma.contacts.findFirst({
            where: { Email_1: cleanEmail },
            include: { companies: true }
        });
        
        if (contato) {
            companyId = contato.companyId;
        }

        // 1. Salvar o email na tabela de logs como inbound
        const inboundLog = await prisma.email_send_log.create({
            data: {
                dedup_key: randomUUID(),
                recipient: from,
                subject: subject || 'Sem assunto',
                template: 'inbound_reply',
                tag: 'gabi-inbound',
                direction: 'inbound',
                parent_email_id: parentEmailLog?.id || null,
                status: 'received',
                content: text || html || '',
                // A análise da Gabi será atualizada depois
                gabi_analysis: { processed_by_ai: false }
            }
        });

        // Registrar no Histórico de Alterações (Audit Log)
        audit.log(prisma, {
            actor: null,
            action: 'RECEIVE',
            entity_type: 'email',
            entity_id: inboundLog.id,
            entity_name: inboundLog.subject,
            description: `E-mail recebido de ${from}. Processando via Gabi AI...`,
            company_id: companyId
        });

        // 2. Chamar a IA (Gabi) para classificar o email
        let intent = 'resposta_simples';
        let action = 'auto_replied';
        let summary = 'Não foi possível gerar um resumo pela IA. Cliente confirmou ou respondeu de forma breve.';
        let isComplex = false;
        let sentimentLevel = 'neutral'; // Será classificado pela IA
        
        // Chamada real ao Gemini
        try {
            // Helper local para não depender de refatoração do gabi.js no momento
            async function getApiKey() {
                const setting = await prisma.app_settings.findUnique({ where: { key: 'gemini_api_key' } });
                return setting?.value || process.env.GEMINI_API_KEY || null;
            }
            const apiKey = await getApiKey();
            
            if (apiKey) {
                const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
                const emailBody = text || html || '(sem texto)';
                const prompt = `Você é especialista em Customer Success. Analise o e-mail recebido e responda SOMENTE com JSON válido.
Responda APENAS com este formato JSON:
{
  "intent": "suporte_complexo|resposta_simples",
  "action": "escalated_to_human|auto_replied",
  "sentiment_level": "very_positive|positive|neutral|negative|very_negative",
  "summary": "Resumo de 1 a 2 frases do que o cliente precisa."
}
Critérios de intent:
- "suporte_complexo" / "escalated_to_human": cliente relatou um problema, quer cancelar, reclama, demonstra insatisfação, ou precisa de ajuda específica.
- "resposta_simples" / "auto_replied": cliente deu um ok, respondeu NPS brevemente, só confirmou.
Critérios de sentiment_level:
- very_positive: elogios efusivos, muito satisfeito.
- positive: cliente satisfeito, resposta positiva.
- neutral: neutro, sem indicação clara de satisfação/insatisfação.
- negative: reclamação, frustração, insatisfação.
- very_negative: ameaça cancelar, indignação severa, linguagem muito negativa.

E-mail recebido:
"${emailBody}"`;

                const resp = await fetch(geminiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
                    })
                });

                if (resp.ok) {
                    const data = await resp.json();
                    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    const cleaned = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
                    const parsed  = JSON.parse(cleaned);
                    
                    intent = parsed.intent || intent;
                    action = parsed.action || action;
                    summary = parsed.summary || summary;
                    sentimentLevel = parsed.sentiment_level || 'neutral';
                    isComplex = action === 'escalated_to_human';
                    console.log(`[Webhook Email] 🧠 Análise Gabi: Intenção=${intent}, Sentimento=${sentimentLevel}, Transbordo=${isComplex}`);
                } else {
                    console.warn(`[Webhook Email] Falha na API Gemini: ${resp.status}`);
                }
            } else {
                console.warn(`[Webhook Email] Sem API Key, usando fallback simulado.`);
                throw new Error("No API key");
            }
        } catch (err) {
            // Fallback simulado se IA falhar — analisa palavras-chave no texto
            const bodyForFallback = text || html || '';
            isComplex = bodyForFallback.length > 200 || /cancelar|problema|erro|ajuda|socorro|ruim|péssimo|horrível|insatisf|não consigo|reclamação/i.test(bodyForFallback);
            const isNegative = /ruim|péssimo|horrível|insatisf|cancelar|não consigo|reclamação|problema/i.test(bodyForFallback);
            const isPositive = /ótimo|excelente|parabéns|obrigad|satisfeito|adorei|perfeito/i.test(bodyForFallback);
            sentimentLevel = isNegative ? 'negative' : (isPositive ? 'positive' : 'neutral');
            intent = isComplex ? 'suporte_complexo' : 'resposta_simples';
            action = isComplex ? 'escalated_to_human' : 'auto_replied';
            summary = isComplex 
                ? 'O cliente respondeu com dúvidas ou problemas detalhados. Necessário intervenção humana.'
                : 'O cliente respondeu de forma objetiva / confirmando.';
        }
            
        let gabiOutboundLogId = null;
        let generatedReply = null;
        if (action === 'auto_replied') {
            generatedReply = "Olá! Agradecemos o seu contato. Entendi sua mensagem e já registrei no sistema. Em breve nosso time analisará caso haja mais alguma pendência. Um abraço da Gabi!";
            
            const replySubject = subject?.startsWith('Re:') ? subject : `Re: ${subject || 'Sem assunto'}`;
            const replyHtml = `<div style="font-family:sans-serif; color:#1e293b; line-height:1.7">
<p>${generatedReply}</p>
<hr style="border:none; border-top:1px solid #e2e8f0; margin:1.5rem 0;">
<p style="color:#94a3b8; font-size:0.85rem;">💬 Respondido automaticamente pela Gabi — Assistente de Customer Success da Journey CRM.<br>
Este é um e-mail automático. Para falar com nossa equipe, responda esta mensagem.</p>
</div>`;

            // ── Envio REAL via Resend — NÃO deixa sendEmail criar log duplo ──
            // Criamos o log de saída manualmente para ter controle total do parent_email_id
            const outboundDedupKey = randomUUID();
            const outboundLog = await prisma.email_send_log.create({
                data: {
                    dedup_key: outboundDedupKey,
                    recipient: cleanEmail,
                    subject: replySubject,
                    template: 'gabi-auto-reply',
                    tag: 'gabi-auto-reply',
                    direction: 'outbound',
                    parent_email_id: inboundLog.id,
                    status: 'pending',
                    content: replyHtml,
                    gabi_analysis: {
                        processed_by_ai: true,
                        action_taken: 'auto_replied',
                        intent,
                        sentiment: { level: sentimentLevel },
                        summary: `Resposta automática enviada para: ${cleanEmail}`
                    }
                }
            });
            gabiOutboundLogId = outboundLog.id;

            const sendResult = await sendEmail({
                to: cleanEmail,
                subject: replySubject,
                html: replyHtml,
                tag: 'gabi-auto-reply',
                dedupKey: outboundDedupKey,
                skipLog: true, // Log já criado manualmente com parent_email_id e gabi_analysis
            });

            // Atualiza status após envio
            await prisma.email_send_log.update({
                where: { id: outboundLog.id },
                data: { 
                    status: sendResult.sent ? 'sent' : 'failed',
                    resend_id: sendResult.id || null
                }
            });

            console.log(`[Webhook Email] 📤 Resposta Gabi ${sendResult.sent ? 'ENVIADA' : 'FALHOU'} para ${cleanEmail}`);
        }

        // Atualizar log com análise completa (incluindo sentiment para o frontend)
        await prisma.email_send_log.update({
            where: { id: inboundLog.id },
            data: {
                gabi_analysis: {
                    processed_by_ai: true,
                    intent,
                    confidence_score: isComplex ? 0.3 : 0.9,
                    action_taken: action,
                    summary,
                    sentiment: { level: sentimentLevel },
                    ...(generatedReply && { generated_reply: generatedReply })
                }
            }
        });

        // 3. Se necessita de atenção humana, criar card em Minhas Atividades
        if (action === 'escalated_to_human') {
            
            // Busca TODOS os usuários ativos para notificar a todos no Kanban
            const allActiveUsers = await prisma.users.findMany({ 
                where: { ativo: true },
                select: { id: true }
            });

            // Melhor extração do assunto e do corpo do e-mail
            const finalSubject = subject || 'Sem assunto';
            // Usa o texto limpo, fallback pra HTML sem tags, fallback pra (Vazio)
            let emailBody = text || '';
            if (!emailBody && html) {
                emailBody = html.replace(/<[^>]*>?/gm, ''); // Strip basic HTML if text is empty
            }
            if (!emailBody) emailBody = 'Corpo do e-mail não disponível.';

            const newActivity = await prisma.activities.create({
                data: {
                    activity_type: 'Ação necessária',
                    title: '[Intervenção Cód IA] Analisar resposta de e-mail',
                    description: `**Resumo da Gabi:** ${summary}\n\n**Intenção Detectada:** ${intent}\n**Ação Tomada:** Transbordo para Humano\n\n**Assunto recebido:** ${finalSubject}\n**Remetente originado:** ${from}\n\n**E-mail Original (Mensagem Full):**\n\`\`\`text\n${emailBody.trim()}\n\`\`\`\n\n[EMAIL_LOG:${inboundLog.id}]`,
                    priority: 'alta',
                    status: 'A Fazer',
                    company_id: companyId,
                    created_by_user_id: allActiveUsers[0]?.id || null,
                    activity_datetime: new Date(),
                    // Atribui para TODOS os usuários ativos — garante que apareça no Kanban de todos
                    activity_assignees: {
                        create: allActiveUsers.map(u => ({ user_id: u.id }))
                    }
                }
            });

            console.log(`[Webhook Email] Transbordo criado: Atividade ${newActivity.id} — atribuída a ${allActiveUsers.length} usuário(s)`);
        }

        res.status(200).json({ ok: true, message: 'Processado pela Gabi AI' });
    } catch (err) {
        console.error('[Webhook Email] Erro no processamento:', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;
