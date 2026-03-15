import { state } from '../core/state.js';
import { router } from '../core/router.js';

export const empresaInterna = {
  activeTab: 'visao-geral',
  
  render() {
    const container = document.getElementById('s4-content');
    if (!container) return;
    
    const co = state.activeCompany || { name: 'Empresa', short: 'E', color: 'var(--indigo)', location: '---' };
    
    container.innerHTML = `
      <div class="panel" style="padding-top: 20px;">
        <div style="margin-bottom: 20px;">
          <button onclick="window.goBackToEmpresas()" style="display:flex; align-items:center; gap:6px; font-size:12px; color:var(--dark-100); font-weight:600; margin-bottom:12px;">
            <i class="ph-bold ph-arrow-left"></i> Voltar para Empresas
          </button>
          
          <div class="tenant-card" style="margin-bottom:0; background: var(--dark-800);">
            <div class="ci ci-lg" style="background: ${co.color}">${co.short}</div>
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <h2 class="u-name" style="font-size: 18px;">${co.name}</h2>
                <span class="badge badge-active">Ativo</span>
              </div>
              <div class="tenant-badge-row">
                <span class="badge badge-plan">${co.location}</span>
                <span class="badge badge-plan">${co.url || 'subdomain.journey.app'}</span>
              </div>
            </div>
            
            <div style="margin-left:auto; display:flex; align-items:center; gap:32px; padding-right:20px;">
               <div style="text-align:center;">
                 <div class="stat-val" style="font-size:18px;">${co.contacts || 0}</div>
                 <div class="stat-lbl" style="margin-bottom:0;">Contatos</div>
               </div>
               <div style="text-align:center;">
                 <div class="stat-val" style="font-size:18px;">${co.users || 0}</div>
                 <div class="stat-lbl" style="margin-bottom:0;">Usuários</div>
               </div>
               <div style="text-align:center;">
                 <div class="stat-val" style="font-size:18px;">${co.activity || '0%'}</div>
                 <div class="stat-lbl" style="margin-bottom:0;">Atividade</div>
               </div>
               <button onclick="window.goBackToEmpresas()" class="perm-close" style="margin-left:20px;"><i class="ph-bold ph-x"></i></button>
            </div>
          </div>
        </div>
        
        <div class="section-tabs" style="padding:0; margin-bottom:24px;">
          <div class="tab ${this.activeTab === 'visao-geral' ? 'active' : ''}" data-tab="visao-geral">Visão Geral</div>
          <div class="tab ${this.activeTab === 'pagamento' ? 'active' : ''}" data-tab="pagamento">Pagamento</div>
          <div class="tab ${this.activeTab === 'usuarios' ? 'active' : ''}" data-tab="usuarios">Usuários</div>
          <div class="tab ${this.activeTab === 'permissoes' ? 'active' : ''}" data-tab="permissoes">Permissões</div>
        </div>
        
        <div id="tab-content">
          ${this.renderTabContent()}
        </div>
      </div>
    `;
    
    // Switch tabs
    container.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.activeTab = tab.getAttribute('data-tab');
        this.render();
      });
    });
  },
  
  renderTabContent() {
    if (this.activeTab === 'visao-geral') {
      return `
        <div class="fade-in">
          <div class="stats-row" style="padding:0; margin-bottom:24px;">
            <div class="stat-c"><div class="stat-lbl">NPS</div><div class="stat-val green">9.4</div></div>
            <div class="stat-c"><div class="stat-lbl">Saúde</div><div class="stat-val green">98</div></div>
            <div class="stat-c"><div class="stat-lbl">Churn Risk</div><div class="stat-val amber">Baixo</div></div>
          </div>
          
          <div style="display:grid; grid-template-columns: 1.5fr 1fr; gap:20px;">
            <div class="stat-c" style="padding:22px;">
              <div class="nav-section-label" style="padding-left:0; margin-top:0;">Dados da Empresa</div>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-top:12px;">
                <div>
                  <label class="dark-lbl">Razão Social</label>
                  <div class="dark-input">${state.activeCompany?.razao || '---'}</div>
                </div>
                <div>
                  <label class="dark-lbl">CNPJ</label>
                  <div class="dark-input">${state.activeCompany?.cnpj || '---'}</div>
                </div>
                <div style="grid-column: span 2;">
                  <label class="dark-lbl">Data de Criação</label>
                  <div class="dark-input">${state.activeCompany?.created || '---'}</div>
                </div>
              </div>
            </div>
            
            <div class="stat-c" style="padding:22px;">
              <div class="nav-section-label" style="padding-left:0; margin-top:0;">Responsável DATI</div>
              <div class="user-cell" style="margin-top:20px;">
                <div class="u-avatar" style="background:var(--indigo); width:44px; height:44px;">DM</div>
                <div>
                  <div class="u-name">Daniel Mendes</div>
                  <div class="u-email">Account Manager</div>
                </div>
                <button class="act-btn" style="margin-left:auto;">Trocar</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }
    
    if (this.activeTab === 'usuarios') {
       return `
        <div class="fade-in">
          <div class="users-block">
            <div class="users-table-header">
              <div class="users-table-title">Usuários com acesso a esta empresa</div>
              <button class="btn-primary" style="padding:6px 12px; font-size:11px;" onclick="window.openInviteModal()"><i class="ph-bold ph-plus"></i> Convidar</button>
            </div>
            <div class="table-wrap">
               <table>
                <thead>
                  <tr><th>Usuário</th><th>Tipo</th><th>Acesso desde</th><th>Ações</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td><div class="user-cell"><div class="u-avatar" style="background:var(--indigo)">DM</div><div><div class="u-name">Daniel Mendes</div><div class="u-email">daniel@godati.com.br</div></div></div></td>
                    <td><span class="badge badge-master">MASTER</span></td>
                    <td><div class="u-email">12 Jan 2025</div></td>
                    <td><button class="act-icon-btn"><i class="ph-bold ph-trash"></i></button></td>
                  </tr>
                </tbody>
               </table>
            </div>
          </div>
        </div>
       `;
    }
    
    return `<div class="fade-in"><p style="color:var(--dark-100);">Conteúdo da aba em desenvolvimento...</p></div>`;
  }
};

window.goBackToEmpresas = () => {
    router.navigate('s2');
};
