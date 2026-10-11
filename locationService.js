/**
 * Browser Geolocation API wrapper
 */

export function checkGeolocationSupport() {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

export function isSecureContext() {
  if (typeof window === 'undefined') return true;
  return window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

export function getCurrentCoordinates({ timeout = 15000, highAccuracy = true } = {}) {
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
    } catch (err) {
      resolve({
        error: err?.message || 'Location permission is required to view this document.',
        code: 'GEOLOCATION_ERROR',
        permissionStatus: 'denied',
      });
    }
  });
}
