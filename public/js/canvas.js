// public/js/canvas.js

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. A4 KAĞIDI AÇ/KAPAT ---
    const createBtn = document.getElementById('createNewBtn');
    const a4Canvas = document.getElementById('a4Canvas');
    const closeBtn = document.getElementById('closeCanvasBtn');
    const workspacePoster = document.getElementById('workspaceEmptyState'); // YENİ: Posteri seçtik

    if (createBtn && a4Canvas && closeBtn) {
        createBtn.addEventListener('click', function () {
            a4Canvas.setAttribute('data-editing-id', '');
            document.getElementById('planTitleInput').value = '';
            document.getElementById('planDateInput').value = '';
            window.clearCanvasZones?.();
            const saveBtn = document.getElementById('savePlanBtn');
            if (saveBtn) saveBtn.textContent = '💾 Kaydet';
            a4Canvas.classList.add('active');
            createBtn.style.display = 'none';
            if (workspacePoster) workspacePoster.style.display = 'none';
        });

        closeBtn.addEventListener('click', function () {
            a4Canvas.classList.remove('active');
            createBtn.style.display = 'flex';
            if (workspacePoster) workspacePoster.style.display = 'flex'; // Vazgeçilirse posteri geri getir
        });
    }

    // --- PDF İNDİRME MOTORU (Yüksek Çözünürlüklü ve Net) ---
    const downloadPdfBtn = document.getElementById('downloadPdfBtn');

    if (downloadPdfBtn) {
        downloadPdfBtn.addEventListener('click', function () {
            window.showToast('PDF hazırlanıyor, lütfen bekleyin...', 'success');

            // 1. Görünmemesi gereken butonları gizle
            downloadPdfBtn.style.display = 'none';
            closeCanvasBtn.style.display = 'none';
            const deleteBtns = document.querySelectorAll('.delete-item-btn');
            deleteBtns.forEach(btn => btn.style.display = 'none');

            // 2. PERDE/SOLUKLUK SORUNUNUN ÇÖZÜMÜ:
            // Animasyonlar html2canvas'ın saydamlık hesaplamasını bozar. 
            // Fotoğraf çekmeden önce animasyonu ve gölgeyi tamamen kapatıyoruz.
            const originalAnimation = a4Canvas.style.animation;
            const originalTransform = a4Canvas.style.transform;
            const originalBoxShadow = a4Canvas.style.boxShadow;

            a4Canvas.style.animation = 'none';
            a4Canvas.style.transform = 'none';
            a4Canvas.style.boxShadow = 'none';

            // 3. EKSTRA NETLİK: Kullanıcının yazdığı açıklamaları (input) 
            // PDF'te soluk gri görünmesin diye anlık simsiyah yapıyoruz.
            const inputs = a4Canvas.querySelectorAll('input[type="text"]');
            inputs.forEach(input => {
                input.style.color = '#222222'; // Kalem siyahı
                input.style.fontWeight = '500';
                input.style.borderBottom = 'none'; // Kesik çizgileri PDF'te gizle
            });

            // 4. Fotoğrafı Çek (HD Kalite)
            html2canvas(a4Canvas, {
                scale: 4,
                useCORS: true,
                backgroundColor: '#ffffff'
            }).then(canvas => {

                // 5. Her şeyi anında eski haline (Ekranda göründüğü duruma) getir
                downloadPdfBtn.style.display = 'block';
                closeCanvasBtn.style.display = 'block';
                deleteBtns.forEach(btn => btn.style.display = 'flex');

                a4Canvas.style.animation = originalAnimation;
                a4Canvas.style.transform = originalTransform;
                a4Canvas.style.boxShadow = originalBoxShadow;

                inputs.forEach(input => {
                    input.style.color = ''; // CSS'teki orijinal rengine dön
                    input.style.fontWeight = '';
                    input.style.borderBottom = '';
                });

                // 6. PDF'i Oluştur ve İndir
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF('p', 'mm', 'a4');

                const imgData = canvas.toDataURL('image/png');
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

                pdf.save('StudyNexus-Haftalik-Plan.pdf');
                window.showToast('Harika! Planınız cam gibi net indirildi.', 'success');
            }).catch(err => {
                console.error("PDF hatası:", err);
                window.showToast('PDF oluşturulurken hata oluştu.', 'error');

                // Hata olsa bile ekranı düzelt
                downloadPdfBtn.style.display = 'block';
                closeCanvasBtn.style.display = 'block';
            });
        });
    }

    // --- 2. SÜRÜKLE BIRAK (DRAG & DROP) MOTORU ---
    const draggables = document.querySelectorAll('.draggable-item');
    const dropZones = document.querySelectorAll('.drop-zone');

    draggables.forEach(draggable => {
        draggable.addEventListener('dragstart', () => {
            if (draggable.getAttribute('draggable') === 'false') return;
            draggable.classList.add('dragging');
        });
        draggable.addEventListener('dragend', () => {
            draggable.classList.remove('dragging');
        });
    });

    // Bırakma Alanları (Günler)
    dropZones.forEach(zone => {
        zone.addEventListener('dragover', e => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });

        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });

        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('drag-over');

            const draggedItem = document.querySelector('.dragging');
            if (!draggedItem) return;

            // KURAL 1: Bir güne maksimum 8 konu sınırı!
            const isMovingWithinSameZone = draggedItem.parentElement === zone;
            if (!isMovingWithinSameZone && zone.querySelectorAll('.planned-item').length >= 8) {
                window.showToast('Bir güne en fazla 8 konu ekleyebilirsiniz!', 'error');
                return; // 8'i geçtiyse işlemi iptal et
            }

            // DURUM A: Tuvaldeki mevcut bir satır yer değiştiriyorsa (Sadece taşı)
            if (draggedItem.classList.contains('planned-item')) {
                const oldZone = draggedItem.parentElement; // Geldiği eski günü hafızaya al
                zone.appendChild(draggedItem);

                // Hem yeni geldiği günün hem de terk ettiği eski günün tasarımını güncelle
                window.updateZoneLayout(zone);
                if (oldZone) window.updateZoneLayout(oldZone);

                return;
            }

            // DURUM B: Sol menüden yepyeni bir konu geliyorsa
            const topicName = draggedItem.getAttribute('data-topic-name');
            const topicId = draggedItem.getAttribute('data-topic-id');
            const courseId = draggedItem.getAttribute('data-course-id');

            // KURAL 2: Aynı konu aynı güne birden fazla eklenemez
            const isAlreadyInDay = zone.querySelector(`.planned-item[data-topic-id="${topicId}"]`);
            if (isAlreadyInDay) {
                window.showToast('Bu konu bu güne zaten eklenmiş!', 'error');
                return;
            }

            const plannedItem = document.createElement('div');
            plannedItem.classList.add('planned-item');
            plannedItem.setAttribute('draggable', 'true');
            plannedItem.setAttribute('data-topic-id', topicId);
            plannedItem.setAttribute('data-course-id', courseId);

            plannedItem.innerHTML = `
                <input type="checkbox" title="Tamamlandı">
                <span class="item-title">${topicName}</span>
                <input type="text" placeholder="Açıklama ekleyin...">
                <button class="delete-item-btn" title="Bu planı sil">✕</button>
            `;

            plannedItem.addEventListener('dragstart', () => {
                plannedItem.classList.add('dragging');
            });
            plannedItem.addEventListener('dragend', () => {
                plannedItem.classList.remove('dragging');
            });

            const deleteBtn = plannedItem.querySelector('.delete-item-btn');
            deleteBtn.addEventListener('click', () => {
                plannedItem.remove();
                window.updateZoneLayout(zone); // Sildikten sonra düzeni güncelle
            });

            zone.appendChild(plannedItem);
            window.updateZoneLayout(zone); // Ekledikten sonra düzeni güncelle
        });
    });

    // Sunucudan gelen EJS bildirim kutusunu otomatik gizle (Eğer varsa)
    const toast = document.getElementById('toastMsg');
    if (toast) {
        setTimeout(() => {
            toast.style.transition = 'opacity 0.5s ease';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    }
});

