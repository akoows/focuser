'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const progressService = require('../services/progressService');

exports.dashboard = asyncHandler(async (req, res) => ok(res, await progressService.dashboard(req.user, req.valid.query)));
exports.overview = asyncHandler(async (req, res) => ok(res, await progressService.overview(req.user, req.valid.query)));
exports.history = asyncHandler(async (req, res) => ok(res, await progressService.history(req.user, req.valid.query)));
