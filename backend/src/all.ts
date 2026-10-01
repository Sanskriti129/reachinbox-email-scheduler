// Runs the API and the worker in one process — handy for single-service hosting.
// RUN_WORKER=false starts the API only (e.g. on a host that blocks outbound SMTP;
// scheduled emails then wait safely until a worker runs somewhere that can send).
import { startServer } from './app.js';
import { startWorker } from './workerApp.js';

await startServer();
if (process.env.RUN_WORKER !== 'false') await startWorker();
else console.log('[all] RUN_WORKER=false — API only, no worker in this process');
