import { Router } from 'express';
import { requireFeature } from '../middleware/checkAccess.js';

const router = Router();

const RAILWAY_API_URL   = 'https://backboard.railway.com/graphql/v2';
const RAILWAY_API_TOKEN = process.env.RAILWAY_API_TOKEN;
const RAILWAY_SERVICE_ID = process.env.RAILWAY_SERVICE_ID;

/**
 * Query GraphQL do Railway para listar deployments de um serviço.
 * Retorna os últimos 50 deployments com status real.
 */
async function fetchRailwayDeployments() {
    if (!RAILWAY_API_TOKEN || !RAILWAY_SERVICE_ID) {
        throw new Error('RAILWAY_API_TOKEN ou RAILWAY_SERVICE_ID não configurados no .env');
    }

    const query = `
        query {
            deployments(input: { serviceId: "${RAILWAY_SERVICE_ID}" }, first: 50) {
                edges {
                    node {
                        id
                        status
                        createdAt
                        meta
                    }
                }
            }
        }
    `;

    const res = await fetch(RAILWAY_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${RAILWAY_API_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
    });

    if (!res.ok) {
        throw new Error(`Railway API HTTP ${res.status}`);
    }

    const json = await res.json();

    if (json.errors?.length) {
        throw new Error(`Railway GraphQL error: ${json.errors[0].message}`);
    }

    return json.data.deployments.edges.map(({ node }) => {
        const meta = node.meta || {};
        return {
            id:      node.id,
            status:  node.status,                          // BUILDING, SUCCESS, FAILED, REMOVED, QUEUED, etc.
            date:    node.createdAt,
            hash:    meta.commitHash?.slice(0, 7) || '—', // hash curto (7 chars)
            message: meta.commitMessage || '—',
            author:  meta.commitAuthor  || 'Railway',
        };
    });
}

router.get('/history', requireFeature('deploy.view'), async (req, res) => {
    try {
        const deployments = await fetchRailwayDeployments();
        res.json(deployments);
    } catch (err) {
        console.error('[GET /api/deploy/history] Erro ao consultar Railway API:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;
