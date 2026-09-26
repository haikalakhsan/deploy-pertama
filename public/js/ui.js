const UI = {
    switchTab(id) { 
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active')); 
        const target = document.getElementById(id);
        if(target) target.classList.add('active'); 
        
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        const btn = document.querySelector(`.tab-btn[onclick*="${id}"]`);
        if(btn) btn.classList.add('active');
        window.scrollTo(0,0);
    },
    openModal(id) { document.getElementById(id).classList.add('show'); },
    closeModal(id) { document.getElementById(id).classList.remove('show'); },
    toggleDropdown(id) { const el = document.getElementById(id); el.style.display = el.style.display === 'none' ? 'block' : 'none'; },
    showToast(msg) { 
        const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = `<i class="fas fa-info-circle" style="color:#4fa5d6; font-size:20px;"></i> <span>${msg}</span>`; 
        document.getElementById('toastContainer').appendChild(t); 
        setTimeout(()=> { t.style.opacity = '0'; setTimeout(()=>t.remove(), 300); }, 3000); 
    },
    renderProductCards(arr, isEtalase = false) { 
        if(arr.length === 0) return `<div style="grid-column:1/-1; text-align:center; padding:50px; color:#aaa;"><i class="fas fa-box-open fa-3x"></i><p style="margin-top:15px;">Belum ada barang.</p></div>`;
        return arr.map(p => {
            const priceFmt = new Intl.NumberFormat('id-ID').format(p.price);
            let imgSrc = p.image || `https://via.placeholder.com/200?text=${p.name.replace(/\s/g, '+')}`;
            
            if(isEtalase) {
                return `
                <div class="product-card">
                    <div class="card-img-wrapper">
                        <img src="${imgSrc}" alt="${p.name}">
                    </div>
                    <div class="product-info">
                        <h4>${p.name}</h4>
                        <p class="price">Rp ${priceFmt}</p>
                        <button style="background:var(--c-red); color:white; border:none; padding:10px; border-radius:10px; cursor:pointer; width:100%; margin-top:10px;" onclick="handleDeleteProduct(${p.id})"><i class="fas fa-trash"></i> Hapus</button>
                    </div>
                </div>`;
            } else {
                return `
                <div class="product-card" onclick="viewProductDetail(${p.id})">
                    <div class="card-img-wrapper">
                        <div class="badges-top">
                            <span class="badge-grade ${p.condition_grade === 'A' ? 'bg-purple' : 'bg-orange'}">Grade ${p.condition_grade}</span>
                            ${p.is_barter_allowed ? '<span class="badge-barter bg-blue"><i class="fas fa-sync"></i> Barter</span>' : ''}
                        </div>
                        <img src="${imgSrc}" alt="${p.name}">
                    </div>
                    <div class="product-info">
                        <h4>${p.name}</h4>
                        <p class="price">Rp ${priceFmt}</p>
                        <div class="location-badge">
                            <span class="pin"><i class="fas fa-tag text-pink"></i> ${p.category}</span>
                        </div>
                    </div>
                </div>`;
            }
        }).join('');
    }
};