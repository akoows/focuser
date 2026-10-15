'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const focusSessionService = require('../services/focusSessionService');

exports.create = asyncHandler(async (req, res) => ok(res, { session: await focusSessionService.create(req.user.id, req.valid.body) }, 201));
exports.list = asyncHandler(async (req, res) => ok(res, await focusSessionService.list(req.user.id, req.valid.query)));
exports.active = asyncHandler(async (req, res) => ok(res, { session: await focusSessionService.getActive(req.user.id) }));
exports.get = asyncHandler(async (req, res) => ok(res, { session: await focusSessionService.get(req.user.id, req.valid.params.id) }));
exports.pause = asyncHandler(async (req, res) => ok(res, { session: await focusSessionService.pause(req.user.id, req.valid.params.id) }));
exports.resume = asyncHandler(async (req, res) => ok(res, { session: await focusSessionService.resume(req.user.id, req.valid.params.id) }));
exports.complete = asyncHandler(async (req, res) => ok(res, { session: await focusSessionService.complete(req.user.id, req.valid.params.id) }));
exports.cancel = asyncHandler(async (req, res) => ok(res, { session: await focusSessionService.cancel(req.user.id, req.valid.params.id) }));
