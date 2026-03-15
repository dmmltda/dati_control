import { PERMISSIONS_LIST } from '../core/state.js';

export const modalPermissoes = {
  selected: new Set(),
  userName: '',
  
  open(userName) {
    this.userName = userName;
    this.selected = new Set();
    this.render();
  },
  
  render() {
    let overlay = document.getElementById('modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'modal-overlay';
      overlay.className = 'modal-backdrop';
      document.body.appendChild(overlay);
    }
    
    overlay.innerHTML = `
      <div class="perm-modal fade-in">
        <div class="perm-modal-header">
          <div class="perm-icon"><i class="ph-bold ph-shield-check"></i></div>
          <div>
            <div class="perm-title">Permissões de Acesso</div>
            <div class="perm-user"><i class="ph ph-user"></i> ${this.userName}</div>
          </div>
          <div class="perm-count-badge" id="perm-counter">${this.selected.size}/17 permissões</div>
          <button class="perm-close" onclick="window.closeModal()"><i class="ph-bold ph-x"></i></button>
        </div>
        
        <div class="perm-select-row">
          <span class="perm-select-lbl">Seleção Rápida:</span>
          <button class="sel-btn all" onclick="window.permSelectAll()">Todas</button>
          <button class="sel-btn none" onclick="window.permSelectNone()">Nenhuma</button>
        </div>
        
        <div class="perm-body">
          <div class="perm-section">
            <div class="perm-section-title nav">Navegação</div>
            <div class="perm-grid">
              ${PERMISSIONS_LIST.navigation.map(p => this.renderItem(p)).join('')}
            </div>
          </div>
          
          <div class="perm-section">
            <div class="perm-section-title view">Visualizar Cliente</div>
            <div class="perm-grid">
              ${PERMISSIONS_LIST.view.map(p => this.renderItem(p)).join('')}
            </div>
          </div>
          
          <div class="perm-section">
            <div class="perm-section-title edit">Edição</div>
            <div class="perm-grid">
              ${PERMISSIONS_LIST.edit.map(p => this.renderItem(p)).join('')}
            </div>
          </div>
        </div>
        
        <div class="perm-footer">
          <button class="btn-cancel" onclick="window.closeModal()">Cancelar</button>
          <button class="btn-save" onclick="window.savePermissions()">Salvar Alterações</button>
        </div>
      </div>
    `;
    
    overlay.classList.remove('hidden');
    
    // Add click listeners to items
    overlay.querySelectorAll('.perm-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id');
        this.togglePermission(id);
      });
    });
  },
  
  renderItem(name) {
    const isChecked = this.selected.has(name);
    return `
      <div class="perm-item ${isChecked ? 'checked' : ''}" data-id="${name}">
        <div class="perm-checkbox">
          ${isChecked ? '<i class="ph-bold ph-check" style="font-size:10px; color:white;"></i>' : ''}
        </div>
        <span class="perm-name">${name}</span>
      </div>
    `;
  },
  
  togglePermission(id) {
    if (this.selected.has(id)) {
      this.selected.delete(id);
    } else {
      this.selected.add(id);
    }
    this.render();
  },
  
  selectAll() {
    const all = [...PERMISSIONS_LIST.navigation, ...PERMISSIONS_LIST.view, ...PERMISSIONS_LIST.edit];
    this.selected = new Set(all);
    this.render();
  },
  
  selectNone() {
    this.selected.clear();
    this.render();
  }
};

window.openPermModal = (name) => modalPermissoes.open(name);
window.closeModal = () => document.getElementById('modal-overlay')?.classList.add('hidden');
window.permSelectAll = () => modalPermissoes.selectAll();
window.permSelectNone = () => modalPermissoes.selectNone();
window.savePermissions = () => {
    window.showToast('Permissões sugeridas!', 'As permissões de ' + modalPermissoes.userName + ' foram atualizadas.');
    window.closeModal();
};
