'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const friendService = require('../services/friendService');

exports.list = asyncHandler(async (req, res) => {
  ok(res, await friendService.list(req.user.id));
});

exports.status = asyncHandler(async (req, res) => {
  ok(res, { relationship: await friendService.status(req.user.id, req.valid.params.username) });
});

exports.sendRequest = asyncHandler(async (req, res) => {
  ok(res, { relationship: await friendService.sendRequest(req.user.id, req.valid.body.username) }, 201);
});

exports.acceptRequest = asyncHandler(async (req, res) => {
  ok(res, { relationship: await friendService.respondToRequest(req.user.id, req.valid.params.id) });
});

exports.removeRequest = asyncHandler(async (req, res) => {
  ok(res, await friendService.removeRequest(req.user.id, req.valid.params.id));
});

exports.removeFriend = asyncHandler(async (req, res) => {
  ok(res, await friendService.removeFriend(req.user.id, req.valid.params.id));
});
