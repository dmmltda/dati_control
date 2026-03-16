import { router } from '../core/router.js';
import { state } from '../core/state.js';

export const navigation = {
  renderSidebar(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = `
      <div class="sidebar-top">
        <div class="sidebar-brand">
          <div class="sidebar-mark">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          </div>
          <span class="sidebar-logo-text">Journey</span>
        </div>
        <div class="sidebar-actions">
          <button class="icon-btn"><i class="ph-bold ph-bell"></i></button>
          <button class="icon-btn"><i class="ph-bold ph-caret-left"></i></button>
        </div>
      </div>
      
      <div class="sidebar-nav">
        <div class="nav-section-label">Meu Espaço</div>
        <div class="nav-item" data-screen="s2">
          <i class="ph-bold ph-buildings nav-icon"></i>
          Empresas
        </div>
        <div class="nav-item">
          <i class="ph-bold ph-users-three nav-icon"></i>
          Contatos
        </div>
        
        <div class="nav-section-label">Gestão</div>
        <div class="nav-item" data-screen="s3">
          <i class="ph-bold ph-user-gear nav-icon"></i>
          Usuários
        </div>
        <div class="nav-item">
          <i class="ph-bold ph-chart-bar nav-icon"></i>
          Relatórios
        </div>
        
        <div class="nav-section-label">Configurações</div>
        <div class="nav-item">
          <i class="ph-bold ph-gear nav-icon"></i>
          Geral
        </div>
      </div>
      
      <div class="sidebar-footer">
        <div class="user-row">
          <div class="u-avatar" style="background: ${state.user?.color || 'var(--indigo)'}">
            ${state.user?.short || 'U'}
          </div>
          <div>
            <div class="user-name">${state.user?.name || 'Usuário'}</div>
            <div class="user-role">${state.user?.type === 'master' ? 'Administrador Master' : 'Membro Standard'}</div>
          </div>
          <i class="ph-bold ph-caret-right chevron-icon"></i>
        </div>
      </div>
    `;
    
    // Add click listeners
    container.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const screen = item.getAttribute('data-screen');
        if (screen) router.navigate(screen);
      });
    });
  }
};
