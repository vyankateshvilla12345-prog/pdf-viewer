import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Anchored strictly to server/assets/pdf_00024.pdf
const ASSETS_DIR = path.resolve(__dirname, '../assets');
const PDF_FILE_PATH = path.join(ASSETS_DIR, 'pdf_00024.pdf');

/**
 * Checks whether the required PDF file exists on the server
 */
export function checkPdfFileExists() {
  const exists = fs.existsSync(PDF_FILE_PATH);
  if (!exists) {
    console.error(
      `[CRITICAL CONFIGURATION ERROR] Required PDF file is missing! Expected at: ${PDF_FILE_PATH}. ` +
      'Please place your actual PDF at server/assets/pdf_00024.pdf.'
    );
  }
  return exists;
}

/**
 * Streams the protected PDF document to the authorized client with Range support
 */
export function streamProtectedPdf(req, res) {
  // Path traversal verification
  const safeResolvedPath = path.resolve(PDF_FILE_PATH);
  if (!safeResolvedPath.startsWith(ASSETS_DIR) || !safeResolvedPath.endsWith('pdf_00024.pdf')) {
    return res.status(403).json({
      error: 'Access to the specified asset is prohibited.',
      code: 'FORBIDDEN_PATH',
    });
  }

  if (!fs.existsSync(safeResolvedPath)) {
    console.error(`[PDF Service] Document file missing at: ${safeResolvedPath}`);
    return res.status(404).json({
      error: 'The document is temporarily unavailable.',
      code: 'DOCUMENT_NOT_FOUND',
    });
  }

  let stats;
  try {
    stats = fs.statSync(safeResolvedPath);
  } catch (err) {
    console.error('[PDF Service] Error reading file stats:', err.message);
    return res.status(500).json({
      error: 'Error reading document.',
      code: 'DOCUMENT_READ_ERROR',
    });
  }

  const fileSize = stats.size;
  const rangeHeader = req.headers.range;

  // Strict anti-caching & secure transmission headers
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline; filename="document.pdf"');
  res.setHeader('Accept-Ranges', 'bytes');

  // Handle HTTP 206 Partial Content range requests (PDF.js streaming)
  if (rangeHeader) {
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || start >= fileSize || end >= fileSize || start > end) {
      res.setHeader('Content-Range', `bytes */${fileSize}`);
      return res.status(416).json({
        error: 'Requested Range Not Satisfiable',
        code: 'RANGE_NOT_SATISFIABLE',
      });
    }

    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunkSize);

    const stream = fs.createReadStream(safeResolvedPath, { start, end });
    stream.on('error', (streamErr) => {
      console.error('[PDF Stream Error]', streamErr.message);
      if (!res.headersSent) res.status(500).end();
    });
    return stream.pipe(res);
  }

  // Full document streaming
  res.setHeader('Content-Length', fileSize);
  const stream = fs.createReadStream(safeResolvedPath);
  stream.on('error', (streamErr) => {
    console.error('[PDF Stream Error]', streamErr.message);
    if (!res.headersSent) res.status(500).end();
  });
  return stream.pipe(res);
}
