// public/js/canvas.js
import { escapeHtml } from './security.js';

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. A4 KAĞIDI AÇ/KAPAT ---
    const createBtn = document.getElementById('createNewBtn');
    const a4Canvas = document.getElementById('a4Canvas');
    const closeBtn = document.getElementById('closeCanvasBtn');
    const workspacePoster = document.getElementById('workspaceEmptyState'); // YENİ: Posteri seçtik

    if (a4Canvas && closeBtn) {
        closeBtn.addEventListener('click', function () {
            window.closeCanvasEditor?.();
        });
    }

    if (createBtn && a4Canvas) {
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
    }

    window.bindPlanOpenHandlers?.();

    const downloadPdfBtn = document.getElementById('downloadPdfBtn');
    if (downloadPdfBtn) {
        downloadPdfBtn.addEventListener('click', () => window.exportPlanToPdf?.());
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
                <span class="item-title">${escapeHtml(topicName)}</span>
                <input type="text" placeholder="Açıklama ekleyin...">
                <button class="delete-item-btn" title="Bu planı sil">✕</button>
            `;

            plannedItem.addEventListener('dragstart', () => {
                plannedItem.classList.add('dragging');
            });
            plannedItem.addEventListener('dragend', () => {
                plannedItem.classList.remove('dragging');
            });
            plannedItem.querySelector('input[type="checkbox"]').addEventListener('change', (event) => {
                plannedItem.classList.toggle('is-done', event.target.checked);
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

function createPdfTextNode(input, clonedDoc) {
    const value = input.value || input.getAttribute('placeholder') || '';
    const replacement = clonedDoc.createElement('div');
    replacement.textContent = value;
    replacement.className = input.className;
    replacement.style.fontFamily = "'Poppins', sans-serif";
    replacement.style.boxSizing = 'border-box';
    replacement.style.width = '100%';
    replacement.style.textAlign = 'center';
    replacement.style.background = 'transparent';
    replacement.style.border = 'none';
    replacement.style.outline = 'none';
    replacement.style.color = input.classList.contains('plan-title-input') ? '#2e1065' : '#7c7b9b';
    replacement.style.fontWeight = input.classList.contains('plan-title-input') ? '800' : '500';
    replacement.style.fontSize = input.classList.contains('plan-title-input') ? '1.8rem' : '1rem';
    replacement.style.lineHeight = '1.25';
    replacement.style.minHeight = input.classList.contains('plan-title-input') ? '44px' : '24px';
    replacement.style.marginTop = input.classList.contains('plan-date-input') ? '8px' : '0';
    return replacement;
}

function buildPdfExportClone() {
    const source = document.getElementById('a4Canvas');
    if (!source?.classList.contains('active')) return null;

    const stage = document.createElement('div');
    stage.className = 'pdf-export-stage';
    stage.style.position = 'fixed';
    stage.style.left = '-10000px';
    stage.style.top = '0';
    stage.style.width = '794px';
    stage.style.background = '#ffffff';
    stage.style.zIndex = '-1';

    const clone = source.cloneNode(true);
    clone.id = 'a4CanvasPdfClone';
    clone.classList.add('active', 'pdf-export-canvas');
    clone.style.display = 'block';
    clone.style.width = '794px';
    clone.style.maxWidth = '794px';
    clone.style.minHeight = '1123px';
    clone.style.margin = '0';
    clone.style.marginBottom = '0';
    clone.style.padding = '56px';
    clone.style.boxSizing = 'border-box';
    clone.style.background = '#ffffff';
    clone.style.borderRadius = '0';
    clone.style.boxShadow = 'none';
    clone.style.animation = 'none';
    clone.style.transform = 'none';
    clone.style.overflow = 'visible';

    clone
        .querySelectorAll('.canvas-toolbar, #closeCanvasBtn, .delete-item-btn, .planned-item input[type="checkbox"]')
        .forEach((el) => el.remove());

    clone.querySelectorAll('input[type="text"]').forEach((input) => {
        input.replaceWith(createPdfTextNode(input, document));
    });

    clone.querySelectorAll('.drop-zone').forEach((zone) => {
        zone.style.border = '2px dashed transparent';
        zone.style.overflow = 'visible';
    });

    stage.appendChild(clone);
    document.body.appendChild(stage);
    return { stage, clone };
}

/** Planı görünür editörden bağımsız, sabit A4 kopya üzerinden PDF'e aktarır. */
window.exportPlanToPdf = async function () {
    if (!window.html2canvas || !window.jspdf?.jsPDF) {
        window.showToast('PDF kütüphaneleri yüklenemedi. Sayfayı yenileyin.', 'error');
        return;
    }

    const exportNode = buildPdfExportClone();
    if (!exportNode) {
        window.showToast('PDF için önce planı tuvalde açın.', 'error');
        return;
    }

    window.showToast('PDF hazırlanıyor, lütfen bekleyin...', 'success');

    try {
        await document.fonts?.ready;

        const { clone } = exportNode;
        const snapshot = await html2canvas(clone, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            width: clone.offsetWidth,
            height: clone.scrollHeight,
            windowWidth: clone.offsetWidth,
            windowHeight: clone.scrollHeight,
            scrollX: 0,
            scrollY: 0
        });

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();

        const imgData = snapshot.toDataURL('image/png', 1.0);
        const ratio = Math.min(pageW / snapshot.width, pageH / snapshot.height);
        const drawW = snapshot.width * ratio;
        const drawH = snapshot.height * ratio;
        const offsetX = (pageW - drawW) / 2;
        const offsetY = (pageH - drawH) / 2;

        pdf.addImage(imgData, 'PNG', offsetX, offsetY, drawW, drawH, undefined, 'FAST');
        pdf.save('StudyNexus-Haftalik-Plan.pdf');
        window.showToast('PDF tam sayfa olarak indirildi.', 'success');
    } catch (err) {
        console.error('PDF hatası:', err);
        window.showToast('PDF oluşturulurken hata oluştu.', 'error');
    } finally {
        exportNode.stage.remove();
    }
};

// --- 3. DİNAMİK BİLDİRİM (TOAST) SİSTEMİ ---
window.showToast = function (message, type = 'success') {
    const bgColor = type === 'error' ? '#ef4444' : '#10b981'; // Hata ise kırmızı, başarı ise yeşil
    const toastHTML = `
        <div class="toast-message" style="background: ${bgColor};" id="dynamicToast_${Date.now()}">
            ${escapeHtml(message)}
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

let activeCourseFilter = null;
let topicSearchQuery = '';
let topicStatusFilter = 'all';

window.applyCourseTopicFilter = function () {
    document.querySelectorAll('#courseTagsContainer .course-pill[data-course-id]').forEach((pill) => {
        const pillId = pill.getAttribute('data-course-id');
        pill.classList.toggle('active', activeCourseFilter !== null && pillId === activeCourseFilter);
    });

    const query = topicSearchQuery.trim().toLowerCase();
    const items = document.querySelectorAll('#topicsContainer .draggable-item');
    let visibleCount = 0;
    items.forEach((item) => {
        const matchCourse = activeCourseFilter === null
            || item.getAttribute('data-course-id') === activeCourseFilter;
        const name = (item.getAttribute('data-topic-name') || '').toLowerCase();
        const matchSearch = !query || name.includes(query);
        const isDone = item.classList.contains('is-done');
        const matchStatus = topicStatusFilter === 'all'
            || (topicStatusFilter === 'done' && isDone)
            || (topicStatusFilter === 'todo' && !isDone);
        const show = matchCourse && matchSearch && matchStatus;
        item.style.display = show ? '' : 'none';
        if (show) visibleCount += 1;
    });

    const emptyHint = document.getElementById('topicsFilterEmpty');
    if (emptyHint) {
        const filtersActive = activeCourseFilter !== null || query !== '' || topicStatusFilter !== 'all';
        if (visibleCount === 0) {
            emptyHint.textContent = filtersActive ? 'Filtreyle eşleşen konu yok.' : 'Henüz konu yok.';
            emptyHint.style.display = filtersActive ? 'block' : 'none';
        } else {
            emptyHint.style.display = 'none';
        }
    }
};

window.setTopicSearch = function (value) {
    topicSearchQuery = value || '';
    window.applyCourseTopicFilter();
};

window.setTopicStatusFilter = function (status, btn) {
    topicStatusFilter = status;
    document.querySelectorAll('#topicStatusFilter button').forEach((b) => {
        b.classList.toggle('active', b === btn);
    });
    window.applyCourseTopicFilter();
};

window.filterPlans = function (value) {
    const query = (value || '').trim().toLowerCase();
    const container = document.querySelector('.left-sidebar .pile-container');
    if (container) container.classList.toggle('searching', query !== '');

    const papers = document.querySelectorAll('.left-sidebar .pile-container .pile-paper');
    let visible = 0;
    papers.forEach((paper) => {
        const title = (paper.querySelector('.pile-title')?.textContent || '').toLowerCase();
        const date = (paper.querySelector('.pile-date')?.textContent || '').toLowerCase();
        const show = !query || title.includes(query) || date.includes(query);
        paper.style.display = show ? '' : 'none';
        if (show) visible += 1;
    });

    const emptyEl = document.getElementById('planSearchEmpty');
    if (emptyEl) emptyEl.style.display = query !== '' && visible === 0 ? 'block' : 'none';
};

// Ders etiketine tıklayınca: seç, filtrele (tekrar tıklayınca tüm konular)
window.selectCourseInCombo = function (courseId) {
    const id = String(courseId);
    activeCourseFilter = activeCourseFilter === id ? null : id;

    const select = document.getElementById('topicCourseSelect');
    const input = document.getElementById('newTopicInput');
    if (select) {
        select.value = activeCourseFilter || courseId;
    }
    if (input && activeCourseFilter) {
        input.focus();
    }

    window.applyCourseTopicFilter();
};

// --- 5. VERİTABANI İŞLEM FONKSİYONLARI (AJAX) ---

window.updateStatsUI = function (stats) {
    if (!stats) return;
    const ring = document.getElementById('statsRing');
    const pct = document.getElementById('statsPercentText');
    const count = document.getElementById('statsCountText');
    const rows = document.getElementById('statsCourseRows');
    const trendBars = document.getElementById('statsTrendBars');
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
                <span>${escapeHtml(c.name)}</span>
                <div class="stats-bar"><div class="stats-bar-fill stats-bar-animated" style="width:${c.percent}%"></div></div>
                <span class="stats-pct">${c.percent}%</span>
            </div>`).join('');
    }
    if (trendBars && stats.trend) {
        trendBars.innerHTML = stats.trend.length
            ? stats.trend.map(point => `
                <div class="trend-bar-item" title="${escapeHtml(point.snapshot_date)} · ${point.overall_percent}%">
                    <div class="trend-bar-track">
                        <div class="trend-bar-fill" style="height:${Math.max(6, point.overall_percent)}%"></div>
                    </div>
                    <span>${escapeHtml(String(point.snapshot_date).slice(5))}</span>
                </div>`).join('')
            : '<p class="stats-muted">Trend için birkaç tamamlama kaydı oluşmalı.</p>';
    }
};

function popValue(el) {
    if (!el) return;
    el.classList.remove('xp-pop');
    void el.offsetWidth;
    el.classList.add('xp-pop');
    setTimeout(() => el.classList.remove('xp-pop'), 600);
}

window.updateGamificationUI = function (gamification) {
    if (!gamification) return;
    const card = document.getElementById('gamificationCard');
    const levelEl = document.getElementById('gamiLevel');
    const xpEl = document.getElementById('gamiXp');
    const streakEl = document.getElementById('gamiStreak');
    const bar = document.getElementById('gamiXpBar');
    const intoEl = document.getElementById('gamiXpInto');
    const forEl = document.getElementById('gamiXpFor');
    const toNextEl = document.getElementById('gamiXpToNext');
    const badges = document.getElementById('gamiBadges');

    const prevLevel = levelEl ? parseInt(levelEl.textContent, 10) || 0 : 0;
    const prevXp = xpEl ? parseInt(xpEl.textContent, 10) || 0 : 0;

    if (levelEl) levelEl.textContent = gamification.level;
    if (xpEl) {
        xpEl.textContent = gamification.xp;
        if (gamification.xp !== prevXp) popValue(xpEl);
    }
    if (streakEl) streakEl.textContent = gamification.streak;
    if (intoEl) intoEl.textContent = gamification.xpIntoLevel;
    if (forEl) forEl.textContent = gamification.xpForLevel;
    if (toNextEl) toNextEl.textContent = gamification.xpToNext;
    if (bar) {
        requestAnimationFrame(() => {
            bar.style.width = `${gamification.levelProgressPercent}%`;
        });
    }

    if (badges) {
        badges.innerHTML = (gamification.badges && gamification.badges.length)
            ? gamification.badges.map(b => `<span class="badge-pill">${b.icon} ${escapeHtml(b.label)}</span>`).join('')
            : '<span class="badge-pill muted">Rozetler yakında</span>';
    }

    if (card && gamification.level > prevLevel && prevLevel > 0) {
        card.classList.remove('level-up');
        void card.offsetWidth;
        card.classList.add('level-up');
        setTimeout(() => card.classList.remove('level-up'), 1000);
    }

    if (gamification.xp > prevXp) {
        window.showXpGainBar(prevXp, gamification);
    }
};

let xpGainTimers = [];
window.showXpGainBar = function (prevXp, gamification) {
    document.getElementById('xpGainOverlay')?.remove();
    xpGainTimers.forEach(clearTimeout);
    xpGainTimers = [];

    const leveledUp = gamification.level > Math.floor(prevXp / gamification.xpForLevel) + 1;
    const sameLevel = !leveledUp;
    const startPercent = sameLevel
        ? Math.round(((prevXp % gamification.xpForLevel) / gamification.xpForLevel) * 100)
        : 0;
    const endPercent = gamification.levelProgressPercent;
    const gained = gamification.xp - prevXp;

    const overlay = document.createElement('div');
    overlay.id = 'xpGainOverlay';
    overlay.className = 'xp-gain-overlay';
    overlay.innerHTML = `
        <div class="xp-gain-card">
            <div class="xp-gain-top">
                <span class="xp-gain-level">SEVİYE ${gamification.level}</span>
                <span class="xp-gain-amount">+${gained} XP</span>
            </div>
            <div class="xp-gain-track">
                <div class="xp-gain-fill"><span class="xp-gain-shine"></span></div>
            </div>
            <div class="xp-gain-status"></div>
        </div>`;
    document.body.appendChild(overlay);

    const fill = overlay.querySelector('.xp-gain-fill');
    const status = overlay.querySelector('.xp-gain-status');
    fill.style.width = `${startPercent}%`;

    requestAnimationFrame(() => {
        overlay.classList.add('show');
        requestAnimationFrame(() => {
            fill.style.width = `${leveledUp ? 100 : endPercent}%`;
        });
    });

    xpGainTimers.push(setTimeout(() => {
        if (leveledUp) fill.style.width = `${endPercent}%`;
        status.textContent = leveledUp ? `🎉 Seviye ${gamification.level}! İlerleme kaydedildi` : '✓ İlerleme kaydedildi';
        status.classList.add('show');
    }, 1100));

    xpGainTimers.push(setTimeout(() => {
        overlay.classList.remove('show');
    }, 2400));

    xpGainTimers.push(setTimeout(() => {
        overlay.remove();
    }, 2850));
};

window.confirmXpLoss = function (amount) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'xp-confirm-overlay';
        const lossText = amount ? `<span class="xp-confirm-amount">-${amount} XP</span> kaybedeceksin.` : 'XP ilerlemen düşecek.';
        overlay.innerHTML = `
            <div class="xp-confirm-box" role="dialog" aria-modal="true">
                <div class="xp-confirm-icon">⚠️</div>
                <h3>Emin misin?</h3>
                <p>Bu görevin işaretini kaldırırsan ${lossText}<br>Devam etmek istiyor musun?</p>
                <div class="xp-confirm-actions">
                    <button type="button" class="xp-confirm-cancel">Vazgeç</button>
                    <button type="button" class="xp-confirm-ok">Evet, geri al</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('show'));

        const close = (result) => {
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 220);
            resolve(result);
        };
        overlay.querySelector('.xp-confirm-cancel').addEventListener('click', () => close(false));
        overlay.querySelector('.xp-confirm-ok').addEventListener('click', () => close(true));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    });
};

