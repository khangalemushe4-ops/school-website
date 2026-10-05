const router = require('express').Router();
const { z } = require('zod');
const db = require('../db');
const auth = require('../middleware/auth');
const { HttpError, parseId } = require('../lib/errors');

router.use(auth);

const vehicleSchema = z.object({
  make_model: z.string().trim().min(1).max(100),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  reg_number: z.string().trim().min(1).max(20),
  color: z.string().trim().max(30).optional(),
  preferred_service: z.string().trim().max(100).optional(),
});

router.get('/', async (req, res) => {
  const { rows } = await db.query('SELECT * FROM vehicles WHERE user_id = $1 ORDER BY id', [req.user.id]);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const v = vehicleSchema.parse(req.body);
  const { rows } = await db.query(
    `INSERT INTO vehicles (user_id, make_model, year, reg_number, color, preferred_service)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.user.id, v.make_model, v.year ?? null, v.reg_number.toUpperCase(), v.color ?? null, v.preferred_service ?? null]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const v = vehicleSchema.partial().parse(req.body);
  const { rows } = await db.query(
    `UPDATE vehicles SET
       make_model = COALESCE($3, make_model),
       year = COALESCE($4, year),
       reg_number = COALESCE($5, reg_number),
       color = COALESCE($6, color),
       preferred_service = COALESCE($7, preferred_service)
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, req.user.id, v.make_model ?? null, v.year ?? null, v.reg_number?.toUpperCase() ?? null, v.color ?? null, v.preferred_service ?? null]
  );
  if (!rows[0]) throw new HttpError(404, 'Vehicle not found');
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  try {
    const r = await db.query('DELETE FROM vehicles WHERE id = $1 AND user_id = $2', [id, req.user.id]);
    if (!r.rowCount) throw new HttpError(404, 'Vehicle not found');
    res.status(204).end();
  } catch (err) {
    if (err.code === '23503') throw new HttpError(409, 'Vehicle has bookings and cannot be deleted');
    throw err;
  }
});

module.exports = router;
