// One-time schema setup for the leaderboard. Run once against a fresh
// database: `node --env-file=.env.local tools/init_db.mjs`.
//
// Uses the *direct* (unpooled) connection string, not the pooled one --
// DDL over a transaction-mode pooler is the class of bug that never names
// pooling as the cause.
import { Client } from 'pg';

const client = new Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
await client.connect();

await client.query(`
  create table if not exists scores (
    id bigint generated always as identity primary key,
    name text not null,
    distance integer not null,
    cause text not null,
    created_at timestamptz not null default now()
  );
`);
await client.query('create index if not exists scores_distance_idx on scores (distance desc);');

await client.end();
console.log('scores table ready');
