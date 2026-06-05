/** Sekme tabanlı ana menü — yer imi kaydırması yerine panel değişimi */
export function initAppNav() {
    const nav = document.querySelector('.app-nav');
    if (!nav) return;

    const chips = nav.querySelectorAll('.nav-chip[data-panel]');
    const panels = document.querySelectorAll('.app-panel');

    function showPanel(panelId) {
        panels.forEach((p) => {
            p.classList.toggle('active', p.id === `panel-${panelId}`);
        });
        chips.forEach((c) => {
            c.classList.toggle('active', c.dataset.panel === panelId);
        });
    }

    chips.forEach((chip) => {
        chip.addEventListener('click', (e) => {
            e.preventDefault();
            showPanel(chip.dataset.panel);
        });
    });

    const defaultPanel = nav.dataset.defaultPanel || chips[0]?.dataset.panel;
    if (defaultPanel) showPanel(defaultPanel);

    window.showAppPanel = showPanel;
    return { showPanel };
}
