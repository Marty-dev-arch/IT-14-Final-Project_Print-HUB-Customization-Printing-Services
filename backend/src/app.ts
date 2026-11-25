import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import { createStore } from './db/store.js';
import type { BackendStore } from './db/types.js';
import { createAdminAuthRouter } from './routes/adminAuth.js';
import { createAdminOpsRouter } from './routes/adminOps.js';
import { createPublicRouter } from './routes/public.js';
import { securityHeadersMiddleware } from './security/headers.js';

export function createApp(customStore?: BackendStore): Express {
  const app = express();
  const store = customStore ?? createStore();

  const allowedOrigins = new Set(
    [
      process.env.PUBLIC_ORIGIN?.trim() || 'http://localhost:5173',
      process.env.ADMIN_ORIGIN?.trim() || 'http://localhost:5174',
      'https://rjhubprinting.com',
      'https://admin.rjhubprinting.com',
    ].filter(Boolean),
  );

  app.disable('x-powered-by');
  app.use(securityHeadersMiddleware);
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || allowedOrigins.has(origin)) {
          cb(null, true);
        } else {
          cb(new Error('Origin not permitted by CORS.'));
        }
      },
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '4mb' }));

  app.use('/api', createPublicRouter(store));
  app.use('/api/admin/auth', createAdminAuthRouter(store));
  app.use('/api/admin', createAdminOpsRouter(store));

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.message.includes('CORS')) {
      res.status(403).json({ error: 'CORS policy rejected request origin.' });
      return;
    }
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}
