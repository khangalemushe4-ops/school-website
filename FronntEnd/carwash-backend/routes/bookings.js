const router = require('express').Router();
const { z } = require('zod');
const db = require('../db');
const auth = require('../middleware/auth');
const { HttpError, parseId } = require('../lib/errors');

const OPEN = process.env.BUSINESS_OPEN || '08:00';
const CLOSE = process.env.BUSINESS_CLOSE || '17:00';
const TZ = process.env.BUSINESS_TZ || 'Africa/Johannesburg';

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const bookingSchema = z.object({
  service_id: z.coerce.number().int().positive(),
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  booking_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)'),
  vehicle_id: z.coerce.number().int().positive().optional(),
});

const SELECT_BOOKINGS = `
  SELECT b.id, b.booking_date, b.booking_time, b.status, b.created_at,
    CASE WHEN v.id IS NULL THEN NULL ELSE
      json_build_object('id', v.id, 'make_model', v.make_model, 'reg_number', v.reg_number)
    END AS vehicle,
    json_build_object('id', s.id, 'name', s.name, 'price', s.price, 'duration_min', s.duration_min) AS service,
    json_build_object('amount', p.amount, 'status', p.status) AS payment
  FROM bookings b
  LEFT JOIN vehicles v ON v.id = b.vehicle_id
  JOIN services s ON s.id = b.service_id
  LEFT JOIN payments p ON p.booking_id = b.id`;

// Public: which time windows are already taken on a date
router.get('/availability', async (req, res) => {
  const { date } = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.query);
  const { rows } = await db.query(
    `SELECT b.booking_time::text AS start,
            (b.booking_time + make_interval(mins => s.duration_min))::text AS "end"
     FROM bookings b JOIN services s ON s.id = b.service_id
     WHERE b.booking_date = $1 AND b.status <> 'cancelled'
     ORDER BY b.booking_time`,
    [date]
  );
  res.json({ date, open: OPEN, close: CLOSE, busy: rows });
});

router.use(auth);

router.get('/', async (req, res) => {
  const { rows } = await db.query(
    `${SELECT_BOOKINGS} WHERE b.user_id = $1 ORDER BY b.booking_date DESC, b.booking_time DESC`,
    [req.user.id]
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await db.query(`${SELECT_BOOKINGS} WHERE b.id = $1 AND b.user_id = $2`, [
    parseId(req.params.id),
    req.user.id,
  ]);
  if (!rows[0]) throw new HttpError(404, 'Booking not found');
  res.json(rows[0]);
});

router.post('/', async (req, res) => {
  const b = bookingSchema.parse(req.body);

  const bookingId = await db.tx(async (c) => {
    const svcRes = await c.query('SELECT id, price, duration_min FROM services WHERE id = $1', [b.service_id]);
    if (!svcRes.rowCount) throw new HttpError(404, 'Service not found');
    const svc = svcRes.rows[0];

    const start = toMinutes(b.booking_time);
    if (start < toMinutes(OPEN) || start + svc.duration_min > toMinutes(CLOSE)) {
      throw new HttpError(400, `Bookings must fit between ${OPEN} and ${CLOSE}`);
    }

    const past = await c.query(`SELECT ($1::date + $2::time) < (now() AT TIME ZONE $3) AS past`, [
      b.booking_date, b.booking_time, TZ,
    ]);
    if (past.rows[0].past) throw new HttpError(400, 'Booking time is in the past');

    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [b.booking_date]);

    const clash = await c.query(
      `SELECT 1 FROM bookings bk JOIN services s ON s.id = bk.service_id
       WHERE bk.booking_date = $1 AND bk.status <> 'cancelled'
         AND ($2::time, $2::time + make_interval(mins => $3::int))
             OVERLAPS (bk.booking_time, bk.booking_time + make_interval(mins => s.duration_min))
       LIMIT 1`,
      [b.booking_date, b.booking_time, svc.duration_min]
    );
    if (clash.rowCount) throw new HttpError(409, 'That time slot is already taken');

    const { rows } = await c.query(
      `INSERT INTO bookings (user_id, vehicle_id, service_id, booking_date, booking_time)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [req.user.id, b.vehicle_id || null, b.service_id, b.booking_date, b.booking_time]
    );
    await c.query('INSERT INTO payments (booking_id, amount) VALUES ($1,$2)', [rows[0].id, svc.price]);
    return rows[0].id;
  });

  const { rows } = await db.query(`${SELECT_BOOKINGS} WHERE b.id = $1`, [bookingId]);
  res.status(201).json(rows[0]);
});

router.patch('/:id/cancel', async (req, res) => {
  const id = parseId(req.params.id);
  await db.tx(async (c) => {
    const r = await c.query(
      `UPDATE bookings SET status = 'cancelled'
       WHERE id = $1 AND user_id = $2 AND status IN ('pending','confirmed') RETURNING id`,
      [id, req.user.id]
    );
    if (!r.rowCount) throw new HttpError(409, 'Booking not found or cannot be cancelled');
    await c.query(`UPDATE payments SET status = 'cancelled' WHERE booking_id = $1 AND status = 'unpaid'`, [id]);
  });
  const { rows } = await db.query(`${SELECT_BOOKINGS} WHERE b.id = $1`, [id]);
  res.json(rows[0]);
});

module.exports = router;