const API_URL = 'http://localhost:3000/api';
const API = {
    async fetchProducts() { const r = await fetch(`${API_URL}/products`); return r.json(); },
    async register(name, nim, password, lat, lng) { const r = await fetch(`${API_URL}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, nim, password, lat, lng }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; },
    async login(nim, password) { const r = await fetch(`${API_URL}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nim, password }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; },
    async logout() { await fetch(`${API_URL}/logout`, { method: 'POST' }); },
    async checkSession() { const r = await fetch(`${API_URL}/me`); if (!r.ok) throw new Error("No session"); return r.json(); },
    async updateProfile(id, fd) { const r = await fetch(`${API_URL}/users/${id}`, { method: 'PUT', body: fd }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; },
    async addProduct(fd) { const r = await fetch(`${API_URL}/products`, { method: 'POST', body: fd }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; },
    async deleteProduct(id) { await fetch(`${API_URL}/products/${id}`, { method: 'DELETE' }); },
    async findMatch(keyword, radius) { const r = await fetch(`${API_URL}/match?keyword=${keyword}&radius=${radius}`); return r.json(); },
    async fetchMessages(room) { const r = await fetch(`${API_URL}/messages/${room}`); return r.json(); },
    async initiateTransaction(sellerId, productId) { const r = await fetch(`${API_URL}/transactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seller_id: sellerId, product_id: productId }) }); return r.json(); }
};