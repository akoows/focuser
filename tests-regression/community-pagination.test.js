import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const reading = readFileSync(new URL('../src/pages/reading/ReadingPageView.jsx', import.meta.url), 'utf8');

test('active Friends screen appends all three collections and exposes retryable pagination errors', () => {
  const friendsPage = app.slice(app.indexOf('export function FriendsPage('), app.indexOf('function DashboardFriends()'));
  assert.match(friendsPage, /friends: \[\.\.\.current\.friends, \.\.\.result\.friends\]/);
  assert.match(friendsPage, /incomingRequests: \[\.\.\.current\.incomingRequests, \.\.\.result\.incomingRequests\]/);
  assert.match(friendsPage, /outgoingRequests: \[\.\.\.current\.outgoingRequests, \.\.\.result\.outgoingRequests\]/);
  assert.match(friendsPage, /friends\.list\(\{ limit: 20, \.\.\.\(cursor \? \{ cursor \} : \{\}\) \}\)/);
  assert.match(friendsPage, /pagination\?\.hasMore/);
  assert.match(friendsPage, /loadMoreError \? <p role="alert"/);
  assert.match(friendsPage, /requestId !== requestIdRef\.current/);
  assert.match(friendsPage, /acceptRequest\(person\.requestId\)/);
  assert.match(friendsPage, /removeFriend\(person\.id\)/);
});

test('active Reading feed preserves refresh, appends unique items, and exposes error and end states', () => {
  assert.match(reading, /reading\.feed\(\{ limit: 20, cursor: feedPagination\.nextCursor \}\)/);
  assert.match(reading, /existing\.id === item\.id/);
  assert.match(reading, /feedRequestIdRef\.current/);
  assert.match(reading, /onClick=\{loadReadingFeed\}/);
  assert.match(reading, /feedPageError \? <p role="alert"/);
  assert.match(reading, /feedPagination\?\.hasMore/);
  assert.match(reading, /setFilter\(value\)/);
});
