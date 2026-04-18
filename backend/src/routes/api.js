const { Router } = require('express');
const controller = require('../controllers/dataController');

const router = Router();

router.get('/latest', controller.latest);
router.get('/history', controller.history);
router.get('/status', controller.status);

module.exports = router;
