'use strict';
const { z } = require('zod');
const config = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { normalizeIsbn, isValidIsbn } = require('../utils/isbn');

const recommendationSchema = z.object({ isbn: z.string().nullable() }).strict();
const RECOMMENDATION_PROMPT = 'Return only JSON with isbn. Choose one ISBN from candidates matching the requested title and author, or null if none match.';

function parseRecommendation(text, candidates) {
  let parsed;
  try {
    parsed = JSON.parse(String(text).trim());
  } catch {
    throw new AppError(502, 'GROQ_INVALID_RESPONSE', 'Resposta inválida do Groq.');
  }
  const result = recommendationSchema.safeParse(parsed);
  if (!result.success || (result.data.isbn !== null && (
    !isValidIsbn(result.data.isbn) || !candidates.includes(normalizeIsbn(result.data.isbn))
  ))) {
    throw new AppError(502, 'GROQ_INVALID_RESPONSE', 'O Groq retornou uma recomendação inválida.');
  }
  return result.data.isbn === null ? null : normalizeIsbn(result.data.isbn);
}

async function searchCatalog(title, author) {
  const url = new URL('https://openlibrary.org/search.json');
  url.searchParams.set('title', title);
  if (author) url.searchParams.set('author', author);
  url.searchParams.set('fields', 'title,author_name,isbn,cover_i,first_publish_year');
  url.searchParams.set('limit', '20');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.groq.timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      logger.warn('openlibrary_isbn_lookup_provider_status', { status: response.status });
      throw new AppError(502, 'BOOK_CATALOG_ERROR', 'Falha ao consultar o catálogo de livros.');
    }
    const body = await response.json();
    if (!Array.isArray(body?.docs)) {
      throw new AppError(502, 'BOOK_CATALOG_INVALID_RESPONSE', 'O catálogo de livros retornou uma resposta inválida.');
    }

    const seenCovers = new Set();
    return body.docs.flatMap((book) => {
      const coverId = Number.isInteger(book.cover_i) && book.cover_i > 0 ? book.cover_i : null;
      const isbn = Array.isArray(book.isbn)
        ? book.isbn.map(normalizeIsbn).find(isValidIsbn) || null
        : null;
      if (!coverId && !isbn) return [];
      const coverKey = coverId ? `cover:${coverId}` : `isbn:${isbn}`;
      if (seenCovers.has(coverKey)) return [];
      seenCovers.add(coverKey);
      const titleText = typeof book.title === 'string' ? book.title.trim().slice(0, 160) : '';
      if (!titleText) return [];
      return [{
        source: 'Open Library',
        title: titleText,
        author: Array.isArray(book.author_name)
          ? book.author_name.find((name) => typeof name === 'string')?.slice(0, 120) || null
          : null,
        year: Number.isInteger(book.first_publish_year) ? book.first_publish_year : null,
        isbn,
        coverId,
        coverUrl: coverId
          ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
          : `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg`,
      }];
    }).slice(0, 12);
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new AppError(504, 'BOOK_CATALOG_TIMEOUT', 'A consulta ao catálogo de livros demorou demais para responder.');
    }
    if (error instanceof AppError) throw error;
    logger.warn('openlibrary_isbn_lookup_network_error', { errName: error?.name });
    throw new AppError(502, 'BOOK_CATALOG_ERROR', 'Falha ao consultar o catálogo de livros.');
  } finally {
    clearTimeout(timer);
  }
}

