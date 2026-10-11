import React from 'react';
import { ShieldAlert, RefreshCw } from 'lucide-react';

export default function AccessDenied({ message, onRetry }) {
  const displayMessage = message || 'Location permission is required to view this document.';

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-slate-100 p-4 antialiased">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur-md text-center">
        <div className="mx-auto w-12 h-12 rounded-xl bg-rose-950/40 border border-rose-900/50 flex items-center justify-center text-rose-400 mb-6 shadow-inner">
          <ShieldAlert className="w-5 h-5" />
        </div>

        <h1 className="text-xl font-semibold text-white tracking-tight mb-2">
          Access Denied
        </h1>

        <p className="text-sm text-slate-400 mb-8 leading-relaxed">
          {displayMessage}
        </p>

        {onRetry && (
          <button
            onClick={onRetry}
            className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-800 text-white text-sm font-medium transition-all duration-150 border border-slate-700 flex items-center justify-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Try again</span>
          </button>
        )}

        <p className="mt-6 text-[11px] text-slate-500">
          Location permission is required by policy. If blocked, click the lock or site settings icon in your browser address bar to allow location.
        </p>
      </div>
    </div>
  );
}
