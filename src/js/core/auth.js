import { state } from './state.js';

export const auth = {
  async init() {
    // This would be replaced by actual Clerk initialization
    console.log('Initializing Auth...');
    
    // Check session mock
    const userJson = localStorage.getItem('journey_user');
    if (userJson) {
      state.setState({ user: JSON.parse(userJson), currentScreen: 's2' });
    }
  },
  
  async login(email) {
    // Mock login
    const user = {
      name: 'Daniel Martins',
      email: email,
      type: 'master',
      short: 'DM',
      color: 'linear-gradient(135deg,#6366f1,#8b5cf6)'
    };
    localStorage.setItem('journey_user', JSON.stringify(user));
    state.setState({ user, currentScreen: 's2' });
  },
  
  async logout() {
    localStorage.removeItem('journey_user');
    state.setState({ user: null, currentScreen: 's1' });
  }
};
