'use strict';
const config = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const authService = require('../services/authService');
const registrationUploadService = require('../services/registrationUploadService');

const baseCookie = () => ({ httpOnly: true, secure: config.cookie.secure, sameSite: config.cookie.sameSite, path: '/' });

exports.register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.valid.body);
  ok(res, { user: authService.publicUser(result.user), emailVerificationRequired: result.emailVerificationRequired }, 201);
});

exports.registrationAvatarSignature = asyncHandler(async (req, res) => {
  ok(res, await registrationUploadService.createSignature('avatar'));
});

exports.registrationBannerSignature = asyncHandler(async (req, res) => {
  ok(res, await registrationUploadService.createSignature('banner'));
});

exports.login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.valid.body);
  if (result.token) {
    // JWT apenas em cookie httpOnly (inacessível a JavaScript => mitiga roubo por XSS). Nunca no corpo.
    res.cookie(config.cookie.name, result.token, { ...baseCookie(), maxAge: config.jwt.expiresInDays * 86400000 });
    return ok(res, { user: result.user });
  }
  ok(res, result);
});

exports.verifyEmail = asyncHandler(async (req, res) => {
  ok(res, await authService.verifyEmail(req.valid.body));
});

exports.resendEmailVerification = asyncHandler(async (req, res) => {
  ok(res, await authService.resendEmailVerification(req.valid.body));
});

exports.verifyLogin = asyncHandler(async (req, res) => {
  const { user, token } = await authService.verifyLogin(req.valid.body);
  res.cookie(config.cookie.name, token, { ...baseCookie(), maxAge: config.jwt.expiresInDays * 86400000 });
  ok(res, { user });
});

exports.logout = asyncHandler(async (req, res) => {
  await authService.logout(req.cookies?.[config.cookie.name]);
  res.clearCookie(config.cookie.name, baseCookie());
  ok(res, { message: 'Sessão encerrada.' });
});

exports.me = (req, res) => ok(res, { user: authService.publicUser(req.user) });
