(function () {
    const STORAGE_KEY = 'studynexus-theme';

    function getTheme() {
        return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    function applyTheme(theme) {
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        updateToggleButtons(theme);
        updateWelcomePoster(theme);
    }

    function updateWelcomePoster(theme) {
        document.querySelectorAll('.welcome-poster[data-poster-dark]').forEach((img) => {
            const lightSrc = img.dataset.posterLight;
            const darkSrc = img.dataset.posterDark;
            if (!lightSrc || !darkSrc) return;
            img.src = theme === 'dark' ? darkSrc : lightSrc;
        });
    }

    function updateToggleButtons(theme) {
        document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
            const isDark = theme === 'dark';
            btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
            btn.title = isDark ? 'Açık moda geç' : 'Karanlık moda geç';
            const darkIcon = btn.querySelector('.theme-toggle-img--dark');
            const brightIcon = btn.querySelector('.theme-toggle-img--bright');
            if (darkIcon) darkIcon.hidden = isDark;
            if (brightIcon) brightIcon.hidden = !isDark;
        });
    }

    function initTheme() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const theme = stored || (prefersDark ? 'dark' : 'light');
            applyTheme(theme);
        } catch {
            applyTheme('light');
        }
    }

    window.toggleStudyNexusTheme = function () {
        const next = getTheme() === 'dark' ? 'light' : 'dark';
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {}
        applyTheme(next);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTheme);
    } else {
        initTheme();
    }
})();
