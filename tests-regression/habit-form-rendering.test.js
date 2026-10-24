import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pageSource = readFileSync(new URL('../src/pages/habits/HabitsPage.jsx', import.meta.url), 'utf8');
const formSource = readFileSync(new URL('../src/pages/habits/HabitFormModal.jsx', import.meta.url), 'utf8');
const sidebarSource = readFileSync(new URL('../src/SidebarRail.css', import.meta.url), 'utf8');
const appCssSource = readFileSync(new URL('../src/App.css', import.meta.url), 'utf8');
const colorTypeIndex = formSource.indexOf('type="color"');
const colorInputStart = formSource.lastIndexOf('<input', colorTypeIndex);
const colorInputEnd = formSource.indexOf('/>', colorTypeIndex) + 2;
const colorInputSource = colorTypeIndex >= 0 && colorInputEnd >= 2
  ? formSource.slice(colorInputStart, colorInputEnd)
  : '';

test('color selector form state stays inside its modal so card list does not rerender while selecting color', () => {
  assert.match(formSource, /const\s+\[form,\s*setForm\]\s*=\s*useState/);
  assert.doesNotMatch(pageSource, /const\s+\[form,\s*setForm\]\s*=\s*useState/);
  assert.match(formSource, /onSubmit=\{\(event\)\s*=>\s*onSubmit\(event,\s*\{\s*\.\.\.form,\s*color:\s*colorPickerInputRef\.current\?\.value\s*\|\|\s*form\.color\s*\}\)\}/);
});

test('native color dragging does not update the full form on every picker event', () => {
  assert.match(colorInputSource, /defaultValue=\{form\.color\}/);
  assert.match(colorInputSource, /onBlur=\{/);
  assert.doesNotMatch(colorInputSource, /value=\{form\.color\}|onChange=/);
  assert.match(formSource, /onSubmit=\{\(event\)\s*=>\s*onSubmit\(event,\s*\{\s*\.\.\.form,\s*color:\s*colorPickerInputRef\.current\?\.value\s*\|\|\s*form\.color\s*\}\)\}/);
});

test('desktop sidebar star has a rendered box instead of a zero-sized inline span', () => {
  const starStyles = sidebarSource.match(/\.sidebar-brand-star\s*\{([^}]+)\}/)?.[1] || '';
  assert.match(starStyles, /display:\s*block/);
  assert.match(starStyles, /width:\s*24px/);
  assert.match(starStyles, /height:\s*24px/);
});

test('custom color drives modal theme and the close button stays centered in its heading', () => {
  assert.match(formSource, /className="card habit-form habit-form-modal" style=\{\{\s*'--habit-color':\s*form\.color\s*\}\}/);
  assert.match(appCssSource, /\.card\.habit-form-modal\s*\{/);
  const modalStyles = appCssSource.match(/\.habit-form-modal\s*\{([^}]+)\}/)?.[1] || '';
  assert.match(modalStyles, /background:\s*linear-gradient/);
  assert.match(modalStyles, /var\(--habit-color/);
  const closeStyles = appCssSource.match(/\.habit-form-modal \.habit-form-heading \.habit-category-filter-close\s*\{([^}]+)\}/)?.[1] || '';
  assert.match(closeStyles, /align-self:\s*center/);
  assert.match(closeStyles, /margin-left:\s*auto/);
});
