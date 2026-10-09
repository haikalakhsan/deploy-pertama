const AppState = { activeUser: null, allProducts: [], currentRoom: null };
let chatPollInterval;

document.addEventListener("DOMContentLoaded", async () => {
    checkSession();
    fetchProducts();

    // AUTH
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const data = await API.login(document.getElementById('loginNim').value, document.getElementById('loginPass').value);
            AppState.activeUser = data.user;
            UI.closeModal('modalLogin'); UI.showToast("Login Berhasil!", "success");
            checkSession();
        } catch(e) { UI.showToast(e.message, "error"); }
    });

    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await API.register(document.getElementById('regName').value, document.getElementById('regNim').value, document.getElementById('regEmail').value, document.getElementById('regPass').value);
            UI.closeModal('modalRegister'); UI.showToast("Akun terdaftar! Silakan Login", "success");
            UI.openModal('modalLogin');
        } catch(e) { UI.showToast(e.message, "error"); }
    });

    document.getElementById('resetPassForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await API.resetPassword(document.getElementById('resetNim').value, document.getElementById('resetEmail').value, document.getElementById('resetNewPass').value);
            UI.closeModal('modalResetPass'); UI.showToast('Sandi diperbarui! Silakan Masuk.', 'success');
            document.getElementById('resetPassForm').reset(); UI.openModal('modalLogin');
        } catch(e) { UI.showToast(e.message, 'error'); }
    });

    // PRODUCTS
    document.getElementById('addProductForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.append('image', document.getElementById('prodImage').files[0]);
        fd.append('name', document.getElementById('prodName').value);
        fd.append('price', document.getElementById('prodPrice').value);
        fd.append('category', document.getElementById('prodCategory').value);
        fd.append('condition_grade', document.getElementById('prodGrade').value);
        fd.append('is_barter', document.getElementById('prodBarter').value);
        fd.append('description', document.getElementById('prodDesc').value);
        
        try {
            await API.addProduct(fd);
            UI.closeModal('modalAddProduct'); UI.showToast("Barang diunggah!", "success");
            document.getElementById('addProductForm').reset();
            fetchProducts(); renderMyEtalase();
        } catch(e) { UI.showToast(e.message, "error"); }
    });

    document.getElementById('ratingForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await API.completeTransaction(document.getElementById('ratingTxId').value, document.getElementById('ratingScore').value, document.getElementById('ratingReview').value);
            UI.closeModal('modalRating'); UI.showToast("Ulasan terkirim!", "success");
            window.fetchNotifications();
        } catch(e) { UI.showToast(e.message, "error"); }
    });
});

async function checkSession() {
    try {
        AppState.activeUser = await API.checkSession();
        document.getElementById('authGuest').style.display = 'none';
        document.getElementById('authLogged').style.display = 'flex';
        document.getElementById('navUserName').innerText = AppState.activeUser.name;
        document.getElementById('tabProfilBtn').style.display = 'flex';
        if(AppState.activeUser.role === 'admin') document.getElementById('tabAdminBtn').style.display = 'flex';
        renderMyEtalase(); window.fetchNotifications();
    } catch(e) {
        document.getElementById('authGuest').style.display = 'flex';
        document.getElementById('authLogged').style.display = 'none';
        document.getElementById('tabProfilBtn').style.display = 'none';
        document.getElementById('tabAdminBtn').style.display = 'none';
    }
}

window.logout = async function() { await API.logout(); AppState.activeUser = null; checkSession(); UI.switchTab('beranda'); }

window.fetchProducts = async function() {
    try {
        AppState.allProducts = await API.fetchProducts();
        document.getElementById('productGridContainer').innerHTML = UI.renderProductCards(AppState.allProducts);
    } catch(e) { console.error(e); }
}

