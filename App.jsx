import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import RootPage from './routes/RootPage';
import PdfPage from './routes/PdfPage';
import AdminPage from './routes/AdminPage';

/**
 * EXACT APPLICATION ROUTING SPECIFICATION:
 * - '/' — empty page with NO visible UI, no navbar, no marketing, no auto-redirect.
 * - '/pdf_00024' — visitor's PDF viewer and location-permission gate.
 * - '/home/admin=@' — administrator login and security audit dashboard.
 * - Unknown routes return empty page without exposing the PDF.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootPage />} />
        <Route path="/pdf_00024" element={<PdfPage />} />
        <Route path="/home/admin=@" element={<AdminPage />} />
        <Route path="*" element={<RootPage />} />
      </Routes>
    </BrowserRouter>
  );
}
