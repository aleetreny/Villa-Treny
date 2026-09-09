/** Same-origin navigation keeps the forum mounted and makes browser Back useful. */
export function navigateForum(href: string) {
  const url = new URL(href, location.origin);
  if (url.origin !== location.origin) return;
  if (url.href === location.href) return;
  history.pushState(null, '', url);
  window.dispatchEvent(new PopStateEvent('popstate', { state: { forumNavigation: true } }));
}

export function focusFragment(hash = location.hash) {
  let id: string;
  try { id = decodeURIComponent(hash.slice(1)); } catch { return; }
  const target = document.getElementById(id);
  if (!target) return;
  // Headings and sections need a focus destination as well as a scroll position.
  if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
  target.scrollIntoView({ block: 'start' });
  target.focus({ preventScroll: true });
}
