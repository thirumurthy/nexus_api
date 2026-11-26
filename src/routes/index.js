const router = require('express').Router();
const apiKey = require('../middleware/apiKey');
const { sync } = require('../controllers/syncController');
const scooter = require('../controllers/scooterController');
const trip = require('../controllers/tripController');
const ai = require('../controllers/aiController');
const admin = require('../controllers/adminController');

// Health Check
router.get('/health', (req, res) => res.json({
  status: 'ok',
  service: 'nexus-pulse-api',
  version: '2.0.0',
  time: new Date().toISOString()
}));

// Web Dashboard HTML views
router.get(['/admin', '/dashboard'], admin.renderDashboard);
router.get(['/admin/ai-test', '/ai-test'], admin.renderAiTest);

// Fast in-memory API key validation endpoint (no database query needed)
router.get('/admin/auth-test', apiKey, (req, res) => res.json({ status: 'success', message: 'API Key is valid' }));

// Admin Data APIs (protected by API Key if API_KEY is set in env)
router.get('/admin/overview', apiKey, admin.overview);
router.get('/admin/scooters', apiKey, admin.listScooters);
router.get('/admin/scooter/:deviceKey', apiKey, admin.scooterDetail);
router.patch('/admin/scooter/:deviceKey/name', apiKey, admin.updateName);

// ==============================================================================
// AI PROVIDER & COPILOT APIs (Public & Configurable)
// ==============================================================================
router.get('/ai/providers', ai.listProviders);
router.post('/ai/provider', apiKey, ai.setActiveProvider);
router.post('/ai/test', apiKey, ai.testProvider);
router.post('/ai/chat', apiKey, ai.genericChat);

// ==============================================================================
// SCOOTER REVAMP APIs (Protected by API Key if configured)
// ==============================================================================
router.use('/scooter', apiKey);

// Core Sync & Live HUD (Home Tab)
router.post('/scooter/sync', sync);
router.get('/scooter/:deviceId/live', scooter.live);
router.get('/scooter/:deviceId/insights', scooter.insights);
router.get('/scooter/:deviceId/maintenance', scooter.maintenance);

// Trips & Cadence Trends (Trips Tab)
router.get('/scooter/:deviceId/cadence', scooter.cadence);
router.get('/scooter/:deviceId/daily', scooter.daily);
router.get('/scooter/:deviceId/monthly', scooter.monthly);
router.get('/scooter/:deviceId/trips', trip.listTrips);
router.post('/scooter/:deviceId/trips', trip.createTrip);
router.get('/scooter/:deviceId/trips/:tripId', trip.getTripDetail);
router.post('/scooter/:deviceId/trips/:tripId/analyze', trip.analyzeTrip);

// Hardware Controls & Diagnostics (Scooter Tab)
router.post('/scooter/:deviceId/control', scooter.control);
router.get('/scooter/:deviceId/diagnostics', scooter.diagnostics);
router.post('/scooter/:deviceId/diagnostics/scan', scooter.runDiagnosticsScan);

// Preferences & Settings (Settings Tab)
router.get('/scooter/:deviceId/settings', scooter.getSettings);
router.patch('/scooter/:deviceId/settings', scooter.updateSettings);
router.get('/scooter/:deviceId/export', scooter.exportData);

// AI Neural Copilot & Dynamic Insights (Insights Tab)
router.get('/scooter/:deviceId/ai-coach', ai.getAiCoach);
router.post('/scooter/:deviceId/ai-coach/refresh', ai.refreshAiCoach);
router.post('/scooter/:deviceId/ai-copilot/chat', ai.copilotChat);

module.exports = router;
