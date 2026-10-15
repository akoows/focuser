'use strict';
const router = require('express').Router();
const validate = require('../middlewares/validate');
const requireAuth = require('../middlewares/auth');
const schemas = require('../validators');
const goals = require('../controllers/goalController');

router.use(requireAuth);
router.post('/', validate({ body: schemas.goalCreate }), goals.create);
router.get('/', validate({ query: schemas.goalListQuery }), goals.list);
router.get('/:id', validate({ params: schemas.idParam }), goals.get);
router.patch('/:id', validate({ params: schemas.idParam, body: schemas.goalUpdate }), goals.update);
router.post('/:id/progress', validate({ params: schemas.idParam, body: schemas.goalProgress }), goals.progress);
router.delete('/:id', validate({ params: schemas.idParam }), goals.remove);
module.exports = router;
