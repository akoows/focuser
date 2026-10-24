import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_ACCENT_PRESETS,
  getAppAccentColor,
  getAccentContrast,
  saveAppAccentColor,
  saveAppColorPresets,
} from '../src/pages/settings/appThemeSettings.js';

test('app and public-profile accent selectors share one complete preset palette', () => {
  assert.deepEqual(APP_ACCENT_PRESETS.map(({ label }) => label), ['Branco', 'Lavanda', 'Azul', 'Menta', 'Rosa', 'Âmbar']);
  assert.equal(new Set(APP_ACCENT_PRESETS.map(({ value }) => value.toLowerCase())).size, APP_ACCENT_PRESETS.length);
  assert.ok(APP_ACCENT_PRESETS.every(({ value }) => /^#[\da-f]{6}$/i.test(value)));
});

test('accent contrast remains readable on light, dark, saturated and invalid colors', () => {
  assert.equal(getAccentContrast('#ffffff'), '#111111');
  assert.equal(getAccentContrast('#000000'), '#ffffff');
  assert.equal(getAccentContrast('#3724ff'), '#ffffff');
  assert.equal(getAccentContrast('#ffff00'), '#111111');
  assert.equal(getAccentContrast('invalid'), '#111111');
  assert.equal(getAccentContrast(null), '#111111');
});

test('getAppAccentColor preserves valid hex values and falls back for missing or invalid data', () => {
  assert.equal(getAppAccentColor('#C4B5FD'), '#C4B5FD');
  assert.equal(getAppAccentColor(undefined), '#ffffff');
  assert.equal(getAppAccentColor('lavender'), '#ffffff');
  assert.equal(getAppAccentColor('#12345'), '#ffffff');
});

test('saveAppAccentColor persists a valid value and rejects invalid values or unavailable API', async () => {
  const updateProfile = async (data) => ({ user: { id: 'user-1', ...data } });
  assert.deepEqual(await saveAppAccentColor({ updateProfile }, '#c4b5fd'), {
    user: { id: 'user-1', appAccentColor: '#c4b5fd' },
  });
  await assert.rejects(saveAppAccentColor({ updateProfile }, 'blue'), /cor hexadecimal/i);
  await assert.rejects(saveAppAccentColor({}, '#ffffff'), /não está disponível/i);
});

test('saveAppColorPresets accepts up to 30 presets and rejects malformed lists', async () => {
  const updateProfile = async (data) => data;
  const presets = Array.from({ length: 30 }, (_, index) => ({ id: String(index) }));
  assert.deepEqual(await saveAppColorPresets({ updateProfile }, presets), { appColorPresets: presets });
  await assert.rejects(saveAppColorPresets({ updateProfile }, Array(31).fill({})), /até 30/);
  await assert.rejects(saveAppColorPresets({ updateProfile }, {}), /lista/);
});
