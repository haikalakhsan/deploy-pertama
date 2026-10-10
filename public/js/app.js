const AppState = { activeUser: null, allProducts: [], myProducts: [], currentRoom: null, selectedBarterItem: null };
const CATEGORIES = ['Elektronik', 'Buku & Diktat', 'Perabot Kos', 'Fashion', 'Tas & ATK', 'Lainnya'];

let chatPollInterval = null;
let chatLastId = 0;
let notifInterval = null;

const $ = (id) => document.getElementById(id);

// ---------- Util ----------
async function withBusy(btnId, fn) {
    const btn = $(btnId);
    if (btn) btn.disabled = true;
    try { return await fn(); } finally { if (btn) btn.disabled = false; }
}

// Kompres foto di browser (batas body Vercel ~4.5 MB)
async function compressImage(file, maxSide = 1200, quality = 0.8) {
    if (!file || !file.type.startsWith('image/')) return file;
    try {
        const bmp = await createImageBitmap(file);
        const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.round(bmp.width * scale);
        c.height = Math.round(bmp.height * scale);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', quality));
        return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
    } catch (e) { return file; }
}

function fillCategorySelects() {
    ['prodCategory', 'editProdCategory'].forEach(id => {
        const sel = $(id);
        if (sel) sel.innerHTML = CATEGORIES.map(c => `<option value="${UI.escapeHTML(c)}">${UI.escapeHTML(c)}</option>`).join('');
    });
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
    fillCategorySelects();
    window.fetchProducts();
    checkSession();

    // Event delegation untuk semua tombol dinamis
    document.addEventListener('click', (e) => {
        // Tutup dropdown profil bila klik di luar
        if (!e.target.closest('#profileMenu') && !e.target.closest('[onclick*="toggleDropdown"]')) {
            const menu = $('profileMenu'); if (menu) menu.style.display = 'none';
        }
        // Tutup modal bila klik area gelap
        if (e.target.classList && e.target.classList.contains('modal')) e.target.style.display = 'none';

        const el = e.target.closest('[data-action]');
        if (!el) return;
        const d = el.dataset;
        switch (d.action) {
            case 'chat': UI.closeModal('modalPublicStore'); startChat(Number(d.sellerId), d.sellerName); break;
            case 'open-private': startChat(Number(d.sellerId), d.sellerName); break;
            case 'lock': handleLockTransaction(Number(d.id)); break;
            case 'store': openPublicStore(Number(d.userId)); break;
            case 'sold': handleMarkSold(Number(d.id)); break;
            case 'edit': openEditModal(Number(d.id)); break;
            case 'delete': handleDeleteProduct(Number(d.id)); break;
            case 'select-barter': selectBarterItem(Number(d.id)); break;
            case 'tx-accept': handleTx(Number(d.id), 'accepted'); break;
            case 'tx-reject': handleTx(Number(d.id), 'cancelled'); break;
            case 'tx-complete': $('ratingTxId').value = d.id; UI.openModal('modalRating'); break;
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    });

    // AUTH
    $('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await withBusy('btnLoginSubmit', async () => {
            try {
                await API.login($('loginNim').value, $('loginPass').value);
                UI.closeModal('modalLogin');
                $('loginForm').reset();
                UI.showToast('Login Berhasil!', 'success');
                await checkSession();
                window.fetchProducts();
            } catch (err) { UI.showToast(err.message, 'error'); }
        });
    });

    $('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await withBusy('btnRegSubmit', async () => {
            try {
                await API.register($('regName').value, $('regNim').value, $('regEmail').value, $('regPass').value);
                UI.closeModal('modalRegister');
                $('registerForm').reset();
                UI.showToast('Akun terdaftar! Silakan Login', 'success');
                UI.openModal('modalLogin');
            } catch (err) { UI.showToast(err.message, 'error'); }
        });
    });

    $('resetPassForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await withBusy('btnResetSubmit', async () => {
            try {
                await API.resetPassword($('resetNim').value, $('resetEmail').value, $('resetNewPass').value);
                UI.closeModal('modalResetPass');
                $('resetPassForm').reset();
                UI.showToast('Sandi diperbarui! Silakan Masuk.', 'success');
                UI.openModal('modalLogin');
            } catch (err) { UI.showToast(err.message, 'error'); }
        });
    });

    // PRODUK
    $('addProductForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await withBusy('btnAddSubmit', async () => {
            try {
                const file = $('prodImage').files[0];
                if (!file) return UI.showToast('Foto barang wajib diunggah.', 'error');
                const fd = new FormData();
                fd.append('image', await compressImage(file));
                fd.append('name', $('prodName').value);
                fd.append('price', $('prodPrice').value);
                fd.append('category', $('prodCategory').value);
                fd.append('condition_grade', $('prodGrade').value);
                fd.append('is_barter', $('prodBarter').value);
                fd.append('description', $('prodDesc').value);
                await API.addProduct(fd);
                UI.closeModal('modalAddProduct');
                UI.showToast('Barang diunggah!', 'success');
                $('addProductForm').reset();
                window.fetchProducts();
                refreshMyProducts();
            } catch (err) { UI.showToast(err.message, 'error'); }
        });
    });

    $('editProductForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await withBusy('btnEditSubmit', async () => {
            try {
                const fd = new FormData();
                const file = $('editProdImage').files[0];
                if (file) fd.append('image', await compressImage(file));
                fd.append('name', $('editProdName').value);
                fd.append('price', $('editProdPrice').value);
                fd.append('category', $('editProdCategory').value);
                fd.append('condition_grade', $('editProdGrade').value);
                fd.append('is_barter', $('editProdBarter').value);
                fd.append('description', $('editProdDesc').value);
                await API.updateProduct($('editProdId').value, fd);
                UI.closeModal('modalEditProduct');
                UI.showToast('Barang diperbarui!', 'success');
                window.fetchProducts();
                refreshMyProducts();
            } catch (err) { UI.showToast(err.message, 'error'); }
        });
    });

    $('ratingForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await withBusy('btnSubmitRating', async () => {
            try {
                await API.completeTransaction($('ratingTxId').value, Number($('ratingScore').value), $('ratingReview').value);
                UI.closeModal('modalRating');
                $('ratingForm').reset();
                UI.showToast('Ulasan terkirim!', 'success');
                window.fetchNotifications();
                window.fetchProducts();
                refreshMyProducts();
            } catch (err) { UI.showToast(err.message, 'error'); }
        });
    });

    // PROFIL
    $('editProfileForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await withBusy('btnUpdateProfile', async () => {
            try {
                const fd = new FormData();
                fd.append('faculty', $('editFaculty').value);
                fd.append('phone', $('editPhone').value);
                AppState.activeUser = await API.updateProfile(fd);
                applyLoggedInUI();
                UI.showToast('Profil disimpan!', 'success');
            } catch (err) { UI.showToast(err.message, 'error'); }
        });
    });

    $('profileImgInput').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const fd = new FormData();
            fd.append('image', await compressImage(file, 600));
            AppState.activeUser = await API.updateProfile(fd);
            applyLoggedInUI();
            UI.showToast('Foto profil diperbarui!', 'success');
        } catch (err) { UI.showToast(err.message, 'error'); }
        e.target.value = '';
    });

    $('chatMessageInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') window.sendMessage();
    });
});

