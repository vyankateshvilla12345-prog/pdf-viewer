import express from 'express';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { getOverviewStats, getFilteredAccessLogs, logEvent } from '../services/eventService.js';
import { revokeViewerSession, getSessionDetails } from '../services/sessionService.js';
import { addIpBlock, listIpBlocks, removeIpBlock } from '../services/accessService.js';
import { rateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// Enforce admin ID token verification on all /api/admin/* endpoints
router.use(requireAdmin);

/**
 * GET /api/admin/overview
 * Overview metrics for dashboard cards
 */
router.get(
  '/overview',
  rateLimiter({ windowMs: 60000, max: 60 }),
  async (req, res) => {
    try {
      const result = await getOverviewStats();
      return res.status(200).json({ ok: true, stats: result.stats, source: result.source });
    } catch (err) {
      console.error('[Admin Route] Overview error:', err.message);
      return res.status(500).json({ error: 'Unable to load overview statistics.', code: 'OVERVIEW_ERROR' });
    }
  }
);

/**
 * GET /api/admin/access-logs
 * Filtered, paginated audit log queries
 */
router.get(
  '/access-logs',
  rateLimiter({ windowMs: 60000, max: 60 }),
  async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const startAfter = req.query.startAfter ? String(req.query.startAfter) : null;
      const eventType = req.query.eventType ? String(req.query.eventType) : null;
      const outcome = req.query.outcome ? String(req.query.outcome) : null;
      const sessionId = req.query.sessionId ? String(req.query.sessionId) : null;
      const search = req.query.search ? String(req.query.search) : null;

      const result = await getFilteredAccessLogs({
        limit,
        startAfter,
        eventType,
        outcome,
        sessionId,
        search,
      });

      return res.status(200).json({
        ok: true,
        logs: result.logs,
        source: result.source,
      });
    } catch (err) {
      console.error('[Admin Route] Logs query error:', err.message);
      return res.status(500).json({ error: 'Failed to retrieve access logs.', code: 'LOGS_ERROR' });
    }
  }
);

/**
 * GET /api/admin/sessions/:id
 * Detailed session timeline
 */
router.get(
  '/sessions/:id',
  rateLimiter({ windowMs: 60000, max: 60 }),
  async (req, res) => {
    const sessionId = req.params.id;
    try {
      const session = await getSessionDetails(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found.', code: 'NOT_FOUND' });
      }

      // Query logs for this specific session
      const logsResult = await getFilteredAccessLogs({ sessionId, limit: 100 });

      return res.status(200).json({
        ok: true,
        session,
        timeline: logsResult.logs,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to retrieve session details.', code: 'SESSION_DETAILS_ERROR' });
    }
  }
);

/**
 * POST /api/admin/sessions/:id/revoke
 * Instantly revoke an active viewer session
 */
router.post(
  '/sessions/:id/revoke',
  rateLimiter({ windowMs: 60000, max: 30 }),
  async (req, res) => {
    const sessionId = req.params.id;
    try {
      await revokeViewerSession(sessionId, req.adminUser?.uid);

      await logEvent({
        eventType: 'admin_action',
        sessionId,
        authenticatedUid: req.adminUser?.uid,
        outcome: 'info',
        reasonCode: 'SESSION_REVOKED_BY_ADMIN',
        details: { targetSessionId: sessionId },
      });

      return res.status(200).json({ ok: true, message: `Session ${sessionId} has been revoked.` });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to revoke session.', code: 'REVOKE_ERROR' });
    }
  }
);

/**
 * GET /api/admin/ip-blocks
 * List active IP blocks
 */
router.get(
  '/ip-blocks',
  rateLimiter({ windowMs: 60000, max: 60 }),
  async (req, res) => {
    try {
      const blocks = await listIpBlocks();
      return res.status(200).json({ ok: true, blocks });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to retrieve IP blocks.', code: 'IP_BLOCKS_ERROR' });
    }
  }
);

/**
 * POST /api/admin/ip-blocks
 * Create new IP block
 */
router.post(
  '/ip-blocks',
  rateLimiter({ windowMs: 60000, max: 30 }),
  async (req, res) => {
    const { ip, ipHash, reason, expiresAt } = req.body || {};
    if (!ip && !ipHash) {
      return res.status(400).json({ error: 'Target IP or IP Hash is required.', code: 'BLOCK_TARGET_REQUIRED' });
    }

    try {
      const block = await addIpBlock({
        ip,
        ipHash,
        reason: reason || 'Administrative perimeter block',
        expiresAt: expiresAt || 'forever',
        adminUid: req.adminUser?.uid,
      });

      await logEvent({
        eventType: 'admin_action',
        authenticatedUid: req.adminUser?.uid,
        outcome: 'info',
        reasonCode: 'IP_BLOCK_ENFORCED',
        details: { target: block.ipHash, reason },
      });

      return res.status(201).json({ ok: true, block });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to enforce IP block.', code: 'CREATE_BLOCK_ERROR' });
    }
  }
);

/**
 * DELETE /api/admin/ip-blocks/:hash
 * Deactivate IP block
 */
router.delete(
  '/ip-blocks/:hash',
  rateLimiter({ windowMs: 60000, max: 30 }),
  async (req, res) => {
    const targetHash = req.params.hash;
    try {
      await removeIpBlock(targetHash, req.adminUser?.uid);

      await logEvent({
        eventType: 'admin_action',
        authenticatedUid: req.adminUser?.uid,
        outcome: 'info',
        reasonCode: 'IP_BLOCK_LIFTED',
        details: { targetHash },
      });

      return res.status(200).json({ ok: true, message: 'IP block deactivated.' });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to remove IP block.', code: 'REMOVE_BLOCK_ERROR' });
    }
  }
);

export default router;
