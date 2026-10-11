import { sendSecurityEvent } from '../api';

interface DeterrenceOptions {
  onDeterrenceNotice?: (message: string) => void;
}

export function setupDeterrenceListeners({ onDeterrenceNotice }: DeterrenceOptions = {}) {
  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    if (onDeterrenceNotice) {
      onDeterrenceNotice('Context menu is disabled on protected documents.');
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const isCtrlOrMeta = e.ctrlKey || e.metaKey;

    if (
      (isCtrlOrMeta && (e.key === 'p' || e.key === 'P')) ||
      (isCtrlOrMeta && (e.key === 's' || e.key === 'S')) ||
      e.key === 'PrintScreen'
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

  const handleCopy = (e: ClipboardEvent) => {
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