// ---------- Session ----------
function applyLoggedInUI() {
    const u = AppState.activeUser;
    if (!u) return;
    $('authGuest').style.display = 'none';
    $('authUser').style.display = 'flex';
    $('headerProfileName').innerText = (u.name || 'Profil').split(' ')[0];
    $('headerProfilePic').src = u.profile_image || UI.PLACEHOLDER;
    $('tabProfilBtn').style.display = 'flex';
    $('fabAddProduct').style.display = 'flex';
    // Admin Panel belum ada, tombolnya tetap disembunyikan.
}

function applyGuestUI() {
    $('authGuest').style.display = 'flex';
    $('authUser').style.display = 'none';
    $('tabProfilBtn').style.display = 'none';
    $('tabAdminBtn').style.display = 'none';
    $('fabAddProduct').style.display = 'none';
}

async function checkSession() {
    try {
        AppState.activeUser = await API.checkSession();
        applyLoggedInUI();
        await refreshMyProducts();
        window.fetchNotifications();
        if (!notifInterval) notifInterval = setInterval(() => { if (!document.hidden) window.fetchNotifications(); }, 30000);
    } catch (e) {
        AppState.activeUser = null;
        AppState.myProducts = [];
        applyGuestUI();
        if (notifInterval) { clearInterval(notifInterval); notifInterval = null; }
    }
}

