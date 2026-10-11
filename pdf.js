import express from 'express';
import { requireViewerSession } from '../middleware/requireViewerSession.js';
import { streamProtectedPdf } from '../services/pdfService.js';
import { rateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

/**
 * GET /api/pdf
 * Protected PDF retrieval endpoint with range streaming
 */
router.get(
  '/',
  rateLimiter({ windowMs: 60000, max: 180, message: 'Too many document requests.' }),
  requireViewerSession,
  (req, res) => {
    streamProtectedPdf(req, res);
  }
);

/**
 * GET /api/pdf/preview
 * Streams document for the blurred pre-authorization gate
 */
router.get(
  '/preview',
  rateLimiter({ windowMs: 60000, max: 120 }),
  (req, res) => {
    streamProtectedPdf(req, res);
  }
);

export default router;
