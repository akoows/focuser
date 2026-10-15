'use strict';
const router = require('express').Router();
const requireAuth = require('../middlewares/auth');
const c = require('../controllers/checkInController');

router.use(requireAuth);
router.get('/today', c.today);
module.exports = router;
