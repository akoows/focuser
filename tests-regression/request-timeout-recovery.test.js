import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const apiSource = readFileSync(new URL('../src/services/focuserApi.js', import.meta.url), 'utf8');
const habitsSource = readFileSync(new URL('../src/pages/habits/HabitsPage.jsx', import.meta.url), 'utf8');
const readingSource = readFileSync(new URL('../src/pages/reading/ReadingPageView.jsx', import.meta.url), 'utf8');

test('timeout recovery covers response body, uses a longer budget for book lookup and never retries writes automatically', () => {
  assert.match(apiSource, /responseText = await response\.text\(\)/);
  assert.match(apiSource, /timeoutMs = REQUEST_TIMEOUT_MS/);
  assert.match(apiSource, /timeoutMs: 30_000/);
  assert.match(apiSource, /REQUEST_OUTCOME_UNKNOWN/);
  assert.doesNotMatch(apiSource, /retry|retries/i);
});

test('habit check-in and reading log refresh persisted state after an uncertain write', () => {
  assert.match(habitsSource, /requestError\.code === 'REQUEST_OUTCOME_UNKNOWN'[\s\S]{0,180}await loadHabits\(\)/);
  assert.match(habitsSource, /confira o contador antes de registrar novamente/);
  assert.match(readingSource, /requestError\.code === 'REQUEST_OUTCOME_UNKNOWN'[\s\S]{0,220}loadReading\(booksPage\), loadReadingFeed\(\)/);
  assert.match(readingSource, /confira o progresso do livro antes de tentar novamente/);
});
