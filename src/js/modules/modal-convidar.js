import { COMPANIES_DATA } from '../core/state.js';

export const modalConvidar = {
  type: 'standard', // master or standard
  selectedCompanies: new Set(),
  
  open() {
    this.type = 'standard';
    this.selectedCompanies = new Set();
    this.render();
  },
  
  render() {
    let overlay = document.getElementById('modal-overlay-invite');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-overlay-invite';
      overlay.className = 'modal-backdrop';
      document.body.appendChild(overlay);
    }
    
    overlay.innerHTML = `
      <div class="inv-modal fade-in">
        <div class="inv-header">
          <div>
            <div class="inv-title">Convidar Usuário</div>
            <div class="inv-sub">Envie um convite para um novo membro da equipe</div>
          </div>
          <button class="perm-close" onclick="window.closeInviteModal()"><i class="ph-bold ph-x"></i></button>
        </div>
        
        <div class="inv-body">
          <div class="inv-fg">
            <label class="dark-lbl">E-mail do convidado</label>
            <input type="email" class="dark-input" placeholder="exemplo@empresa.com.br">
          </div>
          
          <div class="inv-fg">
            <label class="dark-lbl">Tipo de usuário</label>
            <div class="type-grid">
              <div class="type-card ${this.type === 'master' ? 'sel' : ''}" onclick="window.setInviteType('master')">
                <div class="type-icon"><i class="ph-bold ph-sketch-logo" style="color:var(--purple);"></i></div>
                <div class="type-name">Master</div>
                <div class="type-desc">Acesso total ao tenant e todas as filhas.</div>
              </div>
              <div class="type-card ${this.type === 'standard' ? 'sel' : ''}" onclick="window.setInviteType('standard')">
                <div class="type-icon"><i class="ph-bold ph-user" style="color:var(--indigo);"></i></div>
                <div class="type-name">Standard</div>
                <div class="type-desc">Acesso limitado a empresas específicas.</div>
              </div>
            </div>
          </div>
          
          ${this.type === 'standard' ? `
            <div class="inv-fg">
              <label class="dark-lbl">Empresas com acesso</label>
              ${COMPANIES_DATA.map(co => `
                <div class="co-pick ${this.selectedCompanies.has(co.id) ? 'sel' : ''}" onclick="window.toggleCoSelect('${co.id}')">
                   <div class="ci ci-sm" style="background:${co.color}">${co.short}</div>
                   <div class="co-name">${co.name}</div>
                   <div style="margin-left:auto;">
                     <div class="perm-checkbox" style="margin-right:0;">
                       ${this.selectedCompanies.has(co.id) ? '<i class="ph-bold ph-check" style="font-size:10px; color:white;"></i>' : ''}
                     </div>
                   </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
        
        <div class="inv-footer">
           <button class="btn-cancel" onclick="window.closeInviteModal()">Cancelar</button>
           <button class="btn-primary" onclick="window.sendInvite()">Enviar Convite</button>
        </div>
      </div>
    `;
    
    overlay.classList.remove('hidden');
  },
  
  setType(type) {
    this.type = type;
    this.render();
  },
  
  toggleCompany(id) {
    if (this.selectedCompanies.has(id)) {
      this.selectedCompanies.delete(id);
    } else {
      this.selectedCompanies.add(id);
    }
    this.render();
  }
};

window.openInviteModal = () => modalConvidar.open();
window.closeInviteModal = () => document.getElementById('modal-overlay-invite')?.classList.add('hidden');
window.setInviteType = (type) => modalConvidar.setType(type);
window.toggleCoSelect = (id) => modalConvidar.toggleCompany(id);
window.sendInvite = () => {
    window.showToast('Convite enviado!', 'O convite foi enviado para o e-mail informado.');
    window.closeInviteModal();
};
