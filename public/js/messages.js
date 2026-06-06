const chatState = {
    threadId: null,
    teacherId: null,
    studentId: null,
    partnerId: null,
    pollTimer: null
};

function esc(str) {
    return window.escapeHtml ? window.escapeHtml(str) : String(str ?? '');
}

function displayName(user) {
    return user?.full_name || user?.username || 'Kullanıcı';
}

function avatarLetter(name) {
    const ch = String(name || '?').trim().charAt(0);
    return ch ? ch.toUpperCase() : '?';
}

function formatChatTime(iso) {
    if (!iso) return '';
    const date = new Date(iso.includes('T') || iso.includes('Z') ? iso : `${iso.replace(' ', 'T')}Z`);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const sameDay =
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();
    if (sameDay) {
        return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function setBadgeCount(el, count) {
    if (!el) return;
    const n = Number(count) || 0;
    if (n > 0) {
        el.textContent = n > 99 ? '99+' : String(n);
        el.hidden = false;
    } else {
        el.hidden = true;
    }
}

function updateChatUnreadBadge(count) {
    if (window.STUDYNEXUS_USER?.role === 'teacher') {
        refreshTeacherFloatUnread();
    } else {
        setBadgeCount(document.getElementById('coachingUnreadBadge'), count);
    }
}

async function refreshTeacherFloatUnread() {
    const badge = document.getElementById('chatFloatBadge');
    if (!badge || window.STUDYNEXUS_USER?.role !== 'teacher') return;

    try {
        const res = await fetch('/api/messages/threads', { headers: { Accept: 'application/json' } });
        const data = await res.json();
        if (!data.success) return;

        const studentId = window.STUDYNEXUS_VIEW?.studentId;
        const count = studentId
            ? data.threads?.find((t) => t.student_id === studentId)?.unread_count || 0
            : data.unread || 0;
        setBadgeCount(badge, count);
    } catch {
        /* sessiz */
    }
}

window.toggleChatFloat = function (force) {
    const panel = document.getElementById('chatFloatPanel');
    if (!panel) return;
    const show = force === undefined ? !panel.classList.contains('open') : force;
    panel.classList.toggle('open', show);
    if (show) {
        const studentId = window.STUDYNEXUS_VIEW?.studentId;
        if (studentId) {
            chatState.studentId = studentId;
            openChatThread({ studentId });
        }
        document.getElementById('chatInput')?.focus();
    }
};

function setChatPartner(partner, roleHint) {
    const name = displayName(partner);
    const nameEl = document.getElementById('chatPartnerName');
    const subEl = document.getElementById('chatPartnerSub');
    const avatarEl = document.getElementById('chatPartnerAvatar');
    if (nameEl) nameEl.textContent = name;
    if (avatarEl) avatarEl.textContent = avatarLetter(name);
    if (subEl) {
        if (window.STUDYNEXUS_USER?.role === 'teacher') {
            subEl.textContent = partner?.grade ? `${partner.grade} · Öğrenci` : 'Öğrenci';
        } else {
            subEl.textContent = partner?.branch ? `${partner.branch} · Koç` : roleHint || 'Koç';
        }
    }
}

function renderChatBubble(msg, currentUserId) {
    const mine = msg.sender_id === currentUserId;
    const senderName = displayName(msg);
    const time = formatChatTime(msg.created_at);
    const readMark =
        mine && msg.read_at
            ? '<span class="chat-read-mark">Okundu</span>'
            : mine
              ? '<span class="chat-read-mark pending">İletildi</span>'
              : '';

    return `<div class="chat-bubble-row ${mine ? 'mine' : 'theirs'}">
        ${!mine ? `<span class="chat-bubble-avatar">${avatarLetter(senderName)}</span>` : ''}
        <div class="chat-bubble-wrap">
            ${!mine ? `<span class="chat-bubble-name">${esc(senderName)}</span>` : ''}
            <div class="chat-bubble">${esc(msg.body)}</div>
            <div class="chat-bubble-meta">
                <span class="chat-bubble-time">${time}</span>
                ${readMark}
            </div>
        </div>
    </div>`;
}

function renderChatMessages(messages) {
    const box = document.getElementById('chatMessages');
    if (!box) return;
    const userId = window.STUDYNEXUS_USER?.id;
    if (!messages?.length) {
        box.innerHTML = `<div class="chat-empty" id="chatEmptyState">
            <span class="chat-empty-icon">💬</span>
            <p>Henüz mesaj yok.</p>
            <span class="chat-empty-hint">İlk mesajı göndererek sohbeti başlatın.</span>
        </div>`;
        return;
    }
    box.innerHTML = messages.map((m) => renderChatBubble(m, userId)).join('');
    scrollChatToBottom();
}

function scrollChatToBottom() {
    const box = document.getElementById('chatMessages');
    if (box) box.scrollTop = box.scrollHeight;
}

function renderChatTabs(threads, activeTeacherId) {
    const tabs = document.getElementById('chatThreadTabs');
    if (!tabs) return;
    if (!threads || threads.length <= 1) {
        tabs.hidden = true;
        tabs.innerHTML = '';
        return;
    }
    tabs.hidden = false;
    tabs.innerHTML = threads
        .map((t) => {
            const name = displayName(t);
            const active = t.teacher_id === activeTeacherId ? ' active' : '';
            const unread = t.unread_count > 0 ? `<span class="chat-tab-badge">${t.unread_count}</span>` : '';
            return `<button type="button" class="chat-tab${active}" data-teacher-id="${t.teacher_id}" onclick="selectChatTeacher(${t.teacher_id})">${esc(name)}${unread}</button>`;
        })
        .join('');
}

async function openChatThread({ teacherId, studentId } = {}) {
    const params = new URLSearchParams();
    if (teacherId) params.set('teacherId', teacherId);
    if (studentId) params.set('studentId', studentId);

    try {
        const res = await fetch(`/api/messages/thread?${params}`, {
            headers: { Accept: 'application/json' }
        });
        const data = await res.json();
        if (!data.success) {
            window.showToast?.(data.message || 'Sohbet yüklenemedi.', 'error');
            return;
        }

        chatState.threadId = data.thread.id;
        chatState.teacherId = data.thread.teacher_id;
        chatState.studentId = data.thread.student_id;
        chatState.partnerId =
            window.STUDYNEXUS_USER?.role === 'teacher'
                ? data.thread.student_id
                : data.thread.teacher_id;

        setChatPartner(data.partner);
        renderChatMessages(data.messages);
        updateChatUnreadBadge(data.unread);
        window.loadNotifications?.();
    } catch {
        window.showToast?.('Sunucu bağlantısı koptu.', 'error');
    }
}

async function loadStudentChatThreads() {
    try {
        const res = await fetch('/api/messages/threads', { headers: { Accept: 'application/json' } });
        const data = await res.json();
        if (!data.success) return;

        updateChatUnreadBadge(data.unread);
        const threads = data.threads || [];
        if (!threads.length) return;

        const activeId = chatState.teacherId || threads[0].teacher_id;
        renderChatTabs(threads, activeId);
        await openChatThread({ teacherId: activeId });
    } catch {
        /* sessiz */
    }
}

window.selectChatTeacher = function (teacherId) {
    chatState.teacherId = teacherId;
    document.querySelectorAll('.chat-tab').forEach((tab) => {
        tab.classList.toggle('active', Number(tab.dataset.teacherId) === teacherId);
    });
    openChatThread({ teacherId });
};

window.sendChatMessage = async function () {
    const input = document.getElementById('chatInput');
    const body = input?.value.trim();
    if (!body) return;

    if (!chatState.threadId) {
        const teacherId = chatState.teacherId;
        const viewStudentId = window.STUDYNEXUS_VIEW?.studentId;
        if (window.STUDYNEXUS_USER?.role === 'teacher' && viewStudentId) {
            await openChatThread({ studentId: viewStudentId });
        } else if (teacherId) {
            await openChatThread({ teacherId });
        }
        if (!chatState.threadId) {
            window.showToast?.('Önce koça bağlanın.', 'error');
            return;
        }
    }

    const sendBtn = document.getElementById('chatSendBtn');
    if (sendBtn) sendBtn.disabled = true;

    try {
        const res = await fetch(`/api/messages/thread/${chatState.threadId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body })
        });
        const data = await res.json();
        if (!data.success) {
            window.showToast?.(data.message || 'Mesaj gönderilemedi.', 'error');
            return;
        }

        const box = document.getElementById('chatMessages');
        const empty = document.getElementById('chatEmptyState');
        if (empty) empty.remove();
        if (box) {
            box.insertAdjacentHTML('beforeend', renderChatBubble(data.message, window.STUDYNEXUS_USER.id));
            scrollChatToBottom();
        }
        if (input) {
            input.value = '';
            input.style.height = 'auto';
        }
        updateChatUnreadBadge(data.unread);
    } catch {
        window.showToast?.('Sunucu bağlantısı koptu.', 'error');
    } finally {
        if (sendBtn) sendBtn.disabled = false;
    }
};

async function refreshActiveChat() {
    if (!chatState.threadId) return;
    const params = new URLSearchParams();
    if (window.STUDYNEXUS_USER?.role === 'teacher') {
        params.set('studentId', chatState.studentId);
    } else {
        params.set('teacherId', chatState.teacherId);
    }
    try {
        const res = await fetch(`/api/messages/thread?${params}`, {
            headers: { Accept: 'application/json' }
        });
        const data = await res.json();
        if (!data.success) return;
        renderChatMessages(data.messages);
        updateChatUnreadBadge(data.unread);
    } catch {
        /* sessiz */
    }
}

function decorateTeacherStudentCards(threads) {
    if (!threads?.length) return;
    const map = new Map(threads.map((t) => [t.student_id, t.unread_count || 0]));
    document.querySelectorAll('.teacher-student-card').forEach((card) => {
        const link = card.querySelector('a[href*="/teacher/student/"]');
        if (!link) return;
        const match = link.getAttribute('href')?.match(/\/teacher\/student\/(\d+)/);
        if (!match) return;
        const unread = map.get(Number(match[1])) || 0;
        let badge = card.querySelector('.teacher-student-unread');
        if (unread > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'teacher-student-unread';
                card.querySelector('.teacher-student-head')?.appendChild(badge);
            }
            badge.textContent = unread > 9 ? '9+' : String(unread);
            badge.hidden = false;
        } else if (badge) {
            badge.hidden = true;
        }
    });
}

async function loadTeacherMessageBadges() {
    if (window.STUDYNEXUS_USER?.role !== 'teacher') return;
    try {
        const res = await fetch('/api/messages/threads', { headers: { Accept: 'application/json' } });
        const data = await res.json();
        if (data.success) decorateTeacherStudentCards(data.threads);
    } catch {
        /* sessiz */
    }
}

function setupChatComposer() {
    const input = document.getElementById('chatInput');
    if (!input) return;
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            window.sendChatMessage();
        }
    });
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
    });
}

function startChatPolling() {
    if (chatState.pollTimer) clearInterval(chatState.pollTimer);
    chatState.pollTimer = setInterval(() => {
        const user = window.STUDYNEXUS_USER;
        if (!user) return;

        if (user.role === 'teacher' && document.getElementById('chatFloatBadge')) {
            refreshTeacherFloatUnread();
            const floatOpen = document.getElementById('chatFloatPanel')?.classList.contains('open');
            if (floatOpen && chatState.threadId) refreshActiveChat();
            return;
        }

        const panel = document.getElementById('chatPanel');
        const coachingPanel = document.getElementById('panel-coaching');
        if (panel && coachingPanel?.classList.contains('active') && chatState.threadId) {
            refreshActiveChat();
        }
    }, 12000);
}

export function initChat() {
    if (!document.getElementById('chatPanel')) return;

    setupChatComposer();
    startChatPolling();

    const user = window.STUDYNEXUS_USER;
    if (!user) return;

    if (user.role === 'teacher') {
        const studentId = window.STUDYNEXUS_VIEW?.studentId;
        if (studentId) {
            chatState.studentId = studentId;
            refreshTeacherFloatUnread();
        } else {
            loadTeacherMessageBadges();
        }
    } else if (user.role === 'student') {
        loadStudentChatThreads();
        document.getElementById('coachingNavChip')?.addEventListener('click', () => {
            loadStudentChatThreads();
        });
    }
}

document.addEventListener('DOMContentLoaded', initChat);

window.initChat = initChat;
window.loadTeacherMessageBadges = loadTeacherMessageBadges;
window.refreshStudentChat = loadStudentChatThreads;
