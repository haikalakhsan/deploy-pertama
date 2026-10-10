const UI = {
    PLACEHOLDER: 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="100%" height="100%" fill="#eceae6"/>' +
        '<text x="50%" y="52%" font-family="sans-serif" font-size="22" fill="#aaa" text-anchor="middle">No Image</text></svg>'),

    escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return str.toString().replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
    },

    showToast(msg, type = 'info') {
        const t = document.createElement('div');
        t.innerText = msg;
        t.style.cssText = `position:fixed; bottom:20px; right:20px; padding:15px 25px; border-radius:10px; color:white; font-weight:bold; z-index:10050; max-width:80vw; background: ${type === 'error' ? '#e74c3c' : (type === 'success' ? '#2ecc71' : '#3498db')}; box-shadow: 0 4px 6px rgba(0,0,0,0.1);`;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 3500);
    },

    switchTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        const target = document.getElementById(tabId);
        if (target) target.classList.add('active');
        document.querySelectorAll('.tab-nav .tab-btn').forEach(b => {
            b.classList.toggle('active', (b.getAttribute('onclick') || '').includes(`'${tabId}'`));
        });
        window.scrollTo(0, 0);
        if (typeof window.onTabChange === 'function') window.onTabChange(tabId);
    },

    openModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'flex'; },
    closeModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; },

    toggleDropdown(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = el.style.display === 'block' ? 'none' : 'block';
    },

    formatRupiah(n) { return 'Rp ' + (Number(n) || 0).toLocaleString('id-ID'); },

    // Semua tombol memakai data-action (ditangani oleh event delegation di app.js),
    // sehingga tidak ada data user yang disisipkan ke dalam atribut onclick.
    renderProductCards(arr, isEtalase = false) {
        if (!Array.isArray(arr) || arr.length === 0) {
            return `<div style="grid-column: 1/-1; text-align:center; padding:50px 20px;">
                        <i class="fas fa-box-open fa-3x text-grey" style="margin-bottom:15px;"></i>
                        <h3 class="text-grey">Yaaah, belum ada barang nih.</h3>
                        <p class="text-grey">Jadilah yang pertama berjualan di sini!</p>
                    </div>`;
        }

        const meId = (typeof AppState !== 'undefined' && AppState.activeUser) ? AppState.activeUser.id : null;

        return arr.map(p => {
            const own = meId !== null && p.user_id === meId;
            const sellerName = this.escapeHTML(p.seller_name);
            let actions;

            if (isEtalase) {
                actions = `<div style="display:flex; gap:5px; margin-top:10px; flex-wrap:wrap;">
                    ${!p.is_sold ? `<button style="flex:1; background:#4fa5d6; color:white; border:none; padding:8px; border-radius:8px; cursor:pointer; font-size:12px;" data-action="sold" data-id="${p.id}"><i class="fas fa-check-circle"></i> Laku</button>` : ''}
                    <button style="flex:1; background:var(--c-blue); color:white; border:none; padding:8px; border-radius:8px; cursor:pointer; font-size:12px;" data-action="edit" data-id="${p.id}"><i class="fas fa-edit"></i></button>
                    <button style="flex:1; background:var(--c-red); color:white; border:none; padding:8px; border-radius:8px; cursor:pointer; font-size:12px;" data-action="delete" data-id="${p.id}"><i class="fas fa-trash"></i></button>
                </div>`;
            } else if (p.is_sold) {
                actions = `<p style="font-size:12px; color:gray; margin-top:15px; text-align:center;">Barang sudah terjual</p>`;
            } else if (own) {
                actions = `<p style="font-size:12px; color:gray; margin-top:15px; text-align:center;">Barang milikmu</p>`;
            } else {
                actions = `<div style="display:flex; gap:8px; margin-top:15px;">
                    <button style="flex:1; background:var(--primary-green); color:white; border:none; padding:10px; border-radius:10px; cursor:pointer;" data-action="chat" data-seller-id="${p.user_id}" data-seller-name="${sellerName}"><i class="fas fa-comment"></i> Chat</button>
                    <button style="flex:1; background:var(--accent-orange); color:white; border:none; padding:10px; border-radius:10px; cursor:pointer;" data-action="lock" data-id="${p.id}"><i class="fas fa-handshake"></i> Kunci</button>
                </div>`;
            }

            return `
        <div class="product-card" style="background:white; border-radius:15px; box-shadow:0 2px 8px rgba(0,0,0,0.05); overflow:hidden; border: 1px solid #eee; cursor:default;">
            <div style="padding:10px;">
                <img src="${this.escapeHTML(p.image) || this.PLACEHOLDER}" alt="" onerror="this.onerror=null;this.src=UI.PLACEHOLDER;" style="width:100%; aspect-ratio: 1/1; object-fit:cover; border-radius:15px; margin-bottom:10px;">
                <div style="padding:0 5px; text-align:left;">
                    <div style="display:flex; justify-content:space-between; align-items:start;">
                        <h4 style="margin:0; font-size:15px;">${this.escapeHTML(p.name)}</h4>
                        ${p.is_sold ? '<span style="background:#e57c58; color:white; padding:3px 8px; border-radius:10px; font-size:10px; font-weight:bold; margin-left:5px;">TERJUAL</span>' : ''}
                    </div>
                    <h3 style="color:var(--primary-green); margin:8px 0;">${this.formatRupiah(p.price)}</h3>
                    <div style="display:flex; gap:5px; margin-bottom:10px; flex-wrap:wrap;">
                        <span class="badge" style="background:#f0f7ff; color:var(--c-blue); padding:4px 8px; border-radius:8px; font-size:11px;"><i class="fas fa-tag"></i> ${this.escapeHTML(p.category)}</span>
                        <span class="badge" style="background:#fff4e5; color:var(--accent-orange); padding:4px 8px; border-radius:8px; font-size:11px;"><i class="fas fa-star"></i> Grade ${this.escapeHTML(p.condition_grade)}</span>
                        ${p.is_barter_allowed ? `<span class="badge" style="background:#e8f8f5; color:var(--primary-green); padding:4px 8px; border-radius:8px; font-size:11px;"><i class="fas fa-sync"></i> Bisa Barter</span>` : ''}
                    </div>
                    ${!isEtalase ? `<p style="font-size:12px; color:gray; margin-top:5px; cursor:pointer;" data-action="store" data-user-id="${p.user_id}"><i class="fas fa-user-circle"></i> ${sellerName}</p>` : ''}
                    ${actions}
                </div>
            </div>
        </div>`;
        }).join('');
    }
};