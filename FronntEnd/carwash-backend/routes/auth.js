const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db');
const auth = require('../middleware/auth');
const { HttpError } = require('../lib/errors');

const sign = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(30).optional(),
  password: z.string().min(8).max(100),
  notify_method: z.enum(['email', 'sms']).default('email'),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

const profileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().max(30).optional(),
  notify_method: z.enum(['email', 'sms']).optional(),
});

const USER_FIELDS = 'id, name, email, phone, notify_method, created_at';

router.post('/register', async (req, res) => {
  const b = registerSchema.parse(req.body);
  const hash = await bcrypt.hash(b.password, 10);

  const user = await db.tx(async (c) => {
    const { rows } = await c.query(
      `INSERT INTO users (name, email, phone, password_hash, notify_method)
       VALUES ($1,$2,$3,$4,$5) RETURNING ${USER_FIELDS}`,
      [b.name, b.email, b.phone || null, hash, b.notify_method]
    );
    await c.query('INSERT INTO notification_prefs (user_id) VALUES ($1)', [rows[0].id]);
    return rows[0];
  });

  res.status(201).json({ user, token: sign(user.id) });
});

router.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  const row = rows[0];
  const ok = row && (await bcrypt.compare(password, row.password_hash));
  if (!ok) throw new HttpError(401, 'Invalid email or password');

  const { password_hash, ...user } = row;
  res.json({ user, token: sign(user.id) });
});

router.get('/me', auth, async (req, res) => {
  const { rows } = await db.query(`SELECT ${USER_FIELDS} FROM users WHERE id = $1`, [req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'User not found');
  res.json(rows[0]);
});

router.put('/me', auth, async (req, res) => {
  const b = profileSchema.parse(req.body);
  const { rows } = await db.query(
    `UPDATE users SET
       name = COALESCE($2, name),
       phone = COALESCE($3, phone),
       notify_method = COALESCE($4, notify_method)
     WHERE id = $1 RETURNING ${USER_FIELDS}`,
    [req.user.id, b.name ?? null, b.phone ?? null, b.notify_method ?? null]
  );
  res.json(rows[0]);
});

module.exports = router;
