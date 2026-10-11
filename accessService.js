import { hashIp, logEvent } from './eventService.js';
import { createViewerSession } from './sessionService.js';
import { getFirestore, isFirebaseConfigured } from '../firebase.js';

const activeIpBlocks = new Map();

export function validateCoordinates(latitude, longitude, accuracy) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return { valid: false, reason: 'Latitude and longitude must be valid numbers.' };
  }

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return { valid: false, reason: 'Coordinates must be finite values.' };
  }

  if (latitude < -90 || latitude > 90) {
    return { valid: false, reason: 'Latitude must be between -90 and 90 degrees.' };
  }

  if (longitude < -180 || longitude > 180) {
    return { valid: false, reason: 'Longitude must be between -180 and 180 degrees.' };
  }

  if (accuracy !== undefined && accuracy !== null) {
    if (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy < 0) {
      return { valid: false, reason: 'Accuracy must be a non-negative finite number.' };
    }
  }

  return { valid: true };
}

export async function isIpBlocked(clientIp) {
  const ipHash = hashIp(clientIp);

  const mem = activeIpBlocks.get(ipHash);
  if (mem && mem.active) {
    if (mem.expiresAt === 'forever' || new Date(mem.expiresAt).getTime() > Date.now()) {
      return { blocked: true, reason: mem.reason };
    } else {
      activeIpBlocks.delete(ipHash);
    }
  }

  if (isFirebaseConfigured()) {
    try {
      const db = getFirestore();
      const doc = await db.collection('ip_blocks').doc(ipHash).get();
      if (doc.exists) {
        const data = doc.data();
        if (data.active) {
          if (data.expiresAt === 'forever' || new Date(data.expiresAt).getTime() > Date.now()) {
            activeIpBlocks.set(ipHash, data);
            return { blocked: true, reason: data.reason };
          }
        }
      }
    } catch (err) {
      console.error('[AccessService] Error checking IP blocks in Firestore:', err.message);
    }
  }

  return { blocked: false };
}

export async function addIpBlock({ ip, ipHash: explicitHash, reason = 'Administrative block', expiresAt = 'forever', adminUid = null }) {
  const targetHash = explicitHash || hashIp(ip);
  const blockData = {
    ipHash: targetHash,
    reason,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt || 'forever',
    active: true,
    createdByAdminUid: adminUid,
  };

  activeIpBlocks.set(targetHash, blockData);

  if (isFirebaseConfigured()) {
    try {
      const db = getFirestore();
      await db.collection('ip_blocks').doc(targetHash).set(blockData);
    } catch (err) {
      console.error('[AccessService] Failed to save IP block to Firestore:', err.message);
    }
  }

  return blockData;
}

export async function listIpBlocks() {
  if (isFirebaseConfigured()) {
    try {
      const db = getFirestore();
      const snapshot = await db.collection('ip_blocks').where('active', '==', true).get();
      return snapshot.docs.map((d) => d.data());
    } catch (err) {
      console.error('[AccessService] Error listing IP blocks:', err.message);
    }
  }

  return Array.from(activeIpBlocks.values()).filter((b) => b.active);
}

export async function removeIpBlock(targetHash, adminUid = null) {
  activeIpBlocks.delete(targetHash);

  if (isFirebaseConfigured()) {
    try {
      const db = getFirestore();
      await db.collection('ip_blocks').doc(targetHash).update({
        active: false,
        deactivatedAt: new Date().toISOString(),
        deactivatedByAdminUid: adminUid,
      });
    } catch (err) {
      console.error('[AccessService] Failed to deactivate IP block:', err.message);
    }
  }

  return { success: true };
}

export async function requestAccessApproval({ clientIp, userAgent, latitude, longitude, accuracy, permissionStatus, authenticatedUid = null }) {
  const ipHash = hashIp(clientIp);

  // 1. Enforce IP Blocks
  const blockCheck = await isIpBlocked(clientIp);
  if (blockCheck.blocked) {
    await logEvent({
      eventType: 'access_denied',
      outcome: 'denied',
      reasonCode: 'IP_BLOCKED',
      ip: clientIp,
      userAgent,
      details: { reason: blockCheck.reason },
    });
    return { approved: false, status: 403, error: 'Access denied by network security policy.', code: 'IP_BLOCKED' };
  }

  // Record access attempt
  await logEvent({
    eventType: 'access_requested',
    outcome: 'info',
    reasonCode: 'REQUEST_RECEIVED',
    ip: clientIp,
    userAgent,
    locationPermissionStatus: permissionStatus || 'unknown',
  });

  const locationRequired = (process.env.LOCATION_REQUIRED || 'true').toLowerCase() === 'true';

  if (locationRequired) {
    if (latitude === undefined || longitude === undefined) {
      await logEvent({
        eventType: 'access_denied',
        outcome: 'denied',
        reasonCode: 'LOCATION_MISSING',
        ip: clientIp,
        userAgent,
        locationPermissionStatus: permissionStatus || 'denied',
      });
      return { approved: false, status: 400, error: 'Location permission is required to view this document.', code: 'LOCATION_REQUIRED' };
    }

    const coordCheck = validateCoordinates(latitude, longitude, accuracy);
    if (!coordCheck.valid) {
      await logEvent({
        eventType: 'access_denied',
        outcome: 'denied',
        reasonCode: 'INVALID_COORDINATES',
        ip: clientIp,
        userAgent,
        details: { reason: coordCheck.reason },
      });
      return { approved: false, status: 400, error: 'Invalid geographic coordinates.', code: 'INVALID_COORDINATES' };
    }
  }

  // Issue session
  const coords = locationRequired ? { latitude, longitude, accuracy } : null;
  const session = await createViewerSession({
    clientIp,
    ipHash,
    authenticatedUid,
    coordinates: coords,
  });

  await logEvent({
    eventType: 'access_granted',
    sessionId: session.sessionId,
    authenticatedUid,
    outcome: 'success',
    reasonCode: 'LOCATION_VERIFIED',
    ip: clientIp,
    userAgent,
    locationPermissionStatus: 'granted',
    coordinates: coords,
  });

  return {
    approved: true,
    token: session.token,
    sessionId: session.sessionId,
    expiresIn: session.expiresIn,
    maxExpiresIn: session.maxExpiresIn,
  };
}
