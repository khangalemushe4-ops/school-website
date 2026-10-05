const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { parseId, HttpError } = require('../lib/errors');

router.use(auth, adminOnly);

// Dashboard summary
router.get('/stats', async (req, res) => {
  const [users, bookings, pending, revenue, vehicles] = await Promise.all([
    db.query('SELECT COUNT(*)::int AS n FROM users'),
    db.query('SELECT COUNT(*)::int AS n FROM bookings'),
    db.query(`SELECT COUNT(*)::int AS n FROM bookings WHERE status = 'pending'`),
    db.query(`SELECT COALESCE(SUM(amount),0)::numeric AS total FROM payments WHERE status = 'paid'`),
    db.query('SELECT COUNT(*)::int AS n FROM vehicles'),
  ]);
  res.json({
    users: users.rows[0].n,
    bookings: bookings.rows[0].n,
    pending: pending.rows[0].n,
    revenue: revenue.rows[0].total,
    vehicles: vehicles.rows[0].n,
  });
});

// All bookings
router.get('/bookings', async (req, res) => {
  const { rows } = await db.query(`
    SELECT b.id, b.booking_date, b.booking_time, b.status, b.created_at,
      json_build_object('id', u.id, 'name', u.name, 'email', u.email) AS user,
      json_build_object('id', v.id, 'make_model', v.make_model, 'reg_number', v.reg_number) AS vehicle,
      json_build_object('id', s.id, 'name', s.name, 'price', s.price) AS service,
      json_build_object('amount', p.amount, 'status', p.status) AS payment
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    JOIN vehicles v ON v.id = b.vehicle_id
    JOIN services s ON s.id = b.service_id
    LEFT JOIN payments p ON p.booking_id = b.id
    ORDER BY b.booking_date DESC, b.booking_time DESC
    LIMIT 200
  `);
  res.json(rows);
});

// Update a booking status (confirmed / completed / cancelled)
router.patch('/bookings/:id', async (req, res) => {
  const status = String(req.body.status || '');
  if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
    throw new HttpError(400, 'Invalid status');
  }
  const { rows } = await db.query(
    'UPDATE bookings SET status = $1 WHERE id = $2 RETURNING *',
    [status, parseId(req.params.id)]
  );
  if (!rows[0]) throw new HttpError(404, 'Booking not found');
  res.json(rows[0]);
});

// All users
router.get('/users', async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, name, email, phone, is_admin, created_at FROM users ORDER BY id'
  );
  res.json(rows);
});

module.exports = router;