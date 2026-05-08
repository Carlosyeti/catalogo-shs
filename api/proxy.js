export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
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

    // ── ARTICULOS ──────────────────────────────────────────
    if (metodo === 'ARTICULOS') {
      const cantidad = req.query.cantidad || '50';
      const pagina   = req.query.pagina   || '0';
      const artId    = req.query.articuloId || '0';
      let url = `${API_BASE}/exsim/servicios/metodo/ARTICULOS/${TOKEN}/${cantidad}/${pagina}/${artId}`;
      let data = await fetchMicrosip(url);
      if (Array.isArray(data)) {
        data = data.map(a => ({
          id: a.id, clave: a.clave, nombre: a.nombre,
          unidadmed: a.unidadmed, imagen: a.imagen, precios: a.precios
        }));
      }
      return res.status(200).json(data);
    }

    // ── CLIENTES ───────────────────────────────────────────
if (metodo === 'CLIENTES') {
  const cantidad  = req.query.cantidad  || '50';
  const pagina    = req.query.pagina    || '0';
  const clienteId = req.query.clienteId || '0';

  const url = `${API_BASE}/exsim/servicios/metodo/CLIENTES/${TOKEN}/${cantidad}/${pagina}/${clienteId}`;
  const data = await fetchMicrosip(url);
  return res.status(200).json(Array.isArray(data) ? data : []);
}

    // ── PEDIDOS ────────────────────────────────────────────
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

    // ── IMAGENES ───────────────────────────────────────────
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
