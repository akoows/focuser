'use strict';
// Utilitários de datas baseados em "dateKey" (string "YYYY-MM-DD") no fuso do usuário.
// Comparar dateKeys lexicograficamente equivale a comparar datas.

const fmtCache = new Map();
function formatter(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    fmtCache.set(tz, f);
  }
  return f;
}

function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function dateKeyFromInstant(date, tz) {
  const parts = formatter(tz).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function parseDateKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toISOString().slice(0, 10) === key ? date : null;
}

const isValidDateKey = (key) => parseDateKey(key) !== null;

function addDays(key, n) {
  const d = parseDateKey(key);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const dayOfWeek = (key) => parseDateKey(key).getUTCDay(); // 0=domingo
const diffDays = (a, b) => Math.round((parseDateKey(b) - parseDateKey(a)) / 86400000);

module.exports = { isValidTimeZone, dateKeyFromInstant, parseDateKey, isValidDateKey, addDays, dayOfWeek, diffDays };
