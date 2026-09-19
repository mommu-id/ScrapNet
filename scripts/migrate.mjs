import postgres from 'postgres';

if (!process.env.DATABASE_URL) throw new Error('Isi DATABASE_URL di .env.local');

const url = process.env.DATABASE_URL;
const sql = postgres(url, {
  ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : 'require',
  connect_timeout: 15
});

try {
  await sql`CREATE TABLE IF NOT EXISTS providers (
    id text PRIMARY KEY,
    domain text NOT NULL,
    city text NOT NULL,
    data jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(domain,city)
  )`;

  await sql`CREATE TABLE IF NOT EXISTS packages (
    id text PRIMARY KEY,
    provider_id text NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    data jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS runs (
    id text PRIMARY KEY,
    data jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

  await sql`CREATE TABLE IF NOT EXISTS operation_locks (
    name text PRIMARY KEY,
    expires_at timestamptz NOT NULL
  )`;

  console.log('Schema ScrapNet siap di database.');
} catch (err) {
  console.error('Migrasi gagal:', err);
  process.exit(1);
} finally {
  await sql.end();
}
