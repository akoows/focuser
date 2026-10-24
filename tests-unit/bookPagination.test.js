import test from 'node:test';
import assert from 'node:assert/strict';
import { appendUniqueBooks, loadBookPages } from '../src/pages/reading/bookPagination.js';

test('appendUniqueBooks preserves order, appends new ids once, ignores malformed rows and rejects non-arrays', () => {
  const first = { id: 'book-1', title: 'First' };
  const second = { id: 'book-2', title: 'Second' };
  assert.deepEqual(appendUniqueBooks([first], [first, second, second, null, { title: 'Missing id' }]), [first, second]);
  assert.throws(() => appendUniqueBooks({}, []), /must be arrays/);
});

test('book pagination fetches pages sequentially, preserves filters and stops at the requested page', async () => {
  const calls = [];
  const result = await loadBookPages(async (params) => {
    calls.push(params);
    const page = Number(params.page);
    return {
      items: [{ id: `book-${page}` }],
      pagination: { page, limit: 1, total: 3, totalPages: 3 },
    };
  }, { status: 'archived', limit: 1, pageCount: 2 });

  assert.deepEqual(calls, [
    { status: 'archived', page: '1', limit: '1' },
    { status: 'archived', page: '2', limit: '1' },
  ]);
  assert.deepEqual(result.items.map(({ id }) => id), ['book-1', 'book-2']);
  assert.equal(result.pagination.page, 2);
});

test('book pagination stops at the API last page and rejects invalid requests or malformed responses', async () => {
  let calls = 0;
  const result = await loadBookPages(async () => {
    calls += 1;
    return { items: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 0 } };
  }, { status: 'all', limit: 50, pageCount: 4 });
  assert.equal(calls, 1);
  assert.equal(result.pagination.totalPages, 0);

  await assert.rejects(loadBookPages(null), /listBooks must be a function/);
  await assert.rejects(loadBookPages(async () => ({ items: [] })), /pagination metadata/);
  await assert.rejects(loadBookPages(async () => ({ items: [], pagination: { totalPages: 1 } }), { status: 'unknown' }), /Unsupported book status/);
  await assert.rejects(loadBookPages(async () => ({ items: [], pagination: { totalPages: 1 } }), { limit: 101 }), /limit must be between/);
  await assert.rejects(loadBookPages(async () => ({ items: [], pagination: { totalPages: 1 } }), { pageCount: 0 }), /pageCount must be a positive integer/);
});