async function searchGoogleBooks(title, author) {
  const url = new URL('https://www.googleapis.com/books/v1/volumes');
  url.searchParams.set('q', `intitle:${title}${author ? ` inauthor:${author}` : ''}`);
  url.searchParams.set('maxResults', '20');
  url.searchParams.set('printType', 'books');
  url.searchParams.set('fields', 'items(id,volumeInfo(title,authors,publishedDate,industryIdentifiers,imageLinks))');
  if (config.googleBooks.apiKey) url.searchParams.set('key', config.googleBooks.apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.googleBooks.timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      logger.warn('google_books_lookup_provider_status', { status: response.status });
      throw new AppError(502, 'GOOGLE_BOOKS_ERROR', 'Falha ao consultar Google Books.');
    }
    const body = await response.json();
    if (body.items !== undefined && !Array.isArray(body.items)) {
      throw new AppError(502, 'GOOGLE_BOOKS_INVALID_RESPONSE', 'Google Books retornou uma resposta inválida.');
    }

    const seenVolumes = new Set();
    return (body.items || []).flatMap((item) => {
      const volume = item?.volumeInfo;
      const rawCoverUrl = volume?.imageLinks?.thumbnail || volume?.imageLinks?.smallThumbnail;
      if (typeof item?.id !== 'string' || !volume || typeof rawCoverUrl !== 'string') return [];
      let parsedCoverUrl;
      try {
        parsedCoverUrl = new URL(rawCoverUrl);
        if (!['books.google.com', 'books.googleusercontent.com'].includes(parsedCoverUrl.hostname)) return [];
        parsedCoverUrl.protocol = 'https:';
      } catch {
        return [];
      }
      if (seenVolumes.has(item.id)) return [];
      seenVolumes.add(item.id);
      const isbn = Array.isArray(volume.industryIdentifiers)
        ? volume.industryIdentifiers
          .map((identifier) => identifier?.identifier)
          .filter((identifier) => typeof identifier === 'string')
          .map(normalizeIsbn)
          .find(isValidIsbn) || null
        : null;
      const titleText = typeof volume.title === 'string' ? volume.title.trim().slice(0, 160) : '';
      if (!titleText) return [];
      const yearMatch = typeof volume.publishedDate === 'string' ? volume.publishedDate.match(/^\d{4}/) : null;
      return [{
        source: 'Google Books',
        title: titleText,
        author: Array.isArray(volume.authors)
          ? volume.authors.find((name) => typeof name === 'string')?.slice(0, 120) || null
          : null,
        year: yearMatch ? Number(yearMatch[0]) : null,
        isbn,
        coverId: null,
        coverUrl: parsedCoverUrl.toString(),
      }];
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new AppError(504, 'GOOGLE_BOOKS_TIMEOUT', 'A consulta ao Google Books demorou demais para responder.');
    }
    if (error instanceof AppError) throw error;
    logger.warn('google_books_lookup_network_error', { errName: error?.name });
    throw new AppError(502, 'GOOGLE_BOOKS_ERROR', 'Falha ao consultar Google Books.');
  } finally {
    clearTimeout(timer);
  }
}

async function recommendIsbn(title, author, books) {
  if (!config.groq.apiKey) return null;
  const candidates = [...new Set(books.map((book) => book.isbn).filter(Boolean))];
  if (!candidates.length) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.groq.timeoutMs);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.groq.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: config.groq.model,
        temperature: 0,
        max_tokens: 120,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: RECOMMENDATION_PROMPT },
          { role: 'user', content: JSON.stringify({ title, author: author || null, candidates: books.map(({ title: bookTitle, author: bookAuthor, year, isbn }) => ({ title: bookTitle, author: bookAuthor, year, isbn })) }) },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn('groq_isbn_recommendation_provider_status', { status: response.status });
      return null;
    }
    const body = await response.json();
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') return null;
    return parseRecommendation(text, candidates);
  } catch (error) {
    logger.warn(error?.name === 'AbortError' ? 'groq_isbn_recommendation_timeout' : 'groq_isbn_recommendation_failed', {
      ...(error?.name ? { errName: error.name } : {}),
      ...(error instanceof AppError ? { errCode: error.code } : {}),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function lookup({ title, author }) {
  const results = await Promise.allSettled([
    searchCatalog(title, author),
    searchGoogleBooks(title, author),
  ]);
  const rejected = results.filter((result) => result.status === 'rejected');
  const sources = {
    openLibrary: results[0].status === 'fulfilled',
    googleBooks: results[1].status === 'fulfilled',
  };
  let books = results
    .filter((result) => result.status === 'fulfilled')
    .flatMap((result) => result.value);
  if (books.length === 0 && rejected.length === results.length) {
    throw new AppError(502, 'BOOK_CATALOGS_UNAVAILABLE', 'Não foi possível consultar os catálogos de livros.');
  }

  const seenCovers = new Set();
  books = books.filter((book) => {
    const key = `${book.source}:${book.coverUrl}`;
    if (seenCovers.has(key)) return false;
    seenCovers.add(key);
    return true;
  }).slice(0, 24);
  if (!books.length) {
    if (rejected.length) {
      throw new AppError(502, 'BOOK_CATALOGS_INCOMPLETE', 'Não foi possível pesquisar capas em todas as fontes. Tente novamente mais tarde.');
    }
    throw new AppError(404, 'ISBN_NOT_FOUND', 'Não encontrei capas nos catálogos para esse livro. Confira o título e o autor.');
  }
  const recommendedIsbn = await recommendIsbn(title, author, books);
  return {
    items: books.map((book) => ({ ...book, recommended: Boolean(recommendedIsbn && book.isbn === recommendedIsbn) })),
    sources,
  };
}

module.exports = { lookup, parseRecommendation, searchCatalog, searchGoogleBooks };