window.renderWeekPanelUI = function (weekPanel) {
    const list = document.getElementById('weekTaskList');
    if (!list || !weekPanel?.hasPlan) return;

    if (!weekPanel.todayItems?.length) {
        list.innerHTML = '';
        return;
    }

    list.innerHTML = weekPanel.todayItems.map((item) => `
        <li class="${item.daily_completed ? 'is-done' : ''}" data-week-item-id="${item.id}">
            <button
                type="button"
                class="week-task-toggle"
                onclick="toggleWeekItemDone(${item.id}, ${item.daily_completed ? 'false' : 'true'}, this)"
                title="${item.daily_completed ? 'Geri al' : 'Bugün tamamlandı'}">
                ${item.daily_completed ? '✓' : '○'}
            </button>
            <span class="week-task-content">
                <strong>${escapeHtml(item.course_name)}</strong> — ${escapeHtml(item.topic_name)}
                ${item.description ? `<span class="week-task-desc">${escapeHtml(item.description)}</span>` : ''}
            </span>
        </li>
    `).join('');
};

window.refreshWeekPanelUI = function () {
    return fetch('/api/week-panel', { headers: { Accept: 'application/json' } })
        .then(res => res.json())
        .then(data => {
            if (data.success) window.renderWeekPanelUI(data.weekPanel);
            return data;
        });
};

