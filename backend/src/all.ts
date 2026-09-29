// Runs the API and the worker in one process — handy for single-service hosting.
// In production at scale you'd run `start` and `start:worker` as separate processes.
import { startServer } from './app.js';
import { startWorker } from './workerApp.js';

await startServer();
await startWorker();
