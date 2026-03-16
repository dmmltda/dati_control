import { Router } from 'express';
import { requireFeature } from '../middleware/checkAccess.js';
import { exec } from 'child_process';

const router = Router();

router.get('/history', requireFeature('deploy.view'), (req, res) => {
    // Busca últimos 50 commits (simulando histórico de deploys no Railway)
    const format = '{"hash":"%h", "message":"%s", "author":"%an", "date":"%cI"}';
    const cmd = `git log -n 50 --pretty=format:'${format}'`;

    exec(cmd, { cwd: process.cwd() }, (error, stdout, stderr) => {
        if (error) {
            console.error('[GET /api/deploy/history] Erro:', error);
            // Se falhar (ex: git não instalado no host), retorna mock fallback
            return res.json([
                { hash: 'latest', message: 'Railway Build Executado', author: 'Railway', date: new Date().toISOString() }
            ]);
        }
        
        try {
            // O output é um JSON Line (cada linha é um objeto JSON separado, não um array válido)
            const lines = stdout.trim().split('\n');
            const data = lines.filter(Boolean).map(line => JSON.parse(line));
            res.json(data);
        } catch (parseError) {
            console.error('[GET /api/deploy/history] Parse Error:', parseError);
            res.status(500).json({ error: 'Erro ao converter histórico de deploys' });
        }
    });
});

export default router;
