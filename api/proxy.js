
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const API_BASE = 'http://38.58.46.142:9091';
  const TOKEN = '6GmrWp2KvHh2R4682ciDY09Klu92bv';

  const metodo = req.query.metodo || 'ARTICULOS';
  const cantidad = req.query.cantidad || '100';
  const pagina = req.query.pagina || '1';
  const clienteId = req.query.clienteId || '';
  const articuloId = req.query.articuloId || '';
  const id = req.query.id || '';

  let apiUrl = '';

  if (metodo === 'ARTICULOS') {
    apiUrl = `${API_BASE}/exsim/servicios/metodo/ARTICULOS/${TOKEN}/${cantidad}?pagina=${pagina}`;
  } else if (metodo === 'CLIENTES') {
    apiUrl = `${API_BASE}/exsim/servicios/metodo/CLIENTES/${TOKEN}/${cantidad}`;
  } else if (metodo === 'IMAGENES') {
    apiUrl = `${API_BASE}/exsim/servicios/metodo/IMAGENES/${TOKEN}/${id}`;
  } else if (metodo === 'DESCUENTO_CLIENTE') {
    apiUrl = `${API_BASE}/exsim/servicios/metodo/DESCUENTO_CLIENTE/${TOKEN}/${clienteId}/${articuloId}`;
  } else if (metodo === 'PEDIDOS' && req.method === 'POST') {
    const response = await fetch(`${API_BASE}/exsim/servicios/metodo/PEDIDOS`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    return res.status(200).json(data);
  } else {
    return res.status(200).json({ ok: true, mensaje: 'Proxy SHS activo' });
  }

  try {
    const response = await fetch(apiUrl);
    const text = await response.text();
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(text);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
