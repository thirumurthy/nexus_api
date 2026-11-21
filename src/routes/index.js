const router = require('express').Router();
const apiKey = require('../middleware/apiKey');
const { sync } = require('../controllers/syncController');
const { insights, daily, monthly } = require('../controllers/scooterController');
const admin = require('../controllers/adminController');

router.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Web Dashboard HTML views
router.get(['/admin', '/dashboard'], admin.renderDashboard);

// Admin Data APIs (protected by API Key if API_KEY is set in env)
router.get('/admin/overview', apiKey, admin.overview);
router.get('/admin/scooters', apiKey, admin.listScooters);
router.get('/admin/scooter/:deviceKey', apiKey, admin.scooterDetail);
router.patch('/admin/scooter/:deviceKey/name', apiKey, admin.updateName);

// Scooter Sync & Insights APIs
router.use('/scooter', apiKey);
router.post('/scooter/sync', sync);
router.get('/scooter/:deviceId/insights', insights);
router.get('/scooter/:deviceId/daily', daily);
router.get('/scooter/:deviceId/monthly', monthly);

module.exports = router;
