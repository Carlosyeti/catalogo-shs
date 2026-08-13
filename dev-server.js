// dev-server.js — servidor local SOLO para desarrollo.
// Sirve los archivos estáticos del sitio y ejecuta las funciones de /api
// (que en producción corren como funciones serverless de Vercel) para
// poder probar el flujo completo en localhost.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 5500;

process.env.MICROSIP_API_URL = process.env.MICROSIP_API_URL || 'http://38.58.46.142:9095';
process.env.MICROSIP_API_TOKEN = process.env.MICROSIP_API_TOKEN || 'XTXWVDNdHP0EI8tdYdWtEsf0Bf60lr8eSXaBEOUP86E';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

function makeRes(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
  res.setHeader = res.setHeader.bind(res);
  return res;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith('/api/')) {
    const modName = url.pathname.replace('/api/', '').replace(/\.js$/, '');
    const modPath = path.join(__dirname, 'api', modName + '.js');
    if (!fs.existsSync(modPath)) { res.writeHead(404); res.end('API module not found: ' + modName); return; }
    try {
      const mod = await import('file://' + modPath + '?t=' + Date.now());
      const query = Object.fromEntries(url.searchParams.entries());
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', async () => {
        let parsedBody = undefined;
        if (body) { try { parsedBody = JSON.parse(body); } catch { parsedBody = body; } }
        const fakeReq = { method: req.method, query, body: parsedBody, headers: req.headers };
        const fakeRes = makeRes(res);
        try {
          await mod.default(fakeReq, fakeRes);
        } catch (err) {
          console.error('Error en ' + modName + ':', err);
          if (!res.writableEnded) { res.statusCode = 500; res.end(JSON.stringify({ error: err.message })); }
        }
      });
    } catch (err) {
      console.error('Error cargando ' + modName + ':', err);
      res.writeHead(500); res.end('Error cargando modulo: ' + err.message);
    }
    return;
  }

  // Estáticos
  let filePath = path.join(__dirname, decodeURIComponent(url.pathname));
  if (url.pathname === '/') filePath = path.join(__dirname, 'index.html');
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log('Dev server (con /api funcionando) en http://localhost:' + PORT));
