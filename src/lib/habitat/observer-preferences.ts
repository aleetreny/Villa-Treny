import { useSyncExternalStore } from 'react';

const query = '(prefers-reduced-motion: reduce)';
function motionSubscribe(notify: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
}
export function useReducedMotion(): boolean {
  return useSyncExternalStore(motionSubscribe, () => window.matchMedia(query).matches, () => true);
}
function visibilitySubscribe(notify: () => void) {
  document.addEventListener('visibilitychange', notify);
  return () => document.removeEventListener('visibilitychange', notify);
}
export function usePageVisible(): boolean {
  return useSyncExternalStore(visibilitySubscribe, () => !document.hidden, () => false);
}