// --- 3. DİNAMİK BİLDİRİM (TOAST) SİSTEMİ ---
window.showToast = function (message, type = 'success') {
    const bgColor = type === 'error' ? '#ef4444' : '#10b981'; // Hata ise kırmızı, başarı ise yeşil
    const toastHTML = `
        <div class="toast-message" style="background: ${bgColor};" id="dynamicToast_${Date.now()}">
            ${message}
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', toastHTML);

    // Son eklenen toast'u bul ve 3 saniye sonra sil
    const toasts = document.querySelectorAll('.toast-message');
    const latestToast = toasts[toasts.length - 1];

    setTimeout(() => {
        latestToast.style.transition = 'opacity 0.5s ease';
        latestToast.style.opacity = '0';
        setTimeout(() => latestToast.remove(), 500);
    }, 3000);
};

// --- 4. ARAYÜZ (UI) ETKİLEŞİM FONKSİYONLARI ---

// Ders etiketine tıklayınca Combo Box'tan (Select) otomatik seçme
window.selectCourseInCombo = function (courseId) {
    const select = document.getElementById('topicCourseSelect');
    const input = document.getElementById('newTopicInput');
    if (select && input) {
        select.value = courseId;
        input.focus(); // İmleci anında konu yazma kutusuna taşı
    }
};

// --- 5. VERİTABANI İŞLEM FONKSİYONLARI (AJAX) ---

window.updateStatsUI = function (stats) {
    if (!stats) return;
    const ring = document.getElementById('statsRing');
    const pct = document.getElementById('statsPercentText');
    const count = document.getElementById('statsCountText');
    const rows = document.getElementById('statsCourseRows');
    if (ring) ring.style.setProperty('--p', stats.overallPercent);
    if (pct) pct.textContent = `${stats.overallPercent}%`;
    if (count) count.textContent = `${stats.completedTopics} / ${stats.totalTopics}`;
    if (rows && stats.byCourse) {
        rows.innerHTML = stats.byCourse.map(c => `
            <div class="stats-course-row" data-course-id="${c.id}">
                <span>${c.name}</span>
                <div class="stats-bar"><div class="stats-bar-fill" style="width:${c.percent}%"></div></div>
                <span class="stats-pct">${c.percent}%</span>
            </div>`).join('');
    }
};

window.toggleTopicDone = function (id, isCompleted, btnElement) {
    fetch('/toggle-topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: id, isCompleted: isCompleted })
    })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const topicDiv = btnElement.closest('.draggable-item');
                const span = topicDiv.querySelector('span');

                if (isCompleted) {
                    span.style.textDecoration = 'line-through';
                    span.style.color = '#999';
                    topicDiv.style.opacity = '0.5';
                    topicDiv.setAttribute('draggable', 'false');
                    topicDiv.style.cursor = 'default';
                    btnElement.setAttribute('onclick', `event.stopPropagation(); toggleTopicDone(${id}, false, this)`);
                } else {
                    span.style.textDecoration = 'none';
                    span.style.color = 'inherit';
                    topicDiv.style.opacity = '1';
                    topicDiv.setAttribute('draggable', 'true');
                    topicDiv.style.cursor = 'grab';
                    btnElement.setAttribute('onclick', `event.stopPropagation(); toggleTopicDone(${id}, true, this)`);
                }
                window.updateStatsUI(data.stats);
            }
        }).catch(err => console.error(err));
};

window.deleteTopic = function (id, btnElement) {
    if (confirm('Konuyu kalıcı olarak silmek istediğinize emin misiniz?')) {
        fetch('/delete-topic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topicId: id })
        }).then(res => res.json()).then(data => {
            if (data.success) {
                const topicDiv = btnElement.closest('.draggable-item');
                topicDiv.style.transition = 'all 0.3s ease';
                topicDiv.style.transform = 'scale(0.8)';
                topicDiv.style.opacity = '0';
                setTimeout(() => topicDiv.remove(), 300);
                document.querySelectorAll(`.planned-item[data-topic-id="${id}"]`).forEach(el => el.remove());
                window.showToast('Konu tamamen silindi', 'success');
            }
        });
    }
};

window.deleteCourse = function (id, btnElement) {
    if (confirm('DİKKAT: Bu ders ve derse ait TÜM KONULAR silinecek. Emin misiniz?')) {
        fetch('/delete-course', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ courseId: id })
        }).then(res => res.json()).then(data => {
            if (data.success) {
                btnElement.parentElement.remove();
                const option = document.querySelector(`select#topicCourseSelect option[value="${id}"]`);
                if (option) option.remove();
                document.querySelectorAll(`.draggable-item[data-course-id="${id}"]`).forEach(el => el.remove());
                document.querySelectorAll(`.planned-item[data-course-id="${id}"]`).forEach(el => el.remove());
                window.showToast('Ders ve konuları silindi', 'success');
            }
        });
    }
};

