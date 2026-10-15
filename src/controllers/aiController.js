'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const aiService = require('../services/aiService');

exports.analyze = asyncHandler(async (req, res) => ok(res, await aiService.analyze(req.user, req.valid.body)));
