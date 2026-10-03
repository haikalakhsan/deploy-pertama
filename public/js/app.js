let AppState = { activeUser: null, allProducts: [], currentRoom: 'global' };
let socket;

document.addEventListener("DOMContentLoaded", async () => {
    await checkSession();
    await fetchProducts();

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnLoginSubmit'); btn.innerText = 'Loading...';
        try {
            await API.login(document.getElementById('loginNim').value, document.getElementById('loginPass').value);
            UI.closeModal('modalLogin'); UI.showToast('Berhasil masuk! Selamat datang.');
            await checkSession();
        } catch (e) { UI.showToast(e.message); }
        btn.innerText = 'Masuk';
    });

    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnRegSubmit'); btn.innerText = 'Loading...';

        UI.showToast("Meminta izin lokasi...");
        const loc = await new Promise((resolve) => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                    (err) => resolve({ lat: -7.0500, lng: 110.3930 })
                );
            } else resolve({ lat: -7.0500, lng: 110.3930 });
        });

        try {
            await API.register(
                document.getElementById('regName').value,
                document.getElementById('regNim').value,
                document.getElementById('regEmail').value, // <-- Ini yang baru ditambahkan
                document.getElementById('regPass').value,
                loc.lat, loc.lng
            );
            UI.closeModal('modalRegister'); UI.showToast('Akun berhasil dibuat!');
            document.getElementById('registerForm').reset();
        } catch (e) { UI.showToast(e.message); }
        btn.innerText = 'Daftar Sekarang';
    });

    document.getElementById('editProfileForm').addEventListener('submit', handleUpdateProfileData);
    document.getElementById('profileImgInput').addEventListener('change', previewProfileImage);

    document.getElementById('addProductForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnAddSubmit'); btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
        try {
            const fd = new FormData();
            fd.append('image', document.getElementById('prodImage').files[0]);
            fd.append('name', document.getElementById('prodName').value);
            fd.append('price', document.getElementById('prodPrice').value);
            fd.append('category', document.getElementById('prodCategory').value);
            fd.append('condition_grade', document.getElementById('prodGrade').value);
            fd.append('is_barter', document.getElementById('prodBarter').value);
            fd.append('description', document.getElementById('prodDesc').value);
            await API.addProduct(fd);
            UI.closeModal('modalAddProduct');
            UI.showToast('Barang berhasil diposting!');
            document.getElementById('addProductForm').reset();
            fetchProducts();
        } catch (e) { UI.showToast(e.message); }
        btn.innerHTML = '<i class="fas fa-upload"></i> Simpan & Upload';
    });
    document.getElementById('editProductForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnEditSubmit'); btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
        try {
            const id = document.getElementById('editProdId').value;
            const fd = new FormData();

            // Masukkan gambar jika user mengunggah yang baru
            const imgFile = document.getElementById('editProdImage').files[0];
            if (imgFile) fd.append('image', imgFile);

            fd.append('name', document.getElementById('editProdName').value);
            fd.append('price', document.getElementById('editProdPrice').value);
            fd.append('category', document.getElementById('editProdCategory').value);
            fd.append('condition_grade', document.getElementById('editProdGrade').value);
            fd.append('is_barter', document.getElementById('editProdBarter').value);
            fd.append('description', document.getElementById('editProdDesc').value);

            await API.updateProduct(id, fd);
            UI.closeModal('modalEditProduct');
            UI.showToast('Barang berhasil diperbarui!', 'success');
            document.getElementById('editProductForm').reset();
            fetchProducts(); // Segarkan tampilan
        } catch (e) { UI.showToast(e.message, 'error'); }
        btn.innerHTML = '<i class="fas fa-save"></i> Simpan Perubahan';
    });
    document.getElementById('resetPassForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnResetSubmit'); btn.innerText = 'Loading...';
        try {
            await API.resetPassword(
                document.getElementById('resetNim').value,
                document.getElementById('resetEmail').value,
                document.getElementById('resetNewPass').value
            );
            UI.closeModal('modalResetPass');
            UI.showToast('Kata sandi berhasil diperbarui! Silakan Masuk.', 'success');
            document.getElementById('resetPassForm').reset();
            UI.openModal('modalLogin');
        } catch (e) { UI.showToast(e.message, 'error'); }
        btn.innerText = 'Simpan Sandi Baru';
    });
    document.getElementById('ratingForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await API.completeTransaction(
                document.getElementById('ratingTxId').value,
                document.getElementById('ratingScore').value,
                document.getElementById('ratingReview').value
            );
            UI.closeModal('modalRating');
            UI.showToast("Terima kasih atas ulasannya!", "success");
            window.fetchNotifications();
        } catch (err) { UI.showToast(err.message, "error"); }
    });
});

