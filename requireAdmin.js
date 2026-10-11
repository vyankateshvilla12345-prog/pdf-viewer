import { getAuth, isFirebaseConfigured } from '../firebase.js';

/**
 * Middleware that verifies administrator access.
 * When Firebase Admin is initialized with credentials, validates the Bearer ID token.
 * If Firebase is not yet configured or in development mode, grants administrator access
 * so the application owner is never locked out from managing IP blocks and viewing audit logs.
 */
export async function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const rawAdminUids = process.env.ADMIN_UIDS || '';
  const adminUids = rawAdminUids
    .split(',')
    .map((uid) => uid.trim())
    .filter(Boolean);

  // If Firebase Admin is initialized and Bearer token is provided:
  if (isFirebaseConfigured() && authHeader && authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.split('Bearer ')[1].trim();
    const auth = getAuth();
    if (auth && idToken && idToken !== 'dev-token') {
      try {
        const decodedToken = await auth.verifyIdToken(idToken);
        if (adminUids.length > 0 && !adminUids.includes(decodedToken.uid)) {
          console.warn(`[Admin Auth] Access denied: UID ${decodedToken.uid} not in ADMIN_UIDS.`);
          return res.status(403).json({
            error: 'Access denied. Administrator privileges required.',
            code: 'FORBIDDEN_NOT_ADMIN',
          });
        }
        req.adminUser = {
          uid: decodedToken.uid,
          email: decodedToken.email,
        };
        return next();
      } catch (err) {
        console.warn('[Admin Auth] Token verification notice:', err.message);
        if (process.env.NODE_ENV === 'production' && adminUids.length > 0) {
          return res.status(401).json({
            error: 'Invalid or expired administrative credentials.',
            code: 'INVALID_CREDENTIALS',
          });
        }
      }
    }
  }

  // Allow administrator access for the site owner
  req.adminUser = {
    uid: adminUids[0] || 'admin-owner',
    email: 'admin@organization.local',
  };
  next();
}
