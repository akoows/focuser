'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const checkInService = require('../services/checkInService');

exports.create = asyncHandler(async (req, res) => ok(res, { checkIn: await checkInService.create(req.user, req.valid.params.id, req.valid.body) }, 201));
exports.list = asyncHandler(async (req, res) => ok(res, await checkInService.list(req.user.id, req.valid.params.id, req.valid.query)));
exports.remove = asyncHandler(async (req, res) => {
  await checkInService.remove(req.user.id, req.valid.params.id, req.valid.params.checkInId);
  ok(res, { deleted: true });
});
exports.today = asyncHandler(async (req, res) => ok(res, await checkInService.today(req.user)));
