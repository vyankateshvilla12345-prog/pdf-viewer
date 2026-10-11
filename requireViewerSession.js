import { validateViewerSession } from '../services/sessionService.js';

/**
 * Middleware that strictly verifies that incoming requests hold an active, unexpired viewing session
 */
export async function requireViewerSession(req, res, next) {
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split('Bearer ')[1].trim();
  } else if (req.headers['x-access-token']) {
    token = String(req.headers['x-access-token']).trim();
  }

  if (!token) {
    return res.status(401).json({
      error: 'Access denied. Valid session token required.',
      code: 'TOKEN_MISSING',
    });
  }

  const result = await validateViewerSession(token);
  if (!result.valid) {
    return res.status(401).json({
      error: result.message,
      code: result.code,
    });
  }

  req.viewerSession = result.session;
  req.sessionToken = token;
  next();
}
