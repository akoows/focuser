'use strict';
// Constantes de negócio (sem dependência de ambiente: usadas também pelos testes unitários).
module.exports = Object.freeze({
  ALL_DAYS: Object.freeze([0, 1, 2, 3, 4, 5, 6]),
  MAX_HABITS_PER_USER: 100,
  MAX_GOALS_PER_USER: 100,
  MAX_READING_BOOKS_PER_USER: 100,
  MAX_BACKDATE_DAYS: 7,
  MAX_RANGE_DAYS: 366,
  STREAK_WINDOW_DAYS: 365,
  PERIOD_DAYS: Object.freeze({ week: 7, month: 30, quarter: 90 }),
  OBJECT_ID_REGEX: /^[a-f\d]{24}$/i,
});
