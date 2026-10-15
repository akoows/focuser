'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mongodb://localhost:27017/focuser_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste-apenas-para-testes-0123456789abcdef';

const config = require('../../src/config/env');
const AppError = require('../../src/utils/AppError');
const isbnLookupService = require('../../src/services/isbnLookupService');

describe('ISBN lookup via Groq', () => {
  it('normalizes and validates the ISBN Groq recommends from catalog results', () => {
    assert.equal(isbnLookupService.parseRecommendation('{"isbn":"978-0-13-110362-7"}', ['9780131103627']), '9780131103627');
    assert.equal(isbnLookupService.parseRecommendation('{"isbn":null}', ['9780131103627']), null);
  });

  it('rejects malformed responses and ISBNs with an invalid checksum', () => {
    assert.throws(
      () => isbnLookupService.parseRecommendation('not json', ['9780131103627']),
      (error) => error instanceof AppError && error.code === 'GROQ_INVALID_RESPONSE',
    );
    assert.throws(
      () => isbnLookupService.parseRecommendation('{"isbn":"9780131103628"}', ['9780131103627']),
      (error) => error instanceof AppError && error.code === 'GROQ_INVALID_RESPONSE',
    );
    assert.throws(
      () => isbnLookupService.parseRecommendation('{"isbn":"9780131103627"}', ['9780131103626']),
      (error) => error instanceof AppError && error.code === 'GROQ_INVALID_RESPONSE',
    );
  });

  it('returns catalog editions and asks Groq for an optional recommendation', async (t) => {
    const originalKey = config.groq.apiKey;
    config.groq.apiKey = 'test-groq-key';
    t.after(() => { config.groq.apiKey = originalKey; });
    const sentRequests = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      sentRequests.push({ url: String(url), options });
      if (String(url).startsWith('https://openlibrary.org/search.json')) {
        return new Response(JSON.stringify({
          docs: [
            { title: 'The C Programming Language', author_name: ['Brian W. Kernighan and Dennis M. Ritchie'], isbn: ['978-0-13-110362-7'], cover_i: 101, first_publish_year: 1978 },
            { title: 'The C Programming Language', author_name: ['Brian W. Kernighan and Dennis M. Ritchie'], isbn: ['9780131103627'], cover_i: 101, first_publish_year: 1988 },
            { title: 'The C Programming Language, 2nd Edition', author_name: ['Brian W. Kernighan and Dennis M. Ritchie'], isbn: ['9780131103627'], cover_i: 202, first_publish_year: 1988 },
          ],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (String(url).startsWith('https://www.googleapis.com/books/v1/volumes')) {
        return new Response(JSON.stringify({
          items: [{
            id: 'google-volume-1',
            volumeInfo: {
              title: 'The C Programming Language',
              authors: ['Brian W. Kernighan and Dennis M. Ritchie'],
              publishedDate: '1988',
              industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780131103627' }],
              imageLinks: { thumbnail: 'http://books.google.com/books/content?id=google-volume-1&printsec=frontcover&img=1&zoom=1' },
            },
          }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        choices: [{ message: { content: '{"isbn":"9780131103627"}' } }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const result = await isbnLookupService.lookup({ title: 'The C Programming Language', author: 'Brian W. Kernighan and Dennis M. Ritchie' });
    const googleRequest = sentRequests.find((request) => request.url.startsWith('https://www.googleapis.com/books/v1/volumes'));
    const groqRequest = sentRequests.find((request) => request.url === 'https://api.groq.com/openai/v1/chat/completions');
    const payload = JSON.parse(groqRequest.options.body);
    assert.match(sentRequests[0].url, /^https:\/\/openlibrary\.org\/search\.json\?/);
    assert.ok(googleRequest);
    assert.match(googleRequest.url, /intitle%3AThe\+C\+Programming\+Language/);
    assert.equal(groqRequest.url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(groqRequest.options.headers.authorization, 'Bearer test-groq-key');
    assert.equal(JSON.parse(payload.messages[1].content).candidates.length, 3);
    assert.equal(result.items.length, 3);
    assert.deepEqual(result.items.map((book) => book.source), ['Open Library', 'Open Library', 'Google Books']);
    assert.deepEqual(result.items.map((book) => book.coverId), [101, 202, null]);
    assert.equal(result.items[2].coverUrl, 'https://books.google.com/books/content?id=google-volume-1&printsec=frontcover&img=1&zoom=1');
    assert.equal(result.items[0].isbn, '9780131103627');
    assert.equal(result.items[0].recommended, true);
    assert.equal(result.items[1].recommended, true);
    assert.equal(result.items[2].recommended, true);
    assert.deepEqual(result.sources, { openLibrary: true, googleBooks: true });
  });

  it('continues with Open Library covers when Google Books is unavailable', async (t) => {
    const originalKey = config.groq.apiKey;
    config.groq.apiKey = '';
    t.after(() => { config.groq.apiKey = originalKey; });
    t.mock.method(globalThis, 'fetch', async (url) => {
      if (String(url).startsWith('https://openlibrary.org/search.json')) {
        return new Response(JSON.stringify({
          docs: [{ title: 'Book', author_name: ['Author'], isbn: ['9780131103627'], cover_i: 101 }],
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: { message: 'Quota exceeded' } }), { status: 429 });
    });

    const result = await isbnLookupService.lookup({ title: 'Book' });
    assert.equal(result.items.length, 1);
    assert.deepEqual(result.sources, { openLibrary: true, googleBooks: false });
  });
});
