'use strict';
// Serve APENAS o test-panel.html em http://localhost:8080 (sem dependências).
// Não use "http-server ." na raiz do projeto: ele exporia .env, código-fonte e SECURITY_AUDIT.md.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PANEL_PORT || 8080);
const FILE = path.join(__dirname, 'test-panel.html');

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (req.method !== 'GET' || (url !== '/' && url !== '/test-panel.html')) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  return fs.readFile(FILE, (err, data) => {
    if (err) { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Erro ao ler test-panel.html'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
    return res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => console.log(`Painel de testes: http://localhost:${PORT}  (a API deve estar em http://localhost:3000)`));
