const router = require('express').Router();
const db = require('../db');
const { HttpError, parseId } = require('../lib/errors');

router.get('/', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM services ORDER BY id');
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM services WHERE id = $1', [parseId(req.params.id)]);
  if (!rows[0]) throw new HttpError(404, 'Service not found');
  res.json(rows[0]);
});

module.exports = router;