async function doLogout() {
    try { await API.logout(); } catch (e) { /* abaikan */ }
    AppState.activeUser = null;
    AppState.myProducts = [];
    AppState.currentRoom = null;
    stopChatPolling();
    if (notifInterval) { clearInterval(notifInterval); notifInterval = null; }
    applyGuestUI();
    UI.switchTab('beranda');
    window.fetchProducts();
}
window.logout = doLogout;
window.handleLogout = doLogout;

// Hook dari UI.switchTab
window.onTabChange = function (tabId) {
    if (['profil', 'chat', 'barter'].includes(tabId) && !AppState.activeUser) {
        UI.switchTab('beranda');
        UI.showToast('Silakan login terlebih dahulu', 'info');
        UI.openModal('modalLogin');
        return;
    }
    if (tabId === 'chat') {
        if (!AppState.currentRoom) { AppState.currentRoom = 'global'; showGlobalHeader(); }
        startChatPolling(AppState.currentRoom);
    } else {
        stopChatPolling();
    }
    if (tabId === 'profil') renderProfile();
    if (tabId === 'barter') renderBarterItems();
};

// ---------- Produk ----------
window.fetchProducts = async function () {
    try {
        AppState.allProducts = await API.fetchProducts();
        $('productSectionTitle').innerText = 'Baru Diposting';
        $('productGridContainer').innerHTML = UI.renderProductCards(AppState.allProducts);
    } catch (e) {
        $('productGridContainer').innerHTML = '<p class="text-grey text-center" style="grid-column:1/-1;">Gagal memuat barang. Coba segarkan halaman.</p>';
    }
};

window.executeSearch = async function (paramCategory) {
    const category = typeof paramCategory === 'string' ? paramCategory : '';
    if (category && $('searchInput')) $('searchInput').value = '';
    const q = $('searchInput') ? $('searchInput').value.trim() : '';
    $('productGridContainer').innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:50px;"><i class="fas fa-spinner fa-spin fa-3x text-grey"></i></div>';
    UI.switchTab('beranda');
    try {
        const results = await API.fetchProducts(q, category);
        $('productSectionTitle').innerText = category ? `Kategori: ${category}` : (q ? `Hasil untuk "${q}"` : 'Baru Diposting');
        $('productGridContainer').innerHTML = UI.renderProductCards(results);
    } catch (e) { UI.showToast('Gagal mencari barang', 'error'); }
};

async function refreshMyProducts() {
    if (!AppState.activeUser) return;
    try {
        AppState.myProducts = await API.fetchMyProducts();
        window.renderMyEtalase();
        renderBarterItems();
    } catch (e) { /* abaikan */ }
}

window.renderMyEtalase = function () {
    if (!AppState.activeUser) return;
    $('myEtalaseGrid').innerHTML = UI.renderProductCards(AppState.myProducts, true);
};

window.openEditModal = function (id) {
    const p = AppState.myProducts.find(x => x.id === id);
    if (!p) return;
    $('editProdId').value = p.id;
    $('editProdName').value = p.name;
    $('editProdCategory').value = p.category;
    $('editProdPrice').value = p.price;
    $('editProdGrade').value = p.condition_grade;
    $('editProdBarter').value = p.is_barter_allowed ? '1' : '0';
    $('editProdDesc').value = p.description || '';
    $('editProdImage').value = '';
    UI.openModal('modalEditProduct');
};

window.handleDeleteProduct = async function (id) {
    if (!confirm('Yakin hapus permanen?')) return;
    try {
        await API.deleteProduct(id);
        UI.showToast('Dihapus!', 'success');
        window.fetchProducts();
        refreshMyProducts();
    } catch (e) { UI.showToast(e.message, 'error'); }
};

