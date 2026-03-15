import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.post('/google-forms', async (req, res) => {
    try {
        console.log('[Webhook] Recebido payload do Google Forms:', req.body);
        
        const { email, score, formType, respostasFull } = req.body;
        
        if (!email) {
            console.warn('[Webhook] Payload inválido (sem email)');
            return res.status(400).json({ error: 'Parâmetros ausentes' });
        }

        // Buscar NPS Pendentes para esse e-mail
        // O cliente pode ter vários pendentes para o mesmo e-mail, mas atualizamos o mais recente (se tiver mais de um)
        // Ou atualizamos todos os "Pendente" para esse e-mail (depende da necessidade)
        const pendingNps = await prisma.company_nps.findFirst({
            where: {
                Destinatario: {
                    equals: email,
                    mode: 'insensitive' // ignorar maiusculas/minusculas
                },
                Score: 'Pendente'
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        if (!pendingNps) {
            console.warn(`[Webhook] Nenhum NPS pendente encontrado para o e-mail: ${email}`);
            return res.status(404).json({ message: 'Nenhuma pesquisa pendente encontrada.' });
        }

        // Atualizar o registro com o novo score (se enviado) e as respostas brutas JSON
        const updateData = {};
        if (score !== undefined) updateData.Score = String(score);
        if (respostasFull) updateData.Respostas_JSON = respostasFull;

        await prisma.company_nps.update({
            where: { id: pendingNps.id },
            data: updateData
        });

        console.log(`[Webhook] ✅ NPS atualizado para ${email}: Score ${score} (ID: ${pendingNps.id})`);
        
        // Também poderíamos registrar no auditLog do servidor se quisermos,
        // mas o básico já é suficiente.
        res.json({ success: true, message: 'NPS atualizado com sucesso.' });
    } catch (err) {
        console.error('[Webhook] Falha ao processar google-forms webhook:', err);
        res.status(500).json({ error: 'Erro interno no webhook' });
    }
});

export default router;
