const BOOK_STATUSES = new Set(['active', 'archived', 'all']);

export function appendUniqueBooks(existing, incoming) {
  if (!Array.isArray(existing) || !Array.isArray(incoming)) {
    throw new TypeError('existing and incoming must be arrays.');
  }
  const items = [...existing];
  const seenIds = new Set(existing.map((book) => book?.id).filter(Boolean));
  for (const book of incoming) {
    if (!book || typeof book.id !== 'string' || !book.id || seenIds.has(book.id)) continue;
    seenIds.add(book.id);
    items.push(book);
  }
  return items;
}

export async function loadBookPages(listBooks, { status = 'active', limit = 50, pageCount = 1 } = {}) {
  if (typeof listBooks !== 'function') throw new TypeError('listBooks must be a function.');
  if (!BOOK_STATUSES.has(status)) throw new TypeError('Unsupported book status.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('limit must be between 1 and 100.');
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new RangeError('pageCount must be a positive integer.');

  const items = [];
  let pagination = null;
  for (let page = 1; page <= pageCount; page += 1) {
    const response = await listBooks({ status, page: String(page), limit: String(limit) });
    if (!Array.isArray(response?.items) || !Number.isInteger(response?.pagination?.totalPages)) {
      throw new TypeError('Book list response is missing items or pagination metadata.');
    }
    items.push(...response.items);
    pagination = response.pagination;
    if (page >= pagination.totalPages) break;
  }

  return { items, pagination };
}
