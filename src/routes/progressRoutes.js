'use strict';
const router = require('express').Router();
const validate = require('../middlewares/validate');
const requireAuth = require('../middlewares/auth');
const schemas = require('../validators');
const c = require('../controllers/progressController');

router.use(requireAuth);
router.get('/', validate({ query: schemas.rangeQuery }), c.overview);
router.get('/history', validate({ query: schemas.rangeQuery }), c.history);
module.exports = router;
