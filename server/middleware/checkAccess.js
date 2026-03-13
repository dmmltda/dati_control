/**
 * @file checkAccess.js
 * Middleware de controle de acesso baseado em user_type e user_memberships.
 *
 * Regras:
 *  - master → acessa qualquer empresa que seja a mãe do seu org OU filha dessa mãe
 *  - standard → acessa somente as companies vinculadas via user_memberships
 *
 * Uso nas rotas:
 *   app.get('/api/companies/:id/...', extractUsuario, checkAccess('companyId'), handler)
 *
 * Após o middleware, req.permissions estará disponível:
 *   - master: { can_create: true, can_edit: true, can_delete: true, can_export: true }
 *   - standard: as permissões definidas na membership
 */

import { PrismaClient } from '@prisma/client';
import { FEATURE_PERMISSIONS } from '../constants/permissions.js';
const prisma = new PrismaClient();


/**
 * Factory que retorna o middleware de verificação de acesso.
 * @param {string} paramName - nome do param da rota que contém o company_id (default: 'companyId')
 */
export function checkAccess(paramName = 'companyId') {
    return async function (req, res, next) {
        const usuario = req.usuarioAtual;
        if (!usuario) return res.status(401).json({ error: 'Não autenticado' });

        const companyId = req.params[paramName] || req.params.id;
        if (!companyId) return next(); // rota sem companyId, deixa passar

        try {
            if (usuario.user_type === 'master') {
                // master: verifica se companyId é a mãe OU uma filha da mãe
                // Para isso, buscamos as empresas acessíveis via memberships na empresa mãe
                // Por ora, master acessa todas — a restrição por org virá com Clerk Organizations
                req.permissions = {
                    can_create: true,
                    can_edit: true,
                    can_delete: true,
                    can_export: true,
                };
                return next();
            }

            // standard: verifica membership explícita
            const membership = await prisma.user_memberships.findUnique({
                where: {
                    user_id_company_id: {
                        user_id: usuario.id,
                        company_id: companyId,
                    }
                }
            });

            if (!membership) {
                return res.status(403).json({
                    error: 'Acesso negado',
                    message: 'Você não tem permissão para acessar esta empresa.',
                });
            }

            req.permissions = {
                can_create: membership.can_create,
                can_edit: membership.can_edit,
                can_delete: membership.can_delete,
                can_export: membership.can_export,
            };

            return next();
        } catch (err) {
            console.error('[checkAccess] Erro:', err);
            return res.status(500).json({ error: 'Erro ao verificar permissões' });
        }
    };
}

/**
 * Middleware simples: bloqueia acesso se user_type !== 'master'
 * Usar em rotas administrativas (gestão de usuários, convites, etc.)
 */
export function requireMaster(req, res, next) {
    if (!req.usuarioAtual) {
        console.log('[DEBUG] requireMaster: 401 Não autenticado');
        return res.status(401).json({ error: 'Não autenticado' });
    }
    if (req.usuarioAtual.user_type !== 'master') {
        console.log(`[DEBUG] requireMaster: 403 Acesso negado para usuário ${req.usuarioAtual.id} (user_type=${req.usuarioAtual.user_type}) em ${req.originalUrl}`);
        return res.status(403).json({
            error: 'Acesso negado',
            message: 'Apenas usuários master podem executar esta ação.',
        });
    }
    next();
}

/**
 * Middleware factory: bloqueia acesso se o usuário standard não tiver a feature permission.
 * Master bypassa automaticamente.
 *
 * Uso:
 *   app.get('/api/gabi/...', extractUsuario, requireFeature('gabi.view'), handler)
 */
export function requireFeature(permissionKeys) {
    const keys = Array.isArray(permissionKeys) ? permissionKeys : [permissionKeys];
    
    // Validar se todas as keys existem
    for (const k of keys) {
        if (!FEATURE_PERMISSIONS[k]) {
            console.warn(`[requireFeature] Permissão desconhecida: "${k}"`);
        }
    }

    return async function (req, res, next) {
        const usuario = req.usuarioAtual;
        if (!usuario) return res.status(401).json({ error: 'Não autenticado' });

        // master tem tudo
        if (usuario.user_type === 'master') return next();

        try {
            const rows = await prisma.user_feature_permissions.findMany({
                where: {
                    user_id: usuario.id,
                    permission: { in: keys },
                    granted: true
                },
            });

            if (rows.length === 0) {
                const featureNames = keys.map(k => FEATURE_PERMISSIONS[k] || k).join(' ou ');
                return res.status(403).json({
                    error: 'Acesso negado',
                    message: `Você não tem permissão para acessar: ${featureNames}`,
                });
            }

            return next();
        } catch (err) {
            console.error('[requireFeature] Erro:', err);
            return res.status(500).json({ error: 'Erro ao verificar permissões' });
        }
    };
}
