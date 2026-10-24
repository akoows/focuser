import test from 'node:test';
import assert from 'node:assert/strict';
import { focuserApi } from '../src/services/focuserApi.js';

test('request timeout stays active through response body parsing and accepts operation-specific budgets', async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let timeoutCallback;
  let timeoutDuration;
  let wasCleared = false;
  let resolveBody;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: () => new Promise((resolve) => { resolveBody = resolve; }),
  });
  globalThis.setTimeout = (callback, duration) => {
    timeoutCallback = callback;
    timeoutDuration = duration;
    return 1;
  };
  globalThis.clearTimeout = (timerId) => { wasCleared = timerId === 1; };

  try {
    const request = focuserApi.reading.lookupIsbn({ title: 'Example' });
    await new Promise((resolve) => originalSetTimeout(resolve, 0));
    assert.equal(timeoutDuration, 30_000);
    assert.equal(wasCleared, false);
    resolveBody(JSON.stringify({ data: { items: [] } }));
    assert.deepEqual(await request, { items: [] });
    assert.equal(wasCleared, true);
    assert.equal(typeof timeoutCallback, 'function');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('timed-out writes report an uncertain outcome and are sent once without automatic retry', async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    });
  };
  globalThis.setTimeout = (callback) => { queueMicrotask(callback); return 2; };
  globalThis.clearTimeout = () => {};

  try {
    await assert.rejects(focuserApi.habits.checkIn('habit-1'), (error) => {
      assert.equal(error.code, 'REQUEST_OUTCOME_UNKNOWN');
      assert.equal(error.outcomeUnknown, true);
      assert.equal(error.status, null);
      assert.match(error.message, /pode ter sido salvo/);
      return true;
    });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('a slow response body is aborted by the same timeout and marks the write outcome as unknown', async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let timeoutCallback;
  let cleared = false;
  globalThis.fetch = async (_url, options) => ({
    ok: true,
    status: 200,
    text: () => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('Body read aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }),
  });
  globalThis.setTimeout = (callback) => { timeoutCallback = callback; return 3; };
  globalThis.clearTimeout = (timerId) => { cleared = timerId === 3; };

  try {
    const request = focuserApi.reading.logSession('book-1', { pagesRead: 2, minutesRead: 1 });
    await new Promise((resolve) => originalSetTimeout(resolve, 0));
    assert.equal(cleared, false);
    timeoutCallback();
    await assert.rejects(request, (error) => {
      assert.equal(error.code, 'REQUEST_OUTCOME_UNKNOWN');
      assert.equal(error.outcomeUnknown, true);
      return true;
    });
    assert.equal(cleared, true);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('network failures on writes are marked uncertain while reads remain safely retryable', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('connection reset'); };
  try {
    await assert.rejects(focuserApi.habits.checkIn('habit-1'), (error) => {
      assert.equal(error.code, 'REQUEST_OUTCOME_UNKNOWN');
      assert.equal(error.outcomeUnknown, true);
      return true;
    });
    await assert.rejects(focuserApi.me(), (error) => {
      assert.equal(error.code, 'API_UNREACHABLE');
      assert.equal(error.outcomeUnknown, false);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
