const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const db = require('../db');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email(),
  phone: z.string().trim().max(30).optional(),
  message: z.string().trim().min(1).max(2000),
});

router.post('/', limiter, async (req, res) => {
  const m = schema.parse(req.body);
  await db.query('INSERT INTO contact_messages (name, email, phone, message) VALUES ($1,$2,$3,$4)', [
    m.name, m.email, m.phone ?? null, m.message,
  ]);
  res.status(201).json({ received: true });
});

module.exports = router;
