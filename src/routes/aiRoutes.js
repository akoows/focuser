'use strict';
const router = require('express').Router();
const validate = require('../middlewares/validate');
const schemas = require('../validators');
const c = require('../controllers/aiController');

// Autenticação e rate limit por usuário são aplicados em app.js antes deste router.
router.post('/analyze', validate({ body: schemas.aiAnalyze }), c.analyze);
module.exports = router;