async function checkSession() {
    try {
        const res = await API.checkSession();
        AppState.activeUser = res.user;
        document.getElementById('authGuest').style.display = 'none';
        document.getElementById('authUser').style.display = 'flex';
        document.getElementById('fabAddProduct').style.display = 'flex';
        document.getElementById('tabProfilBtn').style.display = 'flex';
        if (AppState.activeUser.role === 'admin') {
            document.getElementById('tabAdminBtn').style.display = 'flex';
        }

        const firstName = AppState.activeUser.name.split(' ')[0];
        document.getElementById('headerProfileName').innerText = firstName;

        // Populate Profile UI
        document.getElementById('displayProfileName').innerText = AppState.activeUser.name;
        document.getElementById('displayProfileNim').innerText = "NIM: " + AppState.activeUser.nim;
        document.getElementById('editFaculty').value = AppState.activeUser.faculty || '';
        document.getElementById('editPhone').value = AppState.activeUser.phone || '';
        const userPic = AppState.activeUser.profile_image || `https://via.placeholder.com/130?text=${firstName.charAt(0)}`;
        document.getElementById('headerProfilePic').src = userPic;
        document.getElementById('mainProfilePic').src = userPic;

        if (!socket) {
            socket = io();
            socket.emit('joinRoom', 'global');
            socket.on('receiveMessage', (data) => {
                if (data.room !== AppState.currentRoom) {
                    if (data.sender !== AppState.activeUser.name) UI.showToast(`Pesan baru dari ${data.sender}`);
                    return;
                }
                appendMessageToUI(data.sender, data.msg);
            });
            loadChatHistory('global');
        }
        renderMyEtalase();
        window.fetchNotifications();
    } catch (e) {
        AppState.activeUser = null;
        document.getElementById('authGuest').style.display = 'flex';
        document.getElementById('authUser').style.display = 'none';
        document.getElementById('fabAddProduct').style.display = 'none';
        document.getElementById('tabProfilBtn').style.display = 'none';
    }
}

function appendMessageToUI(sender, msg) {
    const area = document.getElementById('chatMessagesArea');
    if (area.innerHTML.includes('Kirim pesan')) area.innerHTML = '';

    const isMe = sender === AppState.activeUser.name;
    const align = isMe ? 'right' : 'left';
    const bg = isMe ? 'var(--primary-green)' : 'white';
    const color = isMe ? 'white' : '#333';

    area.innerHTML += `
    <div style="text-align:${align}; margin-bottom:15px; width:100%;">
        ${!isMe ? `<div style="font-size:11px; font-weight:bold; color:gray; margin-bottom:5px;">${sender}</div>` : ''}
        <div style="display:inline-block; background:${bg}; color:${color}; padding:15px; border-radius:15px; max-width:70%; text-align:left; box-shadow:0 2px 5px rgba(0,0,0,0.03);">
           ${UI.escapeHTML(msg)}
        </div>
    </div>`;
    area.scrollTop = area.scrollHeight;
}

async function loadChatHistory(room) {
    if (!AppState.activeUser) return;
    const area = document.getElementById('chatMessagesArea');
    area.innerHTML = '<div style="text-align:center; color:gray;">Memuat pesan...</div>';
    try {
        const msgs = await API.fetchMessages(room);
        area.innerHTML = '';
        if (msgs.length === 0) {
            area.innerHTML = `<div style="text-align:center; padding: 40px; color:#aaa;"><i class="far fa-comments fa-3x"></i><p>Kirim pesan untuk mulai ngobrol!</p></div>`;
            return;
        }
        msgs.forEach(m => appendMessageToUI(m.sender_name, m.message));
    } catch (e) { area.innerHTML = 'Gagal memuat pesan'; }
}

