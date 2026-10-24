import test from 'node:test';
import assert from 'node:assert/strict';
import { focuserApi } from '../src/services/focuserApi.js';

function mockFetch(handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    return handler(url, options);
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(text, status = 200, contentType = 'text/plain') {
  return new Response(text, {
    status,
    headers: { 'Content-Type': contentType },
  });
}

test('focuserApi HTTP client - headers and payload handling', async (t) => {
  await t.test('sends X-Focuser-Client: web and Content-Type on POST with body', async () => {
    let capturedUrl, capturedOptions;
    const restore = mockFetch((url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return jsonResponse({ success: true, data: { id: 'user-123' } });
    });

    try {
      const result = await focuserApi.login({ email: 'test@example.com', password: 'secretpassword' });
      assert.deepEqual(result, { id: 'user-123' });
      assert.match(capturedUrl, /\/auth\/login$/);
      assert.equal(capturedOptions.method, 'POST');
      assert.equal(capturedOptions.headers['X-Focuser-Client'], 'web');
      assert.equal(capturedOptions.headers['Content-Type'], 'application/json');
      assert.equal(capturedOptions.credentials, 'include');
      assert.equal(capturedOptions.body, JSON.stringify({ email: 'test@example.com', password: 'secretpassword' }));
    } finally {
      restore();
    }
  });

  await t.test('does NOT send X-Focuser-Client on GET requests', async () => {
    let capturedOptions;
    const restore = mockFetch((url, options) => {
      capturedOptions = options;
      return jsonResponse({ success: true, data: { user: 'Antigravity' } });
    });

    try {
      const result = await focuserApi.me();
      assert.deepEqual(result, { user: 'Antigravity' });
      assert.equal(capturedOptions.method, 'GET');
      assert.equal(capturedOptions.headers['X-Focuser-Client'], undefined);
      assert.equal(capturedOptions.headers['Content-Type'], undefined);
    } finally {
      restore();
    }
  });

  await t.test('unwraps payload.data when present, or returns payload directly', async () => {
    const restore1 = mockFetch(() => jsonResponse({ success: true, data: { items: [1, 2, 3] } }));
    try {
      const res = await focuserApi.habits.list();
      assert.deepEqual(res, { items: [1, 2, 3] });
    } finally {
      restore1();
    }

    const restore2 = mockFetch(() => jsonResponse({ customPayload: 'direct-value' }));
    try {
      const res = await focuserApi.habits.list();
      assert.deepEqual(res, { customPayload: 'direct-value' });
    } finally {
      restore2();
    }
  });
});

test('focuserApi error and edge case handling (regression)', async (t) => {
  await t.test('parses structured API errors including code, status, and details', async () => {
    const restore = mockFetch(() => jsonResponse({
      error: {
        message: 'Credenciais inválidas.',
        code: 'INVALID_CREDENTIALS',
        details: { field: 'password' },
      },
    }, 401));

    try {
      await assert.rejects(
        async () => focuserApi.login({ email: 'user@test.com', password: 'wrong' }),
        (err) => {
          assert.equal(err.message, 'Credenciais inválidas.');
          assert.equal(err.status, 401);
          assert.equal(err.code, 'INVALID_CREDENTIALS');
          assert.deepEqual(err.details, { field: 'password' });
          return true;
        }
      );
    } finally {
      restore();
    }
  });

  await t.test('handles non-JSON server error response gracefully', async () => {
    const restore = mockFetch(() => textResponse('<html>Bad Gateway</html>', 502, 'text/html'));

    try {
      await assert.rejects(
        async () => focuserApi.dashboard('2026-10-23'),
        (err) => {
          assert.match(err.message, /A API retornou uma resposta inválida \(HTTP 502\)/);
          return true;
        }
      );
    } finally {
      restore();
    }
  });

  await t.test('surfaces friendly connection error on network failure', async () => {
    const restore = mockFetch(() => {
      throw new Error('fetch failed (ECONNREFUSED)');
    });

    try {
      await assert.rejects(
        async () => focuserApi.me(),
        (err) => {
          assert.match(err.message, /Não foi possível conectar à API/);
          return true;
        }
      );
    } finally {
      restore();
    }
  });

  await t.test('handles request timeout AbortError', async () => {
    const restore = mockFetch(() => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      throw error;
    });

    try {
      await assert.rejects(
        async () => focuserApi.dashboard(),
        (err) => {
          assert.match(err.message, /A API não respondeu em 10 segundos/);
          return true;
        }
      );
    } finally {
      restore();
    }
  });
});

