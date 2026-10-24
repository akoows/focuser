import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  deleteHabitColorPreset,
  habitColorStorageKey,
  readHabitColorPresets,
  saveHabitColorPreset,
  writeHabitColorPresets,
} from '../src/pages/habits/habitColorPresets.js';

const pageSource = readFileSync(new URL('../src/pages/habits/HabitsPage.jsx', import.meta.url), 'utf8');
const formSource = readFileSync(new URL('../src/pages/habits/HabitFormModal.jsx', import.meta.url), 'utf8');

test('custom habit colors persist per user and can be saved, updated and removed', () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  let presets = saveHabitColorPreset([], '#123abc', () => 'preset-1');
  assert.equal(writeHabitColorPresets('user-1', presets, storage), true);
  assert.deepEqual(readHabitColorPresets('user-1', storage), presets);
  assert.deepEqual(readHabitColorPresets('user-2', storage), []);

  presets = saveHabitColorPreset(presets, '#abcdef', () => 'preset-2');
  assert.equal(presets.length, 2);
  assert.equal(presets[1].color, '#ABCDEF');
  presets = deleteHabitColorPreset(presets, 'preset-1');
  assert.equal(presets.length, 1);
  presets = deleteHabitColorPreset(presets, 'preset-2');
  assert.deepEqual(presets, []);
});

test('preset updates stay in page state while live color selection stays local to the form', () => {
  assert.match(pageSource, /setSavedHabitColors\(\(current\)\s*=>\s*saveHabitColorPreset\(current,\s*color\)\)/);
  assert.match(pageSource, /setSavedHabitColors\(\(current\)\s*=>\s*deleteHabitColorPreset\(current,\s*presetId\)\)/);
  assert.match(formSource, /const\s+\[form,\s*setForm\]\s*=\s*useState/);
  assert.match(formSource, /onSubmit=\{\(event\)\s*=>\s*onSubmit\(event,\s*\{\s*\.\.\.form,\s*color:\s*colorPickerInputRef\.current\?\.value\s*\|\|\s*form\.color\s*\}\)\}/);
  assert.match(formSource, /type="color"/);
  assert.match(pageSource, /writeHabitColorPresets\(userId,\s*savedHabitColors\)/);
  assert.notEqual(habitColorStorageKey('user-1'), habitColorStorageKey('user-2'));
  assert.doesNotMatch(formSource, /Nome do preset de cor|HABIT_COLORS/);
  assert.match(formSource, /aria-label="Código hexadecimal da cor"/);
  assert.match(formSource, /const color = normalizeHabitHexColor\(value\)/);
  assert.match(formSource, /setForm\(\(current\) => \(\{ \.\.\.current, color \}\)\)/);
  assert.match(formSource, /onSaveColorPreset\(colorPickerInputRef\.current\?\.value\s*\|\|\s*form\.color\)/);
});
