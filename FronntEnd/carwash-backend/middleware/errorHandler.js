const { ZodError } = require('zod');
const { HttpError } = require('../lib/errors');

module.exports = function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
  if (err.code === '23505') return res.status(409).json({ error: 'That value is already in use' });
  if (err.code === '23503') return res.status(409).json({ error: 'Record is referenced by other data' });
  if (err.code === '22007' || err.code === '22008') return res.status(400).json({ error: 'Invalid date or time' });

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
