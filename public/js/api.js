const API_URL = '/api';

async function request(path, { method = 'GET', body, form } = {}) {
    const opts = { method, credentials: 'same-origin', headers: {} };
    if (form) {
        opts.body = form;
    } else if (body !== undefined) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
    }
    const r = await fetch(API_URL + path, opts);
    let data = null;
    try { data = await r.json(); } catch (e) { /* respons bukan JSON */ }
    if (!r.ok) throw new Error((data && data.error) || `Permintaan gagal (${r.status})`);
    return data;
}

const API = {
    // Auth
    register: (name, nim, email, password, lat, lng) => request('/register', { method: 'POST', body: { name, nim, email, password, lat, lng } }),
    login: (nim, password) => request('/login', { method: 'POST', body: { nim, password } }),
    logout: () => request('/logout', { method: 'POST' }),
    checkSession: () => request('/me'),
    resetPassword: (nim, email, newPassword) => request('/reset-password', { method: 'POST', body: { nim, email, newPassword } }),
    updateProfile: (fd) => request('/profile', { method: 'PUT', form: fd }),

    // Produk
    fetchProducts: (search = '', category = '') => request(`/products?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`),
    fetchMyProducts: () => request('/my-products'),
    addProduct: (fd) => request('/products', { method: 'POST', form: fd }),
    updateProduct: (id, fd) => request(`/products/${id}`, { method: 'PUT', form: fd }),
    deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE' }),
    markAsSold: (id) => request(`/products/${id}/sold`, { method: 'PUT' }),
    fetchPublicStore: (userId) => request(`/store/${userId}`),
    fetchBarter: (keyword) => request(`/barter?keyword=${encodeURIComponent(keyword)}`),

    // Transaksi
    createTransaction: (productId) => request('/transactions', { method: 'POST', body: { product_id: productId } }),
    fetchIncomingTransactions: () => request('/transactions/incoming'),
    updateTransactionStatus: (id, status) => request(`/transactions/${id}/status`, { method: 'PUT', body: { status } }),
    completeTransaction: (id, rating, review) => request(`/transactions/${id}/complete`, { method: 'PUT', body: { rating, review } }),

    // Chat
    fetchMessages: (room, after = 0) => request(`/messages/${encodeURIComponent(room)}?after=${after}`),
    sendMessage: (room, message) => request('/messages', { method: 'POST', body: { room, message } }),
    checkChatTransaction: (partnerId) => request(`/chat/${partnerId}/transaction`)
};