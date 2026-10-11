import React, { useState } from 'react';
import { ShieldCheck, Lock, AlertCircle, Loader2 } from 'lucide-react';

interface LocationGateProps {
  onRequestAccess: (geoResult: any) => void;
  isProcessing: boolean;
  errorMessage?: string | null;
}

export default function LocationGate({ onRequestAccess, isProcessing, errorMessage }: LocationGateProps) {
  const [localError, setLocalError] = useState<string | null>(null);

  const handleAllowClick = () => {
    setLocalError(null);

    // Insecure HTTP contexts block geolocation in modern browsers
    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      const msg = 'Geolocation requires a secure HTTPS connection.';
      setLocalError(msg);
      onRequestAccess({ error: msg, code: 'INSECURE_CONTEXT' });
      return;
    }

    if (!navigator.geolocation) {
      const msg = 'Geolocation is not supported by your browser.';
      setLocalError(msg);
      onRequestAccess({ error: msg, code: 'GEOLOCATION_UNSUPPORTED' });
      return;
    }

    // Explicit user-triggered permission prompt
    try {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          onRequestAccess({
            latitude,
            longitude,
            accuracy,
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
            msg = 'Unable to determine device location. Please ensure location services are enabled.';
            code = 'LOCATION_UNAVAILABLE';
          } else if (geoError.code === geoError.PERMISSION_DENIED) {
            msg = 'Location access was denied. Document access cannot be granted without verification.';
            code = 'PERMISSION_DENIED';
          }

          setLocalError(msg);
          onRequestAccess({ error: msg, code, permissionStatus: 'denied' });
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    } catch (err: any) {
      const msg = err?.message || 'Location permission is required to view this document.';
      setLocalError(msg);
      onRequestAccess({ error: msg, code: 'GEOLOCATION_ERROR', permissionStatus: 'denied' });
    }
  };

  const displayError = errorMessage || localError;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs antialiased">
      <div className="w-full max-w-md bg-slate-900/95 border border-slate-700/80 rounded-2xl p-8 shadow-2xl backdrop-blur-xl text-center">
        {/* Document Icon */}
        <div className="mx-auto w-12 h-12 rounded-xl bg-slate-800/90 border border-slate-700/80 flex items-center justify-center text-slate-200 mb-6 shadow-inner">
          <Lock className="w-5 h-5 text-indigo-400" />
        </div>

        {/* Title */}
        <h1 className="text-xl font-semibold text-white tracking-tight mb-2">
          Secure Document
        </h1>

        {/* Minimal Explanation */}
        <p className="text-sm text-slate-400 mb-8 leading-relaxed">
          Location access is required to verify device security policy and open this protected document.
        </p>

        {/* Error Notice */}
        {displayError && (
          <div className="mb-6 p-3 rounded-lg bg-rose-950/40 border border-rose-900/50 text-rose-300 text-xs flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="leading-snug">{displayError}</span>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleAllowClick}
          disabled={isProcessing}
          className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium transition-all duration-150 shadow-md shadow-indigo-950/40 flex items-center justify-center gap-2 cursor-pointer"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Verifying authorization...</span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              <span>Allow location and continue</span>
            </>
          )}
        </button>

        {/* Discreet reassurance */}
        <p className="mt-6 text-[11px] text-slate-500">
          Temporary proximity verification only. Coordinates are not stored permanently.
        </p>
      </div>
    </div>
  );
}
