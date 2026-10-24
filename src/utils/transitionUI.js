import { flushSync } from 'react-dom';

export function transitionUI(update, host = globalThis.document) {
  if (typeof update !== 'function') throw new TypeError('A UI update callback is required.');
  if (!host?.startViewTransition || host.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    flushSync(update);
    return null;
  }
  const transition = host.startViewTransition(() => flushSync(update));
  // A newer interaction may skip the animation; the state update still completes.
  transition.finished.catch(() => {});
  transition.ready?.catch(() => {});
  return transition;
}