window.executeSearch = async function(paramCategory) {
    const q = document.getElementById('searchInput') ? document.getElementById('searchInput').value : '';
    const category = typeof paramCategory === 'string' ? paramCategory : '';
    document.getElementById('productGridContainer').innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:50px;"><i class="fas fa-spinner fa-spin fa-3x text-grey"></i></div>';
    try {
        const results = await API.fetchProducts(q, category);
        document.getElementById('productSectionTitle').innerText = q || category ? `Hasil pencarian` : 'Baru Diposting';
        document.getElementById('productGridContainer').innerHTML = UI.renderProductCards(results);
    } catch(e) { UI.showToast("Gagal mencari barang", "error"); }
    UI.switchTab('beranda');
}

// CHAT POLLING
function startChatPolling(room) {
    if (chatPollInterval) clearInterval(chatPollInterval);
    loadChatHistory(room);
    chatPollInterval = setInterval(() => loadChatHistory(room), 3000);
}

async function loadChatHistory(room) {
    if(!AppState.activeUser) return;
    try {
        const msgs = await API.fetchMessages(room);
        const area = document.getElementById('chatMessagesArea');
        if(!area) return;
        
        if(msgs.length === 0) { area.innerHTML = `<p class="text-center text-grey" style="padding:30px;">Kirim pesan pertama!</p>`; return; }

        let html = '';
        msgs.forEach(m => {
            const isMe = m.sender_name === AppState.activeUser.name;
            html += `<div style="text-align:${isMe ? 'right' : 'left'}; margin-bottom:15px; width:100%;">
                ${!isMe ? `<div style="font-size:11px; font-weight:bold; color:gray;">${UI.escapeHTML(m.sender_name)}</div>` : ''}
                <div style="display:inline-block; background:${isMe ? 'var(--primary-green)' : 'white'}; color:${isMe ? 'white' : '#333'}; padding:12px 18px; border-radius:15px; max-width:75%; text-align:left;">
                    ${UI.escapeHTML(m.message)}
                </div>
            </div>`;
        });
        
        if (area.children.length !== msgs.length) { area.innerHTML = html; area.scrollTop = area.scrollHeight; }
    } catch(e) {}
}

window.sendMessage = async function() {
    if(!AppState.activeUser) return;
    const input = document.getElementById('chatMessageInput');
    const msg = input.value.trim();
    if(!msg) return;
    input.value = '';
    await API.sendMessage(AppState.currentRoom, msg, AppState.activeUser.name);
    loadChatHistory(AppState.currentRoom);
}

window.startChat = async function(sellerId, sellerName) {
    if(!AppState.activeUser) { UI.openModal('modalLogin'); return; }
    if(AppState.activeUser.id === sellerId) { UI.showToast("Ini barangmu sendiri", "info"); return; }
    
    const users = [AppState.activeUser.id, sellerId].sort();
    AppState.currentRoom = 'room_' + users[0] + '_' + users[1];
    document.getElementById('chatRoomTitle').innerHTML = `${UI.escapeHTML(sellerName)}`;
    
    const banner = document.getElementById('chatTxBanner');
    try {
        const tx = await API.checkChatTransaction(sellerId);
        if (tx && banner) {
            banner.style.display = 'block';
            banner.style.color = tx.status === 'completed' ? 'green' : (tx.status === 'cancelled' ? 'red' : '#856404');
            banner.innerHTML = `<i class="fas fa-box"></i> <strong>${UI.escapeHTML(tx.name)}</strong> - Status: ${tx.status.toUpperCase()}`;
        } else if (banner) { banner.style.display = 'none'; }
    } catch(e) { if(banner) banner.style.display = 'none'; }
    
    startChatPolling(AppState.currentRoom); UI.switchTab('chat');
}

// TRANSAKSI
window.handleLockTransaction = async function(sellerId, productId) {
    if(!AppState.activeUser) return UI.openModal('modalLogin');
    if(confirm("Kunci transaksi ini? Penjual akan dikabari.")) {
        try { await API.createTransaction(sellerId, productId); UI.showToast("Berhasil diajukan!", "success"); } 
        catch(e) { UI.showToast(e.message, "error"); }
    }
}

