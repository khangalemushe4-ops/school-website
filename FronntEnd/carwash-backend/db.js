const { Pool, types } = require('pg');

// Return DATE columns as 'YYYY-MM-DD' strings (avoids JS timezone shifting)
types.setTypeParser(1082, (v) => v);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required by Neon
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // allows for Neon cold starts
});

pool.on('error', (err) => console.error('Unexpected pg pool error:', err.message));

const query = (text, params) => pool.query(text, params);

// Runs fn(client) inside BEGIN/COMMIT, rolls back on error
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
