export const TENANT_DATA = {
  name: 'Dati Master',
  plan: 'Enterprise',
  users: 12,
  companies: 5,
  logo: 'D'
};

export const COMPANIES_DATA = [
  { id: '1', name: 'Alunorte', short: 'AL', color: 'linear-gradient(135deg, #3b82f6, #2563eb)', location: 'Barcarena, PA', contacts: 12, users: 4, activity: '92%', status: 'active', razao: 'Alunorte Alumina do Norte do Brasil S.A.', cnpj: '00.000.000/0001-00', created: '10/01/2024' },
  { id: '2', name: 'Hydro Paragominas', short: 'HP', color: 'linear-gradient(135deg, #10b981, #059669)', location: 'Paragominas, PA', contacts: 8, users: 3, activity: '85%', status: 'active', razao: 'Mineração Paragominas S.A.', cnpj: '00.000.000/0001-01', created: '15/02/2024' },
  { id: '3', name: 'Vale S.A.', short: 'V', color: 'linear-gradient(135deg, #f59e0b, #d97706)', location: 'Nova Lima, MG', contacts: 24, users: 6, activity: '78%', status: 'active', razao: 'Vale S.A.', cnpj: '00.000.000/0001-02', created: '20/03/2024' },
  { id: '4', name: 'Imerys Rio Jari', short: 'IR', color: 'linear-gradient(135deg, #6366f1, #4f46e5)', location: 'Muaná, PA', contacts: 0, users: 0, activity: '0%', status: 'locked' },
  { id: '5', name: 'Norsk Hydro', short: 'NH', color: 'linear-gradient(135deg, #ec4899, #db2777)', location: 'Oslo, NO', contacts: 0, users: 0, activity: '0%', status: 'locked' }
];

export const PERMISSIONS_LIST = {
  navigation: ['Dashboard', 'Empresas', 'Minhas Atividades', 'Relatórios', 'Histórico de Alterações', 'Log de Testes', 'Gabi AI'],
  view: ['Dados Básicos', 'Produtos DATI', 'Contatos', 'Customer Success', 'Atividades'],
  edit: ['Editar Básicos', 'Editar Produtos DATI', 'Editar Contatos', 'Editar CS', 'Editar Atividades']
};

export const state = {
  user: null,
  isAuthenticated: false,
  currentScreen: 's1',
  activeCompany: null,
  tenant: TENANT_DATA,
  companies: COMPANIES_DATA,
  users: [],
  listeners: [],

  subscribe(fn) {
    this.listeners.push(fn);
  },

  notify() {
    this.listeners.forEach(fn => fn(this));
  },

  setState(newState) {
    Object.assign(this, newState);
    this.notify();
  },

  async fetchTenantData() {
    try {
      const res = await fetch('/api/users/me/tenant');
      if (res.ok) {
        this.tenant = await res.json();
        this.notify();
      }
    } catch (err) {
      console.warn('Failed to fetch tenant data:', err);
    }
  },

  async fetchUsers() {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        this.users = await res.json();
        this.notify();
      }
    } catch (err) {
      console.warn('Failed to fetch users:', err);
    }
  },

  async fetchCompanies() {
    try {
      const res = await fetch('/api/users/me/companies');
      if (res.ok) {
        const data = await res.json();
        this.companies = data.companies || COMPANIES_DATA;
        this.notify();
      }
    } catch (err) {
      console.warn('Failed to fetch companies:', err);
    }
  }
};
