import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_BASE = 'http://38.58.46.142:9091';
  const TOKEN = '6GmrWp2KvHh2R4682ciDY09Klu92bv';
  const metodo = req.query.metodo || 'ARTICULOS';

  function repairJSON(text) {
    let attempts = 0;
    while (attempts < 100) {
      try { return JSON.parse(text); } catch (e) {
        const posMatch = e.message.match(/position (\d+)/);
        if (!posMatch) break;
        const pos = parseInt(posMatch[1]);
        text = text.substring(0, pos) + ' ' + text.substring(pos + 1);
        attempts++;
      }
    }
    const lastObj = text.lastIndexOf('},{');
    if (lastObj > 0) {
      try { return JSON.parse(text.substring(0, lastObj + 1) + ']'); } catch (e) {}
    }
    return [];
  }

  async function fetchMicrosip(url) {
    const response = await fetch(url);
    let text = await response.text();
    text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');
    return repairJSON(text) || [];
  }

  try {

    if (metodo === 'ARTICULOS') {
      const cantidad = req.query.cantidad || '50';
      const pagina   = req.query.pagina   || '0';
      const artId    = req.query.articuloId || '0';
      const url = `${API_BASE}/exsim/servicios/metodo/ARTICULOS/${TOKEN}/${cantidad}/${pagina}/${artId}`;
      let data = await fetchMicrosip(url);
      if (Array.isArray(data)) {
        data = data.map(a => ({
          id: a.id, clave: a.clave, nombre: a.nombre,
          unidadmed: a.unidadmed, imagen: a.imagen, precios: a.precios
        }));
      }
      return res.status(200).json(data);
    }

    if (metodo === 'CLIENTES') {
      const clienteId = (req.query.clienteId || '').trim();
      const buscar    = (req.query.buscar || '').trim().toUpperCase();

      if (clienteId) {
        const cached = await redis.get(`cliente:${clienteId}`);
        if (cached) return res.status(200).json([JSON.parse(cached)]);
        return res.status(200).json([]);
      }

      if (buscar) {
        const keys = await redis.keys('cliente:*');
        const resultados = [];
        for (const key of keys) {
          const raw = await redis.get(key);
          if (raw) {
            const c = JSON.parse(raw);
            if (c.nombre && c.nombre.toUpperCase().includes(buscar)) {
              resultados.push(c);
            }
          }
        }
        return res.status(200).json(resultados);
      }

      return res.status(200).json([]);
    }

    if (metodo === 'SYNC') {
      let pagina = 0;
      let total = 0;
      while (true) {
        const url = `${API_BASE}/exsim/servicios/metodo/CLIENTES/${TOKEN}/100/${pagina}`;
        const data = await fetchMicrosip(url);
        if (!Array.isArray(data) || data.length === 0) break;
        for (const c of data) {
          await redis.set(`cliente:${String(c.clave).trim()}`, JSON.stringify(c), 'EX', 86400);
          total++;
        }
        if (data.length < 100) break;
        pagina++;
      }
      return res.status(200).json({ ok: true, total, mensaje: `${total} clientes sincronizados` });
    }

    if (metodo === 'PEDIDOS') {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
      }
      const body = req.body;
      if (!body || !body.Documento) {
        return res.status(400).json({ error: 'Body inválido. Se requiere { Documento: {...} }' });
      }
      const response = await fetch(
        `${API_BASE}/exsim/servicios/metodo/PEDIDOS/${TOKEN}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );
      const text = await response.text();
      let result;
      try { result = JSON.parse(text); } catch { result = { respuesta: text }; }
      return res.status(200).json(result);
    }

    if (metodo === 'IMAGENES') {
      const pagina = req.query.pagina || '0';
      const artId  = req.query.articuloId || '0';
      const url = `${API_BASE}/exsim/servicios/metodo/IMAGENES/${TOKEN}/50/${pagina}/${artId}`;
      const data = await fetchMicrosip(url);
      return res.status(200).json(data);
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
