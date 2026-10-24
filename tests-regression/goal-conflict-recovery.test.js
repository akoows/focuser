import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const goalsPageSource = readFileSync(new URL('../src/pages/GoalsPage.jsx', import.meta.url), 'utf8');

test('goal edit, progress and archive conflicts reload current data and show recovery guidance', () => {
  assert.equal((goalsPageSource.match(/recoverGoalConflict\(requestError, loadGoals, setError/g) || []).length, 3);
  assert.match(goalsPageSource, /A meta mudou em outra atualização\. Atualizei a lista/);
  assert.match(goalsPageSource, /A meta mudou enquanto o progresso era atualizado\. A lista foi recarregada/);
  assert.match(goalsPageSource, /if \(requestId === requestIdRef\.current\) setGoals\(response\.items\)/);
  assert.match(goalsPageSource, /if \(requestId === requestIdRef\.current\) setIsLoading\(false\)/);
});
