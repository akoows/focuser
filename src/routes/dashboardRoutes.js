'use strict';
const router = require('express').Router();
const validate = require('../middlewares/validate');
const requireAuth = require('../middlewares/auth');
const schemas = require('../validators');
const c = require('../controllers/progressController');

router.get('/', requireAuth, validate({ query: schemas.dashboardQuery }), c.dashboard);
module.exports = router;
