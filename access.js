import express from 'express';
import { requestAccessApproval } from '../services/accessService.js';
import { heartbeatViewerSession } from '../services/sessionService.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import { extractClientIp } from '../services/geoService.js';

const router = express.Router();

/**
 * POST /api/access/request
 * Validates device location and issues short-lived session token
 */
router.post(
  '/request',
  rateLimiter({ windowMs: 60000, max: 20, message: 'Too many access attempts. Please wait.' }),
  async (req, res) => {
    const clientIp = extractClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const { latitude, longitude, accuracy, permissionStatus } = req.body || {};

    try {
      const result = await requestAccessApproval({
        clientIp,
        userAgent,
        latitude,
        longitude,
        accuracy,
        permissionStatus,
      });

      if (!result.approved) {
        return res.status(result.status || 400).json({
          error: result.error,
          code: result.code,
        });
      }

      return res.status(200).json({
        ok: true,
        sessionId: result.sessionId,
        token: result.token,
        expiresIn: result.expiresIn,
        maxExpiresIn: result.maxExpiresIn,
      });
    } catch (err) {
      console.error('[Access Route Error]', err);
      return res.status(500).json({
        error: 'Unable to process access request.',
        code: 'ACCESS_REQUEST_ERROR',
      });
    }
  }
);

/**
 * POST /api/access/heartbeat
 * Updates session activity timestamp and viewing duration
 */
router.post(
  '/heartbeat',
  rateLimiter({ windowMs: 60000, max: 60 }),
  async (req, res) => {
    let token = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split('Bearer ')[1].trim();
    } else if (req.headers['x-access-token']) {
      token = String(req.headers['x-access-token']).trim();
    }

    if (!token) {
      return res.status(401).json({ error: 'Session token required.', code: 'TOKEN_MISSING' });
    }

    try {
      const result = await heartbeatViewerSession(token);
      if (!result.valid) {
        return res.status(401).json({ error: result.message, code: result.code });
      }

      return res.status(200).json({ ok: true, remainingSeconds: result.remainingSeconds });
    } catch (err) {
      return res.status(500).json({ error: 'Heartbeat update failed.', code: 'HEARTBEAT_ERROR' });
    }
  }
);

export default router;
