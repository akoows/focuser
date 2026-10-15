'use strict';
const router = require('express').Router();
const validate = require('../middlewares/validate');
const requireAuth = require('../middlewares/auth');
const schemas = require('../validators');
const c = require('../controllers/userController');

router.get('/by-username/:username', validate({ params: schemas.publicUsernameParam }), c.publicProfile);
router.use(requireAuth);
router.get('/me', c.me);
router.patch('/me', validate({ body: schemas.userUpdate }), c.update);
router.put('/me/reading-focus', validate({ body: schemas.readingFocusStart }), c.updateReadingFocus);
router.delete('/me/reading-focus', validate({ body: schemas.readingFocusStop }), c.clearReadingFocus);
router.post('/me/avatar-signature', c.avatarSignature);
router.post('/me/banner-signature', c.bannerSignature);
router.post('/me/password-change', validate({ body: schemas.passwordChangeStart }), c.startPasswordChange);
router.post('/me/password-change/verify', validate({ body: schemas.passwordChangeVerify }), c.verifyPasswordChange);
module.exports = router;
