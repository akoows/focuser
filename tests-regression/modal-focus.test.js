import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const modalFiles = [
  '../src/pages/habits/HabitsPage.jsx',
  '../src/pages/habits/CategoryDrawer.jsx',
  '../src/pages/habits/HabitComponents.jsx',
  '../src/pages/habits/HabitHistoryDrawer.jsx',
  '../src/pages/reading/ReadingPageView.jsx',
];

test('every aria-modal component uses the shared focus scope for entry, containment, and restoration', () => {
  for (const file of modalFiles) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /activateModalFocus/, `${file} should install the shared modal focus scope`);
    assert.match(source, /aria-modal="true"/, `${file} should declare modal semantics`);
  }
});

test('habit form and reorder dialogs provide a meaningful fallback focus target', () => {
  const habitsPage = readFileSync(new URL('../src/pages/habits/HabitsPage.jsx', import.meta.url), 'utf8');
  const formModal = readFileSync(new URL('../src/pages/habits/HabitFormModal.jsx', import.meta.url), 'utf8');
  assert.match(habitsPage, /fallbackFocus:\s*\(\)\s*=>\s*habitFormReturnFocusRef\.current/);
  assert.match(habitsPage, /fallbackFocus:\s*\(\)\s*=>\s*reorderButtonRef\.current/);
  assert.match(formModal, /ref=\{dialogRef\}/);
  assert.match(formModal, /role="dialog" aria-modal="true"/);
});