async function handleLogout() {
    UI.toggleDropdown('profileMenu');
    await API.logout();
    await checkSession();
    UI.showToast('Berhasil keluar');
    UI.switchTab('beranda');
}

async function fetchProducts() {
    AppState.allProducts = await API.fetchProducts();
    document.getElementById('productGridContainer').innerHTML = UI.renderProductCards(AppState.allProducts);
    renderMyEtalase();
}

function renderMyEtalase() {
    if (!AppState.activeUser) return;
    const myItems = AppState.allProducts.filter(p => p.user_id === AppState.activeUser.id);
    document.getElementById('myEtalaseGrid').innerHTML = UI.renderProductCards(myItems, true);

    const barterList = document.getElementById('barterDynamicList');
    if (barterList) {
        if (myItems.length === 0) {
            barterList.innerHTML = '<p class="text-grey" style="text-align:center; padding:20px;">Belum ada barang di etalase Anda.</p>';
        } else {
            let bHtml = '';
            myItems.forEach((item, index) => {
                const priceFmt = new Intl.NumberFormat('id-ID').format(item.price);
                let imgSrc = item.image ? item.image : `https://via.placeholder.com/80?text=${item.name.replace(/\s/g, '+')}`;
                bHtml += `
                <div class="my-item-card ${index === 0 ? 'selected' : ''}" onclick="document.querySelectorAll('.my-item-card').forEach(c=>c.classList.remove('selected')); this.classList.add('selected');">
                    <div class="my-item-img">
                        <span class="badge-grade bg-secondary-green">${item.condition_grade}</span>
                        <img src="${imgSrc}" alt="${item.name}">
                    </div>
                    <div class="my-item-info">
                        <h4 style="font-size:14px; margin-bottom:5px;">${item.name}</h4>
                        <p style="font-size:12px; color:var(--text-grey);">${item.category} &middot; Rp ${priceFmt}</p>
                    </div>
                    <div class="check-circle"><i class="fas fa-check"></i></div>
                </div>`;
            });
            barterList.innerHTML = bHtml;
        }
    }
}

window.executeSearch = async function (paramCategory) {
    const q = document.getElementById('searchInput').value;
    const category = typeof paramCategory === 'string' ? paramCategory : '';

    document.getElementById('productSectionTitle').innerText = q || category ? `Mencari data...` : 'Baru Diposting';
    document.getElementById('productGridContainer').innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 50px;"><i class="fas fa-spinner fa-spin fa-3x text-grey"></i></div>';

    try {
        // Tembak pencarian ke backend (MySQL) langsung
        const results = await API.fetchProducts(q, category);
        document.getElementById('productSectionTitle').innerText = q || category ? `Hasil pencarian` : 'Baru Diposting';
        document.getElementById('productGridContainer').innerHTML = UI.renderProductCards(results);
    } catch (e) { UI.showToast("Gagal mencari barang", "error"); }

    UI.switchTab('beranda');
}

window.sendMessage = function () {
    if (!AppState.activeUser) {
        UI.showToast("Silakan masuk untuk menggunakan chat.");
        return UI.openModal('modalLogin');
    }
    const input = document.getElementById('chatMessageInput');
    const msg = input.value.trim();
    if (!msg) return;
    socket.emit('sendMessage', { room: AppState.currentRoom, userId: AppState.activeUser.id, sender: AppState.activeUser.name, msg });
    input.value = '';
}

