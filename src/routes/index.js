'use strict';
const router = require('express').Router();

router.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok' } }));
router.use('/auth', require('./authRoutes'));
router.use('/users', require('./userRoutes'));
router.use('/friends', require('./friendRoutes'));
router.use('/habits', require('./habitRoutes'));
router.use('/goals', require('./goalRoutes'));
router.use('/focus-sessions', require('./focusSessionRoutes'));
router.use('/reading', require('./readingRoutes'));
router.use('/check-ins', require('./checkInRoutes'));
router.use('/dashboard', require('./dashboardRoutes'));
router.use('/progress', require('./progressRoutes'));
router.use('/ai', require('./aiRoutes'));
module.exports = router;
