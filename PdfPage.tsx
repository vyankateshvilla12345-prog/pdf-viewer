import React, { useState, useEffect, useCallback, useRef } from 'react';
import LocationGate from '../components/LocationGate';
import PdfViewer from '../components/PdfViewer';
import AccessDenied from '../components/AccessDenied';
import { getCurrentCoordinates, CoordinatesResult } from '../services/locationService';
import { requestAccess, fetchPdfDocument, fetchPdfPreview, sendHeartbeat, sendSecurityEvent } from '../api';
import { setupDeterrenceListeners } from '../utils/security';
import { setSessionAuth, clearSessionAuth } from '../utils/session';
import { Loader2 } from 'lucide-react';

const VIEW_STATES = {
  LOCATION_GATE: 'LOCATION_GATE',
  ACCESS_DENIED: 'ACCESS_DENIED',
  VIEWING_PDF: 'VIEWING_PDF',
};

export default function PdfPage() {
  const [viewState, setViewState] = useState<string>(VIEW_STATES.LOCATION_GATE);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active session data
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionExpiresIn, setSessionExpiresIn] = useState<number>(120);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [deterrenceNotice, setDeterrenceNotice] = useState<string | null>(null);

  const heartbeatTimerRef = useRef<any>(null);

  // Pre-load document preview so it appears blurred under the location gate immediately
  useEffect(() => {
    let isCancelled = false;
    fetchPdfPreview()
      .then((binary) => {
        if (!isCancelled) {
          setPdfData(binary);
        }
      })
      .catch((err) => {
        console.warn('[PDF Preview]', err.message);
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  // Deterrence listeners (context menu, copy, PrintScreen)
  useEffect(() => {
    const cleanup = setupDeterrenceListeners({
      onDeterrenceNotice: (notice: string) => {
        setDeterrenceNotice(notice);
        setTimeout(() => setDeterrenceNotice(null), 3500);
      },
    });
    return cleanup;
  }, []);

  // Heartbeat loop every 25 seconds while PDF is being viewed
  useEffect(() => {
    if (viewState === VIEW_STATES.VIEWING_PDF && sessionToken) {
      heartbeatTimerRef.current = setInterval(() => {
        sendHeartbeat(sessionToken).catch(() => {});
      }, 25000);
    } else {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    }
    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };
  }, [viewState, sessionToken]);

  /**
   * Primary user-initiated access flow
   */
  const handleLocationRequest = async (geoResult?: CoordinatesResult) => {
    let result = geoResult;

    if (!result) {
      setIsProcessing(true);
      result = await getCurrentCoordinates();
    }

    // If location access was denied, immediately wipe the PDF from DOM & memory and deny access!
    if (result.error || result.permissionStatus === 'denied') {
      setIsProcessing(false);
      setPdfData(null); // PURGE DOCUMENT
      await sendSecurityEvent('location_permission_denied', {
        locationPermissionStatus: 'denied',
        details: { code: result.code, error: result.error },
      });
      setErrorMessage(result.error || 'Location permission is required to view this document.');
      setViewState(VIEW_STATES.ACCESS_DENIED);
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      await sendSecurityEvent('location_permission_granted', {
        locationPermissionStatus: 'granted',
        coordinates: {
          latitude: result.latitude!,
          longitude: result.longitude!,
          accuracy: result.accuracy,
        },
      });

      const accessResponse = await requestAccess({
        latitude: result.latitude,
        longitude: result.longitude,
        accuracy: result.accuracy,
        permissionStatus: 'granted',
      });

      if (!accessResponse.ok || !accessResponse.token) {
        throw new Error('Access was not approved by server.');
      }

      setSessionAuth(accessResponse.token, accessResponse.sessionId);
      setSessionToken(accessResponse.token);
      setSessionId(accessResponse.sessionId);
      setSessionExpiresIn(accessResponse.expiresIn || 120);

      // Fetch protected PDF bytes through authenticated endpoint
      const binaryData = await fetchPdfDocument(accessResponse.token);
      setPdfData(binaryData);
      setViewState(VIEW_STATES.VIEWING_PDF);

      await sendSecurityEvent('document_opened', {
        sessionId: accessResponse.sessionId,
        coordinates: {
          latitude: result.latitude!,
          longitude: result.longitude!,
          accuracy: result.accuracy,
        },
      });
    } catch (err: any) {
      console.error('[Access Request Error]', err);
      // On failure or rejection: immediately purge document from memory and deny view
      setPdfData(null);

      const safeMsg =
        err.status === 403
          ? 'Access denied by network security policy.'
          : err.status === 400
          ? 'Invalid geographic coordinates provided.'
          : err.status === 404
          ? 'The document is temporarily unavailable.'
          : 'Location access could not be validated. Access denied.';

      setErrorMessage(safeMsg);
      setViewState(VIEW_STATES.ACCESS_DENIED);

      await sendSecurityEvent('access_denied', {
        locationPermissionStatus: 'granted',
        details: { code: err.code || 'UNKNOWN_ERROR', status: err.status },
      });
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Session expiration: purges document bytes from memory immediately
   */
  const handleSessionExpired = useCallback(() => {
    setPdfData(null);
    setSessionToken(null);
    setSessionId(null);
    clearSessionAuth();
    setErrorMessage('Your viewing session has expired.');
    setViewState(VIEW_STATES.ACCESS_DENIED);

    sendSecurityEvent('session_expired', {
      sessionId: sessionId || 'none',
      details: { reason: 'TTL_EXPIRED' },
    }).catch(() => {});
  }, [sessionId]);

  const handleRetry = () => {
    setErrorMessage(null);
    setIsProcessing(false);
    // Reload preview so it appears blurred again
    fetchPdfPreview()
      .then((bin) => setPdfData(bin))
      .catch(() => {});
    setViewState(VIEW_STATES.LOCATION_GATE);
  };

  return (
    <div className="relative min-h-screen w-full bg-slate-950 font-sans overflow-hidden">
      {/* 1. Location Gate Over Blurred PDF Document */}
      {viewState === VIEW_STATES.LOCATION_GATE && (
        <div className="relative h-screen w-full overflow-hidden">
          {pdfData ? (
            <PdfViewer
              pdfData={pdfData}
              sessionId="AUTHORIZATION-PENDING"
              isBlurred={true}
            />
          ) : (
            <div className="h-screen w-full bg-slate-950 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
              <span className="text-xs text-slate-400 font-mono">Loading document...</span>
            </div>
          )}

          {/* Location Permission Modal Overlay directly on the blurred PDF */}
          <LocationGate
            onRequestAccess={handleLocationRequest}
            isProcessing={isProcessing}
            errorMessage={errorMessage}
          />
        </div>
      )}

      {/* 2. Access Denied State — Strict rejection, PDF completely removed */}
      {viewState === VIEW_STATES.ACCESS_DENIED && (
        <AccessDenied
          message={errorMessage}
          onRetry={handleRetry}
        />
      )}

      {/* 3. Protected PDF Viewer — Unblurred & Fully Interactive */}
      {viewState === VIEW_STATES.VIEWING_PDF && pdfData && (
        <PdfViewer
          pdfData={pdfData}
          sessionId={sessionId}
          expiresIn={sessionExpiresIn}
          onSessionExpired={handleSessionExpired}
          deterrenceNotice={deterrenceNotice}
          isBlurred={false}
        />
      )}
    </div>
  );
}
