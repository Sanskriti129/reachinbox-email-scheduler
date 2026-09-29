import { migrate, pool } from './index.js';

await migrate();
console.log('Schema applied');
await pool.end();
