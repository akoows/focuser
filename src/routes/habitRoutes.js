'use strict';
const router = require('express').Router();
const validate = require('../middlewares/validate');
const requireAuth = require('../middlewares/auth');
const schemas = require('../validators');
const habits = require('../controllers/habitController');
const checkIns = require('../controllers/checkInController');

router.use(requireAuth);
router.post('/', validate({ body: schemas.habitCreate }), habits.create);
router.get('/', validate({ query: schemas.habitListQuery }), habits.list);
router.get('/:id', validate({ params: schemas.idParam }), habits.get);
router.patch('/:id', validate({ params: schemas.idParam, body: schemas.habitUpdate }), habits.update);
router.patch('/:id/archive', validate({ params: schemas.idParam, body: schemas.habitArchive }), habits.archive);
router.delete('/:id', validate({ params: schemas.idParam }), habits.remove);
router.get('/:id/progress', validate({ params: schemas.idParam, query: schemas.rangeQuery }), habits.progress);

router.post('/:id/check-ins', validate({ params: schemas.idParam, body: schemas.checkInCreate }), checkIns.create);
router.get('/:id/check-ins', validate({ params: schemas.idParam, query: schemas.checkInListQuery }), checkIns.list);
router.delete('/:id/check-ins/:checkInId', validate({ params: schemas.checkInParams }), checkIns.remove);
module.exports = router;
