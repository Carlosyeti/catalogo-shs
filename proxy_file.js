export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_BASE = 'http://38.58.46.142:9091';
  const TOKEN = '6GmrWp2KvHh2R4682ciDY09Klu92bv';
  const metodo = req.query.metodo || 'ARTICULOS';
  const cantidad = req.query.cantidad || '700';

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
    // ARTICULOS
    if (metodo === 'ARTICULOS') {
      let data = await fetchMicrosip(
        `${API_BASE}/exsim/servicios/metodo/ARTICULOS/${TOKEN}/${cantidad}`
      );
      if (Array.isArray(data)) {
        data = data.map(a => ({
          id: a.id, clave: a.clave, nombre: a.nombre,
          unidadmed: a.unidadmed, imagen: a.imagen, precios: a.precios
        }));
      }
      return res.status(200).json(data);
    }

    // CLIENTES
    if (metodo === 'CLIENTES') {
      const clienteId = (req.query.clienteId || '').trim();
      // Traemos todos los clientes — Vercel cachea esta respuesta 24h
      let data = await fetchMicrosip(
        `${API_BASE}/exsim/servicios/metodo/CLIENTES/${TOKEN}/2000`
      );
      if (clienteId) {
        data = data.filter(c => String(c.clave).trim() === clienteId);
      }
      return res.status(200).json(data);
    }

    // IMAGENES
    if (metodo === 'IMAGENES') {
      const data = await fetchMicrosip(
        `${API_BASE}/exsim/servicios/metodo/IMAGENES/${TOKEN}/${req.query.id || ''}`
      );
      return res.status(200).json(data);
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
