import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('primary actions derive their fill and foreground from the selected accent', () => {
  const appCss = readSource('../src/App.css');
  const recoveredCss = readSource('../src/RecoveredFeatures.css');
  const app = readSource('../src/App.jsx');

  assert.match(appCss, /\.button-primary\s*\{[^}]*background:\s*var\(--accent\)/s);
  assert.match(recoveredCss, /\.button-primary\s*\{[^}]*color:\s*var\(--on-accent/);
  assert.doesNotMatch(app, /setProperty\(['"]--white['"]/);
  assert.doesNotMatch(appCss, /var\(--white\)/);
  assert.doesNotMatch(recoveredCss, /var\(--white\)/);
});

test('app navigation transitions have reduced-motion support', () => {
  const app = readSource('../src/App.jsx');
  const motionCss = readSource('../src/MotionEnhancements.css');

  assert.match(app, /className="app-page-motion"/);
  assert.match(motionCss, /@keyframes app-page-enter/);
  assert.match(motionCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(motionCss, /\.app-page-motion[\s\S]*?animation:\s*none\s*!important/);
});

test('both appearance interfaces consume the same accent presets', () => {
  const settings = readSource('../src/pages/settings/AppearanceSettings.jsx');
  const profile = readSource('../src/pages/ProfilePage.jsx');
  const presets = readSource('../src/pages/settings/appThemeSettings.js');

  assert.match(settings, /APP_ACCENT_PRESETS\.map/);
  assert.match(profile, /APP_ACCENT_PRESETS\.map/);
  assert.doesNotMatch(profile, /const ACCENT_COLORS\s*=/);
  assert.match(presets, /export const APP_ACCENT_PRESETS/);
});
