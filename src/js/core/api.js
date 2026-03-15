export const api = {
  baseUrl: '/api',
  
  async get(endpoint) {
    const res = await fetch(`${this.baseUrl}${endpoint}`);
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },
  
  async post(endpoint, data) {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },
  
  async patch(endpoint, data) {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  },
  
  async delete(endpoint) {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error(`API Error: ${res.status}`);
    return res.json();
  }
};
