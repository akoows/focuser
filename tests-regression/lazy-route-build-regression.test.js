import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'vite';

test('Vite emits separate dynamic bundles for lazy page routes', async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'focuser-web-lazy-routes-'));
  const temporaryRoot = resolve(tmpdir());
  const resolvedOutputDirectory = resolve(outputDirectory);
  assert.ok(resolvedOutputDirectory.startsWith(`${temporaryRoot}${sep}`));
  assert.ok(basename(resolvedOutputDirectory).startsWith('focuser-web-lazy-routes-'));

  try {
    await build({
      configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
      logLevel: 'silent',
      build: {
        emptyOutDir: true,
        manifest: true,
        outDir: outputDirectory,
      },
    });

    const manifest = JSON.parse(await readFile(join(outputDirectory, '.vite', 'manifest.json'), 'utf8'));
    const appEntry = manifest['index.html'];
    assert.ok(appEntry, 'the Vite manifest includes the HTML application entry');

    const expectedLazyModules = [
      'src/pages/AcademyPage.jsx',
      'src/pages/habits/HabitsPage.jsx',
      'src/pages/reading/ReadingPageView.jsx',
      'src/pages/GoalsPage.jsx',
      'src/pages/ProfilePage.jsx',
    ];
    const dynamicImports = new Set(appEntry.dynamicImports || []);
    for (const moduleId of expectedLazyModules) {
      assert.ok(dynamicImports.has(moduleId), `${moduleId} is emitted as a dynamic import`);
      const chunk = manifest[moduleId];
      assert.equal(chunk?.isDynamicEntry, true, `${moduleId} has its own dynamic entry chunk`);
      assert.notEqual(chunk.file, appEntry.file, `${moduleId} is not bundled into the initial App entry`);
    }
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
