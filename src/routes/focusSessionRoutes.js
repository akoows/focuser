'use strict';
const router = require('express').Router();
const validate = require('../middlewares/validate');
const requireAuth = require('../middlewares/auth');
const schemas = require('../validators');
const sessions = require('../controllers/focusSessionController');

router.use(requireAuth);
router.post('/', validate({ body: schemas.focusSessionCreate }), sessions.create);
router.get('/', validate({ query: schemas.focusSessionListQuery }), sessions.list);
router.get('/active', sessions.active);
router.get('/:id', validate({ params: schemas.idParam }), sessions.get);
router.post('/:id/pause', validate({ params: schemas.idParam }), sessions.pause);
router.post('/:id/resume', validate({ params: schemas.idParam }), sessions.resume);
router.post('/:id/complete', validate({ params: schemas.idParam }), sessions.complete);
router.post('/:id/cancel', validate({ params: schemas.idParam }), sessions.cancel);
module.exports = router;