window.toggleWeekItemDone = function (itemId, completed, btnElement) {
    fetch(`/api/week-item/${itemId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed })
    })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                if (data.stale) {
                    window.refreshWeekPanelUI?.();
                    window.showToast('Görev listesi güncellendi. Tekrar deneyin.', 'error');
                    return;
                }
                window.showToast(data.message || 'Görev güncellenemedi.', 'error');
                return;
            }

            const li = btnElement.closest('li');
            li?.classList.toggle('is-done', data.completed);
            btnElement.textContent = data.completed ? '✓' : '○';
            btnElement.title = data.completed ? 'Geri al' : 'Bugün tamamlandı';
            btnElement.setAttribute(
                'onclick',
                `toggleWeekItemDone(${itemId}, ${data.completed ? 'false' : 'true'}, this)`
            );
            window.setCanvasItemCompleted?.({
                planItemId: data.itemId,
                completed: data.completed
            });
            window.setWeekListItemCompleted?.({
                planItemId: data.itemId,
                completed: data.completed
            });
            window.updateStatsUI(data.stats);
            window.updateGamificationUI(data.gamification);
            window.renderWeekPanelUI?.(data.weekPanel);
            window.showToast(data.completed ? 'Bugünkü görev tamamlandı.' : 'Görev geri alındı.', 'success');
        })
        .catch(err => {
            console.error(err);
            window.showToast('Sunucu bağlantısı koptu.', 'error');
        });
};

window.toggleTopicDone = function (id, isCompleted, btnElement) {
    const run = () => {
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
                    window.setCanvasItemCompleted?.({
                        topicId: id,
                        completed: isCompleted
                    });
                    window.updateStatsUI(data.stats);
                    window.updateGamificationUI(data.gamification);
                    window.applyCourseTopicFilter?.();
                }
            }).catch(err => console.error(err));
    };

    if (!isCompleted) {
        window.confirmXpLoss(20).then((ok) => { if (ok) run(); });
        return;
    }
    run();
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
                window.updateStatsUI?.(data.stats);
                window.updateGamificationUI?.(data.gamification);
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
                if (activeCourseFilter === String(id)) {
                    activeCourseFilter = null;
                    window.applyCourseTopicFilter?.();
                }
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
                    <div class="course-pill" data-course-id="${data.id}" onclick="selectCourseInCombo(${data.id})" role="button" tabindex="0">
                        <span class="pill-text">${escapeHtml(data.name)}</span>
                        <button type="button" class="pill-delete-btn" onclick="event.stopPropagation(); deleteCourse(${data.id}, this)" title="Dersi Sil">×</button>
                    </div>
                `);
            }

            const select = document.getElementById('topicCourseSelect');
            if (select) {
                select.insertAdjacentHTML('beforeend', `<option value="${data.id}">${escapeHtml(data.name)}</option>`);
                select.value = data.id; // OTOMATİK SEÇ
            }

            input.value = '';
            activeCourseFilter = String(data.id);
            window.applyCourseTopicFilter?.();
            document.getElementById('newTopicInput')?.focus();
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
                <div class="draggable-item" draggable="true" data-topic-id="${data.id}" data-course-id="${data.courseId}" data-topic-name="${escapeHtml(data.name)}">
                    <span class="topic-label">${escapeHtml(data.name)}</span>
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
            window.applyCourseTopicFilter?.();
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
                description: item.querySelector('input[type="text"]')?.value.trim() || '',
                completed: item.querySelector('input[type="checkbox"]')?.checked || false
            });
        });
    });
    return planData;
};