window.startChat = async function(sellerId, sellerName) { // Tambahkan async
    if(!AppState.activeUser) { UI.openModal('modalLogin'); return; }
    if(AppState.activeUser.id === sellerId) { UI.showToast("Ini barang kamu sendiri!", "info"); return; }
    
    const users = [AppState.activeUser.id, sellerId].sort();
    AppState.currentRoom = 'room_' + users[0] + '_' + users[1];
    document.getElementById('chatRoomTitle').innerHTML = `${UI.escapeHTML(sellerName)}`;
    
    // Cek Status Transaksi untuk Banner
    const banner = document.getElementById('chatTxBanner');
    try {
        const tx = await API.checkChatTransaction(sellerId);
        if (tx) {
            banner.style.display = 'block';
            let warna = tx.status === 'completed' ? 'green' : (tx.status === 'cancelled' ? 'red' : '#856404');
            banner.style.color = warna;
            banner.innerHTML = `<i class="fas fa-box"></i> <strong>${UI.escapeHTML(tx.name)}</strong> - Status: ${tx.status.toUpperCase()}`;
        } else {
            banner.style.display = 'none';
        }
    } catch(e) { banner.style.display = 'none'; }
    
    startChatPolling(AppState.currentRoom);
    UI.switchTab('chat');
}
window.requestTransaction = async function (sellerId, productId) {
    try {
        await API.initiateTransaction(sellerId, productId);
        UI.showToast("Pengajuan transaksi berhasil dikirim ke penjual!", "success");
    } catch (e) { UI.showToast("Gagal mengajukan transaksi", "error"); }
}

window.viewProductDetail = function (id) {
    const p = AppState.allProducts.find(x => x.id === id);
    if (!p) return;

    const priceFmt = new Intl.NumberFormat('id-ID').format(p.price);

    document.getElementById('detailContentContainer').innerHTML = `
        <div class="breadcrumb">Beranda &rsaquo; ${p.category} &rsaquo; <strong>${p.name}</strong></div>
        <div class="detail-top">
            <div class="detail-gallery">
                <div class="main-image-wrapper">
                    <img src="${p.image || 'https://via.placeholder.com/500?text=' + p.name.replace(/\s/g, '+')}" alt="${p.name}">
                </div>
            </div>
            <div class="detail-info">
                <div class="status-tags">
                    ${p.is_barter_allowed ? '<span class="tag-barter"><i class="fas fa-sync"></i> Bisa Barter</span>' : ''}
                </div>
                <h1 class="product-title">${p.name}</h1>
                <div class="price-box">
                    <div class="price-main">Rp ${priceFmt}</div>
                </div>
                <div class="seller-card">
                    <div class="seller-details">
                        <h3>${p.seller_name}</h3>
                        <div class="verified-badge"><i class="fas fa-check"></i> Terverifikasi Mahasiswa UNNES</div>
                    </div>
                </div>
                <div class="action-buttons-bottom">
                    <button class="btn-chat-action" onclick="startChat(${p.user_id}, '${p.seller_name}')"><i class="far fa-comment-dots"></i> Chat Penjual</button>
                    <button class="btn-chat-action" style="background:var(--accent-orange); color:white;" onclick="requestTransaction(${p.user_id}, ${p.id})"><i class="fas fa-handshake"></i> Kunci Transaksi</button>
                </div>
            </div>
        </div>
        <div class="detail-bottom">
            <div class="detail-desc">
                <h2>Deskripsi</h2>
                <div class="desc-text-box"><p>${p.description.replace(/\n/g, '<br>')}</p></div>
            </div>
        </div>
    `;
    UI.switchTab('detail');
}

