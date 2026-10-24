import test from 'node:test';
import assert from 'node:assert/strict';
import { focuserApi } from '../src/services/focuserApi.js';

const cases = [
  ['habit detail', () => focuserApi.habits.get('a/b'), '/habits/a%2Fb', 'GET', undefined],
  ['habit order', () => focuserApi.habits.reorder(['b', 'a']), '/habits/reorder', 'PATCH', { orderedIds: ['b', 'a'] }],
  ['habit history', () => focuserApi.habits.history('a/b', { from: '2026-10-01', to: '2026-10-24' }), '/habits/a%2Fb/history?from=2026-10-01&to=2026-10-24', 'GET', undefined],
  ['habit progress', () => focuserApi.habits.progress('a/b'), '/habits/a%2Fb/progress?period=week', 'GET', undefined],
  ['habit logs', () => focuserApi.habits.checkIns('a/b', { page: 2, limit: 10 }), '/habits/a%2Fb/check-ins?page=2&limit=10', 'GET', undefined],
  ['partial undo', () => focuserApi.habits.removeCheckIn('a/b', { date: '2026-10-24', amount: 2 }), '/habits/a%2Fb/check-ins', 'PATCH', { date: '2026-10-24', amount: 2 }],
  ['delete record', () => focuserApi.habits.deleteCheckIn('a/b', 'c/d'), '/habits/a%2Fb/check-ins/c%2Fd', 'DELETE', undefined],
  ['today records', () => focuserApi.checkInsToday(), '/check-ins/today', 'GET', undefined],
  ['AI analysis', () => focuserApi.analyze('month'), '/ai/analyze', 'POST', { period: 'month' }],
];

for (const [name, call, endpoint, method, body] of cases) {
  test(`restored ${name} sends the API contract and preserves structured errors`, async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url, `http://localhost:3000/api${endpoint}`);
      assert.equal(options.method, method);
      assert.equal(options.credentials, 'include');
      assert.deepEqual(options.body ? JSON.parse(options.body) : undefined, body);
      if (method !== 'GET') assert.equal(options.headers['X-Focuser-Client'], 'web');
      return Response.json({ data: { restored: true } });
    });
    assert.deepEqual(await call(), { restored: true });
    fetchMock.mock.mockImplementation(async () => Response.json({ error: { code: 'VALIDATION_ERROR', message: 'Dados inválidos' } }, { status: 400 }));
    await assert.rejects(call(), { code: 'VALIDATION_ERROR', status: 400, message: 'Dados inválidos' });
  });
}
