import test from 'node:test';
import assert from 'node:assert/strict';
import { transitionUI } from '../src/utils/transitionUI.js';

test('UI transitions validate callbacks and update without browser support', () => {
  assert.throws(() => transitionUI(null, null), TypeError);
  let updates = 0;
  assert.equal(transitionUI(() => { updates += 1; }, null), null);
  assert.equal(updates, 1);
});

test('reduced motion updates immediately without requesting snapshots', () => {
  let state = 'old';
  transitionUI(() => { state = 'new'; }, {
    defaultView: { matchMedia: () => ({ matches: true }) },
    startViewTransition: () => { throw new Error('Should not animate'); },
  });
  assert.equal(state, 'new');
});

test('supported transitions commit the update exactly once', async () => {
  let updates = 0;
  const transition = { finished: Promise.resolve(), ready: Promise.resolve() };
  assert.equal(transitionUI(() => { updates += 1; }, {
    startViewTransition: (update) => { update(); return transition; },
  }), transition);
  await transition.finished;
  assert.equal(updates, 1);
});