window.setCanvasItemCompleted = function ({ topicId, planItemId, completed }) {
    const selectors = [];
    if (planItemId != null) {
        selectors.push(`.planned-item[data-plan-item-id="${planItemId}"]`);
    } else if (topicId != null) {
        selectors.push(`.planned-item[data-topic-id="${topicId}"]`);
    }
    if (!selectors.length) return;

    document.querySelectorAll(selectors.join(',')).forEach((item) => {
        item.classList.toggle('is-done', !!completed);
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = !!completed;
    });
};

window.setWeekListItemCompleted = function ({ planItemId, completed }) {
    if (planItemId == null) return;
    const li = document.querySelector(`#weekTaskList li[data-week-item-id="${planItemId}"]`);
    if (!li) return;

    const btn = li.querySelector('.week-task-toggle');
    li.classList.toggle('is-done', !!completed);
    if (btn) {
        btn.textContent = completed ? '✓' : '○';
        btn.title = completed ? 'Geri al' : 'Bugün tamamlandı';
        btn.setAttribute(
            'onclick',
            `toggleWeekItemDone(${planItemId}, ${completed ? 'false' : 'true'}, this)`
        );
    }
};

window.syncCanvasItemCompletion = function (plannedItem, completed) {
    const planItemId = plannedItem.getAttribute('data-plan-item-id');
    if (!planItemId || window.STUDYNEXUS_USER?.role !== 'student') {
        plannedItem.classList.toggle('is-done', completed);
        return;
    }

    fetch(`/api/week-item/${planItemId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed })
    })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                plannedItem.querySelector('input[type="checkbox"]').checked = !completed;
                plannedItem.classList.toggle('is-done', !completed);
                window.showToast(data.message || 'Görev güncellenemedi.', 'error');
                return;
            }

            window.setCanvasItemCompleted?.({
                planItemId: data.itemId,
                completed: data.completed
            });
            window.setWeekListItemCompleted?.({
                planItemId: data.itemId,
                completed: data.completed
            });
            window.updateStatsUI(data.stats);
            window.updateGamificationUI(data.gamification);
            window.showToast(data.completed ? 'Bugünkü görev tamamlandı.' : 'Görev geri alındı.', 'success');
        })
        .catch(err => {
            console.error(err);
            plannedItem.querySelector('input[type="checkbox"]').checked = !completed;
            plannedItem.classList.toggle('is-done', !completed);
            window.showToast('Sunucu bağlantısı koptu.', 'error');
        });
};

window.createPlannedItemElement = function (topicId, courseId, topicName, description = '', options = {}) {
    const plannedItem = document.createElement('div');
    plannedItem.classList.add('planned-item');
    if (options.completed) plannedItem.classList.add('is-done');
    plannedItem.setAttribute('draggable', 'true');
    plannedItem.setAttribute('data-topic-id', topicId);
    plannedItem.setAttribute('data-course-id', courseId || '');
    if (options.planItemId) plannedItem.setAttribute('data-plan-item-id', options.planItemId);

    plannedItem.innerHTML = `
        <input type="checkbox" title="Tamamlandı" ${options.completed ? 'checked' : ''}>
        <span class="item-title">${escapeHtml(topicName)}</span>
        <input type="text" placeholder="Açıklama ekleyin..." value="${escapeHtml(description ?? '')}">
        <button class="delete-item-btn" title="Bu planı sil">✕</button>
    `;

    plannedItem.addEventListener('dragstart', () => plannedItem.classList.add('dragging'));
    plannedItem.addEventListener('dragend', () => plannedItem.classList.remove('dragging'));
    plannedItem.querySelector('input[type="checkbox"]').addEventListener('change', (event) => {
        const checked = event.target.checked;
        plannedItem.classList.toggle('is-done', checked);
        window.syncCanvasItemCompletion?.(plannedItem, checked);
    });
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
    const createNewBtn = document.getElementById('createNewBtn');
    if (createNewBtn) createNewBtn.style.display = 'flex';
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
        <div class="pile-title">${escapeHtml(title)}</div>
        <div class="pile-date">${escapeHtml(dateRange)}</div>
    `;
    newPaper.setAttribute('data-open-plan', '');
    newPaper.setAttribute('data-plan-id', planId);
    newPaper.setAttribute('role', 'button');
    newPaper.setAttribute('tabindex', '0');
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

                window.renderWeekPanelUI?.(data.weekPanel);

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
            item.description || '',
            {
                planItemId: item.id,
                completed: Boolean(item.daily_completed || item.is_completed)
            }
        );
        zone.appendChild(el);
        window.updateZoneLayout(zone);
    });

    window.setReadOnlyMode(readOnly);
    window.updateCanvasPlanActions(editingId, readOnly);

    a4Canvas.classList.add('active');
    const createNewBtn = document.getElementById('createNewBtn');
    if (createNewBtn) createNewBtn.style.display = 'none';
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
    const fromBody = document.body?.dataset?.studentViewId;
    const studentId = view?.studentId || (fromBody ? Number(fromBody) : null);
    if (studentId && (view?.mode === 'teacher-student' || fromBody)) {
        return {
            studentId,
            readOnly: view?.readOnly !== false || !!fromBody
        };
    }
    return null;
};

