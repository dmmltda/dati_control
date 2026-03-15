import { state } from '../core/state.js';

export const usuarios = {
  render() {
    const container = document.getElementById('s3-content');
    if (!container) return;
    
    const users = [
      { name: 'Daniel Martins', email: 'daniel@godati.com.br', type: 'master', status: 'active', color: 'linear-gradient(135deg,#6366f1,#8b5cf6)', short: 'D', access: 'Todas' },
      { name: 'Ana Silva', email: 'ana@dati.com.br', type: 'standard', status: 'active', color: 'linear-gradient(135deg,#f472b6,#db2777)', short: 'AS', access: '2 empresas' },
      { name: 'Bruno Costa', email: 'bruno@dati.com.br', type: 'standard', status: 'pending', color: 'linear-gradient(135deg,#34d399,#059669)', short: 'BC', access: '1 empresa' }
    ];
    
    container.innerHTML = `
      <div class="main-header">
        <div>
          <h1 class="page-title">
            <div class="page-title-icon"><i class="ph-bold ph-user-gear"></i></div>
            Usuários
          </h1>
          <p class="page-sub">Gerencie os membros da sua equipe e suas permissões</p>
        </div>
        <button class="btn-primary" id="btn-invite-user">
          <i class="ph-bold ph-plus"></i>
          Convidar Usuário
        </button>
      </div>
      
      <div class="stats-row">
        <div class="stat-c">
          <div class="stat-lbl">Total Usuários</div>
          <div class="stat-val indigo">${users.length}</div>
        </div>
        <div class="stat-c">
          <div class="stat-lbl">Master</div>
          <div class="stat-val purple">1</div>
        </div>
        <div class="stat-c">
          <div class="stat-lbl">Standard</div>
          <div class="stat-val indigo">2</div>
        </div>
        <div class="stat-c">
          <div class="stat-lbl">Convites Pendentes</div>
          <div class="stat-val amber">1</div>
        </div>
      </div>
      
      <div class="panel">
        <div class="users-block">
          <div class="users-table-header">
            <div class="users-table-title">Membros do Tenant</div>
            <div class="search-input">
              <i class="ph-bold ph-magnifying-glass"></i>
              <input type="text" placeholder="Buscar usuário...">
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Tipo</th>
                  <th>Empresas</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${users.map(u => `
                  <tr>
                    <td>
                      <div class="user-cell">
                        <div class="u-avatar" style="background: ${u.color}">${u.short}</div>
                        <div>
                          <div class="u-name">${u.name}</div>
                          <div class="u-email">${u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span class="badge ${u.type === 'master' ? 'badge-master' : 'badge-standard'}">${u.type.toUpperCase()}</span>
                    </td>
                    <td>
                      <span class="badge badge-access">${u.access}</span>
                    </td>
                    <td>
                      <span class="badge ${u.status === 'active' ? 'badge-active' : 'badge-pending'}">
                        <span class="dot ${u.status === 'active' ? 'dot-green' : 'dot-amber'}"></span>
                        ${u.status === 'active' ? 'Ativo' : 'Pendente'}
                      </span>
                    </td>
                    <td>
                      <div class="action-row">
                        <button class="act-icon-btn" title="Editar Permissões" onclick="window.openPermModal('${u.name}')"><i class="ph-bold ph-shield-check"></i></button>
                        <button class="act-icon-btn" title="Suspender"><i class="ph-bold ph-user-minus"></i></button>
                        <button class="act-icon-btn danger" title="Remover"><i class="ph-bold ph-trash"></i></button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    
    document.getElementById('btn-invite-user')?.addEventListener('click', () => {
      window.openInviteModal();
    });
  }
};