window.findBarterMatch = async function () {
    const kw = document.getElementById('barterKeyword').value;
    const rad = document.getElementById('radiusInput').value;
    if (!kw) return UI.showToast("Masukkan kata kunci barang yang dicari!");

    UI.showToast("Menghitung kecocokan dan jarak lokasi...");
    try {
        const matches = await API.findMatch(kw, rad);
        const resDiv = document.getElementById('barterResults');
        resDiv.style.display = 'block';

        if (matches.length === 0) {
            resDiv.innerHTML = `<div style="text-align:center; padding:20px; background:white; border-radius:15px; border:1px solid #eaeaea;"><i class="fas fa-search-minus fa-2x text-grey"></i><p class="mt-15">Tidak ada barang yang cocok dalam radius ${rad} KM.</p></div>`;
            return;
        }

        let html = '<h3 style="margin-bottom:15px;">Hasil Pencocokan Radius Terdekat:</h3><div style="display:grid; gap:15px;">';
        matches.forEach(m => {
            const dist = parseFloat(m.distance).toFixed(1);
            const score = Math.max(10, 100 - (dist * 10));

            html += `
            <div style="background:white; padding:20px; border-radius:15px; border:1px solid #eaeaea; display:flex; gap:15px; align-items:center;">
                <img src="${m.image || 'https://via.placeholder.com/80?text=' + m.name.replace(/\s/g, '+')}" style="width:70px; height:70px; border-radius:10px; object-fit:cover;">
                <div style="flex:1;">
                    <h4 style="margin-bottom:5px;">${m.name}</h4>
                    <p style="font-size:12px; color:var(--text-grey);"><i class="fas fa-user"></i> ${m.seller_name} &middot; <i class="fas fa-map-marker-alt text-pink"></i> Jarak ${dist} KM</p>
                </div>
                <div style="text-align:right;">
                    <h3 style="color:var(--primary-green); font-size:24px;">${parseInt(score)}%</h3>
                    <p style="font-size:10px; color:gray; margin-bottom:5px;">Match Score</p>
                    <button class="btn-primary-green btn-sm" onclick="startChat(${m.user_id}, '${m.seller_name}')"><i class="fas fa-sync"></i> Ajak Barter</button>
                </div>
            </div>`;
        });
        html += '</div>';
        resDiv.innerHTML = html;

    } catch (e) { UI.showToast("Gagal mencari pasangan", "error"); }
}

function previewProfileImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => document.getElementById('mainProfilePic').src = e.target.result;
        reader.readAsDataURL(file);
    }
}

async function handleUpdateProfileData(e) {
    e.preventDefault();
    const btn = document.getElementById('btnUpdateProfile');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

    const formData = new FormData();
    formData.append('faculty', document.getElementById('editFaculty').value);
    formData.append('phone', document.getElementById('editPhone').value);

    const fileInput = document.getElementById('profileImgInput');
    if (fileInput.files.length > 0) formData.append('profile_image', fileInput.files[0]);

    try {
        await API.updateProfile(AppState.activeUser.id, formData);
        UI.showToast("Profil berhasil diperbarui!", "success");
        await checkSession();
    } catch (err) {
        UI.showToast(err.message, "error");
    } finally {
        btn.innerHTML = '<i class="fas fa-save"></i> Simpan Profil';
    }
}

window.handleDeleteProduct = function (prodId) {
    if (confirm("Hapus barang ini dari etalase?")) {
        API.deleteProduct(prodId).then(() => {
            UI.showToast("Barang dihapus", "success");
            fetchProducts();
        }).catch(e => UI.showToast("Gagal menghapus", "error"));
    }
}

