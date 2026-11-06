// Tool tabs (Interior check / Cover calculator): ARIA tabs with arrow-key navigation.
// The selected tab is kept in the URL hash (#calculator), so a link or a reload opens the same tool.

export function initTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const byHash = new Map(tabs.map((t) => [t.dataset.hash, t]));

  const select = (tab, { focus = false, updateHash = true } = {}) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    }
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
}
