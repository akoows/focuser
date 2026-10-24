import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createCalendarDayLoader } from '../src/pages/academy/calendarDayLoader.js';

const componentSource = readFileSync(new URL('../src/pages/AcademyPage.jsx', import.meta.url), 'utf8');

test('calendar only applies the latest selected date and ignores responses after closing details', async () => {
  let resolveFirst;
  let resolveSecond;
  let resolveClosed;
  const loader = createCalendarDayLoader((date) => new Promise((resolve) => {
    if (date.endsWith('-22')) resolveFirst = resolve;
    else if (date.endsWith('-23')) resolveSecond = resolve;
    else resolveClosed = resolve;
  }));
  const firstRequest = loader.load('2026-10-22');
  const secondRequest = loader.load('2026-10-23');
  resolveSecond({ items: [{ id: 'selected-day' }] });
  assert.equal((await secondRequest).stale, false);
  resolveFirst({ items: [{ id: 'older-day' }] });
  assert.equal((await firstRequest).stale, true);

  const closedRequest = loader.load('2026-10-24');
  loader.cancel();
  resolveClosed({ items: [{ id: 'closed-day' }] });
  assert.equal((await closedRequest).stale, true);
  assert.match(componentSource, /if \(result\.stale\) return/);
  assert.match(componentSource, /calendarDayLoader\.cancel\(\)/);
  assert.match(componentSource, /setDaySessionsError\(result\.error\.message/);
  assert.match(componentSource, /isLoadingDaySessions \? <p className="muted-state" role="status">/);
});