window.handleMarkSold = async function (id) {
    if (!confirm('Tandai TERJUAL?')) return;
    try {
        await API.markAsSold(id);
        UI.showToast('Laku!', 'success');
        window.fetchProducts();
        refreshMyProducts();
    } catch (e) { UI.showToast(e.message, 'error'); }
};

window.openPublicStore = async function (userId) {
    try {
        const data = await API.fetchPublicStore(userId);
        $('storeUserName').innerText = data.user.name;
        $('storeUserImg').src = data.user.profile_image || UI.PLACEHOLDER;
        const fac = $('storeUserFaculty');
        if (fac) fac.innerHTML = `<i class="fas fa-graduation-cap"></i> ${UI.escapeHTML(data.user.faculty || 'Mahasiswa UNNES')}`;
        $('storeGridContainer').innerHTML = data.products.length > 0
            ? UI.renderProductCards(data.products)
            : '<p class="text-center text-grey" style="grid-column:1/-1;">Belum ada jualan.</p>';
        UI.openModal('modalPublicStore');
    } catch (e) { UI.showToast(e.message, 'error'); }
};

// ---------- Profil ----------
function renderProfile() {
    const u = AppState.activeUser;
    if (!u) return;
    $('displayProfileName').innerText = u.name;
    $('displayProfileNim').innerText = `NIM: ${u.nim}`;
    $('editFaculty').value = u.faculty || '';
    $('editPhone').value = u.phone || '';
    $('mainProfilePic').src = u.profile_image || UI.PLACEHOLDER;
    window.renderMyEtalase();
}

// ---------- Barter ----------
function renderBarterItems() {
    const list = $('barterDynamicList');
    if (!list) return;
    const items = AppState.myProducts.filter(p => !p.is_sold);
    if (items.length === 0) {
        list.innerHTML = '<p class="text-grey text-center" style="padding:15px;">Etalasemu masih kosong. Tambahkan barang dulu.</p>';
        return;
    }
    list.innerHTML = items.map(p => `
        <div class="my-item-card ${AppState.selectedBarterItem === p.id ? 'selected' : ''}" data-action="select-barter" data-id="${p.id}">
            <div class="my-item-img"><img src="${UI.escapeHTML(p.image) || UI.PLACEHOLDER}" alt=""></div>
            <div class="my-item-info"><h4 style="font-size:14px;">${UI.escapeHTML(p.name)}</h4><p style="font-size:12px;color:gray;">${UI.formatRupiah(p.price)}</p></div>
            <div class="check-circle"><i class="fas fa-check"></i></div>
        </div>`).join('');
}

function selectBarterItem(id) {
    AppState.selectedBarterItem = AppState.selectedBarterItem === id ? null : id;
    renderBarterItems();
}

window.findBarterMatch = async function () {
    if (!AppState.activeUser) return UI.openModal('modalLogin');
    if (!AppState.selectedBarterItem) return UI.showToast('Pilih dulu barang yang ingin kamu tukar.', 'info');
    const keyword = $('barterKeyword').value.trim();
    if (!keyword) return UI.showToast('Isi barang yang kamu cari.', 'info');
    const box = $('barterResults');
    box.style.display = 'block';
    box.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin fa-2x text-grey"></i></div>';
    try {
        const results = await API.fetchBarter(keyword);
        box.innerHTML = results.length === 0
            ? '<p class="text-grey text-center">Belum ada barang barter yang cocok.</p>'
            : `<h4 style="margin-bottom:10px;">${results.length} barang cocok</h4><div class="grid-3" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));">${UI.renderProductCards(results)}</div>`;
    } catch (e) {
        box.innerHTML = '';
        UI.showToast(e.message, 'error');
    }
};

// ---------- Chat ----------
function ensureBanner() {
    let banner = $('chatTxBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'chatTxBanner';
        banner.style.cssText = 'display:none; padding:10px 25px; background:#fff8e1; font-size:13px; border-bottom:1px solid #eee;';
        const header = document.querySelector('.room-header');
        if (header) header.insertAdjacentElement('afterend', banner);
    }
    return banner;
}

function setActiveChatItem(which) {
    document.querySelectorAll('#chatListContainer .chat-item').forEach(el => el.classList.toggle('active', el.dataset.chat === which));
}