window.fetchNotifications = async function () {
    if (!AppState.activeUser) return;
    try {
        const txs = await API.fetchIncomingTransactions();
        const badge = document.getElementById('chatNotifBadge');

        // Nyalakan lonceng merah jika ada pesanan masuk
        if (txs.length > 0) {
            badge.style.display = 'inline-block';
            badge.innerText = txs.length;
        } else {
            badge.style.display = 'none';
        }

        // Render ke dalam Modal
        const area = document.getElementById('notifListArea');
        if (txs.length === 0) {
            area.innerHTML = '<p class="text-grey text-center" style="padding:20px;">Belum ada pesanan masuk.</p>';
            return;
        }

        // Di dalam fungsi fetchNotifications()
        let html = '';
        txs.forEach(t => {
            let actionButtons = '';

            if (t.status === 'pending' && t.seller_id === AppState.activeUser.id) {
                // Jika user adalah penjual, tampilkan Terima/Tolak
                actionButtons = `
                    <button class="btn-primary-green btn-sm" style="flex:1;" onclick="handleTx(${t.id}, 'accepted')"><i class="fas fa-check"></i> Terima</button>
                    <button class="btn-danger btn-sm" style="flex:1; margin-top:0;" onclick="handleTx(${t.id}, 'cancelled')"><i class="fas fa-times"></i> Tolak</button>`;
            } else if (t.status === 'accepted' && t.buyer_id === AppState.activeUser.id) {
                // Jika user adalah pembeli dan pesanan diterima, tampilkan Selesaikan COD
                actionButtons = `
                    <button class="btn-solid-orange btn-sm" style="width:100%;" onclick="document.getElementById('ratingTxId').value='${t.id}'; UI.openModal('modalRating');"><i class="fas fa-handshake"></i> COD Selesai (Beri Rating)</button>`;
            } else {
                actionButtons = `<span style="font-size:12px; font-weight:bold; color:var(--text-grey);">Status: ${t.status.toUpperCase()}</span>`;
            }

            html += `
            <div style="background:#f8f9fa; padding:15px; border-radius:15px; margin-bottom:12px; border:1px solid #eee;">
                <div style="display:flex; gap:12px; align-items:center; margin-bottom:15px;">
                    <img src="${t.product_image || 'https://via.placeholder.com/50'}" style="width:45px; height:45px; border-radius:10px; object-fit:cover;">
                    <div>
                        <h4 style="font-size:14px; margin:0 0 4px 0; color:#333;">${UI.escapeHTML(t.product_name)}</h4>
                        <p style="font-size:12px; color:gray; margin:0;">${t.seller_id === AppState.activeUser.id ? 'Pembeli' : 'Penjual'}: <strong>${UI.escapeHTML(t.buyer_name)}</strong></p>
                    </div>
                </div>
                <div style="display:flex; gap:10px;">
                    ${actionButtons}
                </div>
            </div>`;
        });
        area.innerHTML = html;
    } catch (e) { console.error("Gagal load notif", e); }
}

window.handleTx = async function (id, status) {
    try {
        await API.updateTransactionStatus(id, status);
        UI.showToast(status === 'accepted' ? 'Pesanan diterima! Lanjut Chat COD.' : 'Pesanan dibatalkan.', status === 'accepted' ? 'success' : 'info');
        window.fetchNotifications(); // Refresh isi list
    } catch (e) { UI.showToast("Gagal memproses transaksi", "error"); }
}

window.openEditModal = function (id) {
    const p = AppState.allProducts.find(x => x.id === id);
    if (!p) return;

    // Tarik data dari memori aplikasi ke dalam form modal
    document.getElementById('editProdId').value = p.id;
    document.getElementById('editProdName').value = p.name;
    document.getElementById('editProdPrice').value = p.price;
    document.getElementById('editProdCategory').value = p.category;
    document.getElementById('editProdGrade').value = p.condition_grade;
    document.getElementById('editProdBarter').value = p.is_barter_allowed;
    document.getElementById('editProdDesc').value = p.description;

    UI.openModal('modalEditProduct');
}

// Fungsi Tandai Terjual
window.handleMarkSold = async function(id) {
    if(confirm('Tandai barang ini sebagai TERJUAL? (Barang akan disembunyikan dari beranda)')) {
        try {
            await API.markAsSold(id);
            UI.showToast("Barang ditandai terjual!", "success");
            window.renderMyEtalase(); // Refresh etalase
        } catch(e) { UI.showToast(e.message, "error"); }
    }
}

// Fungsi Buka Etalase Publik
window.openPublicStore = async function(userId) {
    try {
        const data = await API.fetchPublicStore(userId);
        document.getElementById('storeUserName').innerText = data.user.name;
        document.getElementById('storeUserFaculty').innerHTML = `<i class="fas fa-graduation-cap"></i> ${data.user.faculty || 'Mahasiswa UNNES'}`;
        document.getElementById('storeUserImg').src = data.user.profile_image || 'https://via.placeholder.com/80';
        
        // Render barang menggunakan fungsi UI yang ada
        document.getElementById('storeGridContainer').innerHTML = data.products.length > 0 
            ? UI.renderProductCards(data.products) 
            : '<p class="text-grey">Belum ada barang yang dijual.</p>';
            
        UI.openModal('modalPublicStore');
    } catch(e) { UI.showToast("Gagal memuat profil", "error"); }
}