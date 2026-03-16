import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.post('/google-forms', async (req, res) => {
    try {
        console.log('[Webhook Google Forms] Payload recebido:', JSON.stringify(req.body));
        
        const { email, score, formType, respostasFull } = req.body;
        
        if (!email) {
            console.warn('[Webhook] Payload inválido (sem email)');
            return res.status(400).json({ error: 'Parâmetros ausentes: email obrigatório' });
        }

        const emailTrimmed = String(email).trim().toLowerCase();

        // Busca where: email + Score Pendente/vazio (+ formType se disponível)
        const whereClause = {
            Destinatario: { equals: emailTrimmed, mode: 'insensitive' },
            OR: [
                { Score: 'Pendente' },
                { Score: '' },
                { Score: null }
            ]
        };
        if (formType) {
            whereClause.Formulario = { equals: formType, mode: 'insensitive' };
        }

        let pendingNps = await prisma.company_nps.findFirst({
            where: whereClause,
            orderBy: { createdAt: 'desc' }
        });

        // Fallback: busca sem filtro de formType se não encontrou com ele
        if (!pendingNps && formType) {
            console.warn(`[Webhook] Não encontrado com formType="${formType}", tentando sem filtro...`);
            pendingNps = await prisma.company_nps.findFirst({
                where: {
                    Destinatario: { equals: emailTrimmed, mode: 'insensitive' },
                    OR: [
                        { Score: 'Pendente' },
                        { Score: '' },
                        { Score: null }
                    ]
                },
                orderBy: { createdAt: 'desc' }
            });
        }

        if (!pendingNps) {
            // Log todos os registros com esse email para diagnóstico
            const todosComEmail = await prisma.company_nps.findMany({
                where: { Destinatario: { contains: emailTrimmed, mode: 'insensitive' } },
                select: { id: true, Destinatario: true, Score: true, Formulario: true, createdAt: true }
            });
            console.warn(`[Webhook] Nenhum NPS Pendente para "${emailTrimmed}". Registros com esse email:`, JSON.stringify(todosComEmail));
            return res.status(404).json({ 
                message: 'Nenhuma pesquisa pendente encontrada.',
                debug: { emailBuscado: emailTrimmed, formType, registrosEncontrados: todosComEmail.length }
            });
        }

        // Atualiza score e respostas
        const updateData = {};
        if (score !== undefined) updateData.Score = String(score);
        if (respostasFull && typeof respostasFull === 'object') {
            updateData.Respostas_JSON = respostasFull;
        }

        await prisma.company_nps.update({
            where: { id: pendingNps.id },
            data: updateData
        });

        console.log(`[Webhook] ✅ NPS atualizado: email="${emailTrimmed}" | score=${score} | form="${pendingNps.Formulario}" | id=${pendingNps.id}`);
        res.json({ success: true, message: 'NPS atualizado com sucesso.', id: pendingNps.id });
    } catch (err) {
        console.error('[Webhook] Erro ao processar google-forms:', err);
        res.status(500).json({ error: 'Erro interno no webhook' });
    }
});

export default router;
