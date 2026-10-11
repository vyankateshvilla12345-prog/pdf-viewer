/**
 * Security deterrence utilities and event reporting
 *
 * NOTE ON SECURITY BOUNDARIES:
 * Browser-level JavaScript cannot guarantee blocking operating-system-level
 * screenshots, GPU screen recording, or external physical camera photography.
 * These handlers implement reasonable client-side deterrence (disabling right-click context
 * menu, suppressing text selection, intercepting standard print/save shortcuts) while clearly
 * recognizing that authoritative security lies in server-side session gating and short-lived tokens.
 */

import { sendSecurityEvent } from '../api.js';

export function setupDeterrenceListeners({ onDeterrenceNotice } = {}) {
  const handleContextMenu = (e) => {
    e.preventDefault();
    if (onDeterrenceNotice) {
      onDeterrenceNotice('Context menu is disabled on protected documents.');
    }
  };

  const handleKeyDown = (e) => {
    // Intercept common save / print / developer shortcuts
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;

    if (
      (isCtrlOrMeta && (e.key === 'p' || e.key === 'P')) || // Print
      (isCtrlOrMeta && (e.key === 's' || e.key === 'S')) || // Save
      e.key === 'PrintScreen' // Windows PrintScreen key
    ) {
      e.preventDefault();
      if (onDeterrenceNotice) {
        onDeterrenceNotice('Printing, saving, and screen capture shortcuts are restricted.');
      }
      sendSecurityEvent('viewer_error', {
        details: { action: 'blocked_shortcut', key: e.key },
      }).catch(() => {});
    }
  };

  const handleCopy = (e) => {
    e.preventDefault();
    if (onDeterrenceNotice) {
      onDeterrenceNotice('Document text copying is disabled.');
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  document.addEventListener('contextmenu', handleContextMenu);
  document.addEventListener('copy', handleCopy);

  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('contextmenu', handleContextMenu);
    document.removeEventListener('copy', handleCopy);
  };
}
