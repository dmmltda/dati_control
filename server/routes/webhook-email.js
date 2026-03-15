import express from 'express';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as audit from '../services/audit.js';

const router = express.Router();
const prisma = new PrismaClient();

// Rota para receber respostas de email via Webhook (Ex: Resend, SendGrid)
router.post('/incoming', async (req, res) => {
    try {
        console.log('[Webhook Email] Requisição recebida:', JSON.stringify(req.body).substring(0, 200));

        // Resend envia um formato específico, ajuste conforme o provedor real
        // Geralmente: req.body.from, req.body.to, req.body.subject, req.body.text
        const { from, to, subject, text, html } = req.body;
        
        let recipientRaw = '';
        if (Array.isArray(to)) recipientRaw = to.join(',');
        else if (typeof to === 'string') recipientRaw = to;

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

            // Tentar descobrir a empresa a partir do email de origem/destino
            if (parentEmailLog) {
                // Aqui seria possível ter uma lógica para buscar o author da action original,
                // ou vincular à atividade baseada no template enviado.
                // Como não sabemos a priori, podemos buscar pelo email do remetente (cliente) nos contatos
                const cleanEmail = from.match(/<([^>]+)>/)?.[1] || from;
                const contato = await prisma.contacts.findFirst({
                    where: { Email_1: cleanEmail },
                    include: { companies: true }
                });
                
                if (contato) {
                    companyId = contato.companyId;
                }
            }
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
        // Em um sistema real, isso chamaria a API do Gemini aqui, passando o texto do email.
        // Simulando a decisão da IA com base no tamanho do texto (transbordo)
        
        const isComplex = (text || html || '').length > 200 || /cancelar|problema|erro|ajuda|socorro/i.test(text || '');
        
        let intent = isComplex ? 'suporte_complexo' : 'resposta_simples';
        let action = isComplex ? 'escalated_to_human' : 'auto_replied';
        let summary = isComplex 
            ? 'O cliente respondeu com dúvidas ou problemas detalhados. Necessário intervenção humana.'
            : 'O cliente respondeu de forma objetiva / confirmando.';
            
        let generatedReply = null;
        if (action === 'auto_replied') {
            generatedReply = "Olá! Agradecemos o seu contato. Entendi sua mensagem e já registrei no sistema. Em breve nosso time analisará caso haja mais alguma pendência. Um abraço da Gabi!";
            
            // Simular o envio da autopesposta no log do banco (opcional para trackear envio duplo)
            await prisma.email_send_log.create({
                data: {
                    dedup_key: randomUUID(),
                    recipient: from,
                    subject: `Re: ${subject || 'Sem assunto'}`,
                    template: 'inbound_reply',
                    tag: 'gabi-auto-reply',
                    direction: 'outbound',
                    parent_email_id: inboundLog.id,
                    status: 'sent',
                    content: generatedReply
                }
            });
        }

        // Atualizar log com análise
        await prisma.email_send_log.update({
            where: { id: inboundLog.id },
            data: {
                gabi_analysis: {
                    processed_by_ai: true,
                    intent,
                    confidence_score: isComplex ? 0.3 : 0.9,
                    action_taken: action,
                    summary,
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

            const newActivity = await prisma.activities.create({
                data: {
                    activity_type: 'Ação necessária',
                    title: '[Intervenção IA] Analisar resposta de e-mail',
                    description: `**Resumo da Gabi:** ${summary}\n\n**Intenção Detectada:** ${intent}\n\n**Remetente:** ${from}\n\n**E-mail Original:**\n${text || 'Texto não disponível'}\n\n[EMAIL_LOG:${inboundLog.id}]`,
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
