import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverGoalConflict } from '../src/pages/goals/goalConflictRecovery.js';

test('GOAL_CHANGED reloads the latest goal list and gives the user recovery guidance', async () => {
  const latestGoals = [{ id: 'goal-1', currentValue: 4 }];
  let visibleGoals = [{ id: 'goal-1', currentValue: 3 }];
  let visibleError = '';
  const recovered = await recoverGoalConflict(
    { status: 409, code: 'GOAL_CHANGED' },
    async () => { visibleGoals = latestGoals; return true; },
    (message) => { visibleError = message; },
    'A meta mudou; revise os valores atualizados.',
  );

  assert.equal(recovered, true);
  assert.equal(visibleGoals[0].currentValue, 4);
  assert.equal(visibleError, 'A meta mudou; revise os valores atualizados.');
});

test('non-conflict errors keep their normal error path without reloading', async () => {
  let reloadCount = 0;
  let visibleError = '';
  const recovered = await recoverGoalConflict(
    { status: 500, code: 'INTERNAL_ERROR' },
    async () => { reloadCount += 1; return true; },
    (message) => { visibleError = message; },
    'recovery guidance',
  );

  assert.equal(recovered, false);
  assert.equal(reloadCount, 0);
  assert.equal(visibleError, '');
});

test('a failed latest-goals reload does not replace the reload error with stale-state guidance', async () => {
  let visibleError = '';
  const recovered = await recoverGoalConflict(
    { status: 409, code: 'GOAL_CHANGED' },
    async () => { visibleError = 'Could not reload goals'; return false; },
    (message) => { visibleError = message; },
    'A meta mudou; revise os valores atualizados.',
  );

  assert.equal(recovered, true);
  assert.equal(visibleError, 'Could not reload goals');
});
