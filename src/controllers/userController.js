'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const config = require('../config/env');
const authService = require('../services/authService');
const userService = require('../services/userService');
const cloudinaryService = require('../services/cloudinaryService');

const baseCookie = () => ({ httpOnly: true, secure: config.cookie.secure, sameSite: config.cookie.sameSite, path: '/' });

exports.me = (req, res) => ok(res, { user: authService.publicUser(req.user) });

exports.publicProfile = asyncHandler(async (req, res) => {
  ok(res, { profile: await userService.publicProfile(req.valid.params.username) });
});

exports.update = asyncHandler(async (req, res) => {
  const user = await userService.update(req.user.id, req.valid.body);
  ok(res, { user: authService.publicUser(user) });
});

exports.updateReadingFocus = asyncHandler(async (req, res) => {
  ok(res, await userService.updateReadingFocus(req.user.id, req.valid.body));
});

exports.clearReadingFocus = asyncHandler(async (req, res) => {
  await userService.clearReadingFocus(req.user.id, req.valid.body.sessionId);
  ok(res, { cleared: true });
});

exports.avatarSignature = (req, res) => ok(res, cloudinaryService.avatarUploadSignature(req.user.id));
exports.bannerSignature = (req, res) => ok(res, cloudinaryService.bannerUploadSignature(req.user.id));

exports.startPasswordChange = asyncHandler(async (req, res) => {
  ok(res, await userService.startPasswordChange(req.user.id, req.valid.body));
});

exports.verifyPasswordChange = asyncHandler(async (req, res) => {
  const { user, token } = await userService.verifyPasswordChange(req.user.id, req.valid.body);
  res.cookie(config.cookie.name, token, { ...baseCookie(), maxAge: config.jwt.expiresInDays * 86400000 });
  ok(res, { user });
});
