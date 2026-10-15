'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const readingService = require('../services/readingService');
const isbnLookupService = require('../services/isbnLookupService');

exports.lookupIsbn = asyncHandler(async (req, res) => ok(res, await isbnLookupService.lookup(req.valid.body)));
exports.createBook = asyncHandler(async (req, res) => ok(res, { book: await readingService.createBook(req.user.id, req.valid.body) }, 201));
exports.listBooks = asyncHandler(async (req, res) => ok(res, await readingService.listBooks(req.user.id, req.valid.query)));
exports.getBook = asyncHandler(async (req, res) => ok(res, { book: await readingService.getOwnedBook(req.user.id, req.valid.params.id) }));
exports.updateBook = asyncHandler(async (req, res) => ok(res, { book: await readingService.updateBook(req.user.id, req.valid.params.id, req.valid.body) }));
exports.addLog = asyncHandler(async (req, res) => ok(res, await readingService.addReadingLog(req.user, req.valid.params.id, req.valid.body), 201));
exports.today = asyncHandler(async (req, res) => ok(res, await readingService.today(req.user)));
exports.recentFeed = asyncHandler(async (req, res) => ok(res, {
  items: await readingService.recentFeed(req.user.id),
}));
exports.removeBook = asyncHandler(async (req, res) => {
  await readingService.removeBook(req.user.id, req.valid.params.id);
  ok(res, { deleted: true });
});
