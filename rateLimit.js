const ipRequestCounts = new Map();

/**
 * Clean up old rate limit records periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of ipRequestCounts.entries()) {
    if (now > data.resetTime) {
      ipRequestCounts.delete(key);
    }
  }
}, 60000);

/**
 * Creates an in-memory rate limiter middleware
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum number of connections per window
 * @param {string} options.message - Error message to return on limit hit
 */
export function rateLimiter({ windowMs = 60000, max = 30, message = 'Too many requests. Please try again later.' } = {}) {
  return (req, res, next) => {
    // Determine client IP safely
    const clientIp = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const key = `${req.baseUrl || req.path}:${clientIp}`;
    const now = Date.now();

    let entry = ipRequestCounts.get(key);

    if (!entry || now > entry.resetTime) {
      entry = {
        count: 1,
        resetTime: now + windowMs,
      };
      ipRequestCounts.set(key, entry);
      return next();
    }

    entry.count += 1;

    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetTime - now) / 1000));
      return res.status(429).json({
        error: message,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfterSeconds: Math.ceil((entry.resetTime - now) / 1000),
      });
    }

    next();
  };
}
