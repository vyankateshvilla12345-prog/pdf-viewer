import React, { useState, useEffect, useCallback, useRef } from 'react';
import LocationGate from '../components/LocationGate';
import PdfViewer from '../components/PdfViewer';
import AccessDenied from '../components/AccessDenied';
import { getCurrentCoordinates } from '../services/locationService';
import { requestAccess, fetchPdfDocument, sendHeartbeat, sendSecurityEvent } from '../api';
import { setupDeterrenceListeners } from '../utils/security';
import { setSessionAuth, clearSessionAuth } from '../utils/session';

const VIEW_STATES = {
  LOCATION_GATE: 'LOCATION_GATE',
  ACCESS_DENIED: 'ACCESS_DENIED',
  VIEWING_PDF: 'VIEWING_PDF',
};

export default function PdfPage() {
  const [viewState, setViewState] = useState(VIEW_STATES.LOCATION_GATE);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Active session data
  const [sessionToken, setSessionToken] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [sessionExpiresIn, setSessionExpiresIn] = useState(120);
  const [pdfData, setPdfData] = useState(null);
  const [deterrenceNotice, setDeterrenceNotice] = useState(null);

  const heartbeatTimerRef = useRef(null);

  // Deterrence listeners (context menu, copy, PrintScreen)
  useEffect(() => {
    const cleanup = setupDeterrenceListeners({
      onDeterrenceNotice: (notice) => {
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
  const handleLocationRequest = async (geoResult) => {
    let result = geoResult;

    // If triggered directly from LocationGate without pre-resolved result
    if (!result) {
      setIsProcessing(true);
      result = await getCurrentCoordinates();
    }

    if (result.error || result.permissionStatus === 'denied') {
      setIsProcessing(false);
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
      });
    } catch (err) {
      console.error('[Access Request Error]', err);
      const safeMsg =
        err.status === 403
          ? 'Access denied by network security policy.'
          : err.status === 400
          ? 'Invalid geographic coordinates provided.'
          : err.status === 404
          ? 'The document is temporarily unavailable.'
          : 'Access denied.';

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
    setViewState(VIEW_STATES.LOCATION_GATE);
  };

  return (
    <div className="relative min-h-screen w-full bg-slate-950 font-sans">
      {/* 1. Location Gate */}
      {viewState === VIEW_STATES.LOCATION_GATE && (
        <LocationGate
          onRequestAccess={handleLocationRequest}
          isProcessing={isProcessing}
          errorMessage={errorMessage}
        />
      )}

      {/* 2. Access Denied State */}
      {viewState === VIEW_STATES.ACCESS_DENIED && (
        <AccessDenied
          message={errorMessage}
          onRetry={handleRetry}
        />
      )}

      {/* 3. Protected PDF Viewer */}
      {viewState === VIEW_STATES.VIEWING_PDF && pdfData && (
        <PdfViewer
          pdfData={pdfData}
          sessionId={sessionId}
          expiresIn={sessionExpiresIn}
          onSessionExpired={handleSessionExpired}
          deterrenceNotice={deterrenceNotice}
        />
      )}
    </div>
  );
}