test('focuserApi domain endpoints regression', async (t) => {
  await t.test('friends endpoints invoke correct routes and methods', async () => {
    const calls = [];
    const restore = mockFetch((url, options) => {
      calls.push({ url, method: options.method, body: options.body });
      return jsonResponse({ success: true, data: [] });
    });

    try {
      await focuserApi.friends.list();
      await focuserApi.friends.list({ limit: 20, cursor: 'next / page' });
      await focuserApi.friends.status('alice');
      await focuserApi.friends.sendRequest('bob');
      await focuserApi.friends.acceptRequest('req-123');
      await focuserApi.friends.removeRequest('req-123');
      await focuserApi.friends.removeFriend('friend-456');

      assert.equal(calls.length, 7);
      assert.match(calls[0].url, /\/friends$/);
      assert.equal(calls[0].method, 'GET');

      const friendQuery = new URL(calls[1].url).searchParams;
      assert.equal(friendQuery.get('limit'), '20');
      assert.equal(friendQuery.get('cursor'), 'next / page');

      assert.match(calls[2].url, /\/friends\/status\/alice$/);
      assert.equal(calls[2].method, 'GET');

      assert.match(calls[3].url, /\/friends\/requests$/);
      assert.equal(calls[3].method, 'POST');
      assert.equal(calls[3].body, JSON.stringify({ username: 'bob' }));

      assert.match(calls[4].url, /\/friends\/requests\/req-123\/accept$/);
      assert.equal(calls[4].method, 'POST');

      assert.match(calls[5].url, /\/friends\/requests\/req-123$/);
      assert.equal(calls[5].method, 'DELETE');

      assert.match(calls[6].url, /\/friends\/friend-456$/);
      assert.equal(calls[6].method, 'DELETE');
    } finally {
      restore();
    }
  });

  await t.test('reading feed encodes cursor pagination parameters', async () => {
    const calls = [];
    const restore = mockFetch((url) => { calls.push(url); return jsonResponse({ data: { items: [], pagination: { limit: 20, hasMore: false, nextCursor: null } } }); });
    try {
      await focuserApi.reading.feed({ limit: 20, cursor: 'cursor / value' });
      const query = new URL(calls[0]).searchParams;
      assert.equal(new URL(calls[0]).pathname.endsWith('/reading/feed'), true);
      assert.equal(query.get('limit'), '20');
      assert.equal(query.get('cursor'), 'cursor / value');
    } finally { restore(); }
  });

  await t.test('gym endpoints invoke correct routes and methods', async () => {
    const calls = [];
    const restore = mockFetch((url, options) => {
      calls.push({ url, method: options.method, body: options.body });
      return jsonResponse({ success: true, data: {} });
    });

    try {
      await focuserApi.gym.plans();
      await focuserApi.gym.createPlan({ name: 'Treino A' });
      await focuserApi.gym.startSession({ planId: 'p1' });
      await focuserApi.gym.addExercise('sess-1', { name: 'Supino Reto' });
      await focuserApi.gym.addSet('sess-1', 'ex-1');
      await focuserApi.gym.updateSet('sess-1', 'ex-1', 'set-1', { weight: 80, reps: 10, completed: true });
      await focuserApi.gym.completeSession('sess-1');
      await focuserApi.gym.abandonSession('sess-1');
      await focuserApi.gym.stats('Supino Reto');
      await focuserApi.gym.calendarDay('2026-10-23');

      assert.equal(calls.length, 10);
      assert.match(calls[0].url, /\/gym\/plans$/);
      assert.equal(calls[0].method, 'GET');

      assert.match(calls[1].url, /\/gym\/plans$/);
      assert.equal(calls[1].method, 'POST');

      assert.match(calls[2].url, /\/gym\/sessions$/);
      assert.equal(calls[2].method, 'POST');

      assert.match(calls[3].url, /\/gym\/sessions\/sess-1\/exercises$/);
      assert.equal(calls[3].method, 'POST');

      assert.match(calls[4].url, /\/gym\/sessions\/sess-1\/exercises\/ex-1\/sets$/);
      assert.equal(calls[4].method, 'POST');

      assert.match(calls[5].url, /\/gym\/sessions\/sess-1\/exercises\/ex-1\/sets\/set-1$/);
      assert.equal(calls[5].method, 'PATCH');
      assert.equal(calls[5].body, JSON.stringify({ weight: 80, reps: 10, completed: true }));

      assert.match(calls[6].url, /\/gym\/sessions\/sess-1\/complete$/);
      assert.equal(calls[6].method, 'POST');

      assert.match(calls[7].url, /\/gym\/sessions\/sess-1\/abandon$/);
      assert.equal(calls[7].method, 'POST');

      assert.match(calls[8].url, /\/gym\/stats\?exercise=Supino\+Reto$/);
      assert.equal(calls[8].method, 'GET');

      assert.match(calls[9].url, /\/gym\/calendar\/2026-10-23$/);
      assert.equal(calls[9].method, 'GET');
    } finally {
      restore();
    }
  });

  await t.test('goals and habits endpoints encode query parameters and methods properly', async () => {
    const calls = [];
    const restore = mockFetch((url, options) => {
      calls.push({ url, method: options.method, body: options.body });
      return jsonResponse({ success: true, data: {} });
    });

    try {
      await focuserApi.goals.list({ status: 'active', limit: 10 });
      await focuserApi.goals.addProgress('g-1', 2);
      await focuserApi.habits.checkIn('h-1', { date: '2026-10-23', amount: 1 });
      await focuserApi.habits.archive('h-1', true);

      assert.equal(calls.length, 4);
      assert.match(calls[0].url, /\/goals\?status=active&limit=10$/);
      assert.equal(calls[0].method, 'GET');

      assert.match(calls[1].url, /\/goals\/g-1\/progress$/);
      assert.equal(calls[1].method, 'POST');
      assert.equal(calls[1].body, JSON.stringify({ amount: 2 }));

      assert.match(calls[2].url, /\/habits\/h-1\/check-ins$/);
      assert.equal(calls[2].method, 'POST');

      assert.match(calls[3].url, /\/habits\/h-1\/archive$/);
      assert.equal(calls[3].method, 'PATCH');
      assert.equal(calls[3].body, JSON.stringify({ archived: true }));
    } finally {
      restore();
    }
  });
});
