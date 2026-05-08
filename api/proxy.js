export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_BASE = 'http://38.58.46.142:9091';
  const TOKEN = '6GmrWp2KvHh2R4682ciDY09Klu92bv';
  const metodo = req.query.metodo || 'ARTICULOS';
  const cantidad = req.query.cantidad || '700';

  let apiUrl = '';
  if (metodo === 'ARTICULOS') {
    apiUrl = `${API_BASE}/exsim/servicios/metodo/ARTICULOS/${TOKEN}/${cantidad}`;
  } else if (metodo === 'CLIENTES') {
    apiUrl = `${API_BASE}/exsim/servicios/metodo/CLIENTES/${TOKEN}/${cantidad}`;
  } else if (metodo === 'IMAGENES') {
    apiUrl = `${API_BASE}/exsim/servicios/metodo/IMAGENES/${TOKEN}/${req.query.id||''}`;
  } else {
    return res.status(200).json({ ok: true });
  }

  function repairJSON(text) {
    // Intentar hasta 100 reparaciones de caracteres malos
    let attempts = 0;
    while(attempts < 100) {
      try {
        return JSON.parse(text);
      } catch(e) {
        const posMatch = e.message.match(/position (\d+)/);
        if(!posMatch) break;
        const pos = parseInt(posMatch[1]);
        // Reemplazar el carácter malo en esa posición exacta
        text = text.substring(0, pos) + ' ' + text.substring(pos + 1);
        attempts++;
      }
    }
    // Si aún falla, truncar antes del último objeto completo
    const lastObj = text.lastIndexOf('},{');
    if(lastObj > 0) {
      try { return JSON.parse(text.substring(0, lastObj+1) + ']'); } catch(e) {}
    }
    return [];
  }

  try {
    const response = await fetch(apiUrl);
    let text = await response.text();
    text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');

    let data = repairJSON(text);
    if(!data) data = [];

    if(metodo === 'ARTICULOS' && Array.isArray(data)){
      data = data.map(a => ({
        id: a.id,
        clave: a.clave,
        nombre: a.nombre,
        unidadmed: a.unidadmed,
        imagen: a.imagen,
        precios: a.precios
      }));
    }

    return res.status(200).json(data);
  } catch(err){
    return res.status(500).json({ error: err.message });
  }
}
