import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBookPages } from '../src/pages/reading/bookPagination.js';

const readingSource = readFileSync(new URL('../src/pages/reading/ReadingPageView.jsx', import.meta.url), 'utf8');
const profileSource = readFileSync(new URL('../src/pages/ProfilePage.jsx', import.meta.url), 'utf8');

test('all 500 books remain reachable through the same filtered pages and the final item is preserved', async () => {
  const allBooks = Array.from({ length: 500 }, (_, index) => ({
    id: `book-${index}`,
    title: `Book ${index}`,
    isActive: index !== 499,
  }));
  const result = await loadBookPages(async ({ status, page, limit }) => {
    const filtered = allBooks.filter((book) => status === 'all' || (status === 'active' ? book.isActive : !book.isActive));
    const pageNumber = Number(page);
    const pageSize = Number(limit);
    const start = (pageNumber - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      pagination: { page: pageNumber, limit: pageSize, total: filtered.length, totalPages: Math.ceil(filtered.length / pageSize) },
    };
  }, { status: 'all', limit: 50, pageCount: 10 });

  assert.equal(result.items.length, 500);
  assert.equal(result.items.find((book) => book.id === 'book-499').title, 'Book 499');
  const archived = await loadBookPages(async ({ status }) => ({
    items: allBooks.filter((book) => status === 'all' || !book.isActive),
    pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
  }), { status: 'archived', pageCount: 10 });
  assert.deepEqual(archived.items.map(({ id }) => id), ['book-499']);
});

test('reading and profile interfaces consume pagination metadata and let users load more without discarding the filter', () => {
  assert.match(readingSource, /loadBookPages\(focuserApi\.reading\.listBooks/);
  assert.match(readingSource, /appendUniqueBooks\(current, response\.items\)/);
  assert.match(readingSource, /focuserApi\.reading\.listBooks\(\{\s*status:\s*filter,\s*page:\s*String\(nextPage\),\s*limit:\s*String\(READING_BOOK_PAGE_SIZE\),?\s*\}\)/);
  assert.match(readingSource, /booksPage < booksPagination\.totalPages/);
  assert.match(readingSource, /setFilter\(value\)/);
  assert.match(readingSource, /booksPagination\.totalPages/);
  assert.match(profileSource, /focuserApi\.reading\.listBooks\(\{ status: 'all', page: '1', limit: String\(READING_BOOK_PAGE_SIZE\) \}\)/);
  assert.match(profileSource, /booksPagination\.page >= booksPagination\.totalPages/);
  assert.match(profileSource, /status: 'all',[\s\S]*?page: String\(booksPagination\.page \+ 1\)/);
  assert.match(profileSource, /setBooks\(\(current\) => appendUniqueBooks\(current, response\.items\)\)/);
  assert.match(profileSource, /\}, \[user\?\.id\]\)/);
  assert.match(profileSource, /onLoadMoreBooks=\{loadMoreProfileBooks\}/);
});
