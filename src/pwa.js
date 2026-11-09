// Service worker registration. A new version installs in the background, takes control at once
// (skipWaiting + clientsClaim in vite.config.js), and the page reloads once onto it, so nobody keeps using an
// old version after a deploy. Offline use keeps working: the service worker still serves the cached app.
//
// The reload is skipped while a check is running or a check report is on screen (it would wipe the report);
// the new version is then used on the next visit. Browsers don't always look for a new version on page load,
// so we ask after registering and whenever the tab comes back into view.
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const hadController = Boolean(navigator.serviceWorker.controller); // false on a first visit: nothing old on screen
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    if (document.querySelector('.working, #result .report, #cover-result .report')) return;
    reloaded = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => {
        const check = () => reg.update().catch(() => {}); // offline: nothing to fetch, keep the cached version
        check();
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      })
      .catch((e) => console.error('Service worker registration failed:', e));
  });
}