window.bindPlanOpenHandlers = function () {
    if (document.body.dataset.planOpenBound === '1') return;
    document.body.dataset.planOpenBound = '1';

    document.body.addEventListener('click', (e) => {
        const target = e.target.closest('[data-open-plan][data-plan-id]');
        if (!target) return;

        const planId = target.getAttribute('data-plan-id');
        const studentId =
            target.getAttribute('data-student-plan-for') ||
            document.body.dataset.studentViewId ||
            window.getStudentViewContext()?.studentId;

        if (studentId) {
            window.editWeeklyPlan(planId, {
                studentId: Number(studentId),
                readOnly: true
            });
        } else {
            window.editWeeklyPlan(planId);
        }
    });

    document.body.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const target = e.target.closest('.pile-paper[data-open-plan][data-plan-id]');
        if (!target) return;
        e.preventDefault();
        target.click();
    });
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

    fetch(url, { headers: { Accept: 'application/json' } })
        .then(async (res) => {
            let data;
            try {
                data = await res.json();
            } catch {
                throw new Error('invalid_json');
            }
            if (!res.ok || !data.success) {
                window.showToast(data?.message || 'Plan yüklenemedi.', 'error');
                return;
            }

            const readOnly = forceReadOnly || !!data.readOnly;

            try {
                window.applyPlanToCanvas(data, {
                    readOnly,
                    editingId: readOnly ? '' : String(planId)
                });
            } catch (applyErr) {
                console.error('Tuval güncellenemedi:', applyErr);
                window.showToast('Plan yüklendi ama tuvalde gösterilemedi.', 'error');
                return;
            }

            const canvasEl = document.getElementById('a4Canvas');
            if (studentId) canvasEl.setAttribute('data-view-student-id', studentId);
            else canvasEl.removeAttribute('data-view-student-id');

            window.showAppPanel?.('planner');
            const label = viewCtx?.studentName || window.STUDYNEXUS_VIEW?.studentName || 'Öğrenci';
            if (readOnly && studentId) {
                window.showToast(`${label} — program görüntüleniyor.`, 'success');
            } else if (!readOnly) {
                window.showToast('Plan düzenleme modunda.', 'success');
            }
        })
        .catch((err) => {
            console.error('Plan yükleme hatası:', err, url);
            window.showToast('Sunucu bağlantı hatası.', 'error');
        });
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
function parseMonthSlotValue(value) {
    const raw = String(value || '');
    const [yearPart, ...monthParts] = raw.split('|');
    const month = monthParts.join('|') || raw;
    const year = Number(yearPart);
    return {
        year: Number.isFinite(year) && year > 1970 ? year : new Date().getFullYear(),
        month
    };
}

