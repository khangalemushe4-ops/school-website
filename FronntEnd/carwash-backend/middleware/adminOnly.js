const db = require('../db');
const { HttpError } = require('../lib/errors');

module.exports = async function adminOnly(req, res, next) {
  try {
    const { rows } = await db.query('SELECT is_admin FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0] || !rows[0].is_admin) throw new HttpError(403, 'Admin only');
    next();
  } catch (err) {
    next(err);
  }
};