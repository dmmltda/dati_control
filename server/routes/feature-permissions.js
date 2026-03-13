/**
 * @file feature-permissions.js
 *
 * GET  /api/users/:id/feature-permissions  → retorna permissões do usuário
 * PUT  /api/users/:id/feature-permissions  → atualiza em batch (master only)
 *
 * Body do PUT: { permissions: ['dashboard.view', 'companies.view', ...] }
 * (array com as chaves das permissões CONCEDIDAS — o que não estiver na lista é revogado)
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireMaster } from '../middleware/checkAccess.js';
import { FEATURE_PERMISSIONS } from '../constants/permissions.js';
import * as audit from '../services/audit.js';

const router = Router();
const prisma = new PrismaClient();

// ─── GET /api/users/:id/feature-permissions ───────────────────────────────
// Retorna objeto { permission: granted } para o usuário.
// Master pode ver qualquer usuário; standard só pode ver o próprio.
router.get('/:id/feature-permissions', async (req, res) => {
  const { id } = req.params;
  const master = req.usuarioAtual;

  // standard só vê as próprias permissões
  if (master.user_type !== 'master' && master.id !== id) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  try {
    const rows = await prisma.user_feature_permissions.findMany({
      where: { user_id: id },
    });

    // Retorna mapa completo com todas as chaves possíveis
    const result = Object.fromEntries(
      Object.keys(FEATURE_PERMISSIONS).map(key => [
        key,
        rows.find(r => r.permission === key)?.granted ?? false,
      ])
    );

    res.json(result);
  } catch (err) {
    console.error('[GET feature-permissions] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

import fs from 'fs';

// ─── PUT /api/users/:id/feature-permissions ───────────────────────────────
// Recebe array com as permissões CONCEDIDAS e faz upsert em batch.
// Tudo que não vier no array é revogado (granted=false).
router.put('/:id/feature-permissions', requireMaster, async (req, res) => {
  const { id } = req.params;
  const { permissions } = req.body; // string[]
  const master = req.usuarioAtual;

  console.log(`[DEBUG] PUT /api/users/${id}/feature-permissions`);
  console.log(`[DEBUG] Body:`, req.body);

  if (!Array.isArray(permissions)) {
    fs.writeFileSync('/tmp/dati_fp_debug.log', JSON.stringify({ error: 'not_array', type: typeof permissions, body: req.body }));
    return res.status(400).json({ error: 'permissions deve ser um array de strings' });
  }

  // Valida que todas as chaves enviadas existem
  const invalid = permissions.filter(p => !FEATURE_PERMISSIONS[p]);
  if (invalid.length) {
    console.log(`[DEBUG] Invalid permissions:`, invalid);
    fs.writeFileSync('/tmp/dati_fp_debug.log', JSON.stringify({ error: 'invalid_perms', invalid, body: req.body }));
    return res.status(400).json({ error: `Permissões inválidas: ${invalid.join(', ')}` });
  }

  try {
    const allKeys = Object.keys(FEATURE_PERMISSIONS);

    // Upsert em batch: concede o que está no array, revoga o resto
    await prisma.$transaction(
      allKeys.map(key =>
        prisma.user_feature_permissions.upsert({
          where: { user_id_permission: { user_id: id, permission: key } },
          create: {
            user_id: id,
            permission: key,
            granted: permissions.includes(key),
            granted_by: master.id,
          },
          update: {
            granted: permissions.includes(key),
            granted_by: master.id,
          },
        })
      )
    );

    audit.log(prisma, {
      actor: master,
      action: 'UPDATE',
      entity_type: 'user_feature_permissions',
      entity_id: id,
      entity_name: `Permissões de ${id}`,
      description: `Atualizou permissões de funcionalidade do usuário`,
      meta: { granted: permissions },
      ip_address: req.ip,
    });

    res.json({ ok: true, granted: permissions });
  } catch (err) {
    console.error('[PUT feature-permissions] Erro:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
