const router = require('express').Router();
const { z } = require('zod');
const db = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

const prefsSchema = z.object({
  booking_confirm: z.boolean().optional(),
  payment_receipt: z.boolean().optional(),
  reminders: z.boolean().optional(),
  completion_alerts: z.boolean().optional(),
});

const ensureRow = (userId) =>
  db.query('INSERT INTO notification_prefs (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);

router.get('/', async (req, res) => {
  await ensureRow(req.user.id);
  const { rows } = await db.query('SELECT * FROM notification_prefs WHERE user_id = $1', [req.user.id]);
  res.json(rows[0]);
});

router.put('/', async (req, res) => {
  const p = prefsSchema.parse(req.body);
  await ensureRow(req.user.id);
  const { rows } = await db.query(
    `UPDATE notification_prefs SET
       booking_confirm = COALESCE($2, booking_confirm),
       payment_receipt = COALESCE($3, payment_receipt),
       reminders = COALESCE($4, reminders),
       completion_alerts = COALESCE($5, completion_alerts)
     WHERE user_id = $1 RETURNING *`,
    [req.user.id, p.booking_confirm ?? null, p.payment_receipt ?? null, p.reminders ?? null, p.completion_alerts ?? null]
  );
  res.json(rows[0]);
});

module.exports = router;
