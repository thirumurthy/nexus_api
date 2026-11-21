const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./config/db');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const admin = require('./controllers/adminController');

const app = express();

app.disable('x-powered-by');

// Disable CSP so admin dashboard, external CDNs, charts, and event handlers are never blocked
app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(cors());
app.use(express.json({ limit: '20kb' }));

// Serve Dashboard UI directly on /admin and /dashboard
app.get(['/admin', '/dashboard'], admin.renderDashboard);

// Root route: redirect browsers to /admin, return JSON for API clients
app.get('/', (req, res) => {
  if (req.accepts('html') && !req.accepts('json')) {
    return res.redirect('/admin');
  }
  res.json({ name: 'scooter-sync-api', status: 'ok', dashboard: '/admin' });
});

// Ensure DB is connected for API endpoints (cached across serverless invocations)
app.use('/api', async (req, res, next) => {
  if (req.path === '/health' || req.path === '/admin' || req.path === '/dashboard' || req.path === '/admin/auth-test') return next();
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
