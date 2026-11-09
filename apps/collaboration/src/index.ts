import 'dotenv/config';
import { createCollaborationServer } from './server';
import { pool } from '@flowstate/database';
const app = createCollaborationServer({
  port: Number(process.env.COLLABORATION_PORT || 1234),
  origins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim()),
  secret: process.env.COLLABORATION_SECRET || '',
});
await app.server.listen();
console.log('FLOWSTATE collaboration service ready.');
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, async () => {
    await app.destroy();
    await pool.end();
    process.exit(0);
  });
