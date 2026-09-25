function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    const targetContent = document.getElementById(tabId);
    if(targetContent) targetContent.classList.add('active');
    
    document.querySelectorAll(`.tab-btn[onclick="switchTab('${tabId}')"]`).forEach(btn => {
        btn.classList.add('active');
    });
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selectItem(element) {
    document.querySelectorAll('.my-item-card').forEach(card => card.classList.remove('selected'));
    element.classList.add('selected');
}

function toggleFilter(element) {
    if (element.innerText === 'Semua') {
        document.querySelectorAll('.filter-tag').forEach(tag => tag.classList.remove('active'));
        element.classList.add('active');
    } else {
        document.querySelector('.filter-tag:first-child').classList.remove('active');
        element.classList.toggle('active');
    }
}

function updateRadius(value) {
    document.getElementById('radiusValue').innerHTML = `&le; ${value} km dari kampus`;
}

function findMatches() {
    const btn = document.getElementById('btnFindMatch');
    const originalText = btn.innerHTML;
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mencari Kecocokan...';
    btn.style.opacity = '0.8';
    
    setTimeout(() => {
        btn.innerHTML = originalText;
        btn.style.opacity = '1';
        
        const results = document.getElementById('resultsSection');
        results.style.display = 'block';
        results.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 800);
}
