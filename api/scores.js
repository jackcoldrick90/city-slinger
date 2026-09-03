// The leaderboard: GET the top runs, POST a new one.
//
// `attachDatabasePool` is what makes a plain `pg.Pool` safe on Vercel's Fluid
// Compute -- it drains and closes the pool when the function instance is
// about to be frozen, so a suspended instance never holds a connection Neon
// thinks is still live. Without it, scale-to-zero and connection pooling
// fight each other.
import { Pool } from 'pg';
import { attachDatabasePool } from '@vercel/functions';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
attachDatabasePool(pool);

const MAX_NAME_LEN = 12;
const MAX_DISTANCE = 100000; // a sanity ceiling, not a physics replay
const CAUSES = new Set(['drone', 'fuel', 'fall']);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { rows } = await pool.query(
      'select name, distance, cause from scores order by distance desc limit 20',
    );
    res.status(200).json(rows);
    return;
  }

  if (req.method === 'POST') {
    const body = req.body ?? {};
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, MAX_NAME_LEN) : '';
    const distance = Number(body.distance);
    const cause = CAUSES.has(body.cause) ? body.cause : 'fall';

    if (!name || !Number.isFinite(distance) || distance < 0 || distance > MAX_DISTANCE) {
      res.status(400).json({ error: 'invalid score' });
      return;
    }

    await pool.query(
      'insert into scores (name, distance, cause) values ($1, $2, $3)',
      [name, Math.round(distance), cause],
    );
    res.status(201).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'method not allowed' });
}
