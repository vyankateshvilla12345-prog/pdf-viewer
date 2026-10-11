import React from 'react';

/**
 * Root website path ('/')
 * REQUIREMENT: Must contain NO user interface, no marketing page, no sidebar,
 * no dashboard, and must NOT redirect or expose the PDF.
 */
export default function RootPage() {
  return <div className="min-h-screen w-full bg-slate-950" />;
}
