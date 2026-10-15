'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../../src/utils/dates');

test('dateKeyFromInstant respeita o fuso horário', () => {
  const instant = new Date('2026-10-12T02:30:00Z');
  assert.equal(d.dateKeyFromInstant(instant, 'UTC'), '2026-10-12');
  assert.equal(d.dateKeyFromInstant(instant, 'America/Sao_Paulo'), '2026-10-11'); // UTC-3
  assert.equal(d.dateKeyFromInstant(new Date('2026-10-12T12:00:00Z'), 'Pacific/Kiritimati'), '2026-10-13'); // UTC+14
});

test('isValidDateKey rejeita datas impossíveis e formatos errados', () => {
  assert.equal(d.isValidDateKey('2024-02-29'), true);
  assert.equal(d.isValidDateKey('2026-02-29'), false);
  assert.equal(d.isValidDateKey('2026-02-30'), false);
  assert.equal(d.isValidDateKey('2026-1-1'), false);
  assert.equal(d.isValidDateKey('2026-10-12T00:00:00Z'), false);
  assert.equal(d.isValidDateKey(20261012), false);
});

test('isValidTimeZone', () => {
  assert.equal(d.isValidTimeZone('America/Sao_Paulo'), true);
  assert.equal(d.isValidTimeZone('Mars/Base'), false);
  assert.equal(d.isValidTimeZone(''), false);
  assert.equal(d.isValidTimeZone({ $ne: 1 }), false);
  assert.equal(d.isValidTimeZone('A'.repeat(100)), false);
});

test('addDays, dayOfWeek e diffDays', () => {
  assert.equal(d.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(d.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(d.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(d.dayOfWeek('2026-10-12'), 1); // segunda-feira
  assert.equal(d.diffDays('2026-10-01', '2026-10-12'), 11);
});
