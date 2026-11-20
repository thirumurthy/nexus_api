const router = require('express').Router();
const apiKey = require('../middleware/apiKey');
const { sync } = require('../controllers/syncController');
const { insights, daily, monthly } = require('../controllers/scooterController');

router.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

router.use('/scooter', apiKey);
router.post('/scooter/sync', sync);
router.get('/scooter/:deviceId/insights', insights);
router.get('/scooter/:deviceId/daily', daily);
router.get('/scooter/:deviceId/monthly', monthly);

module.exports = router;
