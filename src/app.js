const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./config/db');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10kb' }));

app.get('/', (req, res) => res.json({ name: 'scooter-sync-api', status: 'ok' }));

// Ensure DB is connected (cached across serverless invocations)
app.use('/api', async (req, res, next) => {
  if (req.path === '/health') return next();
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
