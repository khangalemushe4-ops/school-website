require('dotenv').config(); // no-op on Render; loads .env if present locally

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const errorHandler = require('./middleware/errorHandler');

for (const key of ['DATABASE_URL', 'JWT_SECRET']) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy

// Helmet with a relaxed CSP so the inline <script>/<style> in your HTML still runs
app.use(
  helmet({
    contentSecurityPolicy: false, // simplest for a school project; tighten later
  })
);

const origins = (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim());
app.use(cors({ origin: origins.includes('*') ? true : origins }));
app.use(express.json({ limit: '100kb' }));

app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

// ---- API routes FIRST (so /api/* never falls through to static) ----

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.get('/health/db', async (req, res) => {
  await db.query('SELECT 1');
  res.json({ status: 'ok', db: 'connected' });
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/services', require('./routes/services'));
app.use('/api/vehicles', require('./routes/vehicles'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/contact', require('./routes/contact'));

// ---- Static frontend AFTER API routes ----
// Files live one level up, in FronntEnd/ (HOME.HTML, BOOKINGS.HTML, style.css, etc.)
const FRONTEND_DIR = path.join(__dirname, '..');
app.use(express.static(FRONTEND_DIR));

// Home page
app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'HOME.HTML'));
});

// API 404 (only matches paths starting with /api)
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Everything else: send the home page (so unknown URLs still load the site, not a JSON error)
app.use((req, res) => {
  res.status(404).sendFile(path.join(FRONTEND_DIR, 'HOME.HTML'));
});

app.use(errorHandler);

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => console.log(`API listening on port ${port}`));