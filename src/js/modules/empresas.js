import { state, TENANT_DATA, COMPANIES_DATA } from '../core/state.js';
import { router } from '../core/router.js';

export const empresas = {
  render() {
    const container = document.getElementById('s2-content');
    if (!container) return;
    
    container.innerHTML = `
      <div class="main-header">
        <div>
          <h1 class="page-title">
            <div class="page-title-icon"><i class="ph-bold ph-buildings"></i></div>
            Empresas
          </h1>
          <p class="page-sub">Gerencie o acesso às empresas filhas do seu tenant</p>
        </div>
        <button class="btn-primary" id="btn-new-company">
          <i class="ph-bold ph-plus"></i>
          Nova Empresa Filha
        </button>
      </div>
      
      <div class="stats-row">
        <div class="stat-c">
          <div class="stat-lbl">Total Empresas</div>
          <div class="stat-val indigo">${COMPANIES_DATA.length + 1}</div>
        </div>
        <div class="stat-c">
          <div class="stat-lbl">Ativas</div>
          <div class="stat-val green">3</div>
        </div>
        <div class="stat-c">
          <div class="stat-lbl">Sem Acesso</div>
          <div class="stat-val amber">2</div>
        </div>
        <div class="stat-c">
          <div class="stat-lbl">Plano</div>
          <div class="stat-val purple">Enterprise</div>
        </div>
      </div>
      
      <div class="panel">
        <div class="nav-section-label" style="padding-left:0; margin-bottom:12px;">Empresa Mãe (Tenant)</div>
        <div class="tenant-card">
          <div class="ci ci-lg" style="background: ${TENANT_DATA.color}">${TENANT_DATA.short}</div>
          <div>
            <h2 class="u-name" style="font-size: 16px;">${TENANT_DATA.name}</h2>
            <div class="tenant-badge-row">
              <span class="badge badge-plan">${TENANT_DATA.url}</span>
              <span class="badge badge-master">${TENANT_DATA.plan}</span>
              <span class="badge badge-active"><span class="dot dot-green"></span> Ativo</span>
            </div>
          </div>
          <div style="margin-left:auto; display:flex; align-items:center; gap:20px;">
            <div style="text-align:right;">
              <div class="stat-val" style="font-size:18px;">${TENANT_DATA.filhas}</div>
              <div class="stat-lbl" style="margin-bottom:0;">Filhas</div>
            </div>
            <div style="text-align:right;">
              <div class="stat-val" style="font-size:18px;">${TENANT_DATA.usuarios}</div>
              <div class="stat-lbl" style="margin-bottom:0;">Usuários</div>
            </div>
            <button class="act-btn">Configurar</button>
          </div>
        </div>
        
        <div class="nav-section-label" style="padding-left:0; margin-bottom:12px;">Empresas Filhas com Acesso</div>
        <div class="companies-grid">
          ${COMPANIES_DATA.map(co => this.renderCompanyCard(co)).join('')}
        </div>
        
        <div class="nav-section-label" style="padding-left:0; margin-bottom:12px;">Sem Acesso</div>
        <div class="companies-grid">
           ${this.renderLockedCard('Cliente Extra A', 'EX')}
           ${this.renderLockedCard('Parceiro Central', 'PC')}
        </div>
      </div>
    `;
    
    // Add click listeners to Enter buttons
    container.querySelectorAll('.btn-enter').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const company = COMPANIES_DATA.find(c => c.id === id);
        state.setState({ activeCompany: company, currentScreen: 's4' });
      });
    });
  },
  
  renderCompanyCard(co) {
    return `
      <div class="company-card">
        <div class="cc-head">
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="ci ci-md" style="background: ${co.color}">${co.short}</div>
            <div>
              <div class="u-name">${co.name}</div>
              <div class="u-email">${co.location}</div>
            </div>
          </div>
          <span class="badge badge-active">${co.status === 'active' ? 'Ativo' : 'Suspenso'}</span>
        </div>
        <div class="cc-metrics">
          <div class="cc-metric">
            <div class="cc-metric-val">${co.contacts}</div>
            <div class="cc-metric-lbl">Contatos</div>
          </div>
          <div class="cc-metric">
            <div class="cc-metric-val">${co.users}</div>
            <div class="cc-metric-lbl">Usuários</div>
          </div>
          <div class="cc-metric">
            <div class="cc-metric-val">${co.activity}</div>
            <div class="cc-metric-lbl">Ativ.</div>
          </div>
        </div>
        <div class="cc-footer">
          <span class="badge badge-access">${co.access}</span>
          <button class="btn-primary btn-enter" data-id="${co.id}" style="padding: 6px 12px; font-size: 11px;">Entrar</button>
        </div>
      </div>
    `;
  },
  
  renderLockedCard(name, short) {
    return `
      <div class="company-card locked">
        <div class="cc-head">
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="ci ci-md" style="background: var(--dark-400)">${short}</div>
            <div>
              <div class="u-name">${name}</div>
              <div class="u-email">Localização Bloqueada</div>
            </div>
          </div>
        </div>
        <div class="lock-overlay">
          <div class="lock-chip">
            <i class="ph-bold ph-lock"></i>
            Sem Acesso
          </div>
        </div>
      </div>
    `;
  }
};
