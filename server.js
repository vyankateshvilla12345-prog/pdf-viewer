import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import accessRouter from './routes/access.js';
import pdfRouter from './routes/pdf.js';
import eventsRouter from './routes/events.js';
import adminRouter from './routes/admin.js';
import { checkPdfFileExists } from './services/pdfService.js';
import { isFirebaseConfigured } from './firebase.js';

dotenv.config();

const app = express();

// Trust reverse proxy (Google Cloud Run / Cloudflare / Vite proxy) for authentic client IPs
app.set('trust proxy', true);

// Startup validations
checkPdfFileExists();

// Check required variables without leaking values
const recommendedVars = ['PORT', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY', 'ADMIN_UIDS'];
const missingVars = recommendedVars.filter((v) => !process.env[v]);
if (missingVars.length > 0) {
  console.warn(`[Startup Notice] Configuration note: ${missingVars.join(', ')} not set in environment.`);
}

// Helmet configured for security while enabling iframe preview in AI Studio
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'blob:'],
        workerSrc: ["'self'", 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'http:', 'https:', 'blob:'],
        objectSrc: ["'none'"],
        frameAncestors: null,
      },
    },
    frameguard: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// Explicit CORS
const allowedOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || process.env.NODE_ENV !== 'production' || origin === allowedOrigin) {
        return callback(null, true);
      }
      return callback(new Error('CORS origin denied by policy.'));
    },
    credentials: true,
    exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'Content-Disposition'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'X-Access-Token'],
  })
);

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));

/**
 * GET /api/health
 * Public service health check without exposing secrets
 */
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'secure-pdf-viewer',
    firebaseConnected: isFirebaseConfigured(),
    pdfAvailable: checkPdfFileExists(),
  });
});

// Mount modular API routers
app.use('/api/access', accessRouter);
app.use('/api/pdf', pdfRouter);
app.use('/api/events', eventsRouter);
app.use('/api/admin', adminRouter);

// 404 handler for API routes
app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found.',
    code: 'NOT_FOUND',
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('[API Error]', err.message);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: 'An internal server error occurred.',
    code: err.code || 'INTERNAL_SERVER_ERROR',
  });
});

export default app;

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const PORT = process.env.PORT || 10000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Secure PDF Backend] Listening on port ${PORT}`);
  });
}
