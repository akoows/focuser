'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const goalService = require('../services/goalService');

exports.create = asyncHandler(async (req, res) => ok(res, { goal: await goalService.create(req.user.id, req.valid.body) }, 201));
exports.list = asyncHandler(async (req, res) => ok(res, await goalService.list(req.user.id, req.valid.query)));
exports.get = asyncHandler(async (req, res) => ok(res, { goal: await goalService.getOwned(req.user.id, req.valid.params.id) }));
exports.update = asyncHandler(async (req, res) => ok(res, { goal: await goalService.update(req.user.id, req.valid.params.id, req.valid.body) }));
exports.progress = asyncHandler(async (req, res) => ok(res, { goal: await goalService.addProgress(req.user.id, req.valid.params.id, req.valid.body.amount) }));
exports.remove = asyncHandler(async (req, res) => {
  await goalService.remove(req.user.id, req.valid.params.id);
  ok(res, { deleted: true });
});
