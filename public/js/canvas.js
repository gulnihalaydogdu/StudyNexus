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
            a4Canvas.setAttribute('data-read-only', '0');
            document.getElementById('planTitleInput').value = '';
            document.getElementById('planDateInput').value = '';
            window.clearCanvasZones?.();
            window.setReadOnlyMode?.(false);
            const saveBtn = document.getElementById('savePlanBtn');
            if (saveBtn) saveBtn.textContent = '💾 Kaydet';
            window.updateCanvasPlanActions?.('');
            a4Canvas.classList.add('active');
            createBtn.style.display = 'none';
            if (workspacePoster) workspacePoster.style.display = 'none';
        });

        closeBtn.addEventListener('click', function () {
            window.closeCanvasEditor?.();
        });
    }

    // --- PDF İNDİRME MOTORU (Yüksek Çözünürlüklü ve Net) ---
    const downloadPdfBtn = document.getElementById('downloadPdfBtn');

    if (downloadPdfBtn) {
        downloadPdfBtn.addEventListener('click', function () {
            window.showToast('PDF hazırlanıyor, lütfen bekleyin...', 'success');

            const toolbar = a4Canvas.querySelector('.canvas-toolbar');
            const toolbarDisplay = toolbar ? toolbar.style.display : '';
            if (toolbar) toolbar.style.display = 'none';
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

                if (toolbar) toolbar.style.display = toolbarDisplay || '';
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
                if (toolbar) toolbar.style.display = toolbarDisplay || '';
            });
        });
    }

    const deletePlanBtn = document.getElementById('deletePlanBtn');
    const calendarPlanBtn = document.getElementById('calendarPlanBtn');
    const assignPlanBtn = document.getElementById('assignPlanBtn');
    if (deletePlanBtn) deletePlanBtn.addEventListener('click', () => window.deleteWeeklyPlan());
    if (calendarPlanBtn) calendarPlanBtn.addEventListener('click', () => window.addToCalendar());
    if (assignPlanBtn) assignPlanBtn.addEventListener('click', () => window.openAssignPlanModal());

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
    if (ring) {
        const prev = parseFloat(ring.style.getPropertyValue('--p')) || 0;
        ring.classList.add('ring-animate');
        ring.style.setProperty('--p', prev);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                ring.style.setProperty('--p', stats.overallPercent);
            });
        });
        setTimeout(() => ring.classList.remove('ring-animate'), 900);
    }
    if (pct) pct.textContent = `${stats.overallPercent}%`;
    if (count) count.textContent = `${stats.completedTopics} / ${stats.totalTopics}`;
    if (rows && stats.byCourse) {
        rows.innerHTML = stats.byCourse.map(c => `
            <div class="stats-course-row" data-course-id="${c.id}">
                <span>${c.name}</span>
                <div class="stats-bar"><div class="stats-bar-fill stats-bar-animated" style="width:${c.percent}%"></div></div>
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
                const span = topicDiv.querySelector('.topic-label');

                if (isCompleted) {
                    span?.classList.add('done');
                    topicDiv.classList.add('is-done');
                    topicDiv.setAttribute('draggable', 'false');
                    btnElement.setAttribute('onclick', `event.stopPropagation(); toggleTopicDone(${id}, false, this)`);
                } else {
                    span?.classList.remove('done');
                    topicDiv.classList.remove('is-done');
                    topicDiv.setAttribute('draggable', 'true');
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
                <div class="draggable-item" draggable="true" data-topic-id="${data.id}" data-course-id="${data.courseId}" data-topic-name="${data.name}">
                    <span class="topic-label">${data.name}</span>
                    <div class="topic-actions">
                        <button type="button" class="topic-done-btn" onclick="event.stopPropagation(); toggleTopicDone(${data.id}, true, this)" title="Tamamlandı">✓</button>
                        <button type="button" class="topic-delete-btn" onclick="event.stopPropagation(); deleteTopic(${data.id}, this)" title="Konuyu sil">✕</button>
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

window.updateCanvasPlanActions = function (planId, readOnly = false) {
    const show = !!planId && !readOnly;
    const del = document.getElementById('deletePlanBtn');
    const cal = document.getElementById('calendarPlanBtn');
    const assign = document.getElementById('assignPlanBtn');
    if (del) del.style.display = show ? 'inline-flex' : 'none';
    if (cal) cal.style.display = show ? 'inline-flex' : 'none';
    if (assign) assign.style.display = show && window.STUDYNEXUS_USER?.role === 'teacher' ? 'inline-flex' : 'none';
};

window.setReadOnlyMode = function (readonly) {
    const a4Canvas = document.getElementById('a4Canvas');
    if (!a4Canvas) return;
    a4Canvas.setAttribute('data-read-only', readonly ? '1' : '0');
    const savePlanBtn = document.getElementById('savePlanBtn');
    const toolbox = document.querySelector('.toolbox-planner');
    if (savePlanBtn) savePlanBtn.style.display = readonly ? 'none' : 'inline-flex';
    if (toolbox) toolbox.style.pointerEvents = readonly ? 'none' : '';
    if (toolbox) toolbox.style.opacity = readonly ? '0.55' : '';
    a4Canvas.querySelectorAll('.drop-zone input, .drop-zone button, .planned-item input, .planned-item button').forEach((el) => {
        if (readonly) el.setAttribute('disabled', 'disabled');
        else el.removeAttribute('disabled');
    });
    a4Canvas.querySelectorAll('.planned-item').forEach((item) => {
        item.setAttribute('draggable', readonly ? 'false' : 'true');
    });
    const titleIn = document.getElementById('planTitleInput');
    const dateIn = document.getElementById('planDateInput');
    if (titleIn) titleIn.readOnly = !!readonly;
    if (dateIn) dateIn.readOnly = !!readonly;
};

window.closeCanvasEditor = function () {
    const a4Canvas = document.getElementById('a4Canvas');
    a4Canvas.classList.remove('active');
    a4Canvas.setAttribute('data-editing-id', '');
    a4Canvas.setAttribute('data-read-only', '0');
    window.setReadOnlyMode(false);
    window.updateCanvasPlanActions('');
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
    `;
    newPaper.setAttribute('onclick', `editWeeklyPlan(${planId})`);
    newPaper.setAttribute('role', 'button');
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

window.applyPlanToCanvas = function (data, options = {}) {
    const { readOnly = false, editingId = '' } = options;
    const a4Canvas = document.getElementById('a4Canvas');
    if (!a4Canvas || !data.success) return false;

    a4Canvas.setAttribute('data-editing-id', editingId || '');
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

    window.setReadOnlyMode(readOnly);
    window.updateCanvasPlanActions(editingId, readOnly);

    a4Canvas.classList.add('active');
    document.getElementById('createNewBtn').style.display = 'none';
    const wEmptyState = document.getElementById('workspaceEmptyState');
    if (wEmptyState) wEmptyState.style.display = 'none';

    const savePlanBtn = document.getElementById('savePlanBtn');
    if (savePlanBtn) {
        savePlanBtn.textContent = readOnly ? '👁️ Görüntüleme' : (editingId ? '💾 Güncelle' : '💾 Kaydet');
        savePlanBtn.style.display = readOnly ? 'none' : 'inline-flex';
    }
    return true;
};

window.getStudentViewContext = function () {
    const view = window.STUDYNEXUS_VIEW;
    if (view?.mode === 'teacher-student' && view.studentId) {
        return { studentId: view.studentId, readOnly: view.readOnly !== false };
    }
    return null;
};

window.openStudentPlan = function (planId) {
    const ctx = window.getStudentViewContext();
    if (!ctx) {
        window.editWeeklyPlan(planId);
        return;
    }
    window.editWeeklyPlan(planId, { studentId: ctx.studentId, readOnly: true });
};

window.editWeeklyPlan = function (planId, options = {}) {
    const viewCtx = window.getStudentViewContext();
    const studentId = options.studentId ?? viewCtx?.studentId;
    const forceReadOnly = options.readOnly ?? (viewCtx?.readOnly && !!studentId);

    const url = studentId
        ? `/api/coaching/students/${studentId}/plan/${planId}`
        : `/api/plan/${planId}`;

    fetch(url)
        .then((res) => res.json())
        .then((data) => {
            if (!data.success) {
                window.showToast('Plan yüklenemedi.', 'error');
                return;
            }

            const readOnly = forceReadOnly || !!data.readOnly;

            window.applyPlanToCanvas(data, {
                readOnly,
                editingId: readOnly ? '' : String(planId)
            });

            const canvasEl = document.getElementById('a4Canvas');
            if (studentId) canvasEl.setAttribute('data-view-student-id', studentId);
            else canvasEl.removeAttribute('data-view-student-id');

            window.showAppPanel?.('planner');
            const label = viewCtx?.studentName || 'Öğrenci';
            if (readOnly && studentId) {
                window.showToast(`${label} — program görüntüleniyor.`, 'success');
            } else if (!readOnly) {
                window.showToast('Plan düzenleme modunda.', 'success');
            }
        })
        .catch(() => window.showToast('Sunucu bağlantı hatası', 'error'));
};

window.deleteWeeklyPlan = function () {
    const a4Canvas = document.getElementById('a4Canvas');
    const planId = a4Canvas?.getAttribute('data-editing-id');
    if (!planId || a4Canvas.getAttribute('data-read-only') === '1') return;

    if (!confirm('Bu planı ve içindeki tüm programı kalıcı olarak silmek istediğinize emin misiniz?')) return;

    fetch('/delete-weekly-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId })
    })
        .then((res) => res.json())
        .then((data) => {
            if (!data.success) {
                window.showToast(data.message || 'Plan silinemedi.', 'error');
                return;
            }
            window.showToast('Plan silindi.', 'success');
            window.closeCanvasEditor();

            const pileContainer = document.querySelector('.pile-container');
            const paper = pileContainer?.querySelector(`.pile-paper[data-plan-id="${planId}"]`);
            if (paper) {
                paper.style.transition = 'all 0.3s ease';
                paper.style.transform = 'scale(0.85) rotate(-4deg)';
                paper.style.opacity = '0';
                setTimeout(() => {
                    paper.remove();
                    const remaining = pileContainer.querySelectorAll('.pile-paper');
                    if (remaining.length === 0) {
                        pileContainer.innerHTML = `
                            <div class="pile-empty-state">
                                <div style="font-size:3rem;margin-bottom:10px;opacity:0.5;">🗂️</div>
                                <div class="pile-title" style="color:#a39fbb;">Kayıtlı Plan Yok</div>
                                <div class="pile-date">İlk haftalık planınızı oluşturup kaydedin.</div>
                            </div>`;
                    } else {
                        remaining.forEach((p, idx) => {
                            p.style.setProperty('--index', idx);
                            p.style.zIndex = 100 - idx;
                        });
                    }
                }, 300);
            }

            document.querySelectorAll('.cal-week-box').forEach((box) => {
                const onclickAttr = box.getAttribute('onclick') || '';
                if (!onclickAttr.includes(`editWeeklyPlan(${planId})`)) return;
                box.classList.remove('filled');
                box.classList.add('empty');
                box.removeAttribute('onclick');
                const indicator = box.querySelector('.week-indicator');
                if (indicator) indicator.remove();
            });
        })
        .catch(() => window.showToast('Sunucu bağlantısı koptu.', 'error'));
};

window.addToCalendar = function () {
    const planId = document.getElementById('a4Canvas')?.getAttribute('data-editing-id');
    if (!planId) return;
    const calModal = document.getElementById('calendarModal');
    calModal.setAttribute('data-plan-id', planId);
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

                    box.setAttribute('onclick', `editWeeklyPlan(${planId})`);

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
                    <li class="teacher-student-card">
                        <a href="/teacher/student/${s.id}" class="teacher-student-card-link">
                            <div class="teacher-student-head">
                                <strong>${s.full_name || s.username}</strong>
                                <span class="teacher-student-pct">${s.stats.percent}%</span>
                            </div>
                            <p class="teacher-student-meta">${s.stats.completedTopics}/${s.stats.totalTopics} konu · Programlar & takvim</p>
                        </a>
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
                <h4 class="so-section-title">Haftalık programlar</h4>
                ${d.weeklyPlans.length ? `<div class="student-plans-grid">${d.weeklyPlans.map(p =>
                    `<div class="student-plan-row">
                        <div><strong>${p.title}</strong><small>${p.date_range}</small></div>
                        <button type="button" class="view-plan-btn" onclick="viewStudentPlan(${studentId},${p.id})">Programı aç</button>
                    </div>`).join('')}</div>` : '<p class="week-panel-empty">Henüz plan yok.</p>'}
                <h4 class="so-section-title">İlerleme özeti</h4>
                <div class="student-overview-stats">
                    <div class="stats-ring ring-animate" style="--p:${d.stats.percent}"><span>${d.stats.percent}%</span></div>
                    <div><strong>${done}/${d.topics.length}</strong> konu tamamlandı<br>${d.stats.courseCount} ders</div>
                </div>
                <ul class="week-task-list so-topic-list">${d.topics.slice(0, 12).map(t =>
                    `<li class="${t.is_completed ? 'done' : ''}">${t.course_name} — ${t.name}</li>`).join('')}
                    ${d.topics.length > 12 ? '<li class="week-panel-empty">…ve diğer konular</li>' : ''}</ul>`;
            document.getElementById('studentOverviewModal').classList.add('active');
        });
};

window.closeStudentOverview = function () {
    document.getElementById('studentOverviewModal').classList.remove('active');
};

window.viewStudentPlan = function (studentId, planId) {
    window.closeStudentOverview();
    window.editWeeklyPlan(planId, { studentId, readOnly: true });
};

window.openAssignPlanModal = function () {
    const planId = document.getElementById('a4Canvas')?.getAttribute('data-editing-id');
    if (!planId) return window.showToast('Önce bir plan kaydedin veya açın.', 'error');
    document.getElementById('assignPlanModal').setAttribute('data-plan-id', planId);
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
    const planId = document.getElementById('a4Canvas')?.getAttribute('data-editing-id')
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