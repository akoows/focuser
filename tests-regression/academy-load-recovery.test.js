import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadAcademySections, readWorkoutTimer, workoutSessionStorageKey } from '../src/pages/academy/academyDataLoader.js';

const componentSource = readFileSync(new URL('../src/pages/AcademyPage.jsx', import.meta.url), 'utf8');

test('a failed academy section does not discard the active workout or other fulfilled data', async () => {
  const api = { gym: {
    plans: async () => ({ items: [] }),
    activeSession: async () => ({ session: { id: 'active-workout' } }),
    sessions: async () => { throw new Error('history unavailable'); },
    stats: async () => ({ exercises: [{ name: 'Squat' }] }),
    calendar: async () => ({ days: [] }),
  } };
  const { values, errors } = await loadAcademySections(api);
  assert.equal(values.activeSession.session.id, 'active-workout');
  assert.equal(values.stats.exercises[0].name, 'Squat');
  assert.equal(values.history, undefined);
  assert.deepEqual(Object.keys(errors), ['history']);
});

test('corrupt or blocked timer storage falls back without removing the active session', () => {
  const storage = { getItem: () => '{bad json' };
  const restored = readWorkoutTimer(storage, 'active-workout');
  assert.equal(restored.timer, null);
  assert.match(restored.error, /treino ativo continua disponível/);
  assert.match(componentSource, /if \(values\.activeSession\)\s*\{\s*setActiveSession\(values\.activeSession\.session\)/);
  assert.match(componentSource, /readWorkoutTimer\(\(\) => window\.localStorage, values\.activeSession\.session\.id\)/);
  assert.match(componentSource, /setError\(Object\.values\(errors\)\.join\(' '\)\)/);
  assert.match(componentSource, /loadAcademySections\(focuserApi, page\)/);
  assert.equal(workoutSessionStorageKey('active-workout'), 'focuser:gym-rest-timer:active-workout');
});
