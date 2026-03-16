/**
 * @file deploy.js
 * Gerador e monitor de Deploy Checklist (Painel Visual)
 */

import { getAuthToken } from './auth.js';
import { showToast } from './utils.js';

export const deployMonitor = {
    init: function() {
        console.log('[Deploy] view initialized');
        this.render();
    },

    render: function() {
        const container = document.getElementById('view-deploy');
        if (!container) return;

        container.innerHTML = `
            <div class="top-bar" style="margin-bottom:1.429rem;">
                <div>
                    <h1 style="display:flex; align-items:center; gap:0.571rem;">
                        <i class="ph ph-rocket" style="color:#6366f1;"></i>
                        Deploy & Atualizações
                    </h1>
                    <p style="color:#8b98b4;">Checklist de liberação de versão e checklist de segurança de deploy.</p>
                </div>
            </div>

            <div class="glass-panel" style="max-width:800px; margin:0 auto; padding:2rem;">
                <div style="text-align:center; margin-bottom:2.5rem;">
                    <div style="width:64px; height:64px; border-radius:50%; background:rgba(99,102,241,0.1); color:#6366f1; display:flex; align-items:center; justify-content:center; font-size:2rem; margin:0 auto 1.5rem;">
                        <i class="ph ph-shield-check"></i>
                    </div>
                    <h2 style="font-size:1.3rem; margin-bottom:0.5rem; color:#e2e8f0;">Deploy Seguro DATI</h2>
                    <p style="color:#94a3b8; font-size:0.9rem; line-height:1.6;">Antes de mandar qualquer código para produção, siga este checklist rigorosamente para evitar a injeção de dados de teste de volta no banco de produção.</p>
                </div>

                <div style="display:flex; flex-direction:column; gap:1rem;">
                    <label class="deploy-check-item" style="display:flex; gap:1rem; padding:1.25rem; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:12px; cursor:pointer;"
                           onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background='rgba(255,255,255,0.02)'">
                        <input type="checkbox" style="width:20px; height:20px; accent-color:#6366f1; margin-top:2px;">
                        <div>
                            <div style="font-weight:600; color:#e2e8f0; font-size:0.95rem; margin-bottom:0.3rem;">1. Limpar arquivos de dados do código</div>
                            <div style="color:#94a3b8; font-size:0.85rem; line-height:1.5;">Certifique-se de que não há chamadas à API apontando para URLs chumbadas e de que o banco local está configurado no <code>.env</code>.</div>
                        </div>
                    </label>

                    <label class="deploy-check-item" style="display:flex; gap:1rem; padding:1.25rem; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:12px; cursor:pointer;"
                           onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background='rgba(255,255,255,0.02)'">
                        <input type="checkbox" style="width:20px; height:20px; accent-color:#6366f1; margin-top:2px;">
                        <div>
                            <div style="font-weight:600; color:#e2e8f0; font-size:0.95rem; margin-bottom:0.3rem;">2. Build de teste (Local)</div>
                            <div style="color:#94a3b8; font-size:0.85rem; line-height:1.5;">Rode <code>npm run build</code> dentro da pasta server para validar se o código não irá quebrar a esteira de build.</div>
                        </div>
                    </label>

                    <label class="deploy-check-item" style="display:flex; gap:1rem; padding:1.25rem; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:12px; cursor:pointer;"
                           onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background='rgba(255,255,255,0.02)'">
                        <input type="checkbox" style="width:20px; height:20px; accent-color:#6366f1; margin-top:2px;">
                        <div>
                            <div style="font-weight:600; color:#e2e8f0; font-size:0.95rem; margin-bottom:0.3rem;">3. Status de Migration</div>
                            <div style="color:#94a3b8; font-size:0.85rem; line-height:1.5;">Rode <code>npx prisma migrate status</code> e avalie as pendências de migração que serão aplicadas pelo Railway em produção.</div>
                        </div>
                    </label>

                    <label class="deploy-check-item" style="display:flex; gap:1rem; padding:1.25rem; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:12px; cursor:pointer;"
                           onmouseover="this.style.background='rgba(255,255,255,0.04)'" onmouseout="this.style.background='rgba(255,255,255,0.02)'">
                        <input type="checkbox" style="width:20px; height:20px; accent-color:#6366f1; margin-top:2px;">
                        <div>
                            <div style="font-weight:600; color:#e2e8f0; font-size:0.95rem; margin-bottom:0.3rem;">4. Commit & Push</div>
                            <div style="color:#94a3b8; font-size:0.85rem; line-height:1.5;">Faça commit na branch main. O Railway executará de forma atômica e sem downtime na url de produção.</div>
                        </div>
                    </label>
                </div>

                <div style="margin-top:2rem; padding:1.25rem; background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.2); border-radius:12px; text-align:center;">
                    <button class="btn btn-primary" onclick="showToast('Checklist concluído! Deploy liberado. 🚀', 'success')" style="width:100%; max-width:240px; padding:0.8rem; border-radius:8px;">
                        <i class="ph ph-check-circle"></i> Confirmar Checklist
                    </button>
                    <div style="font-size:0.8rem; color:#64748b; margin-top:1rem;">Dica: Todo o processo de pipeline é atomizado no Railway. Se quebrar, não vai impactar o usuário logado.</div>
                </div>
            </div>
        `;
    }
};

window.deployMonitor = deployMonitor;
