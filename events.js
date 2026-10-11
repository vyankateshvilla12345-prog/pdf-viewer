import express from 'express';
import { logEvent, ALLOWED_EVENT_TYPES } from '../services/eventService.js';
import { rateLimiter } from '../middleware/rateLimit.js';
import { extractClientIp } from '../services/geoService.js';

const router = express.Router();

/**
 * POST /api/events
 * Observational telemetry from viewer
 */
router.post(
  '/',
  rateLimiter({ windowMs: 60000, max: 90 }),
  async (req, res) => {
    const { eventType, sessionId, locationPermissionStatus, coordinates, pageNumber, details } = req.body || {};

    if (!eventType || typeof eventType !== 'string') {
      return res.status(400).json({ error: 'Missing eventType', code: 'INVALID_EVENT' });
    }

    if (!ALLOWED_EVENT_TYPES.includes(eventType)) {
      return res.status(400).json({
        error: `Event type '${eventType}' is not permitted.`,
        code: 'UNAPPROVED_EVENT_TYPE',
      });
    }

    // Clients cannot self-authorize
    if (eventType === 'access_granted') {
      return res.status(403).json({
        error: 'Clients cannot self-certify access approval.',
        code: 'UNAUTHORIZED_EVENT_EMISSION',
      });
    }

    const clientIp = extractClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';

    try {
      const result = await logEvent({
        eventType,
        sessionId: typeof sessionId === 'string' ? sessionId.substring(0, 64) : 'none',
        outcome: eventType.includes('denied') || eventType.includes('error') ? 'denied' : 'info',
        reasonCode: 'CLIENT_REPORTED',
        ip: clientIp,
        userAgent,
        locationPermissionStatus: typeof locationPermissionStatus === 'string' ? locationPermissionStatus.substring(0, 32) : 'unknown',
        coordinates: coordinates || details?.coordinates || null,
        pageNumber,
        details: typeof details === 'object' && details !== null ? details : {},
      });

      return res.status(200).json({
        ok: true,
        eventId: result.eventRecord.eventId,
      });
    } catch (err) {
      console.error('[Events Route Error]', err.message);
      return res.status(500).json({ error: 'Failed to record event.', code: 'EVENT_ERROR' });
    }
  }
);

export default router;
