import assert from 'node:assert/strict';
import test from 'node:test';
import { activateModalFocus } from '../src/utils/modalFocus.js';

function createDocument() {
  const listeners = new Map();
  return {
    activeElement: null,
    addEventListener(type, callback) {
      const handlers = listeners.get(type) || new Set();
      handlers.add(callback);
      listeners.set(type, handlers);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    dispatch(event) { for (const callback of listeners.get(event.type) || []) callback(event); },
    listenerCount(type) { return listeners.get(type)?.size || 0; },
  };
}

function createElement(documentRef, { disabled = false, hidden = false, tabIndex = 0 } = {}) {
  const element = {
    ownerDocument: documentRef,
    disabled,
    hidden,
    tabIndex,
    isConnected: true,
    getAttribute: (name) => (name === 'aria-hidden' && hidden ? 'true' : null),
    getClientRects: () => (hidden ? [] : [{}]),
    focus() {
      documentRef.activeElement = element;
      documentRef.dispatch({ type: 'focusin', target: element });
    },
  };
  return element;
}

function createDialog(documentRef, children = []) {
  const dialog = {
    ownerDocument: documentRef,
    isConnected: true,
    tabIndex: -1,
    querySelectorAll: () => children,
    contains: (element) => element === dialog || children.includes(element),
    focus() { documentRef.activeElement = dialog; documentRef.dispatch({ type: 'focusin', target: dialog }); },
  };
  return dialog;
}

function keydown(documentRef, key, shiftKey = false) {
  const event = { type: 'keydown', key, shiftKey, prevented: false, preventDefault() { this.prevented = true; } };
  documentRef.dispatch(event);
  return event;
}

test('modal focus activation validates the element and uses a visible initial focus target', () => {
  assert.throws(() => activateModalFocus(null), /mounted dialog element/);
  const documentRef = createDocument();
  const disabled = createElement(documentRef, { disabled: true });
  const hidden = createElement(documentRef, { hidden: true });
  const first = createElement(documentRef);
  const dialog = createDialog(documentRef, [disabled, hidden, first]);
  const cleanup = activateModalFocus(dialog, { initialFocus: hidden });
  assert.equal(documentRef.activeElement, first);
  cleanup();
  assert.equal(documentRef.listenerCount('keydown'), 0);
  assert.equal(documentRef.listenerCount('focusin'), 0);
});

test('modal focus wraps Tab and Shift+Tab, contains outside focus, and restores its opener', () => {
  const documentRef = createDocument();
  const opener = createElement(documentRef);
  const outside = createElement(documentRef);
  const first = createElement(documentRef);
  const last = createElement(documentRef);
  documentRef.activeElement = opener;
  const dialog = createDialog(documentRef, [first, last]);
  const cleanup = activateModalFocus(dialog, { initialFocus: first });
  assert.equal(documentRef.activeElement, first);

  documentRef.activeElement = last;
  const tabWrap = keydown(documentRef, 'Tab');
  assert.equal(tabWrap.prevented, true);
  assert.equal(documentRef.activeElement, first);

  documentRef.activeElement = first;
  const reverseWrap = keydown(documentRef, 'Tab', true);
  assert.equal(reverseWrap.prevented, true);
  assert.equal(documentRef.activeElement, last);

  documentRef.activeElement = outside;
  documentRef.dispatch({ type: 'focusin', target: outside });
  assert.equal(documentRef.activeElement, first);
  cleanup();
  assert.equal(documentRef.activeElement, opener);
});

test('nested modal focus traps only the top dialog and restores focus to its parent', () => {
  const documentRef = createDocument();
  const opener = createElement(documentRef);
  const parentFirst = createElement(documentRef);
  const parentLast = createElement(documentRef);
  const parent = createDialog(documentRef, [parentFirst, parentLast]);
  documentRef.activeElement = opener;
  let parentEscapes = 0;
  const closeParent = activateModalFocus(parent, { initialFocus: parentFirst, onEscape: () => { parentEscapes += 1; } });

  const childFirst = createElement(documentRef);
  const childLast = createElement(documentRef);
  const child = createDialog(documentRef, [childFirst, childLast]);
  let childEscapes = 0;
  const closeChild = activateModalFocus(child, { initialFocus: childFirst, onEscape: () => { childEscapes += 1; } });
  documentRef.activeElement = childLast;
  keydown(documentRef, 'Tab');
  assert.equal(documentRef.activeElement, childFirst);
  const nestedEscape = keydown(documentRef, 'Escape');
  assert.equal(nestedEscape.prevented, true);
  assert.equal(childEscapes, 1);
  assert.equal(parentEscapes, 0);

  closeChild();
  assert.equal(documentRef.activeElement, parentFirst);
  keydown(documentRef, 'Escape');
  assert.equal(parentEscapes, 1);
  closeParent();
  assert.equal(documentRef.activeElement, opener);
});

test('modal cleanup uses a valid fallback when its original opener disappeared', () => {
  const documentRef = createDocument();
  const opener = createElement(documentRef);
  const fallback = createElement(documentRef);
  const first = createElement(documentRef);
  documentRef.activeElement = opener;
  const dialog = createDialog(documentRef, [first]);
  const cleanup = activateModalFocus(dialog, { fallbackFocus: fallback });
  opener.isConnected = false;
  cleanup();
  assert.equal(documentRef.activeElement, fallback);
});
