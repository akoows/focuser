import test from 'node:test';
import assert from 'node:assert/strict';
import { transitionUI } from '../src/utils/transitionUI.js';

test('skipped animations preserve the selected tab and do not replay updates', async () => {
  let tab = 'overview';
  let updates = 0;
  const host = { startViewTransition: (update) => {
    update();
    return { ready: Promise.reject(new Error('Skipped')), finished: Promise.reject(new Error('Superseded')) };
  } };
  transitionUI(() => { tab = 'plans'; updates += 1; }, host);
  transitionUI(() => { tab = 'history'; updates += 1; }, host);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(tab, 'history');
  assert.equal(updates, 2);
});
