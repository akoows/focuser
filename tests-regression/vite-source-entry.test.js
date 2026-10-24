import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('Vite serves the current React source instead of a stale built bundle', async () => {
  const html = await readFile(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

  assert.match(html, /<script\s+type="module"\s+src="\/src\/main\.jsx"\s*>/);
  assert.doesNotMatch(html, /src="\/assets\/index-[^"]+\.js"/);
});
