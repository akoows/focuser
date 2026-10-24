import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profileSource = readFileSync(new URL('../src/pages/ProfilePage.jsx', import.meta.url), 'utf8');
const readingSource = readFileSync(new URL('../src/pages/reading/ReadingPageView.jsx', import.meta.url), 'utf8');

test('reading page keeps its initial loading state and still refreshes on later user actions', () => {
  assert.match(readingSource, /const \[isLoading, setIsLoading\] = useState\(true\)/);
  assert.match(readingSource, /const loadReading = useCallback\(async \(throughPage = 1\) => \{\s*const requestId = \+\+booksRequestIdRef\.current;\s*setIsLoading\(true\)/);
  assert.match(readingSource, /Promise\.all\(\[\s*loadBookPages\(focuserApi\.reading\.listBooks,[\s\S]*?focuserApi\.reading\.today\(\),\s*\]\)\s*\.then\(\(\[booksResponse, todayResponse\]\) => \{\s*if \(!active \|\| requestId !== booksRequestIdRef\.current\) return/);
  assert.match(readingSource, /setIsLoading\(false\)/);
  assert.match(readingSource, /booksRequestIdRef\.current \+= 1/);
});

test('profile book loading stays scoped to the account and ignores stale responses', () => {
  const effectStart = profileSource.indexOf('const requestId = ++profileBooksRequestIdRef.current;');
  const effectEnd = profileSource.indexOf('}, [user?.id]);', effectStart);
  assert.ok(effectStart >= 0 && effectEnd > effectStart, 'profile effect remains keyed to the user id');
  const profileBooksEffect = profileSource.slice(effectStart, effectEnd);
  assert.match(profileBooksEffect, /if \(!active \|\| requestId !== profileBooksRequestIdRef\.current\) return/);
  assert.match(profileBooksEffect, /active = false/);
  assert.match(profileBooksEffect, /profileBooksRequestIdRef\.current \+= 1/);
  assert.doesNotMatch(profileBooksEffect, /setCurrentBookId|setFavoriteBookId/);
});
