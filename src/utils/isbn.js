'use strict';

function normalizeIsbn(value) {
  return String(value).replace(/[\s-]/g, '').toUpperCase();
}

function isValidIsbn(value) {
  const normalized = normalizeIsbn(value);
  if (/^\d{9}[\dX]$/.test(normalized)) {
    const sum = [...normalized].reduce((total, digit, index) => total + Number(digit === 'X' ? 10 : digit) * (10 - index), 0);
    return sum % 11 === 0;
  }
  if (/^\d{13}$/.test(normalized)) {
    const sum = [...normalized].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    return sum % 10 === 0;
  }
  return false;
}

module.exports = { normalizeIsbn, isValidIsbn };
