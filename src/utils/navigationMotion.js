import { transitionUI } from './transitionUI.js';

export function navigateWithMotion(event, navigate, host = globalThis.document) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target?.closest?.('a[href]');
  if (!link || !event.currentTarget.contains(link) || link.hasAttribute('download')) return;
  const target = link.getAttribute('target');
  const href = link.getAttribute('href');
  if ((target && target !== '_self') || !href?.startsWith('/') || href.startsWith('//')) return;
  event.preventDefault();
  transitionUI(() => navigate(href), host);
}
