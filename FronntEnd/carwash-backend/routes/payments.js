const router = require('express').Router();
const { z } = require('zod');
const db = require('../db');
const auth = require('../middleware/auth');
const { HttpError, parseId, safeEqual } = require('../lib/errors');

// Payment status for one of the logged-in user's bookings
router.get('/booking/:bookingId', auth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT p.* FROM payments p JOIN bookings b ON b.id = p.booking_id
     WHERE b.id = $1 AND b.user_id = $2`,
    [parseId(req.params.bookingId), req.user.id]
  );
  if (!rows[0]) throw new HttpError(404, 'Payment not found');
  res.json(rows[0]);
});

// Called by your payment gateway (PayFast / Yoco / Paystack etc.), NOT by the browser.
// Adapt the body parsing to your gateway's payload format.
router.post('/webhook', async (req, res) => {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret || !safeEqual(req.get('x-webhook-secret') || '', secret)) {
    throw new HttpError(401, 'Unauthorized');
  }

  const b = z
    .object({
      booking_id: z.coerce.number().int().positive(),
      gateway_ref: z.string().min(1),
      status: z.enum(['paid', 'failed']),
    })
    .parse(req.body);

  await db.tx(async (c) => {
    const r = await c.query(
      `UPDATE payments
       SET status = $1::text, gateway_ref = $2,
           paid_at = CASE WHEN $1::text = 'paid' THEN now() ELSE paid_at END
       WHERE booking_id = $3 RETURNING id`,
      [b.status, b.gateway_ref, b.booking_id]
    );
    if (!r.rowCount) throw new HttpError(404, 'Payment not found');
    if (b.status === 'paid') {
      await c.query(`UPDATE bookings SET status = 'confirmed' WHERE id = $1 AND status = 'pending'`, [b.booking_id]);
    }
  });

  res.json({ received: true });
});

module.exports = router;
