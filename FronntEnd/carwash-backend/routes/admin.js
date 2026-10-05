const router = require('express').Router();
const db = require('../db');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { parseId, HttpError } = require('../lib/errors');

router.use(auth, adminOnly);

// --- Dashboard summary ---
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

// --- All bookings (with user, service, payment info) ---
router.get('/bookings', async (req, res) => {
  const { rows } = await db.query(`
    SELECT b.id, b.booking_date, b.booking_time, b.status, b.created_at,
      json_build_object('id', u.id, 'name', u.name, 'email', u.email, 'phone', u.phone) AS user,
      json_build_object('id', s.id, 'name', s.name, 'price', s.price) AS service,
      json_build_object('amount', p.amount, 'status', p.status, 'paid_at', p.paid_at) AS payment
    FROM bookings b
    JOIN users u ON u.id = b.user_id
    JOIN services s ON s.id = b.service_id
    LEFT JOIN payments p ON p.booking_id = b.id
    ORDER BY b.booking_date DESC, b.booking_time DESC
    LIMIT 500
  `);
  res.json(rows);
});

// --- Update a booking status ---
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

// --- Update a payment status for a booking ---
router.patch('/payments/:bookingId', async (req, res) => {
  const status = String(req.body.status || '');
  if (!['unpaid', 'paid', 'refunded', 'cancelled'].includes(status)) {
    throw new HttpError(400, 'Invalid payment status');
  }
  const { rows } = await db.query(
    `UPDATE payments
     SET status = $1,
         paid_at = CASE WHEN $1 = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END
     WHERE booking_id = $2 RETURNING *`,
    [status, parseId(req.params.bookingId)]
  );
  if (!rows[0]) throw new HttpError(404, 'Payment not found');
  res.json(rows[0]);
});

// --- All users ---
router.get('/users', async (req, res) => {
  const { rows } = await db.query(`
    SELECT u.id, u.name, u.email, u.phone, u.is_admin, u.notify_method, u.created_at,
      (SELECT COUNT(*)::int FROM bookings b WHERE b.user_id = u.id) AS booking_count
    FROM users u
    ORDER BY u.id
  `);
  res.json(rows);
});

// --- Promote / demote a user (toggle admin) ---
router.patch('/users/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (typeof req.body.is_admin !== 'boolean') {
    throw new HttpError(400, 'is_admin must be true or false');
  }
  // Prevent an admin from demoting themselves (avoids locking out the only admin).
  if (id === req.user.id && req.body.is_admin === false) {
    throw new HttpError(400, 'You cannot remove your own admin rights');
  }
  const { rows } = await db.query(
    'UPDATE users SET is_admin = $1 WHERE id = $2 RETURNING id, name, email, is_admin',
    [req.body.is_admin, id]
  );
  if (!rows[0]) throw new HttpError(404, 'User not found');
  res.json(rows[0]);
});

module.exports = router;