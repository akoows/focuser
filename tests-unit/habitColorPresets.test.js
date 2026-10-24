import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deleteHabitColorPreset,
  habitColorStorageKey,
  readHabitColorPresets,
  saveHabitColorPreset,
  writeHabitColorPresets,
} from '../src/pages/habits/habitColorPresets.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values,
  };
}

test('color preset storage is scoped to each account', () => {
  assert.notEqual(habitColorStorageKey('user-a'), habitColorStorageKey('user-b'));
});

test('reading presets keeps valid entries and safely handles malformed storage', () => {
  const storage = createStorage({
    [habitColorStorageKey('user-a')]: JSON.stringify([
      { id: 'valid', name: 'Lavanda', color: '#c4b5fd' },
      { id: 2, name: 'id inválido', color: '#ffffff' },
      { id: 'bad-color', name: 'Cor inválida', color: 'blue' },
      { id: 'blank-name', name: ' ', color: '#ffffff' },
    ]),
    [habitColorStorageKey('user-b')]: '{broken json',
  });

  assert.deepEqual(readHabitColorPresets('user-a', storage), [
    { id: 'valid', name: 'Lavanda', color: '#c4b5fd' },
  ]);
  assert.deepEqual(readHabitColorPresets('user-b', storage), []);
  assert.deepEqual(readHabitColorPresets('user-c', null), []);
});

test('writing presets can be read back and reports blocked storage', () => {
  const storage = createStorage();
  const presets = [{ id: 'one', name: 'Azul', color: '#93c5fd' }];
  assert.equal(writeHabitColorPresets('user-a', presets, storage), true);
  assert.deepEqual(readHabitColorPresets('user-a', storage), presets);
  assert.equal(writeHabitColorPresets('user-a', presets, null), false);
  assert.equal(writeHabitColorPresets('user-a', presets, { setItem() { throw new Error('blocked'); } }), false);
});

test('saving custom colors needs no name, ignores duplicates and enforces the limit', () => {
  const presets = [{ id: 'one', name: 'Azul', color: '#93c5fd' }];
  assert.strictEqual(saveHabitColorPreset(presets, 'green'), presets);
  assert.strictEqual(saveHabitColorPreset(presets, null), presets);
  assert.strictEqual(saveHabitColorPreset(presets, '#93C5FD'), presets);
  assert.deepEqual(saveHabitColorPreset(presets, '#a7f3d0', () => 'new-id'), [
    presets[0],
    { id: 'new-id', name: '#A7F3D0', color: '#A7F3D0' },
  ]);

  const full = Array.from({ length: 24 }, (_, index) => ({ id: `${index}`, name: `Cor ${index}`, color: '#ffffff' }));
  assert.strictEqual(saveHabitColorPreset(full, '#000000'), full);
});

test('deleting a preset leaves other colors intact', () => {
  const presets = [
    { id: 'one', name: 'Azul', color: '#93c5fd' },
    { id: 'two', name: 'Rosa', color: '#f9a8d4' },
  ];
  assert.deepEqual(deleteHabitColorPreset(presets, 'one'), [presets[1]]);
  assert.deepEqual(deleteHabitColorPreset(null, 'one'), []);
});
