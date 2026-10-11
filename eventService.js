import crypto from 'crypto';
import { getFirestore, isFirebaseConfigured } from '../firebase.js';
import { reverseGeocodeCoordinates, geocodeIpAddress } from './geoService.js';

export const ALLOWED_EVENT_TYPES = [
  'access_requested',
  'location_permission_granted',
  'location_permission_denied',
  'location_unavailable',
  'location_timeout',
  'access_granted',
  'access_denied',
  'session_heartbeat',
  'session_expired',
  'session_revoked',
  'invalid_session',
  'viewer_error',
  'document_opened',
  'page_rendered',
  'deterrence_shortcut',
  'deterrence_contextmenu',
  'deterrence_copy',
  'admin_action',
];

// In-memory fallback ring buffer for local development & resilience
const inMemoryLogs = [];
const MAX_IN_MEMORY_LOGS = 500;

// Aggregate counters
const inMemoryStats = {
  totalOpenAttempts: 0,
  successfulOpens: 0,
  deniedOpens: 0,
  uniqueSessions: 0,
  locationDenials: 0,
  invalidSessions: 0,
  renderErrors: 0,
  updatedAt: new Date().toISOString(),
};

const observedSessionIds = new Set();
const IP_SALT = process.env.IP_HASH_SALT || crypto.randomBytes(16).toString('hex');

export function hashIp(ip) {
  if (!ip) return 'unknown';
  return crypto.createHash('sha256').update(ip + IP_SALT).digest('hex').substring(0, 32);
}

/**
 * Authoritatively logs a security or access event
 */
export async function logEvent({
  eventType,
  sessionId = 'none',
  authenticatedUid = null,
  outcome = 'info',
  reasonCode = 'OK',
  ip = null,
  userAgent = null,
  locationPermissionStatus = 'unknown',
  coordinates = null,
  pageNumber = null,
  details = {},
}) {
  if (!ALLOWED_EVENT_TYPES.includes(eventType)) {
    throw new Error(`Invalid event type: ${eventType}`);
  }

  const now = new Date();
  const eventId = crypto.randomUUID();
  const ipHash = hashIp(ip);

  // Update counters
  if (eventType === 'access_requested') {
    inMemoryStats.totalOpenAttempts += 1;
  } else if (eventType === 'access_granted') {
    inMemoryStats.successfulOpens += 1;
    if (sessionId && sessionId !== 'none' && !observedSessionIds.has(sessionId)) {
      observedSessionIds.add(sessionId);
      inMemoryStats.uniqueSessions += 1;
    }
  } else if (eventType === 'access_denied') {
    inMemoryStats.deniedOpens += 1;
  } else if (eventType === 'location_permission_denied') {
    inMemoryStats.locationDenials += 1;
  } else if (eventType === 'invalid_session') {
    inMemoryStats.invalidSessions += 1;
  } else if (eventType === 'viewer_error') {
    inMemoryStats.renderErrors += 1;
  }
  inMemoryStats.updatedAt = now.toISOString();

  // Clean normalized IP address
  const cleanIp = ip ? (ip.startsWith('::ffff:') ? ip.replace('::ffff:', '') : ip === '::1' ? '127.0.0.1' : ip) : '127.0.0.1';

  // Enrich with geographical location information
  let geoData = null;
  if (coordinates && coordinates.latitude != null && coordinates.longitude != null) {
    geoData = await reverseGeocodeCoordinates(coordinates.latitude, coordinates.longitude);
  } else if (cleanIp && cleanIp !== '127.0.0.1') {
    geoData = await geocodeIpAddress(cleanIp);
  }

  const finalLat = coordinates?.latitude != null ? Number(coordinates.latitude) : geoData?.latitude != null ? Number(geoData.latitude) : null;
  const finalLon = coordinates?.longitude != null ? Number(coordinates.longitude) : geoData?.longitude != null ? Number(geoData.longitude) : null;

  const eventRecord = {
    eventId,
    documentId: 'doc_pdf_00024',
    sessionId: sessionId || 'none',
    authenticatedUid: authenticatedUid || null,
    eventType,
    createdAt: now.toISOString(),
    createdAtMs: now.getTime(),
    outcome,
    reasonCode,
    ipAddress: cleanIp,
    ipHash,
    locationName: geoData?.locationName || (finalLat && finalLon ? `${finalLat.toFixed(4)}°, ${finalLon.toFixed(4)}°` : 'Location Pending'),
    city: geoData?.city || null,
    region: geoData?.region || null,
    country: geoData?.country || null,
    userAgent: userAgent ? userAgent.substring(0, 256) : 'unknown',
    locationPermissionStatus,
    ...(pageNumber != null ? { pageNumber: Number(pageNumber) } : {}),
    ...(finalLat != null && finalLon != null
      ? {
          latitude: finalLat,
          longitude: finalLon,
          accuracy: coordinates?.accuracy || null,
        }
      : {}),
    details: typeof details === 'object' && details !== null ? details : {},
  };

  inMemoryLogs.unshift(eventRecord);
  if (inMemoryLogs.length > MAX_IN_MEMORY_LOGS) {
    inMemoryLogs.pop();
  }

  if (isFirebaseConfigured()) {
    try {
      const db = getFirestore();
      await db.collection('access_logs').doc(eventId).set(eventRecord);

      // Keep aggregate stats updated in Firestore
      await db.collection('document_stats').doc('doc_pdf_00024').set({
        ...inMemoryStats,
        updatedAt: now.toISOString(),
      }, { merge: true });
    } catch (err) {
      console.error(`[EventLogger] Failed to write event to Firestore:`, err.message);
      if (err.code === 7 || (err.message && err.message.includes('PERMISSION_DENIED'))) {
        console.error(
          '[Firestore PERMISSION_DENIED (Code 7)] Ensure service account has Cloud Datastore User role in IAM.'
        );
      }
      return { eventRecord, persistedToFirestore: false, error: err.message };
    }
  }

  return { eventRecord, persistedToFirestore: isFirebaseConfigured() };
}

