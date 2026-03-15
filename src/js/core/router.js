import { state } from './state.js';

export const router = {
  screens: ['s1', 's2', 's3', 's4'],
  
  init() {
    state.subscribe((s) => {
      this.render(s.currentScreen);
    });
    this.render(state.currentScreen);
  },
  
  navigate(screenId, params = {}) {
    state.setState({ currentScreen: screenId, ...params });
  },
  
  render(activeScreenId) {
    this.screens.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (id === activeScreenId) {
          el.classList.remove('hidden');
          el.classList.add('active');
        } else {
          el.classList.add('hidden');
          el.classList.remove('active');
        }
      }
    });
    
    // Update sidebar active state
    this.updateSidebar(activeScreenId);
  },
  
  updateSidebar(screenId) {
    document.querySelectorAll('.nav-item').forEach(item => {
      const target = item.getAttribute('data-screen');
      if (target === screenId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }
};
