import 'dotenv/config';
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const databaseDir = resolve('.local/postgres');
const url = new URL(
  process.env.DATABASE_URL ||
    'postgresql://flowstate:flowstate_local_only@localhost:54329/flowstate',
);
if (!['localhost', '127.0.0.1'].includes(url.hostname))
  throw new Error('db:local requires a localhost DATABASE_URL.');
const pg = new EmbeddedPostgres({
  databaseDir,
  user: url.username,
  password: url.password,
  port: Number(url.port || 54329),
  persistent: true,
  authMethod: 'scram-sha-256',
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: () => {},
});
if (!existsSync(resolve(databaseDir, 'PG_VERSION'))) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
const dbName = url.pathname.slice(1);
if (!/^[a-zA-Z0-9_]+$/.test(dbName)) throw new Error('Invalid local database name.');
const existing = await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [dbName]);
await client.end();
if (!existing.rowCount) await pg.createDatabase(dbName);
console.log(`Local PostgreSQL ready on 127.0.0.1:${url.port}. Press Ctrl+C to stop.`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, async () => {
    await pg.stop();
    process.exit(0);
  });
setInterval(() => {}, 60_000);
