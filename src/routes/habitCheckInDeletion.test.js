import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../app.js';
import { parseApiConfig } from '../config/env.js';
import { AUTH_COOKIE, createAuthToken } from '../middlewares/auth.js';
import { prisma } from '../lib/prisma.js';

test('deleting a check-in refreshes cached streaks and protects owner boundaries', async (t) => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'local-test-secret-for-check-in-deletion-only-123456';
  t.after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });
  const user = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', tokenVersion: 0, timezone: 'America/Sao_Paulo' };
  const habit = { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', userId: user.id, frequency: 'DAILY', startDateKey: '2026-01-01', currentStreak: 3, longestStreak: 3 };
  const original = {
    findUnique: prisma.user.findUnique,
    findHabit: prisma.habit.findFirst,
    remove: prisma.checkIn.deleteMany,
    findCheckIns: prisma.checkIn.findMany,
    updateHabit: prisma.habit.update,
  };
  const counts = { findHabit: 0, remove: 0, update: 0 };
  prisma.user.findUnique = async () => user;
  prisma.habit.findFirst = async ({ where }) => { counts.findHabit += 1; assert.equal(where.userId, user.id); return habit; };
  prisma.checkIn.deleteMany = async ({ where }) => {
    counts.remove += 1;
    assert.deepEqual(where, { id: 'cccccccccccccccccccccccc', habitId: habit.id, userId: user.id });
    return { count: 1 };
  };
  prisma.checkIn.findMany = async () => [];
  prisma.habit.update = async (args) => { counts.update += 1; return args; };
  t.after(() => {
    prisma.user.findUnique = original.findUnique;
    prisma.habit.findFirst = original.findHabit;
    prisma.checkIn.deleteMany = original.remove;
    prisma.checkIn.findMany = original.findCheckIns;
    prisma.habit.update = original.updateHabit;
  });
  const app = createApp(parseApiConfig({ NODE_ENV: 'test', DATABASE_URL: 'mongodb://127.0.0.1:27018/focuser_test?replicaSet=rs0', JWT_SECRET: process.env.JWT_SECRET }));
  const cookie = `${AUTH_COOKIE}=${createAuthToken(user)}`;
  const path = `/api/habits/${habit.id}/check-ins/cccccccccccccccccccccccc`;
  const success = await request(app).delete(path).set('Cookie', cookie).set('X-Focuser-Client', 'web');
  assert.equal(success.status, 200);
  assert.deepEqual(success.body.data, { deleted: true, streaks: { currentStreak: 0, longestStreak: 0 } });
  assert.equal(counts.update, 1);
  prisma.checkIn.deleteMany = async () => { counts.remove += 1; return { count: 0 }; };
  const missing = await request(app).delete(path).set('Cookie', cookie).set('X-Focuser-Client', 'web');
  assert.equal(missing.status, 404);
  assert.equal(counts.update, 1);
  prisma.habit.findFirst = async () => { counts.findHabit += 1; return null; };
  const unowned = await request(app).delete(path).set('Cookie', cookie).set('X-Focuser-Client', 'web');
  assert.equal(unowned.status, 404);
  assert.equal(counts.remove, 2);
});
