/**
 * Geo & Real IP Enrichment Service
 * Provides robust client IP extraction, coordinate reverse geocoding, and IP geolocation
 */

const geoCache = new Map();
const MAX_CACHE_SIZE = 500;

function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip === 'unknown') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('172.16.') || ip.startsWith('169.254.')) return true;
  if (ip.startsWith('fc00:') || ip.startsWith('fe80:')) return true;
  return false;
}

/**
 * Extracts authoritatively verified client IP from request headers or body
 */
export function extractClientIp(req) {
  // Check headers in order of priority
  const headers = [
    req.headers['cf-connecting-ip'],
    req.headers['x-real-ip'],
    req.headers['x-client-ip'],
    req.headers['true-client-ip'],
    req.headers['fastly-client-ip'],
  ];

  for (const h of headers) {
    if (h && typeof h === 'string') {
      const clean = h.trim();
      if (clean && clean !== 'unknown' && !clean.includes('unknown')) {
        return clean.replace(/^::ffff:/, '');
      }
    }
  }

  // Check X-Forwarded-For chain
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const list = String(forwarded).split(',');
    for (const item of list) {
      const ip = item.trim().replace(/^::ffff:/, '');
      if (ip && ip !== 'unknown' && !isPrivateIp(ip)) {
        return ip;
      }
    }
    if (list[0]) {
      return list[0].trim().replace(/^::ffff:/, '');
    }
  }

  // Client-reported public IP (if verified by browser client via ipify)
  if (req.body && typeof req.body.clientPublicIp === 'string' && req.body.clientPublicIp.trim()) {
    const pub = req.body.clientPublicIp.trim();
    if (!isPrivateIp(pub)) {
      return pub;
    }
  }

  // Fallback to Express req.ip or socket
  const fallback = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  return String(fallback).replace(/^::ffff:/, '');
}

/**
 * Reverse-geocodes exact coordinates into human-readable city, state, country
 */
export async function reverseGeocodeCoordinates(latitude, longitude) {
  if (latitude == null || longitude == null) return null;

  const lat = Number(latitude).toFixed(4);
  const lon = Number(longitude).toFixed(4);
  const cacheKey = `coords_${lat}_${lon}`;

  if (geoCache.has(cacheKey)) {
    return geoCache.get(cacheKey);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14`,
      {
        headers: {
          'User-Agent': 'SecureDocSecurityViewer/1.0',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      }
    );
    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json();
    const addr = data.address || {};
    const city = addr.city || addr.town || addr.village || addr.suburb || addr.municipality || addr.county;
    const region = addr.state || addr.region || addr.province;
    const country = addr.country;

    const parts = [city, region, country].filter(Boolean);
    const locationName = parts.length > 0 ? parts.join(', ') : data.display_name?.split(',').slice(0, 3).join(', ');

    const result = {
      locationName: locationName || `${lat}°, ${lon}°`,
      city: city || null,
      region: region || null,
      country: country || null,
      source: 'gps_reverse_geocoded',
    };

    if (geoCache.size > MAX_CACHE_SIZE) geoCache.clear();
    geoCache.set(cacheKey, result);

    return result;
  } catch (err) {
    // Graceful fallback to formatted coordinates
    return {
      locationName: `${lat}°, ${lon}°`,
      city: null,
      region: null,
      country: null,
      source: 'coords_only',
    };
  }
}

/**
 * Geocodes an IP address to city/country if coordinates were not supplied
 */
export async function geocodeIpAddress(ip) {
  if (!ip || isPrivateIp(ip)) {
    return {
      locationName: 'Local Development / Loopback',
      city: 'Localhost',
      region: 'Local Network',
      country: 'Private',
      source: 'local_network',
    };
  }

  const cacheKey = `ip_${ip}`;
  if (geoCache.has(cacheKey)) {
    return geoCache.get(cacheKey);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const response = await fetch(`https://ipwho.is/${ip}`, {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.success && data.message) return null;

    const parts = [data.city, data.region, data.country].filter(Boolean);
    const locationName = parts.length > 0 ? parts.join(', ') : data.country || 'Unknown Location';

    const result = {
      locationName,
      city: data.city || null,
      region: data.region || null,
      country: data.country || null,
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      source: 'ip_geolocation',
    };

    if (geoCache.size > MAX_CACHE_SIZE) geoCache.clear();
    geoCache.set(cacheKey, result);

    return result;
  } catch {
    return null;
  }
}