window.fetchNotifications = async function() {
    if(!AppState.activeUser) return;
    try {
        const txs = await API.fetchIncomingTransactions();
        const badge = document.getElementById('chatNotifBadge');
        if(badge) { badge.style.display = txs.length > 0 ? 'inline-block' : 'none'; badge.innerText = txs.length; }

        const area = document.getElementById('notifListArea');
        if(!area) return;
        if (txs.length === 0) { area.innerHTML = '<p class="text-grey text-center">Belum ada pesanan masuk.</p>'; return; }

        let html = '';
        txs.forEach(t => {
            let actions = '';
            if (t.status === 'pending' && t.seller_id === AppState.activeUser.id) {
                actions = `<button class="btn-primary-green btn-sm" onclick="handleTx(${t.id}, 'accepted')">Terima</button>
                           <button class="btn-danger btn-sm" onclick="handleTx(${t.id}, 'cancelled')">Tolak</button>`;
            } else if (t.status === 'accepted' && t.buyer_id === AppState.activeUser.id) {
                actions = `<button class="btn-solid-orange btn-sm w-100" onclick="document.getElementById('ratingTxId').value='${t.id}'; UI.openModal('modalRating');">COD Selesai (Rating)</button>`;
            } else {
                actions = `<span class="text-grey font-bold">STATUS: ${t.status.toUpperCase()}</span>`;
            }

            html += `<div style="background:#f8f9fa; padding:15px; border-radius:10px; margin-bottom:12px;">
                <div style="display:flex; gap:12px; margin-bottom:10px;">
                    <img src="${t.product_image || 'https://via.placeholder.com/50'}" style="width:45px; height:45px; border-radius:10px; object-fit:cover;">
                    <div>
                        <h4 style="margin:0; font-size:14px;">${UI.escapeHTML(t.product_name)}</h4>
                        <p style="margin:0; font-size:12px; color:gray;">Mitra: ${UI.escapeHTML(t.buyer_name)}</p>
                    </div>
                </div>
                <div style="display:flex; gap:10px;">${actions}</div>
            </div>`;
        });
        area.innerHTML = html;
    } catch(e) {}
}

window.handleTx = async function(id, status) {
    try {
        await API.updateTransactionStatus(id, status);
        UI.showToast(status === 'accepted' ? 'Diterima!' : 'Ditolak', status === 'accepted' ? 'success' : 'info');
        window.fetchNotifications();
    } catch(e) { UI.showToast(e.message, "error"); }
}

window.renderMyEtalase = function() {
    if(!AppState.activeUser) return;
    const myItems = AppState.allProducts.filter(p => p.user_id === AppState.activeUser.id);
    document.getElementById('myEtalaseGrid').innerHTML = UI.renderProductCards(myItems, true);
}

window.handleDeleteProduct = async function(id) {
    if(confirm("Yakin hapus permanen?")) {
        try { await API.deleteProduct(id); UI.showToast("Dihapus!", "success"); fetchProducts(); renderMyEtalase(); } 
        catch(e) { UI.showToast(e.message, "error"); }
    }
}

window.handleMarkSold = async function(id) {
    if(confirm('Tandai TERJUAL?')) {
        try { await API.markAsSold(id); UI.showToast("Laku!", "success"); fetchProducts(); renderMyEtalase(); } 
        catch(e) { UI.showToast(e.message, "error"); }
    }
}

window.openPublicStore = async function(userId) {
    try {
        const data = await API.fetchPublicStore(userId);
        document.getElementById('storeUserName').innerText = data.user.name;
        document.getElementById('storeUserImg').src = data.user.profile_image || 'https://via.placeholder.com/80';
        document.getElementById('storeGridContainer').innerHTML = data.products.length > 0 ? UI.renderProductCards(data.products) : '<p class="text-center text-grey" style="grid-column:1/-1;">Belum ada jualan.</p>';
        UI.openModal('modalPublicStore');
    } catch(e) {}
}