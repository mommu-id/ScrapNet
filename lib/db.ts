import postgres from 'postgres';
import type { Provider, Package, Run, Snapshot } from './types';
import { demoProviders, demoPackages } from './demo';

let sqlClient: ReturnType<typeof postgres> | null = null;

export function parseJson<T>(val: unknown): T {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as T;
    } catch {
      return val as T;
    }
  }
  return val as T;
}

export function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Hubungkan database terlebih dahulu.');
  if (!sqlClient) {
    sqlClient = postgres(url, {
      ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : 'require',
      connect_timeout: 10,
      max: 10,
      idle_timeout: 20
    });
  }
  return sqlClient;
}

export async function snapshot(): Promise<Snapshot> {
  const config = {
    database: !!process.env.DATABASE_URL,
    search: true,
    admin: !!process.env.ADMIN_SECRET,
    cron: !!process.env.CRON_SECRET
  };
  if (!config.database) return { demo: true, providers: demoProviders, packages: demoPackages, runs: [], config };
  try {
    const sql = db();
    const [p, k, r] = await Promise.all([
      sql`SELECT id, data FROM providers ORDER BY created_at DESC LIMIT 300`,
      sql`SELECT id, data FROM packages ORDER BY created_at DESC LIMIT 1000`,
      sql`SELECT id, data FROM runs ORDER BY created_at DESC LIMIT 100`
    ]);
    return {
      demo: false,
      providers: p.map(x => ({ ...parseJson<Provider>(x.data), id: x.id })),
      packages: k.map(x => ({ ...parseJson<Package>(x.data), id: x.id })),
      runs: r.map(x => ({ ...parseJson<Run>(x.data), id: x.id })),
      config
    };
  } catch (err) {
    console.error('Database connection error in snapshot:', err);
    throw err;
  }
}

export async function log(kind: string, message: string, status: 'success' | 'error' = 'success') {
  try {
    const sql = db();
    const entry: Run = {
      id: crypto.randomUUID(),
      kind,
      message,
      status,
      createdAt: new Date().toISOString()
    };
    await sql`INSERT INTO runs(id,data) VALUES(${entry.id},${sql.json(entry)})`;
  } catch (err) {
    console.error('Failed to log run:', err);
  }
}
