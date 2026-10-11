import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url';
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  ShieldCheck, 
  Clock, 
  AlertTriangle,
  Loader2
} from 'lucide-react';

// Configure stable PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export default function PdfViewer({
  pdfData,
  sessionId,
  expiresIn = 120,
  onSessionExpired,
  deterrenceNotice = null,
  isBlurred = false,
}) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [isRendering, setIsRendering] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [docError, setDocError] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(expiresIn);

  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const containerRef = useRef(null);

  // 1. Session countdown timer
  useEffect(() => {
    setSecondsRemaining(expiresIn);
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (onSessionExpired) {
            onSessionExpired();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresIn, onSessionExpired]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // 2. Load PDF document into PDF.js
  useEffect(() => {
    let isCancelled = false;
    setLoadingDoc(true);
    setDocError(null);

    const loadTask = pdfjsLib.getDocument({
      data: new Uint8Array(pdfData),
    });

    loadTask.promise
      .then((loadedPdf) => {
        if (isCancelled) return;
        setPdfDoc(loadedPdf);
        setNumPages(loadedPdf.numPages);
        setCurrentPage(1);
        setLoadingDoc(false);
      })
      .catch((err) => {
        if (isCancelled) return;
        console.error('[PDF.js Error]', err);
        setDocError('Failed to parse and render document.');
        setLoadingDoc(false);
      });

    return () => {
      isCancelled = true;
      if (loadTask && typeof loadTask.destroy === 'function') {
        loadTask.destroy().catch(() => {});
      }
    };
  }, [pdfData]);

  // 3. Render active page to Canvas
  const renderPage = useCallback(
    async (pageNumber, pageScale) => {
      if (!pdfDoc || !canvasRef.current) return;

      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore cancel
        }
      }

      setIsRendering(true);

      try {
        const page = await pdfDoc.getPage(pageNumber);
        const viewport = page.getViewport({ scale: pageScale });

        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (!context) return;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(dpr, 0, 0, dpr, 0, 0);

        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, viewport.width, viewport.height);

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        const renderTask = page.render(renderContext);
        renderTaskRef.current = renderTask;

        await renderTask.promise;
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') {
          console.error('[Canvas Render Error]', err);
        }
      } finally {
        setIsRendering(false);
      }
    },
    [pdfDoc]
  );

  useEffect(() => {
    if (pdfDoc && currentPage > 0) {
      renderPage(currentPage, scale);
    }
  }, [pdfDoc, currentPage, scale, renderPage]);

  // Page controls
  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage((p) => p - 1);
  };

  const handleNextPage = () => {
    if (currentPage < numPages) setCurrentPage((p) => p + 1);
  };

  const handleZoomIn = () => setScale((s) => Math.min(2.5, +(s + 0.2).toFixed(1)));
  const handleZoomOut = () => setScale((s) => Math.max(0.6, +(s - 0.2).toFixed(1)));
  const handleFitWidth = () => {
    if (containerRef.current && canvasRef.current) {
      const containerWidth = containerRef.current.clientWidth - 48;
      const targetScale = Math.max(0.7, +(containerWidth / 612).toFixed(2));
      setScale(Math.min(targetScale, 1.8));
    }
  };

  return (
    <div
      ref={containerRef}
      onContextMenu={(e) => e.preventDefault()}
      className="flex flex-col h-screen w-full bg-slate-950 text-slate-100 select-none overflow-hidden"
    >
      {/* Floating Minimal Viewer Controls */}
      {!isBlurred && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 bg-slate-900/85 backdrop-blur-md border border-slate-800/80 rounded-full px-3 py-1 flex items-center gap-2 shadow-2xl opacity-60 hover:opacity-100 transition-opacity text-xs select-none">
          <button
            onClick={handlePrevPage}
            disabled={currentPage <= 1 || isRendering}
            className="p-1 hover:bg-slate-800 rounded-full disabled:opacity-30 transition text-slate-300 cursor-pointer"
            title="Previous Page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono text-slate-300 px-1">
            {currentPage} / {numPages || 1}
          </span>
          <button
            onClick={handleNextPage}
            disabled={currentPage >= numPages || isRendering}
            className="p-1 hover:bg-slate-800 rounded-full disabled:opacity-30 transition text-slate-300 cursor-pointer"
            title="Next Page"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <span className="w-px h-3 bg-slate-800 mx-0.5" />
          <button
            onClick={handleZoomOut}
            disabled={scale <= 0.6 || isRendering}
            className="p-1 hover:bg-slate-800 rounded-full disabled:opacity-30 transition text-slate-300 cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleZoomIn}
            disabled={scale >= 2.5 || isRendering}
            className="p-1 hover:bg-slate-800 rounded-full disabled:opacity-30 transition text-slate-300 cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleFitWidth}
            className="p-1 hover:bg-slate-800 rounded-full transition text-slate-300 cursor-pointer"
            title="Fit Width"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      )}

      {deterrenceNotice && (
        <div className="bg-amber-950/80 border-b border-amber-800/60 text-amber-200 px-4 py-2 text-xs flex items-center justify-center gap-2 transition-all">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{deterrenceNotice}</span>
        </div>
      )}

      <main className={`flex-1 overflow-auto bg-slate-950 p-4 md:p-8 flex items-start justify-center relative transition-all duration-700 ${
        isBlurred ? 'filter blur-xl md:blur-2xl opacity-40 select-none pointer-events-none scale-[1.03]' : 'blur-0 opacity-100 scale-100'
      }`}>
        {loadingDoc ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3 my-auto">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
            <p className="text-sm">Decrypting and loading document stream...</p>
          </div>
        ) : docError ? (
          <div className="flex flex-col items-center justify-center h-full text-rose-400 gap-3 my-auto">
            <AlertTriangle className="w-8 h-8" />
            <p className="text-sm">{docError}</p>
          </div>
        ) : (
          <div className="relative shadow-2xl rounded-sm overflow-hidden bg-white border border-slate-800">
            <canvas ref={canvasRef} className="block transition-transform duration-75" />

            <div
              className="absolute inset-0 pointer-events-none flex flex-col justify-around overflow-hidden opacity-[0.06] select-none"
              aria-hidden="true"
            >
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="whitespace-nowrap -rotate-25 text-slate-900 font-bold tracking-widest text-lg sm:text-2xl text-center"
                >
                  CONFIDENTIAL • SESSION #{sessionId ? sessionId.slice(-8) : 'AUTH'} • RESTRICTED ACCESS
                </div>
              ))}
            </div>

            {isRendering && (
              <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
