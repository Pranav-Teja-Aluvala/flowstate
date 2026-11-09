import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index';
try {
  await migrate(db, { migrationsFolder: './packages/database/migrations' });
  console.log('Migrations applied.');
} finally {
  await pool.end();
}
