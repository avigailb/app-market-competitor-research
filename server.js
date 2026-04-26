#!/usr/bin/env node
/**
 * Local dev server for competitor-research
 * - Serves static files
 * - POST /publish  → writes data/state.json + git commit + push
 * - POST /backup   → saves timestamped backup to backups/ (keeps last 30)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PORT = 3456;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader('Access-Control-Allow-Origin', '*');

  // ── POST /publish ──────────────────────────────────────────
  if (req.method === 'POST' && url.pathname === '/publish') {
    try {
      const body = await readBody(req);
      const stateFile = path.join(ROOT, 'data', 'state.json');
      fs.writeFileSync(stateFile, body);
      try {
        execSync('git add data/state.json', { cwd: ROOT, stdio: 'pipe' });
        execSync('git diff --cached --quiet || git commit -m "chore: publish state to GitHub Pages"', { cwd: ROOT, stdio: 'pipe', shell: true });
        execSync('git push origin master', { cwd: ROOT, stdio: 'pipe' });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, msg: 'Committed and pushed.' }));
      } catch (gitErr) {
        // State file written but git failed
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, msg: 'state.json written but git push failed: ' + gitErr.message }));
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, msg: e.message }));
    }
    return;
  }

  // ── POST /backup ───────────────────────────────────────────
  if (req.method === 'POST' && url.pathname === '/backup') {
    try {
      const body = await readBody(req);
      const dir = path.join(ROOT, 'backups');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir);
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      fs.writeFileSync(path.join(dir, `backup-${ts}.json`), body);
      // Keep last 30 backups
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
      while (files.length > 30) fs.unlinkSync(path.join(dir, files.shift()));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, msg: e.message }));
    }
    return;
  }

  // ── Static files ───────────────────────────────────────────
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = path.join(ROOT, filePath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(filePath));
});

server.listen(PORT, () => {
  console.log(`\n  App running at http://localhost:${PORT}\n`);
});
