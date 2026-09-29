import { startWorker } from './workerApp.js';

startWorker().catch((e) => {
  console.error(e);
  process.exit(1);
});