// SAYFA YENİLEMEDEN DERS EKLEME
window.submitNewCourse = function () {
    const input = document.getElementById('newCourseInput');
    const courseName = input.value.trim();
    if (!courseName) return;

    // KURAL: Aynı isimde ders eklenemesin (EJS boşluklarını temizlemek için .trim() eklendi!)
    const isDuplicate = Array.from(document.querySelectorAll('#topicCourseSelect option')).some(opt =>
        opt.textContent.trim().toLowerCase() === courseName.toLowerCase()
    );

    if (isDuplicate) {
        window.showToast('Bu ders zaten kayıtlı!', 'error');
        return;
    }

    fetch('/add-course', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseName: courseName })
    }).then(res => res.json()).then(data => {
        if (data.success) {
            const container = document.getElementById('courseTagsContainer');
            if (container) {
                container.insertAdjacentHTML('beforeend', `
                    <div class="course-pill" data-course-id="${data.id}" onclick="selectCourseInCombo(${data.id})" style="cursor: pointer;">
                        <span class="pill-text">${data.name}</span>
                        <button type="button" class="pill-delete-btn" onclick="event.stopPropagation(); deleteCourse(${data.id}, this)" title="Dersi Sil">×</button>
                    </div>
                `);
            }

            const select = document.getElementById('topicCourseSelect');
            if (select) {
                select.insertAdjacentHTML('beforeend', `<option value="${data.id}">${data.name}</option>`);
                select.value = data.id; // OTOMATİK SEÇ
            }

            input.value = '';
            document.getElementById('newTopicInput').focus(); // OTOMATİK ODAKLAN
            window.showToast(`"${data.name}" eklendi, şimdi konu girebilirsiniz!`, 'success');
        }
    }).catch(err => console.error(err));
};

