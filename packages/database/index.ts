import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const globalDb = globalThis as unknown as { flowstatePool?: Pool };
export const pool =
  globalDb.flowstatePool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== 'production') globalDb.flowstatePool = pool;
export const db = drizzle(pool, { schema });
export * from './schema';
