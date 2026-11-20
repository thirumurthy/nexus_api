const { ZodError } = require('zod');

function notFound(req, res) {
  res.status(404).json({ status: 'error', message: `Route not found: ${req.method} ${req.path}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      status: 'error',
      message: 'Validation failed',
      errors: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))
    });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ status: 'error', message: 'Invalid JSON body' });
  }
  console.error(err);
  res.status(500).json({ status: 'error', message: 'Internal server error' });
}

module.exports = { notFound, errorHandler };