window.confirmCalendarAssignment = function () {
    const planId = document.getElementById('calendarModal').getAttribute('data-plan-id');
    const monthValue = document.getElementById('calMonthSelect').value;
    const week = document.getElementById('selectedWeekValue').value;
    const { year, month } = parseMonthSlotValue(monthValue);

    fetch('/assign-to-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, month: monthValue, week, year })
    })
        .then(res => res.json())
        .then(data => {

            if (data.success) {
                window.showToast(data.message || 'Plan takvime eklendi.', 'success');
                window.closeCalendarModal();

                if (data.previousSlot) {
                    const oldBox = document.getElementById(
                        `cal-box-${data.previousSlot.year}-${data.previousSlot.month}-${data.previousSlot.week}`
                    );
                    if (oldBox) {
                        oldBox.classList.remove('filled');
                        oldBox.classList.add('empty');
                        oldBox.removeAttribute('data-plan-id');
                        oldBox.removeAttribute('data-open-plan');
                        oldBox.querySelector('.week-indicator')?.remove();
                    }
                }

                const boxId = `cal-box-${data.year || year}-${data.month || month}-${data.week || week}`;
                const box = document.getElementById(boxId);
                if (box) {
                    box.classList.remove('empty');
                    box.classList.add('filled');
                    box.title = 'Atanan Plan';

                    box.setAttribute('data-plan-id', planId);
                    box.setAttribute('data-open-plan', '');

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
                if (d.code) {
                    const codeEl = document.getElementById('coachCodeDisplay');
                    if (codeEl) codeEl.textContent = d.code;
                    const copyBtn = document.getElementById('heroCopyCode');
                    if (copyBtn) {
                        copyBtn.onclick = () => {
                            navigator.clipboard?.writeText(d.code)
                                .then(() => window.showToast('Davet kodu kopyalandı.', 'success'))
                                .catch(() => window.showToast('Kopyalanamadı, kodu elle seçin.', 'error'));
                        };
                    }
                }
            });
        fetch('/api/coaching/students')
            .then(r => r.json())
            .then(d => {
                const list = document.getElementById('teacherStudentsList');
                if (!list || !d.success) return;

                const countEl = document.getElementById('teacherStudentCount');
                if (countEl) countEl.textContent = d.students.length;
                const subEl = document.getElementById('teacherStudentsSub');
                if (subEl) subEl.textContent = d.students.length ? `${d.students.length} öğrenci bağlı` : '';

                if (!d.students.length) {
                    list.innerHTML = '<li class="teacher-empty">Henüz öğrenci yok. Davet kodunu paylaşın.</li>';
                    return;
                }
                list.innerHTML = d.students.map(s => `
                    <li class="teacher-student-card">
                        <a href="/teacher/student/${s.id}" class="teacher-student-card-link">
                            <div class="teacher-student-head">
                                <strong>${escapeHtml(s.full_name || s.username)}</strong>
                                <span class="teacher-student-pct">${s.stats.percent}%</span>
                            </div>
                            <p class="teacher-student-meta">${s.stats.completedTopics}/${s.stats.totalTopics} konu · Programlar & takvim</p>
                        </a>
                    </li>`).join('');
                const sel = document.getElementById('assignStudentModalSelect');
                if (sel) {
                    sel.innerHTML = '<option value="">Öğrenci seç...</option>' +
                        d.students.map(s => `<option value="${s.id}">${escapeHtml(s.full_name || s.username)}</option>`).join('');
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
                    : d.teachers.map(t => `<li><strong>${escapeHtml(t.full_name || t.username)}</strong>${t.branch ? ' — ' + escapeHtml(t.branch) : ''}</li>`).join('');
            });
        fetch('/api/coaching/feedback')
            .then(r => r.json())
            .then(d => {
                const list = document.getElementById('studentFeedbackList');
                if (!list || !d.success) return;
                list.innerHTML = d.feedback.length
                    ? d.feedback.map(item => `<li><strong>${escapeHtml(item.full_name || item.username)}</strong>: ${escapeHtml(item.message)}</li>`).join('')
                    : '<li>Henüz geri bildirim yok.</li>';
            });
    }
};

window.submitStudentFeedback = function (studentId) {
    const input = document.getElementById('studentFeedbackInput');
    const message = input?.value.trim();
    if (!message) return window.showToast('Geri bildirim boş olamaz.', 'error');

    const planId = document.getElementById('a4Canvas')?.getAttribute('data-editing-id') || null;
    fetch(`/api/coaching/students/${studentId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, planId })
    })
        .then(r => r.json())
        .then(d => {
            if (!d.success) return window.showToast(d.message || 'Geri bildirim kaydedilemedi.', 'error');
            const list = document.getElementById('teacherFeedbackList');
            if (list) {
                list.insertAdjacentHTML('afterbegin', `<li><strong>Siz</strong>: ${escapeHtml(message)}</li>`);
            }
            input.value = '';
            window.showToast('Geri bildirim gönderildi.', 'success');
        })
        .catch(() => window.showToast('Sunucu bağlantısı koptu.', 'error'));
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
    const monthValue = document.getElementById('assignMonthSelect').value;
    const week = document.getElementById('assignWeekValue').value;
    const { year } = parseMonthSlotValue(monthValue);
    if (!studentId) return window.showToast('Öğrenci seçin.', 'error');

    fetch('/api/coaching/assign-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, planId, month: monthValue, week, year })
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
    window.initStudyTimer?.();
});

// --- ÇALIŞMA SAYACI (POMODORO) ---
let stTotalSeconds = 30 * 60;
let stRemaining = stTotalSeconds;
let stInterval = null;
let stRunning = false;
let stLabel = 'Pomodoro';
let stIsBreak = false;

function stRenderClock() {
    const clock = document.getElementById('studyTimerClock');
    if (!clock) return;
    const m = String(Math.floor(stRemaining / 60)).padStart(2, '0');
    const s = String(stRemaining % 60).padStart(2, '0');
    clock.textContent = `${m}:${s}`;
}

function stSetToggleBtn(text) {
    const btn = document.getElementById('studyTimerToggleBtn');
    if (btn) btn.textContent = text;
}

function stSetTopBtnRunning(running) {
    document.getElementById('timerToggleBtn')?.classList.toggle('running', running);
}

window.toggleStudyTimer = function (force) {
    const el = document.getElementById('studyTimer');
    if (!el) return;
    const show = force === undefined ? !el.classList.contains('open') : force;
    el.classList.toggle('open', show);
};

window.studyTimerSetPreset = function (minutes, label, btn, isBreak = false) {
    stPauseTimer();
    stTotalSeconds = minutes * 60;
    stRemaining = stTotalSeconds;
    stLabel = label;
    stIsBreak = !!isBreak;
    document.querySelectorAll('.st-preset').forEach((b) => b.classList.toggle('active', b === btn));
    const status = document.getElementById('studyTimerStatus');
    if (status) {
        status.textContent = `${label} · ${minutes} dk`;
        status.className = 'study-timer-status';
    }
    document.getElementById('studyTimerClock')?.classList.remove('done');
    stRenderClock();
};

window.studyTimerSetCustom = function () {
    const input = document.getElementById('studyTimerCustomInput');
    const minutes = parseInt(input?.value, 10);
    if (!Number.isFinite(minutes) || minutes < 1) {
        window.showToast?.('Lütfen 1 ile 600 arasında dakika girin.', 'error');
        return;
    }
    const safe = Math.min(minutes, 600);
    stPauseTimer();
    stTotalSeconds = safe * 60;
    stRemaining = stTotalSeconds;
    stLabel = 'Özel';
    stIsBreak = false;
    document.querySelectorAll('.st-preset').forEach((b) => b.classList.remove('active'));
    const status = document.getElementById('studyTimerStatus');
    if (status) {
        status.textContent = `Özel · ${safe} dk`;
        status.className = 'study-timer-status';
    }
    document.getElementById('studyTimerClock')?.classList.remove('done');
    stRenderClock();
};

function stTick() {
    if (stRemaining > 0) {
        stRemaining -= 1;
        stRenderClock();
        if (stRemaining === 0) stFinishTimer();
    }
}

window.studyTimerStartPause = function () {
    if (stRunning) {
        stPauseTimer();
        return;
    }
    if (stRemaining <= 0) stRemaining = stTotalSeconds;
    stRunning = true;
    stSetToggleBtn('Duraklat');
    stSetTopBtnRunning(true);
    const status = document.getElementById('studyTimerStatus');
    if (status) {
        status.textContent = `${stLabel} · çalışıyor`;
        status.className = 'study-timer-status';
    }
    document.getElementById('studyTimerClock')?.classList.remove('done');
    stInterval = setInterval(stTick, 1000);
};

function stPauseTimer() {
    stRunning = false;
    if (stInterval) clearInterval(stInterval);
    stInterval = null;
    stSetToggleBtn('Başlat');
    stSetTopBtnRunning(false);
}

window.studyTimerReset = function () {
    stPauseTimer();
    stRemaining = stTotalSeconds;
    const status = document.getElementById('studyTimerStatus');
    if (status) {
        status.textContent = 'Hazır';
        status.className = 'study-timer-status';
    }
    document.getElementById('studyTimerClock')?.classList.remove('done');
    stRenderClock();
};

function stFinishTimer() {
    const wasStudy = !stIsBreak;
    const finishedMinutes = Math.round(stTotalSeconds / 60);
    stPauseTimer();
    document.getElementById('studyTimerClock')?.classList.add('done');
    const status = document.getElementById('studyTimerStatus');
    if (status) {
        status.textContent = wasStudy ? '⏰ Süre doldu — Mola vakti!' : '✅ Mola bitti — Devam!';
        status.className = 'study-timer-status done';
    }
    stPlayBeep();
    window.toggleStudyTimer(true);

    if (wasStudy && window.STUDYNEXUS_USER?.role === 'student' && finishedMinutes > 0) {
        window.showToast?.('🍅 Pomodoro tamamlandı! +XP kazandın 🎉', 'success');
        fetch('/api/pomodoro/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ minutes: finishedMinutes })
        })
            .then((r) => r.json())
            .then((d) => {
                if (!d.success) return;
                window.updateStatsUI?.(d.stats);
                window.updateGamificationUI?.(d.gamification);
                window.updatePomodoroCount?.(d.gamification?.pomodoros);
            })
            .catch(() => {});
    } else {
        window.showToast?.('⏰ Süre doldu!', 'success');
    }
}

window.updatePomodoroCount = function (pomodoros) {
    if (!pomodoros) return;
    const el = document.getElementById('studyTimerCount');
    if (el) el.textContent = `Bugün: ${pomodoros.today} 🍅 · Toplam: ${pomodoros.total}`;
};

function stPlayBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const beepAt = (t, freq) => {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.connect(g);
            g.connect(ctx.destination);
            o.type = 'sine';
            o.frequency.value = freq;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
            o.start(t);
            o.stop(t + 0.47);
        };
        const now = ctx.currentTime;
        beepAt(now, 880);
        beepAt(now + 0.5, 988);
        beepAt(now + 1.0, 1175);
    } catch (e) {
        /* ses çalınamazsa sessizce geç */
    }
}

window.initStudyTimer = function () {
    if (!document.getElementById('studyTimer')) return;
    stRenderClock();
    if (window.STUDYNEXUS_USER?.role === 'student') {
        fetch('/api/stats', { headers: { Accept: 'application/json' } })
            .then((r) => r.json())
            .then((d) => {
                if (d.success) window.updatePomodoroCount?.(d.gamification?.pomodoros);
            })
            .catch(() => {});
    }
};