import assert from 'node:assert/strict';
import test from 'node:test';
import { createCalendarDayLoader } from '../src/pages/academy/calendarDayLoader.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('calendar day loader validates its fetcher and date input', async () => {
  assert.throws(() => createCalendarDayLoader(null), /fetchDay must be a function/);
  const loader = createCalendarDayLoader(async () => ({ items: [] }));
  await assert.rejects(loader.load('24-10-2026'), /YYYY-MM-DD/);
});

test('calendar day loader returns successful data and captures request errors', async () => {
  const loader = createCalendarDayLoader(async (date) => {
    if (date.endsWith('-23')) throw new Error('calendar unavailable');
    return { items: [{ id: 'session-1' }] };
  });
  const success = await loader.load('2026-10-24');
  assert.equal(success.stale, false);
  assert.deepEqual(success.response.items, [{ id: 'session-1' }]);
  const failure = await loader.load('2026-10-23');
  assert.equal(failure.stale, false);
  assert.equal(failure.error.message, 'calendar unavailable');
});

test('newer selection or close invalidates an older pending calendar response', async () => {
  const first = deferred();
  const second = deferred();
  const closed = deferred();
  const requests = new Map([['2026-10-23', first], ['2026-10-24', second], ['2026-10-25', closed]]);
  const loader = createCalendarDayLoader((date) => requests.get(date).promise);
  const oldRequest = loader.load('2026-10-23');
  const newRequest = loader.load('2026-10-24');
  second.resolve({ items: [{ id: 'new-day' }] });
  assert.equal((await newRequest).stale, false);
  first.resolve({ items: [{ id: 'old-day' }] });
  assert.equal((await oldRequest).stale, true);

  const pending = loader.load('2026-10-25');
  loader.cancel();
  closed.resolve({ items: [{ id: 'closed-day' }] });
  assert.equal((await pending).stale, true);
});