function showGlobalHeader() {
    $('chatRoomTitle').innerHTML = 'Forum Global <span class="verified-tag"><i class="fas fa-wifi"></i></span>';
    ensureBanner().style.display = 'none';
    setActiveChatItem('global');
}

window.openGlobalChat = function () {
    if (!AppState.activeUser) return UI.openModal('modalLogin');
    AppState.currentRoom = 'global';
    showGlobalHeader();
    UI.switchTab('chat');
};

function upsertPrivateChatItem(sellerId, name) {
    const list = $('chatListContainer');
    let el = list.querySelector('[data-chat="private"]');
    if (!el) {
        el = document.createElement('div');
        el.className = 'chat-item';
        el.dataset.chat = 'private';
        list.appendChild(el);
    }
    el.dataset.action = 'open-private';
    el.dataset.sellerId = sellerId;
    el.dataset.sellerName = name;
    el.innerHTML = `<div class="chat-avatar"><img src="${UI.PLACEHOLDER}" alt=""></div>
        <div class="chat-item-content"><div class="chat-item-top"><h4>${UI.escapeHTML(name)}</h4></div>
        <span class="chat-badge badge-barter-light">Chat pribadi</span></div>`;
}

window.startChat = async function (sellerId, sellerName) {
    if (!AppState.activeUser) return UI.openModal('modalLogin');
    if (AppState.activeUser.id === sellerId) return UI.showToast('Ini barangmu sendiri', 'info');

    const [a, b] = [AppState.activeUser.id, sellerId].sort((x, y) => x - y);
    AppState.currentRoom = `room_${a}_${b}`;
    $('chatRoomTitle').innerText = sellerName;
    upsertPrivateChatItem(sellerId, sellerName);
    setActiveChatItem('private');

    const banner = ensureBanner();
    banner.style.display = 'none';
    try {
        const tx = await API.checkChatTransaction(sellerId);
        if (tx) {
            banner.style.display = 'block';
            banner.style.color = tx.status === 'completed' ? 'green' : (tx.status === 'cancelled' ? 'red' : '#856404');
            banner.innerHTML = `<i class="fas fa-box"></i> <strong>${UI.escapeHTML(tx.name)}</strong> - Status: ${UI.escapeHTML(tx.status.toUpperCase())}`;
        }
    } catch (e) { /* banner tetap tersembunyi */ }

    UI.switchTab('chat'); // hook onTabChange memulai polling
};

function stopChatPolling() {
    if (chatPollInterval) { clearInterval(chatPollInterval); chatPollInterval = null; }
}

function startChatPolling(room) {
    stopChatPolling();
    AppState.currentRoom = room;
    chatLastId = 0;
    const area = $('chatMessagesArea');
    if (area) area.innerHTML = '';
    loadChatHistory(true);
    chatPollInterval = setInterval(() => { if (!document.hidden) loadChatHistory(); }, 4000);
}

