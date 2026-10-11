let cachedPublicIp: string | null = null;

export async function getPublicClientIp(): Promise<string | null> {
  if (cachedPublicIp) return cachedPublicIp;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data && data.ip) {
        cachedPublicIp = String(data.ip).trim();
        return cachedPublicIp;
      }
    }
  } catch {
    // Graceful fallback to server-side extraction
  }
  return null;
}

export function checkGeolocationSupport(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

export function isSecureContext(): boolean {
  if (typeof window === 'undefined') return true;
  return window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

export interface CoordinatesResult {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  permissionStatus?: 'granted' | 'denied';
  error?: string;
  code?: string;
}

export function getCurrentCoordinates({ timeout = 15000, highAccuracy = true } = {}): Promise<CoordinatesResult> {
  return new Promise((resolve) => {
    if (!isSecureContext()) {
      return resolve({
        error: 'Location access requires a secure HTTPS connection in production.',
        code: 'INSECURE_CONTEXT',
      });
    }

    if (!checkGeolocationSupport()) {
      return resolve({
        error: 'Geolocation is not supported by your browser.',
        code: 'GEOLOCATION_UNSUPPORTED',
      });
    }

    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            permissionStatus: 'granted',
          });
        },
        (geoError) => {
          let msg = 'Location permission is required to view this document.';
          let code = 'PERMISSION_DENIED';

          if (geoError.code === geoError.TIMEOUT) {
            msg = 'Location request timed out. Please try again.';
            code = 'LOCATION_TIMEOUT';
          } else if (geoError.code === geoError.POSITION_UNAVAILABLE) {
            msg = 'Location could not be obtained. Please ensure location services are enabled.';
            code = 'LOCATION_UNAVAILABLE';
          } else if (geoError.code === geoError.PERMISSION_DENIED) {
            msg = 'Location permission is required to view this document.';
            code = 'PERMISSION_DENIED';
          }

          resolve({
            error: msg,
            code,
            permissionStatus: 'denied',
          });
        },
        {
          enableHighAccuracy: highAccuracy,
          timeout,
          maximumAge: 0,
        }
      );
    } catch (err: any) {
      resolve({
        error: err?.message || 'Location permission is required to view this document.',
        code: 'GEOLOCATION_ERROR',
        permissionStatus: 'denied',
      });
    }
  });
}
