import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { handwritingMiddleware } from './handwriting.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
  '.traineddata': 'application/octet-stream',
  '.webmanifest': 'application/manifest+json',
};

function reply(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(body);
}

/**
 * Shared static server used by the CLI production server and the Electron shell.
 * It deliberately has no framework dependency so it can run inside Electron's
 * embedded Node runtime without installing server packages.
 */
export function createSlovoServer({ distDir }) {
  if (!distDir) throw new Error('distDir is required');

  return http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url || '/', `http://${req.headers.host}`).pathname);
    } catch {
      reply(res, 400, 'Bad request');
      return;
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');

    if (pathname === '/api/handwriting') {
      handwritingMiddleware(req, res);
      return;
    }
    if (pathname === '/api/health') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ ok: true, platform: process.platform }));
      return;
    }

    let file = path.join(distDir, pathname);
    const relative = path.relative(distDir, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      reply(res, 403, 'Forbidden');
      return;
    }

    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      file = path.join(file, 'index.html');
    }

    if (!fs.existsSync(file)) {
      const wantsHtml = (req.headers.accept || '').includes('text/html');
      if (wantsHtml) {
        file = path.join(distDir, 'index.html');
      } else {
        reply(res, 404, 'Not found');
        return;
      }
    }

    const ext = path.extname(file).toLowerCase();
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');

    if (ext === '.html' || pathname === '/sw.js' || ext === '.webmanifest') {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (pathname.startsWith('/assets/') || ext === '.wasm' || ext === '.traineddata') {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (ext === '.woff2' || ext === '.png' || ext === '.svg') {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    } else if (ext === '.gz') {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    const stream = fs.createReadStream(file);
    stream.on('error', () => {
      if (!res.headersSent) reply(res, 500, 'Internal error');
      else res.destroy();
    });
    stream.pipe(res);
  });
}