/**
 * Retrieves aggregate overview metrics for admin
 */
export async function getOverviewStats() {
  if (isFirebaseConfigured()) {
    try {
      const db = getFirestore();
      const doc = await db.collection('document_stats').doc('doc_pdf_00024').get();
      if (doc.exists) {
        return { stats: doc.data(), source: 'firestore' };
      }
    } catch (err) {
      console.error('[EventService] Error getting overview stats from Firestore:', err.message);
    }
  }
  return { stats: inMemoryStats, source: 'fallback-memory' };
}

/**
 * Filtered, paginated audit logs for admin
 */
export async function getFilteredAccessLogs({
  limit = 50,
  startAfter = null,
  eventType = null,
  outcome = null,
  sessionId = null,
  search = null,
} = {}) {
  const safeLimit = Math.min(Math.max(1, limit), 100);

  if (isFirebaseConfigured()) {
    try {
      const db = getFirestore();
      let query = db.collection('access_logs').orderBy('createdAtMs', 'desc');

      if (eventType) {
        query = query.where('eventType', '==', eventType);
      }
      if (outcome) {
        query = query.where('outcome', '==', outcome);
      }
      if (sessionId) {
        query = query.where('sessionId', '==', sessionId);
      }

      if (startAfter) {
        const startDoc = await db.collection('access_logs').doc(startAfter).get();
        if (startDoc.exists) {
          query = query.startAfter(startDoc);
        }
      }

      query = query.limit(safeLimit);
      const snapshot = await query.get();
      let logs = snapshot.docs.map((doc) => doc.data());

      if (search) {
        const sLower = search.toLowerCase();
        logs = logs.filter(
          (l) =>
            l.ipHash?.toLowerCase().includes(sLower) ||
            l.sessionId?.toLowerCase().includes(sLower) ||
            l.reasonCode?.toLowerCase().includes(sLower)
        );
      }

      return { logs, source: 'firestore' };
    } catch (err) {
      console.error('[EventService] Error querying Firestore access_logs:', err.message);
    }
  }

  // In-memory fallback filtering
  let logs = inMemoryLogs;
  if (eventType) logs = logs.filter((l) => l.eventType === eventType);
  if (outcome) logs = logs.filter((l) => l.outcome === outcome);
  if (sessionId) logs = logs.filter((l) => l.sessionId === sessionId);
  if (search) {
    const sLower = search.toLowerCase();
    logs = logs.filter(
      (l) =>
        l.ipHash?.toLowerCase().includes(sLower) ||
        l.sessionId?.toLowerCase().includes(sLower) ||
        l.reasonCode?.toLowerCase().includes(sLower)
    );
  }

  return { logs: logs.slice(0, safeLimit), source: 'fallback-memory' };
}
