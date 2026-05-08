export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_BASE = 'http://38.58.46.142:9091';
  const TOKEN = '6GmrWp2KvHh2R4682ciDY09Klu92bv';
  const metodo = req.query.metodo || 'ARTICULOS';
  const cantidad = req.query.cantidad || '10';
  const pagina = req.query.pagina || '1';

  let apiUrl = '';
  if (metodo === 'ARTICULOS') {
    apiUrl = `${API_BASE}/exsim/servicios/metodo/ARTICULOS/${TOKEN}/${cantidad}?pagina=${pagina}`;
  } else if (metodo === 'CLIENTES') {
    apiUrl = `${API_BASE}/exsim/servicios/metodo/CLIENTES/${TOKEN}/${cantidad}`;
  } else if (metodo === 'IMAGENES') {
    apiUrl = `${API_BASE}/exsim/servicios/metodo/IMAGENES/${TOKEN}/${req.query.id||''}`;
  } else if (metodo === 'DESCUENTO_CLIENTE') {
    apiUrl = `${API_BASE}/exsim/servicios/metodo/DESCUENTO_CLIENTE/${TOKEN}/${req.query.clienteId||''}/${req.query.articuloId||''}`;
  } else {
    return res.status(200).json({ ok: true, mensaje: 'Proxy SHS activo' });
  }

  try {
    const response = await fetch(apiUrl);
    let text = await response.text();
    text = text.replace(/[\x00-\x1F\x7F]/g, ' ');
    let data;
    try {
      data = JSON.parse(text);
    } catch(e) {
      try {
        let fixed = text;
        while (fixed.length > 10) {
          try {
            data = JSON.parse(fixed + (fixed.trimEnd().endsWith(']') ? '' : ']'));
            break;
          } catch(e2) {
            const lastComma = fixed.lastIndexOf('},{');
            if (lastComma < 0) { data = []; break; }
            fixed = fixed.substring(0, lastComma + 1) + ']';
          }
        }
      } catch(e3) { data = []; }
    }
    if (!data) data = [];
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
