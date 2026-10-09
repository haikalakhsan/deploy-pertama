const API_URL = '/api';

const API = {
    async register(name, nim, email, password, lat, lng) { const r = await fetch(`${API_URL}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, nim, email, password, lat, lng }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; },
    async login(nim, password) { const r = await fetch(`${API_URL}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nim, password }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; },
    async logout() { await fetch(`${API_URL}/logout`, { method: 'POST' }); },
    async checkSession() { const r = await fetch(`${API_URL}/me`); if (!r.ok) throw new Error("Not Logged In"); return r.json(); },
    async resetPassword(nim, email, newPassword) { const r = await fetch(`${API_URL}/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nim, email, newPassword }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; },
    
    async fetchProducts(search = '', category = '') { const r = await fetch(`${API_URL}/products?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`); return r.json(); },
    async addProduct(fd) { const r = await fetch(`${API_URL}/products`, { method: 'POST', body: fd }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; },
    async updateProduct(id, fd) { const r = await fetch(`${API_URL}/products/${id}`, { method: 'PUT', body: fd }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; },
    async deleteProduct(id) { const r = await fetch(`${API_URL}/products/${id}`, { method: 'DELETE' }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; },
    async markAsSold(id) { const r = await fetch(`${API_URL}/products/${id}/sold`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }}); return r.json(); },
    async fetchPublicStore(userId) { const r = await fetch(`${API_URL}/store/${userId}`); return r.json(); },
    
    async createTransaction(sellerId, productId) { const r = await fetch(`${API_URL}/transactions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seller_id: sellerId, product_id: productId }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error); return d; },
    async fetchIncomingTransactions() { const r = await fetch(`${API_URL}/transactions/incoming`); return r.json(); },
    async updateTransactionStatus(id, status) { const r = await fetch(`${API_URL}/transactions/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); return r.json(); },
    async completeTransaction(id, rating, review) { const r = await fetch(`${API_URL}/transactions/${id}/complete`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rating, review }) }); return r.json(); },
    
    async fetchMessages(room) { const r = await fetch(`${API_URL}/messages/${room}`); return r.json(); },
    async sendMessage(room, message, senderName) { const r = await fetch(`${API_URL}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room, message, sender_name: senderName }) }); return r.json(); },
    async checkChatTransaction(partnerId) { const r = await fetch(`${API_URL}/chat/${partnerId}/transaction`); return r.json(); }
};