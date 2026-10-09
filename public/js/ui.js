const UI = {
    escapeHTML(str) {
        if (!str) return '';
        return str.toString().replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
    },
    showToast(msg, type = 'info') {
        const t = document.createElement('div');
        t.innerText = msg;
        t.style.cssText = `position:fixed; bottom:20px; right:20px; padding:15px 25px; border-radius:10px; color:white; font-weight:bold; z-index:9999; background: ${type === 'error' ? '#e74c3c' : (type === 'success' ? '#2ecc71' : '#3498db')}; box-shadow: 0 4px 6px rgba(0,0,0,0.1);`;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 3000);
    },
    switchTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
        const t = document.getElementById(`tab-${tabId}`);
        if(t) t.style.display = 'block';
    },
    openModal(id) { document.getElementById(id).style.display = 'flex'; },
    closeModal(id) { document.getElementById(id).style.display = 'none'; },
    
    renderProductCards(arr, isEtalase = false) {
        if (!arr || arr.length === 0) {
            return `<div style="grid-column: 1/-1; text-align:center; padding:50px 20px;">
                        <i class="fas fa-box-open fa-3x text-grey" style="margin-bottom:15px;"></i>
                        <h3 class="text-grey">Yaaah, belum ada barang nih.</h3>
                        <p class="text-grey">Jadilah yang pertama berjualan di sini!</p>
                    </div>`;
        }

        return arr.map(p => `
        <div class="product-card" style="background:white; border-radius:15px; box-shadow:0 2px 8px rgba(0,0,0,0.05); overflow:hidden; border: 1px solid #eee;">
            <div style="padding:10px;">
                <img src="${p.image || 'https://via.placeholder.com/300'}" style="width:100%; aspect-ratio: 1/1; object-fit:cover; border-radius:15px; margin-bottom:10px;">
                
                <div style="padding:0 5px; text-align:left;">
                    <div style="display:flex; justify-content:space-between; align-items:start;">
                        <h4 style="margin:0; font-size:15px;">${this.escapeHTML(p.name)}</h4>
                        ${p.is_sold ? '<span style="background:#e57c58; color:white; padding:3px 8px; border-radius:10px; font-size:10px; font-weight:bold; margin-left:5px;">TERJUAL</span>' : ''}
                    </div>
                    
                    <h3 style="color:var(--primary-green); margin:8px 0;">Rp ${p.price.toLocaleString('id-ID')}</h3>
                    
                    <div style="display:flex; gap:5px; margin-bottom:10px; flex-wrap:wrap;">
                        <span class="badge" style="background:#f0f7ff; color:var(--c-blue); padding:4px 8px; border-radius:8px; font-size:11px;"><i class="fas fa-tag"></i> ${p.category}</span>
                        <span class="badge" style="background:#fff4e5; color:var(--c-orange); padding:4px 8px; border-radius:8px; font-size:11px;"><i class="fas fa-star"></i> Grade ${p.condition_grade}</span>
                        ${p.is_barter_allowed ? `<span class="badge" style="background:#e8f8f5; color:var(--primary-green); padding:4px 8px; border-radius:8px; font-size:11px;"><i class="fas fa-sync"></i> Bisa Barter</span>` : ''}
                    </div>
                    
                    ${!isEtalase ? `<p style="font-size:12px; color:gray; margin-top:5px; cursor:pointer;" onclick="window.openPublicStore(${p.user_id})"><i class="fas fa-user-circle"></i> ${this.escapeHTML(p.seller_name)}</p>` : ''}
                    
                    ${isEtalase ? `
                    <div style="display:flex; gap:5px; margin-top:10px; flex-wrap:wrap;">
                        ${!p.is_sold ? `<button style="flex:1; background:#4fa5d6; color:white; border:none; padding:8px; border-radius:8px; cursor:pointer; font-size:12px;" onclick="handleMarkSold(${p.id})"><i class="fas fa-check-circle"></i> Laku</button>` : ''}
                        <button style="flex:1; background:var(--c-blue); color:white; border:none; padding:8px; border-radius:8px; cursor:pointer; font-size:12px;" onclick="window.openEditModal(${p.id})"><i class="fas fa-edit"></i></button>
                        <button style="flex:1; background:var(--c-red); color:white; border:none; padding:8px; border-radius:8px; cursor:pointer; font-size:12px;" onclick="handleDeleteProduct(${p.id})"><i class="fas fa-trash"></i></button>
                    </div>` : `
                    <div style="display:flex; gap:8px; margin-top:15px;">
                        <button style="flex:1; background:var(--primary-green); color:white; border:none; padding:10px; border-radius:10px; cursor:pointer;" onclick="startChat(${p.user_id}, '${this.escapeHTML(p.seller_name)}')"><i class="fas fa-comment"></i> Chat</button>
                        <button style="flex:1; background:var(--c-orange); color:white; border:none; padding:10px; border-radius:10px; cursor:pointer;" onclick="handleLockTransaction(${p.user_id},${p.id})"><i class="fas fa-handshake"></i> Kunci</button>
                    </div>
                    `}
                </div>
            </div>
        </div>`).join('');
    }
};