function renderMessage(m) {
    const isMe = Number(m.sender_id) === AppState.activeUser.id;
    const time = new Date(m.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    return `<div style="text-align:${isMe ? 'right' : 'left'}; width:100%;">
        ${!isMe ? `<div style="font-size:11px; font-weight:bold; color:gray; margin-bottom:3px;">${UI.escapeHTML(m.sender_name)}</div>` : ''}
        <div style="display:inline-block; background:${isMe ? 'var(--primary-green)' : 'white'}; color:${isMe ? 'white' : '#333'}; padding:12px 18px; border-radius:15px; max-width:75%; text-align:left; white-space:pre-wrap; word-break:break-word;">${UI.escapeHTML(m.message)}</div>
        <div style="font-size:10px; color:#999; margin-top:3px;">${time}</div>
    </div>`;
}

async function loadChatHistory(initial = false) {
    if (!AppState.activeUser || !AppState.currentRoom) return;
    const room = AppState.currentRoom;
    try {
        const msgs = await API.fetchMessages(room, chatLastId);
        if (room !== AppState.currentRoom) return; // ruang sudah berganti
        const area = $('chatMessagesArea');
        if (!area) return;
        if (msgs.length === 0) {
            if (initial) area.innerHTML = '<p class="text-center text-grey" style="padding:30px;">Kirim pesan pertama!</p>';
            return;
        }
        const stick = chatLastId === 0 || (area.scrollHeight - area.scrollTop - area.clientHeight < 80);
        if (chatLastId === 0) area.innerHTML = '';
        area.insertAdjacentHTML('beforeend', msgs.map(renderMessage).join(''));
        chatLastId = msgs[msgs.length - 1].id;
        if (stick) area.scrollTop = area.scrollHeight;
    } catch (e) { /* coba lagi pada polling berikutnya */ }
}

window.sendMessage = async function () {
    if (!AppState.activeUser) return UI.openModal('modalLogin');
    if (!AppState.currentRoom) return UI.showToast('Pilih ruang chat dulu.', 'info');
    const input = $('chatMessageInput');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    try {
        await API.sendMessage(AppState.currentRoom, msg);
        await loadChatHistory();
    } catch (e) {
        input.value = msg;
        UI.showToast(e.message, 'error');
    }
};

// ---------- Transaksi ----------
window.handleLockTransaction = async function (productId) {
    if (!AppState.activeUser) return UI.openModal('modalLogin');
    if (!confirm('Kunci transaksi ini? Penjual akan dikabari.')) return;
    try {
        await API.createTransaction(productId);
        UI.showToast('Berhasil diajukan!', 'success');
        window.fetchNotifications();
    } catch (e) { UI.showToast(e.message, 'error'); }
};

window.fetchNotifications = async function () {
    if (!AppState.activeUser) return;
    try {
        const txs = await API.fetchIncomingTransactions();
        const badge = $('chatNotifBadge');
        if (badge) { badge.style.display = txs.length > 0 ? 'inline-block' : 'none'; badge.innerText = txs.length; }

        const area = $('notifListArea');
        if (!area) return;
        if (txs.length === 0) { area.innerHTML = '<p class="text-grey text-center">Belum ada pesanan.</p>'; return; }

        const me = AppState.activeUser.id;
        area.innerHTML = txs.map(t => {
            const isSeller = t.seller_id === me;
            const partner = isSeller ? t.buyer_name : t.seller_name;
            const role = isSeller ? 'Pembeli' : 'Penjual';
            let actions;
            if (t.status === 'pending' && isSeller) {
                actions = `<button class="btn-primary-green btn-sm" data-action="tx-accept" data-id="${t.id}">Terima</button>
                           <button class="btn-danger btn-sm" style="width:auto; margin-top:0;" data-action="tx-reject" data-id="${t.id}">Tolak</button>`;
            } else if (t.status === 'pending') {
                actions = '<span class="text-grey font-bold">Menunggu konfirmasi penjual</span>';
            } else if (t.status === 'accepted' && !isSeller) {
                actions = `<button class="btn-solid-orange btn-sm w-100" data-action="tx-complete" data-id="${t.id}">COD Selesai (Rating)</button>`;
            } else {
                actions = '<span class="text-grey font-bold">Diterima, menunggu COD selesai</span>';
            }
            return `<div style="background:#f8f9fa; padding:15px; border-radius:10px; margin-bottom:12px;">
                <div style="display:flex; gap:12px; margin-bottom:10px;">
                    <img src="${UI.escapeHTML(t.product_image) || UI.PLACEHOLDER}" alt="" style="width:45px; height:45px; border-radius:10px; object-fit:cover;">
                    <div>
                        <h4 style="margin:0; font-size:14px;">${UI.escapeHTML(t.product_name)}</h4>
                        <p style="margin:0; font-size:12px; color:gray;">${role}: ${UI.escapeHTML(partner)}</p>
                    </div>
                </div>
                <div style="display:flex; gap:10px;">${actions}</div>
            </div>`;
        }).join('');
    } catch (e) { /* abaikan */ }
};

window.handleTx = async function (id, status) {
    try {
        await API.updateTransactionStatus(id, status);
        UI.showToast(status === 'accepted' ? 'Diterima!' : 'Ditolak', status === 'accepted' ? 'success' : 'info');
        window.fetchNotifications();
    } catch (e) { UI.showToast(e.message, 'error'); }
};