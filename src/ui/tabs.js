// Tool tabs (Interior / Cover / Spine & size): ARIA tabs with arrow-key navigation.
// The selected tab is kept in the URL hash (#calculator), so a link or a reload opens the same tool.
// Motion: one indicator glides to the selected tab, and the new panel slides in from the side it sits on
// with a short blur-to-sharp. Both are CSS (transform/opacity); this file only measures and sets variables.

export function initTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const byHash = new Map(tabs.map((t) => [t.dataset.hash, t]));
  const bar = tabs[0].parentElement;
  const ind = bar.querySelector('.tabs__ind');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let current = tabs.find((t) => t.getAttribute('aria-selected') === 'true') ?? tabs[0];

  /** Put the indicator under a tab. `instant` skips the glide (first paint, resize). */
  const place = (tab, instant) => {
    if (!ind) return;
    const inset = parseFloat(getComputedStyle(bar).getPropertyValue('--inset')) || 0;
    if (instant) ind.classList.add('is-placing');
    ind.style.setProperty('--x', `${tab.offsetLeft + inset}px`);
    ind.style.setProperty('--w', String(Math.max(tab.offsetWidth - 2 * inset, 0)));
    if (instant) { void ind.offsetWidth; ind.classList.remove('is-placing'); }
  };

  const select = (tab, { focus = false, updateHash = true } = {}) => {
    const from = tabs.indexOf(current);
    const to = tabs.indexOf(tab);
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
    place(tab, reduce.matches);
    if (tab !== current) {
      // Content arrives from the side the tab sits on: later tab = from the right.
      const panel = document.getElementById(tab.getAttribute('aria-controls'));
      panel.style.setProperty('--dx', to > from ? '28px' : '-28px');
      panel.classList.remove('is-entering');
      void panel.offsetWidth; // restart the animation
      panel.classList.add('is-entering');
      panel.addEventListener('animationend', () => panel.classList.remove('is-entering'), { once: true });
    }
    current = tab;
    if (focus) tab.focus();
    if (updateHash) {
      const hash = tab === tabs[0] ? '' : `#${tab.dataset.hash}`;
      history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
    }
  };

  for (const tab of tabs) {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(tab);
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next == null) return;
      e.preventDefault();
      select(tabs[(next + tabs.length) % tabs.length], { focus: true });
    });
  }

  const fromHash = () => {
    const tab = byHash.get(location.hash.slice(1));
    if (tab) select(tab, { updateHash: false });
  };
  addEventListener('hashchange', fromHash);
  fromHash();
  place(current, true);
  // Re-measure when the layout changes (rotation, font swap, window resize) without gliding.
  new ResizeObserver(() => place(current, true)).observe(bar);
  document.fonts?.ready.then(() => place(current, true));
}
