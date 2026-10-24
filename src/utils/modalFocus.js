const MODAL_FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

const dialogStacks = new WeakMap();

function getModalFocusableElements(dialog) {
  return [...dialog.querySelectorAll(MODAL_FOCUSABLE_SELECTOR)].filter((element) => (
    !element.disabled
    && element.tabIndex >= 0
    && element.getAttribute('aria-hidden') !== 'true'
    && element.getClientRects().length > 0
  ));
}

function focusTarget(element, documentRef) {
  if (!element || element.disabled || element.isConnected === false || typeof element.focus !== 'function') return false;
  if (element.ownerDocument && element.ownerDocument !== documentRef) return false;
  if (element.getAttribute?.('aria-hidden') === 'true' || (element.getClientRects && element.getClientRects().length === 0)) return false;
  element.focus();
  return true;
}

export function activateModalFocus(dialog, { initialFocus, fallbackFocus, onEscape } = {}) {
  const documentRef = dialog?.ownerDocument;
  if (!dialog || !documentRef?.addEventListener || !dialog.querySelectorAll) {
    throw new TypeError('A mounted dialog element is required.');
  }

  const previousFocus = documentRef.activeElement;
  const stack = dialogStacks.get(documentRef) || [];
  const entry = { dialog, onEscape };
  stack.push(entry);
  dialogStacks.set(documentRef, stack);
  const isTopmost = () => stack.at(-1) === entry;
  const focusFirst = () => {
    const focusable = getModalFocusableElements(dialog);
    if (!dialog.contains(initialFocus) || !focusTarget(initialFocus, documentRef)) {
      if (!focusTarget(focusable[0], documentRef)) {
        if (dialog.tabIndex < 0 && dialog.setAttribute) dialog.setAttribute('tabindex', '-1');
        focusTarget(dialog, documentRef);
      }
    }
  };

  const onKeyDown = (event) => {
    if (!isTopmost()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation?.();
      entry.onEscape?.();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = getModalFocusableElements(dialog);
    if (!focusable.length) {
      event.preventDefault();
      focusTarget(dialog, documentRef);
      return;
    }

    const activeIndex = focusable.indexOf(documentRef.activeElement);
    const focusEscaped = !dialog.contains(documentRef.activeElement);
    if (event.shiftKey && (activeIndex === 0 || focusEscaped)) {
      event.preventDefault();
      focusTarget(focusable.at(-1), documentRef);
    } else if (!event.shiftKey && (activeIndex === focusable.length - 1 || focusEscaped)) {
      event.preventDefault();
      focusTarget(focusable[0], documentRef);
    }
  };

  const onFocusIn = (event) => {
    if (!isTopmost() || dialog.contains(event.target)) return;
    focusFirst();
  };

  documentRef.addEventListener('keydown', onKeyDown);
  documentRef.addEventListener('focusin', onFocusIn);
  focusFirst();

  let active = true;
  return () => {
    if (!active) return;
    active = false;
    documentRef.removeEventListener('keydown', onKeyDown);
    documentRef.removeEventListener('focusin', onFocusIn);
    const index = stack.indexOf(entry);
    if (index !== -1) stack.splice(index, 1);
    if (!stack.length) dialogStacks.delete(documentRef);

    const returnTarget = focusTarget(previousFocus, documentRef)
      ? null
      : (typeof fallbackFocus === 'function' ? fallbackFocus() : fallbackFocus);
    if (returnTarget) focusTarget(returnTarget, documentRef);
  };
}
