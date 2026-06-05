/** HTML kaçışı — innerHTML enjeksiyonunu önler */
export function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getCsrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
}

const nativeFetch = window.fetch.bind(window);

window.fetch = function (input, init = {}) {
    const method = (init.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
        const headers = new Headers(init.headers || {});
        if (!headers.has('X-CSRF-Token')) {
            const token = getCsrfToken();
            if (token) headers.set('X-CSRF-Token', token);
        }
        init = { ...init, headers };
    }
    return nativeFetch(input, init);
};

window.escapeHtml = escapeHtml;
