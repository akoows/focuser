import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHabitPayload, createHabitFormState, normalizeHabitHexColor } from '../src/pages/habits/habitFormModel.js';

test('hex color input accepts six digits with or without hash and rejects partial or invalid values', () => {
  assert.equal(normalizeHabitHexColor('#a1B2c3'), '#A1B2C3');
  assert.equal(normalizeHabitHexColor(' a1b2c3 '), '#A1B2C3');
  assert.equal(normalizeHabitHexColor('#abc'), null);
  assert.equal(normalizeHabitHexColor('#12GG56'), null);
  assert.equal(normalizeHabitHexColor(null), null);
});

test('habit form initializes a safe default model', () => {
  assert.deepEqual(createHabitFormState(), {
    name: '', description: '', category: '', icon: 'TARGET', dailyTarget: 1,
    step: 1, unit: '', timeOfDay: 'ANYTIME', color: '#FFFFFF', frequency: 'DAILY', daysOfWeek: [],
  });
});

test('new habits use the user accent while editing preserves a chosen habit color', () => {
  assert.equal(createHabitFormState(null, '#123abc').color, '#123ABC');
  assert.equal(createHabitFormState(null, 'invalid').color, '#FFFFFF');
  assert.equal(createHabitFormState({ color: '#fedcba' }, '#123abc').color, '#fedcba');
  assert.equal(createHabitFormState({}, '#123abc').color, '#123ABC');
});

test('habit form safely restores optional values and custom schedule', () => {
  const daysOfWeek = [1, 3];
  const form = createHabitFormState({
    name: 'Água', frequency: 'CUSTOM', daysOfWeek, dailyTarget: 2000,
    step: 250, unit: 'ML', timeOfDay: 'MORNING', color: '#93c5fd', icon: 'DROPLET',
  });
  assert.equal(form.name, 'Água');
  assert.equal(form.icon, 'DROPLET');
  assert.equal(form.dailyTarget, 2000);
  assert.equal(form.step, 250);
  assert.deepEqual(form.daysOfWeek, daysOfWeek);
  assert.notStrictEqual(form.daysOfWeek, daysOfWeek);
});

test('habit payload trims text and keeps the selected color, unit and schedule', () => {
  const payload = buildHabitPayload({
    name: '  Água  ', description: '  2 litros  ', category: 'Saúde', icon: 'DROPLET',
    dailyTarget: 2000, step: 250, color: '#93c5fd', unit: 'ML', timeOfDay: 'MORNING',
    frequency: 'CUSTOM', daysOfWeek: [1, 3],
  });
  assert.deepEqual(payload, {
    name: 'Água', description: '2 litros', category: 'Saúde', icon: 'DROPLET',
    dailyTarget: 2000, step: 250, color: '#93c5fd', unit: 'ML', timeOfDay: 'MORNING',
    frequency: 'CUSTOM', daysOfWeek: [1, 3],
  });
});

test('editing can clear description and unit without losing other form values', () => {
  const payload = buildHabitPayload({
    name: 'Leitura', description: ' ', category: '', icon: 'BOOK', dailyTarget: 30,
    step: 1, color: '#c4b5fd', unit: '', timeOfDay: 'EVENING', frequency: 'DAILY', daysOfWeek: [],
  }, true);
  assert.equal(payload.description, null);
  assert.equal(payload.unit, null);
  assert.equal(payload.timeOfDay, 'EVENING');
});
