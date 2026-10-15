'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const habitService = require('../services/habitService');
const habitCategoryService = require('../services/habitCategoryService');
const progressService = require('../services/progressService');

exports.create = asyncHandler(async (req, res) => {
  const category = await habitCategoryService.categorize(req.valid.body.name, req.valid.body.description);
  ok(res, { habit: await habitService.create(req.user, { ...req.valid.body, category }) }, 201);
});
exports.list = asyncHandler(async (req, res) => ok(res, await habitService.list(req.user.id, req.valid.query)));
exports.get = asyncHandler(async (req, res) => ok(res, { habit: await habitService.getOwned(req.user.id, req.valid.params.id) }));
exports.update = asyncHandler(async (req, res) => ok(res, { habit: await habitService.update(req.user.id, req.valid.params.id, req.valid.body) }));
exports.archive = asyncHandler(async (req, res) => {
  const archived = req.valid.body.archived ?? true;
  ok(res, { habit: await habitService.setArchived(req.user.id, req.valid.params.id, archived) });
});
exports.remove = asyncHandler(async (req, res) => {
  await habitService.remove(req.user.id, req.valid.params.id);
  ok(res, { deleted: true });
});
exports.progress = asyncHandler(async (req, res) => ok(res, await progressService.habitProgress(req.user, req.valid.params.id, req.valid.query)));