window.submitNewTopic = function () {
    const select = document.getElementById('topicCourseSelect');
    const input = document.getElementById('newTopicInput');
    const topicName = input.value.trim();

    if (!select.value || !topicName) return;

    // KURAL: Aynı derse aynı konu birden fazla eklenemez
    const isDuplicate = Array.from(document.querySelectorAll('#topicsContainer .draggable-item')).some(item => {
        return item.getAttribute('data-course-id') === select.value &&
            item.getAttribute('data-topic-name').toLowerCase() === topicName.toLowerCase();
    });

    if (isDuplicate) {
        window.showToast('Bu konu bu derste zaten mevcut!', 'error');
        return;
    }

    fetch('/add-topic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: select.value, topicName: topicName })
    }).then(res => res.json()).then(data => {
        if (data.success) {
            const container = document.getElementById('topicsContainer');
            const newItemHTML = `
                <div class="draggable-item" draggable="true" data-topic-id="${data.id}" data-course-id="${data.courseId}" data-topic-name="${data.name}" style="background: #f9fafb; border: 1px solid #eee; padding: 10px; border-radius: 6px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; cursor: grab;">
                    <span style="flex: 1; font-size: 0.9rem;">${data.name}</span>
                    <div style="display: flex; gap: 8px;">
                        <button onclick="event.stopPropagation(); toggleTopicDone(${data.id}, true, this)" style="background: none; border: none; cursor: pointer; color: #10b981; font-weight: bold; font-size: 1.1rem;" title="Yeterince ekledim">✓</button>
                        <button onclick="event.stopPropagation(); deleteTopic(${data.id}, this)" style="background: none; border: none; cursor: pointer; color: #ef4444; font-weight: bold; font-size: 1.1rem;" title="Konuyu sil">✕</button>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('afterbegin', newItemHTML);

            const newlyAdded = container.firstElementChild;
            newlyAdded.addEventListener('dragstart', () => newlyAdded.classList.add('dragging'));
            newlyAdded.addEventListener('dragend', () => newlyAdded.classList.remove('dragging'));

            input.value = '';
            window.showToast('Konu başarıyla eklendi', 'success');
        }
    }).catch(err => console.error(err));
};

// Gündeki konu sayısını sayar ve tasarımı 3 kademeli olarak günceller
window.updateZoneLayout = function (zone) {
    const itemCount = zone.querySelectorAll('.planned-item').length;

    // Önce mevcut kademeleri temizle
    zone.classList.remove('compact', 'two-columns');

    if (itemCount >= 5) {
        // 5 ve üstü: İki sütun ve daraltılmış mod
        zone.classList.add('two-columns', 'compact');
    } else if (itemCount >= 3) {
        // 3 veya 4 eleman: Tek sütun ama daraltılmış mod (Sayfa şişmesin diye)
        zone.classList.add('compact');
    }
};

window.collectPlanData = function () {
    const planData = [];
    document.querySelectorAll('.drop-zone').forEach((zone) => {
        const dayName = zone.getAttribute('data-day');
        zone.querySelectorAll('.planned-item').forEach((item) => {
            planData.push({
                day: dayName,
                topicId: item.getAttribute('data-topic-id'),
                description: item.querySelector('input[type="text"]')?.value.trim() || ''
            });
        });
    });
    return planData;
};

window.createPlannedItemElement = function (topicId, courseId, topicName, description = '') {
    const plannedItem = document.createElement('div');
    plannedItem.classList.add('planned-item');
    plannedItem.setAttribute('draggable', 'true');
    plannedItem.setAttribute('data-topic-id', topicId);
    plannedItem.setAttribute('data-course-id', courseId || '');

    plannedItem.innerHTML = `
        <input type="checkbox" title="Tamamlandı">
        <span class="item-title">${topicName}</span>
        <input type="text" placeholder="Açıklama ekleyin..." value="${description.replace(/"/g, '&quot;')}">
        <button class="delete-item-btn" title="Bu planı sil">✕</button>
    `;

    plannedItem.addEventListener('dragstart', () => plannedItem.classList.add('dragging'));
    plannedItem.addEventListener('dragend', () => plannedItem.classList.remove('dragging'));
    plannedItem.querySelector('.delete-item-btn').addEventListener('click', () => {
        const zone = plannedItem.parentElement;
        plannedItem.remove();
        if (zone) window.updateZoneLayout(zone);
    });

    return plannedItem;
};

window.clearCanvasZones = function () {
    document.querySelectorAll('.drop-zone').forEach((zone) => {
        zone.innerHTML = '';
        window.updateZoneLayout(zone);
    });
};

window.closeCanvasEditor = function () {
    const a4Canvas = document.getElementById('a4Canvas');
    a4Canvas.classList.remove('active');
    a4Canvas.setAttribute('data-editing-id', '');
    document.getElementById('createNewBtn').style.display = 'flex';
    const wEmptyState = document.getElementById('workspaceEmptyState');
    if (wEmptyState) wEmptyState.style.display = 'flex';
    const savePlanBtn = document.getElementById('savePlanBtn');
    if (savePlanBtn) savePlanBtn.textContent = '💾 Kaydet';
};

window.prependPilePaper = function (planId, title, dateRange) {
    const pileContainer = document.querySelector('.pile-container');
    const emptyState = pileContainer.querySelector('.pile-empty-state');
    if (emptyState) emptyState.remove();

    const newPaper = document.createElement('div');
    newPaper.className = 'pile-paper';
    newPaper.setAttribute('data-plan-id', planId);
    newPaper.innerHTML = `
        <div class="pile-title">${title}</div>
        <div class="pile-date">${dateRange}</div>
        <div class="pile-actions">
            <button class="view-plan-btn" onclick="openQuickLook(${planId})">Hızlı Bakış</button>
            <button class="edit-plan-btn" onclick="editWeeklyPlan(${planId})">Düzenle</button>
        </div>
    `;
    pileContainer.prepend(newPaper);
    pileContainer.querySelectorAll('.pile-paper').forEach((paper, index) => {
        paper.style.setProperty('--index', index);
        paper.style.zIndex = 100 - index;
    });
};

const savePlanBtn = document.getElementById('savePlanBtn');

if (savePlanBtn) {
    savePlanBtn.addEventListener('click', () => {
        const titleInput = document.getElementById('planTitleInput').value.trim();
        const dateInput = document.getElementById('planDateInput').value.trim();
        const a4Canvas = document.getElementById('a4Canvas');
        const editingId = a4Canvas.getAttribute('data-editing-id');
        const planData = window.collectPlanData();

        if (!titleInput || !dateInput) {
            window.showToast('Lütfen plan başlığını ve tarihini girin!', 'error');
            return;
        }

        savePlanBtn.textContent = '⏳ Kaydediliyor...';
        savePlanBtn.disabled = true;

        const url = editingId ? `/api/plan/${editingId}` : '/save-weekly-plan';
        const method = editingId ? 'PUT' : 'POST';

        fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: titleInput, dateRange: dateInput, planData })
        })
            .then((res) => res.json())
            .then((data) => {
                savePlanBtn.textContent = '💾 Kaydet';
                savePlanBtn.disabled = false;

                if (!data.success) {
                    window.showToast(data.message || 'Kayıt hatası.', 'error');
                    return;
                }

                window.showToast(editingId ? 'Plan güncellendi.' : 'Plan kaydedildi.', 'success');

                if (!editingId) {
                    window.prependPilePaper(data.planId, titleInput, dateInput);
                } else {
                    const paper = document.querySelector(`.pile-paper[data-plan-id="${editingId}"]`);
                    if (paper) {
                        paper.querySelector('.pile-title').textContent = titleInput;
                        paper.querySelector('.pile-date').textContent = dateInput;
                    }
                }

                document.getElementById('planTitleInput').value = '';
                document.getElementById('planDateInput').value = '';
                window.clearCanvasZones();
                window.closeCanvasEditor();
            })
            .catch((err) => {
                console.error(err);
                window.showToast('Sunucu ile iletişim kurulamadı.', 'error');
                savePlanBtn.textContent = '💾 Kaydet';
                savePlanBtn.disabled = false;
            });
    });
}

// --- HIZLI BAKIŞ (QUICK LOOK) FONKSİYONLARI ---
window.openQuickLook = function(planId) {
    window.showToast('Plan yükleniyor...', 'success');
    
    fetch(`/api/plan/${planId}`)
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            const modal = document.getElementById('quickLookModal');
            document.getElementById('qlTitle').textContent = data.plan.title;
            document.getElementById('qlDate').textContent = data.plan.date_range;
            
            // 1. KRİTİK NOKTA: Artık içeriği silmiyoruz, sadece günlerin içini (Pazartesi, Salı vb.) temizliyoruz
            document.querySelectorAll('.read-only-zone').forEach(zone => {
                zone.innerHTML = '';
            });

            // 2. Veritabanından gelen dersleri ilgili günün satırına yerleştir
            if (data.items && data.items.length > 0) {
                data.items.forEach(item => {
                    const zone = document.querySelector(`.read-only-zone[data-day="${item.day_name}"]`);
                    if (zone) {
                        const readOnlyItem = document.createElement('div');
                        readOnlyItem.className = 'planned-item';
                        
                        // İçeriği tıpkı tuvalde tasarladığın gibi oluştur
                        readOnlyItem.innerHTML = `
                            <span class="course-pill" style="font-size: 0.7rem; padding: 4px 8px;">${item.course_name}</span>
                            <span class="item-title" style="font-weight: 600; color: #333;">${item.topic_name}</span>
                            <span style="font-size: 0.8rem; color: #888; flex: 1; text-align: left; margin-left: 5px; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;">
                                ${item.description ? item.description : 'Açıklama yok'}
                            </span>
                        `;
                        zone.appendChild(readOnlyItem);
                    }
                });
            }

            // 3. Tasarımın bozulmaması için çok ders olan günleri (Kompakt/İki Sütunlu) ayarla
            document.querySelectorAll('.read-only-zone').forEach(zone => {
                const count = zone.children.length;
                zone.classList.remove('compact', 'two-columns');
                if (count >= 3 && count <= 4) zone.classList.add('compact');
                if (count >= 5) zone.classList.add('two-columns');
            });

            modal.setAttribute('data-current-plan-id', planId);
            modal.setAttribute('data-read-only', data.readOnly ? '1' : '0');

            const editBtn = document.querySelector('.edit-plan-btn-modal');
            const delBtn = document.getElementById('qlDeleteBtn');
            const shareSelect = document.getElementById('shareClassSelect');
            const shareBtn = document.getElementById('sharePlanBtn');

            const assignBtn = document.getElementById('assignPlanBtn');
            if (data.readOnly) {
                if (editBtn) editBtn.style.display = 'none';
                if (delBtn) delBtn.style.display = 'none';
                if (assignBtn) assignBtn.style.display = 'none';
            } else {
                if (editBtn) editBtn.style.display = 'inline-block';
                if (delBtn) delBtn.style.display = 'inline-block';
                if (assignBtn && window.STUDYNEXUS_USER?.role === 'teacher') {
                    assignBtn.style.display = 'inline-block';
                }
            }

            modal.classList.add('active');
        } else {
            window.showToast('Plan detayları alınamadı!', 'error');
        }
    })
    .catch(err => {
        console.error(err);
        window.showToast('Sunucu bağlantı hatası', 'error');
    });
};

// Modal Kapatma
window.closeQuickLook = function () {
    document.getElementById('quickLookModal').classList.remove('active');
};

window.editWeeklyPlan = function (planId) {
    fetch(`/api/plan/${planId}`)
        .then((res) => res.json())
        .then((data) => {
            if (!data.success || data.readOnly) {
                window.showToast('Bu plan düzenlenemez.', 'error');
                return;
            }

            window.closeQuickLook();
            const a4Canvas = document.getElementById('a4Canvas');
            a4Canvas.setAttribute('data-editing-id', planId);
            document.getElementById('planTitleInput').value = data.plan.title;
            document.getElementById('planDateInput').value = data.plan.date_range;
            window.clearCanvasZones();

            (data.items || []).forEach((item) => {
                const zone = document.querySelector(`.drop-zone[data-day="${item.day_name}"]`);
                if (!zone) return;
                const el = window.createPlannedItemElement(
                    item.topic_id,
                    null,
                    item.topic_name || 'Konu',
                    item.description || ''
                );
                zone.appendChild(el);
                window.updateZoneLayout(zone);
            });

            a4Canvas.classList.add('active');
            document.getElementById('createNewBtn').style.display = 'none';
            const wEmptyState = document.getElementById('workspaceEmptyState');
            if (wEmptyState) wEmptyState.style.display = 'none';
            document.getElementById('savePlanBtn').textContent = '💾 Güncelle';
            window.showToast('Plan düzenleme modunda.', 'success');
        });
};

window.editFromQuickLook = function () {
    const planId = document.getElementById('quickLookModal').getAttribute('data-current-plan-id');
    window.editWeeklyPlan(planId);
};

// --- VERİTABANINDAN HAFTALIK PLAN SİLME ---
window.deleteWeeklyPlan = function () {
    const modal = document.getElementById('quickLookModal');
    const planId = modal.getAttribute('data-current-plan-id');

    if (!planId) return;

    if (confirm('Bu planı ve içindeki tüm programı kalıcı olarak silmek istediğinize emin misiniz?')) {
        fetch('/delete-weekly-plan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ planId: planId })
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    window.showToast('Plan başarıyla silindi.', 'success');
                    window.closeQuickLook(); // Pencereyi kapat

                    // --- 1. SAYFA YENİLEMEDEN YIĞINDAN (PILE) UÇURMA SİHRİ ---
                    const pileContainer = document.querySelector('.pile-container');
                    const papers = pileContainer.querySelectorAll('.pile-paper');

                    papers.forEach(paper => {
                        const btn = paper.querySelector('.view-plan-btn');
                        if (btn && btn.getAttribute('onclick').includes(planId)) {

                            paper.style.transition = 'all 0.3s ease';
                            paper.style.transform = 'scale(0.8) rotate(-5deg)';
                            paper.style.opacity = '0';

                            setTimeout(() => {
                                paper.remove();

                                const remainingPapers = pileContainer.querySelectorAll('.pile-paper');
                                if (remainingPapers.length === 0) {
                                    pileContainer.innerHTML = `
                                    <div class="pile-empty-state">
                                        <div style="font-size: 3rem; margin-bottom: 10px; opacity: 0.5;">🗂️</div>
                                        <div class="pile-title" style="color: #a39fbb;">Kayıtlı Plan Yok</div>
                                        <div class="pile-date">İlk haftalık planınızı oluşturup kaydedin.</div>
                                    </div>
                                `;
                                } else {
                                    remainingPapers.forEach((p, idx) => {
                                        p.style.setProperty('--index', idx);
                                        p.style.zIndex = 100 - idx;
                                    });
                                }
                            }, 300);
                        }
                    });

                    // --- 2. YENİ: TAKVİMDEKİ MOR NOKTAYI VE DOLU KUTUYU TEMİZLEME SİHRİ ---
                    const calendarBoxes = document.querySelectorAll('.cal-week-box');
                    calendarBoxes.forEach(box => {
                        const onclickAttr = box.getAttribute('onclick');

                        // Eğer takvimdeki bu kutu, az önce sildiğimiz plana aitse...
                        if (onclickAttr && onclickAttr.includes(`openQuickLook(${planId})`)) {

                            // Kutunun mor tasarımını sil, eski kesik çizgili haline getir
                            box.classList.remove('filled');
                            box.classList.add('empty');
                            box.title = 'Boş Hafta';

                            // Tıklanabilirlik özelliğini kaldır (Çünkü plan artık yok)
                            box.removeAttribute('onclick');

                            // İçindeki mor noktayı bul ve yok et
                            const indicator = box.querySelector('.week-indicator');
                            if (indicator) {
                                // Tatlı bir küçülme efektiyle kaybolsun
                                indicator.style.transition = 'all 0.2s ease';
                                indicator.style.transform = 'scale(0)';
                                setTimeout(() => indicator.remove(), 200);
                            }
                        }
                    });

                } else {
                    window.showToast(data.message || 'Plan silinirken bir hata meydana geldi.', 'error');
                }
            })
            .catch(err => {
                console.error(err);
                window.showToast('Sunucu bağlantısı koptu.', 'error');
            });
    }
};

// --- 1. TAKVİME EKLE BUTONUNA BASILINCA (Hızlı Bakış içinden) ---
window.addToCalendar = function () {
    const planId = document.getElementById('quickLookModal').getAttribute('data-current-plan-id');

    // Hızlı Bakış penceresini kapat, Takvim penceresini aç
    window.closeQuickLook();

    const calModal = document.getElementById('calendarModal');
    calModal.setAttribute('data-plan-id', planId); // ID'yi yeni pencereye taşıdık
    calModal.classList.add('active');
};

// --- 2. TAKVİM PENCERESİNİ KAPATMA ---
window.closeCalendarModal = function () {
    document.getElementById('calendarModal').classList.remove('active');
};

// --- 3. HAFTA SEÇİMİ (Pill Butonlarına tıklanınca görseli günceller) ---
window.selectWeek = function (btnElement, weekNumber) {
    // Önce hepsinin aktifliğini kaldır
    document.querySelectorAll('.week-pill').forEach(btn => btn.classList.remove('active'));
    // Tıklananı aktif yap
    btnElement.classList.add('active');
    // Gizli inputa değeri yaz
    document.getElementById('selectedWeekValue').value = weekNumber;
};

// --- 4. VERİTABANINA ONAYLAMA (AJAX) ---
window.confirmCalendarAssignment = function () {
    const planId = document.getElementById('calendarModal').getAttribute('data-plan-id');
    const month = document.getElementById('calMonthSelect').value;
    const week = document.getElementById('selectedWeekValue').value;

    fetch('/assign-to-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: planId, month: month, week: week })
    })
        .then(res => res.json())
        .then(data => {

            if (data.success) {
                window.showToast(`Harika! Planınız ${month} ayı ${week}. Haftaya başarıyla atandı.`, 'success');
                window.closeCalendarModal();

                // Sayfa yenilemeden Takvim Grid'inde o haftayı güncelleyelim
                const boxId = `cal-box-${month}-${week}`;
                const box = document.getElementById(boxId);
                if (box) {
                    box.classList.remove('empty');
                    box.classList.add('filled');
                    box.title = 'Atanan Plan';

                    // YENİ: Kutuyu anında tıklanabilir yap ve Hızlı Bakış'a bağla!
                    box.setAttribute('onclick', `openQuickLook(${planId})`);

                    if (!box.querySelector('.week-indicator')) {
                        box.insertAdjacentHTML('beforeend', '<div class="week-indicator"></div>');
                    }
                }
            } else {
                window.showToast(data.message || 'Atama işlemi başarısız oldu.', 'error');
            }
        })
        .catch(err => {
            console.error(err);
            window.showToast('Sunucu bağlantısı koptu.', 'error');
        });
};

// --- KOÇLUK ---
window.loadCoachingData = function () {
    const user = window.STUDYNEXUS_USER;
    if (!user) return;

    if (user.role === 'teacher') {
        fetch('/api/coaching/invite-code')
            .then(r => r.json())
            .then(d => {
                if (d.code) document.getElementById('coachCodeDisplay').textContent = d.code;
            });
        fetch('/api/coaching/students')
            .then(r => r.json())
            .then(d => {
                const list = document.getElementById('teacherStudentsList');
                if (!list || !d.success) return;
                if (!d.students.length) {
                    list.innerHTML = '<li>Henüz öğrenci yok. Davet kodunu paylaşın.</li>';
                    return;
                }
                list.innerHTML = d.students.map(s => `
                    <li>
                        <strong>${s.full_name || s.username}</strong>
                        <span style="color:#8b5cf6;font-weight:600;"> ${s.stats.percent}%</span>
                        <div style="margin-top:6px;">
                            <button class="view-plan-btn" onclick="viewStudentOverview(${s.id})">Program & İlerleme</button>
                        </div>
                    </li>`).join('');
                const sel = document.getElementById('assignStudentModalSelect');
                if (sel) {
                    sel.innerHTML = '<option value="">Öğrenci seç...</option>' +
                        d.students.map(s => `<option value="${s.id}">${s.full_name || s.username}</option>`).join('');
                }
            });
    } else {
        fetch('/api/coaching/my-teacher')
            .then(r => r.json())
            .then(d => {
                const list = document.getElementById('myTeachersList');
                if (!list) return;
                list.innerHTML = !d.teachers?.length
                    ? '<li>Henüz koça bağlı değilsiniz.</li>'
                    : d.teachers.map(t => `<li><strong>${t.full_name || t.username}</strong>${t.branch ? ' — ' + t.branch : ''}</li>`).join('');
            });
    }
};

window.linkToCoach = function () {
    const coachCode = document.getElementById('coachCodeInput').value.trim();
    fetch('/api/coaching/link-teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachCode })
    }).then(r => r.json()).then(d => {
        if (d.success) {
            window.showToast(`${d.teacherName || 'Koç'}a bağlandınız.`, 'success');
            document.getElementById('coachCodeInput').value = '';
            window.loadCoachingData();
        } else {
            window.showToast(d.message || 'Bağlantı başarısız.', 'error');
        }
    });
};

window.viewStudentOverview = function (studentId) {
    fetch(`/api/coaching/students/${studentId}/overview`)
        .then(r => r.json())
        .then(d => {
            if (!d.success) return;
            document.getElementById('soStudentName').textContent = d.student.full_name || d.student.username;
            const done = d.topics.filter(t => t.is_completed).length;
            const body = document.getElementById('studentOverviewBody');
            body.innerHTML = `
                <div class="student-overview-stats">
                    <div class="stats-ring" style="--p:${d.stats.percent}"><span>${d.stats.percent}%</span></div>
                    <div><strong>${done}/${d.topics.length}</strong> konu<br>${d.stats.courseCount} ders</div>
                </div>
                <h4>Haftalık Planlar</h4>
                ${d.weeklyPlans.length ? d.weeklyPlans.map(p =>
                    `<div class="student-plan-row">${p.title} <small>${p.date_range}</small>
                     <button class="view-plan-btn" onclick="viewStudentPlan(${studentId},${p.id})">Gör</button></div>`
                ).join('') : '<p>Plan yok.</p>'}
                <h4>Konular</h4>
                <ul class="week-task-list">${d.topics.map(t =>
                    `<li style="${t.is_completed ? 'opacity:0.5;text-decoration:line-through' : ''}">
                     ${t.course_name} — ${t.name}</li>`).join('')}</ul>`;
            document.getElementById('studentOverviewModal').classList.add('active');
        });
};

window.closeStudentOverview = function () {
    document.getElementById('studentOverviewModal').classList.remove('active');
};

window.viewStudentPlan = function (studentId, planId) {
    fetch(`/api/coaching/students/${studentId}/plan/${planId}`)
        .then(r => r.json())
        .then(d => {
            if (!d.success) return;
            window.closeStudentOverview();
            document.getElementById('qlTitle').textContent = d.plan.title + ' (Öğrenci)';
            document.getElementById('qlDate').textContent = d.plan.date_range;
            document.querySelectorAll('.read-only-zone').forEach(z => z.innerHTML = '');
            d.items.forEach(item => {
                const zone = document.querySelector(`.read-only-zone[data-day="${item.day_name}"]`);
                if (!zone) return;
                const el = document.createElement('div');
                el.className = 'planned-item';
                el.innerHTML = `<span class="course-pill" style="font-size:0.7rem">${item.course_name}</span>
                    <span class="item-title">${item.topic_name}</span>
                    <span style="font-size:0.8rem;color:#888">${item.description || ''}</span>`;
                zone.appendChild(el);
            });
            document.getElementById('quickLookModal').setAttribute('data-read-only', '1');
            document.getElementById('qlDeleteBtn').style.display = 'none';
            document.querySelector('.edit-plan-btn-modal').style.display = 'none';
            document.getElementById('assignPlanBtn').style.display = 'none';
            document.getElementById('quickLookModal').classList.add('active');
        });
};

window.openAssignPlanModal = function () {
    const planId = document.getElementById('quickLookModal').getAttribute('data-current-plan-id');
    document.getElementById('assignPlanModal').setAttribute('data-plan-id', planId);
    window.closeQuickLook();
    document.getElementById('assignPlanModal').classList.add('active');
};

window.closeAssignPlanModal = function () {
    document.getElementById('assignPlanModal').classList.remove('active');
};

window.selectAssignWeek = function (btn, n) {
    document.querySelectorAll('#assignPlanModal .week-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('assignWeekValue').value = n;
};

window.confirmAssignPlan = function () {
    const planId = document.getElementById('quickLookModal').getAttribute('data-current-plan-id')
        || document.getElementById('assignPlanModal').getAttribute('data-plan-id');
    const studentId = document.getElementById('assignStudentModalSelect').value;
    const month = document.getElementById('assignMonthSelect').value;
    const week = document.getElementById('assignWeekValue').value;
    if (!studentId) return window.showToast('Öğrenci seçin.', 'error');

    fetch('/api/coaching/assign-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, planId, month, week })
    }).then(r => r.json()).then(d => {
        if (d.success) {
            window.showToast('Plan öğrenciye atandı ve takvimine eklendi.', 'success');
            window.closeAssignPlanModal();
        } else {
            window.showToast(d.message || 'Atama başarısız.', 'error');
        }
    });
};

document.addEventListener('DOMContentLoaded', () => {
    if (window.STUDYNEXUS_USER) window.loadCoachingData();
});