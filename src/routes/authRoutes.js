'use strict';
const router = require('express').Router();
const validate = require('../middlewares/validate');
const requireAuth = require('../middlewares/auth');
const schemas = require('../validators');
const c = require('../controllers/authController');

router.post('/registration-avatar-signature', c.registrationAvatarSignature);
router.post('/registration-banner-signature', c.registrationBannerSignature);
router.post('/register', validate({ body: schemas.register }), c.register);
router.post('/login', validate({ body: schemas.login }), c.login);
router.post('/verify-email', validate({ body: schemas.emailCode }), c.verifyEmail);
router.post('/resend-verification', validate({ body: schemas.emailOnly }), c.resendEmailVerification);
router.post('/verify-login', validate({ body: schemas.emailCode }), c.verifyLogin);
router.post('/logout', c.logout); // sempre limpa o cookie; revoga o token se for válido
router.get('/me', requireAuth, c.me);
module.exports = router;
