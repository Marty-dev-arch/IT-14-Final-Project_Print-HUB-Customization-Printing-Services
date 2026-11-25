import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envPath);
}

const port = Number(process.env.PORT || 3001);
const app = createApp();

app.listen(port, () => {
  console.log(`[rjhub-backend] listening on http://localhost:${port}`);
});
