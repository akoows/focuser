'use strict';
const router = require('express').Router();
const validate = require('../middlewares/validate');
const requireAuth = require('../middlewares/auth');
const schemas = require('../validators');
const reading = require('../controllers/readingController');

router.use(requireAuth);
router.get('/today', reading.today);
router.get('/feed', reading.recentFeed);
router.post('/isbn-lookup', validate({ body: schemas.isbnLookup }), reading.lookupIsbn);
router.post('/books', validate({ body: schemas.readingBookCreate }), reading.createBook);
router.get('/books', validate({ query: schemas.readingBookListQuery }), reading.listBooks);
router.get('/books/:id', validate({ params: schemas.idParam }), reading.getBook);
router.patch('/books/:id', validate({ params: schemas.idParam, body: schemas.readingBookUpdate }), reading.updateBook);
router.post('/books/:id/logs', validate({ params: schemas.idParam, body: schemas.readingLogCreate }), reading.addLog);
router.delete('/books/:id', validate({ params: schemas.idParam }), reading.removeBook);
module.exports = router;
