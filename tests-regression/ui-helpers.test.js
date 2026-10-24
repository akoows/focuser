import test from 'node:test';
import assert from 'node:assert/strict';

const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

function getHabitFrequencyLabel(frequency, daysOfWeek = []) {
  if (frequency === 'DAILY' || daysOfWeek.length === 7) return 'Todos os dias';
  return daysOfWeek.length ? daysOfWeek.map((day) => WEEKDAY_NAMES[day]).join(', ') : 'Selecione os dias';
}

function formatFrequency(habit) {
  if (habit.frequency === 'DAILY') return 'Todos os dias';
  return (habit.daysOfWeek || []).map((day) => WEEKDAY_NAMES[day]).join(', ');
}

function formatReadingDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${minutes} min`;
  if (!remainingMinutes) return `${hours} h`;
  return `${hours} h ${remainingMinutes} min`;
}

function calculateProgressPercent(current, target) {
  if (!Number.isFinite(target) || target <= 0) return 0;
  if (!Number.isFinite(current) || current <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}

const ACCENT_COLORS = [
  { value: '#ffffff', label: 'Branco' },
  { value: '#c4b5fd', label: 'Lavanda' },
  { value: '#93c5fd', label: 'Azul' },
  { value: '#6ee7b7', label: 'Menta' },
  { value: '#f9a8d4', label: 'Rosa' },
  { value: '#fcd34d', label: 'Âmbar' },
];

test('UI helpers and state calculations regression', async (t) => {
  await t.test('getHabitFrequencyLabel formats daily and custom schedules', () => {
    assert.equal(getHabitFrequencyLabel('DAILY', []), 'Todos os dias');
    assert.equal(getHabitFrequencyLabel('CUSTOM', [0, 1, 2, 3, 4, 5, 6]), 'Todos os dias');
    assert.equal(getHabitFrequencyLabel('CUSTOM', [1, 3, 5]), 'Segunda, Quarta, Sexta');
    assert.equal(getHabitFrequencyLabel('CUSTOM', [0, 6]), 'Domingo, Sábado');
    assert.equal(getHabitFrequencyLabel('CUSTOM', []), 'Selecione os dias');
  });

  await t.test('formatFrequency handles habits without daysOfWeek gracefully', () => {
    assert.equal(formatFrequency({ frequency: 'DAILY' }), 'Todos os dias');
    assert.equal(formatFrequency({ frequency: 'CUSTOM', daysOfWeek: [2, 4] }), 'Terça, Quinta');
    assert.equal(formatFrequency({ frequency: 'CUSTOM' }), '');
  });

  await t.test('formatReadingDuration produces compact and descriptive labels', () => {
    assert.equal(formatReadingDuration(15), '15 min');
    assert.equal(formatReadingDuration(60), '1 h');
    assert.equal(formatReadingDuration(90), '1 h 30 min');
    assert.equal(formatReadingDuration(150), '2 h 30 min');
    assert.equal(formatReadingDuration(180), '3 h');
  });

  await t.test('calculateProgressPercent clamps between 0 and 100 and prevents NaN', () => {
    assert.equal(calculateProgressPercent(0, 10), 0);
    assert.equal(calculateProgressPercent(5, 10), 50);
    assert.equal(calculateProgressPercent(10, 10), 100);
    assert.equal(calculateProgressPercent(15, 10), 100);
    assert.equal(calculateProgressPercent(0, 0), 0);
    assert.equal(calculateProgressPercent(-5, 10), 0);
    assert.equal(calculateProgressPercent(5, -1), 0);
  });

  await t.test('ACCENT_COLORS definitions follow strict hex color schema', () => {
    const hexRegex = /^#[0-9a-f]{6}$/i;
    for (const color of ACCENT_COLORS) {
      assert.match(color.value, hexRegex, `Cor inválida: ${color.value}`);
      assert.ok(color.label && color.label.length > 0);
    }
  });

  await t.test('LOCAL_TODAY_DATE format matches ISO YYYY-MM-DD pattern', () => {
    const localToday = new Intl.DateTimeFormat('en-CA').format(new Date());
    assert.match(localToday, /^\d{4}-\d{2}-\d{2}$/);
  });
});
