'use strict';
const router = require('express').Router();
const validate = require('../middlewares/validate');
const requireAuth = require('../middlewares/auth');
const schemas = require('../validators');
const controller = require('../controllers/friendController');

router.use(requireAuth);
router.get('/', controller.list);
router.get('/status/:username', validate({ params: schemas.publicUsernameParam }), controller.status);
router.post('/requests', validate({ body: schemas.friendRequestCreate }), controller.sendRequest);
router.post('/requests/:id/accept', validate({ params: schemas.idParam }), controller.acceptRequest);
router.delete('/requests/:id', validate({ params: schemas.idParam }), controller.removeRequest);
router.delete('/:id', validate({ params: schemas.idParam }), controller.removeFriend);

module.exports = router;
