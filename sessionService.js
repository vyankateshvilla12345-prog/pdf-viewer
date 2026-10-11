import crypto from 'crypto';
import { getFirestore, isFirebaseConfigured } from '../firebase.js';

// In-memory active sessions: tokenHash -> SessionData
const memorySessions = new Map();
// sessionId -> tokenHash lookup
const sessionIndex = new Map();

/**
 * Periodically purge expired sessions from memory
 */
setInterval(() => {
  const now = Date.now();
  for (const [hash, s] of memorySessions.entries()) {
    if (s.status === 'revoked' || now > s.expiresAt || now > s.maxExpiresAt) {
      s.status = s.status === 'revoked' ? 'revoked' : 'expired';
      // keep for audit query or cleanup
    }
  }
}, 30000);

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Creates an authoritative viewer session
 */
export async function createViewerSession({ clientIp, ipHash, authenticatedUid = null, coordinates = null }) {
  const sessionSeconds = parseInt(process.env.SESSION_SECONDS, 10) || 120;
  const maxSessionSeconds = parseInt(process.env.MAX_SESSION_SECONDS, 10) || 600;

  const now = Date.now();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const sessionId = 'ses_' + crypto.randomBytes(12).toString('hex');

  const sessionData = {
    sessionId,
    tokenHash,
    documentId: 'doc_pdf_00024',
    ipHash,
    authenticatedUid,
    createdAt: new Date(now).toISOString(),
    createdAtMs: now,
    lastSeenAt: new Date(now).toISOString(),
    lastSeenAtMs: now,
    expiresAt: now + sessionSeconds * 1000,
    maxExpiresAt: now + maxSessionSeconds * 1000,
    status: 'active',
    successfulOpenCount: 1,
    pageRequestCount: 0,
    totalViewingSecondsEstimate: 0,
    coordinates: coordinates
      ? {
          latitude: Number(coordinates.latitude.toFixed(4)),
          longitude: Number(coordinates.longitude.toFixed(4)),
          accuracy: coordinates.accuracy || null,
        }
      : null,
  };

  memorySessions.set(tokenHash, sessionData);
  sessionIndex.set(sessionId, tokenHash);

  if (isFirebaseConfigured()) {
    try {
      const db = getFirestore();
      await db.collection('viewer_sessions').doc(sessionId).set({
        ...sessionData,
        tokenHash, // Only stored as SHA-256 hash
      });
    } catch (err) {
      console.error('[SessionService] Failed to persist session to Firestore:', err.message);
    }
  }

  return {
    token: rawToken,
    sessionId,
    expiresIn: sessionSeconds,
    maxExpiresIn: maxSessionSeconds,
  };
}

/**
 * Validates session token for PDF requests
 */
export async function validateViewerSession(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    return { valid: false, code: 'TOKEN_MISSING', message: 'Session token is missing.' };
  }

  const tokenHash = hashToken(rawToken);
  let session = memorySessions.get(tokenHash);

  if (!session && isFirebaseConfigured()) {
    try {
      const db = getFirestore();
      const snapshot = await db.collection('viewer_sessions').where('tokenHash', '==', tokenHash).limit(1).get();
      if (!snapshot.empty) {
        session = snapshot.docs[0].data();
        memorySessions.set(tokenHash, session);
        sessionIndex.set(session.sessionId, tokenHash);
      }
    } catch (err) {
      console.error('[SessionService] Error looking up session in Firestore:', err.message);
    }
  }

  if (!session) {
    return { valid: false, code: 'SESSION_NOT_FOUND', message: 'Invalid or unknown session.' };
  }

  if (session.status === 'revoked') {
    return { valid: false, code: 'SESSION_REVOKED', message: 'This viewing session has been revoked by an administrator.' };
  }

  const now = Date.now();
  if (now > session.expiresAt || now > session.maxExpiresAt) {
    session.status = 'expired';
    return { valid: false, code: 'SESSION_EXPIRED', message: 'Your viewing session has expired. Reauthorization required.' };
  }

  // Record access activity
  session.pageRequestCount = (session.pageRequestCount || 0) + 1;
  session.lastSeenAt = new Date(now).toISOString();
  session.lastSeenAtMs = now;

  return { valid: true, session };
}

/**
 * Heartbeat updates last activity time & estimated viewing duration
 */
export async function heartbeatViewerSession(rawToken) {
  const check = await validateViewerSession(rawToken);
  if (!check.valid) {
    return check;
  }

  const session = check.session;
  const now = Date.now();
  const elapsedSeconds = Math.max(0, Math.round((now - session.createdAtMs) / 1000));
  session.lastSeenAt = new Date(now).toISOString();
  session.lastSeenAtMs = now;
  session.totalViewingSecondsEstimate = elapsedSeconds;

  if (isFirebaseConfigured()) {
    try {
      const db = getFirestore();
      await db.collection('viewer_sessions').doc(session.sessionId).update({
        lastSeenAt: session.lastSeenAt,
        lastSeenAtMs: session.lastSeenAtMs,
        totalViewingSecondsEstimate: elapsedSeconds,
      });
    } catch (err) {
      // Non-blocking heartbeat update
    }
  }

  return { valid: true, sessionId: session.sessionId, remainingSeconds: Math.max(0, Math.round((session.expiresAt - now) / 1000)) };
}

/**
 * Administrator revokes an active session
 */
export async function revokeViewerSession(sessionId, adminUid = null) {
  const tokenHash = sessionIndex.get(sessionId);
  if (tokenHash) {
    const s = memorySessions.get(tokenHash);
    if (s) {
      s.status = 'revoked';
      s.revokedAt = new Date().toISOString();
      s.revokedByAdminUid = adminUid;
    }
  }

  if (isFirebaseConfigured()) {
    try {
      const db = getFirestore();
      await db.collection('viewer_sessions').doc(sessionId).update({
        status: 'revoked',
        revokedAt: new Date().toISOString(),
        revokedByAdminUid: adminUid,
      });
    } catch (err) {
      console.error('[SessionService] Error revoking session in Firestore:', err.message);
    }
  }

  return { success: true, sessionId };
}

/**
 * Retrieves full session record and timeline for admin
 */
export async function getSessionDetails(sessionId) {
  let session = null;
  const tokenHash = sessionIndex.get(sessionId);
  if (tokenHash) {
    session = memorySessions.get(tokenHash);
  }

  if (!session && isFirebaseConfigured()) {
    try {
      const db = getFirestore();
      const doc = await db.collection('viewer_sessions').doc(sessionId).get();
      if (doc.exists) {
        session = doc.data();
      }
    } catch (err) {
      console.error('[SessionService] Error getting session details:', err.message);
    }
  }

  return session;
}
