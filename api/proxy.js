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

    // ── ARTICULOS — sirve desde Redis si está cacheado ──
    if (metodo === 'ARTICULOS') {
      const cantidad = req.query.cantidad || '50';
      const pagina   = req.query.pagina   || '0';
      const artId    = req.query.articuloId || '0';

      // Si piden catálogo completo (artId=0), intentar desde Redis
      if (artId === '0') {
        const cached = await redis.get('catalogo:completo');
        if (cached) {
          const todos = JSON.parse(cached);
          const p = parseInt(pagina);
          const c = parseInt(cantidad);
          const slice = todos.slice(p * c, (p + 1) * c);
          return res.status(200).json(slice);
        }
      }

      // Fallback: Microsip directo
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

    // ── SYNC_ARTICULOS — descarga UNA página y la agrega al caché ──
    if (metodo === 'SYNC_ARTICULOS') {
      const pagina = parseInt(req.query.pagina || '0');
      const reset  = req.query.reset === '1';
      res.setHeader('Cache-Control', 'no-store');

      const url = `${API_BASE}/exsim/servicios/metodo/ARTICULOS/${TOKEN}/100/${pagina}/0`;
      const data = await fetchMicrosip(url);

      if (!Array.isArray(data) || data.length === 0) {
        return res.status(200).json({ ok: true, fin: true, pagina, total: 0 });
      }

      const mapped = data.map(a => ({
        id: a.id, clave: a.clave, nombre: a.nombre,
        unidadmed: a.unidadmed, imagen: a.imagen, precios: a.precios
      }));

      // Si es página 0 o reset, empezar de cero; si no, agregar al existente
      let existentes = [];
      if (!reset && pagina > 0) {
        const cached = await redis.get('catalogo:completo');
        if (cached) existentes = JSON.parse(cached);
      }

      const todos = existentes.concat(mapped);
      await redis.set('catalogo:completo', JSON.stringify(todos));

      return res.status(200).json({
        ok: true,
        fin: data.length < 100,
        pagina,
        enEstaPagina: data.length,
        totalAcumulado: todos.length
      });
    }

    // ── CATALOGO_COMPLETO — devuelve todo de una vez desde Redis ──
    if (metodo === 'CATALOGO_COMPLETO') {
      const cached = await redis.get('catalogo:completo');
      if (cached) return res.status(200).json(JSON.parse(cached));
      return res.status(200).json([]);
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
            if (c.nombre && c.nombre.toUpperCase().includes(buscar)) resultados.push(c);
          }
        }
        return res.status(200).json(resultados);
      }
      return res.status(200).json([]);
    }

    if (metodo === 'HISTORIAL') {
      const clienteId = (req.query.clienteId || '').trim();
      if (!clienteId) return res.status(400).json({ error: 'clienteId requerido' });
      const cached = await redis.get(`historial:${clienteId}`);
      if (cached) return res.status(200).json(JSON.parse(cached));
      return res.status(200).json({ articulos: [] });
    }

    if (metodo === 'PRECIOS_CLIENTE') {
      const clienteId = (req.query.clienteId || '').trim();
      if (!clienteId) return res.status(400).json({ error: 'clienteId requerido' });
      const cached = await redis.get(`precios:${clienteId}`);
      if (cached) return res.status(200).json(JSON.parse(cached));
      return res.status(200).json({});
    }

    if (metodo === 'SYNC_HISTORIAL') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Usar POST' });
      const payload = req.body;
      if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'Body inválido' });
      let total = 0;
      for (const [clave, data] of Object.entries(payload)) {
        await redis.set(`historial:${clave}`, JSON.stringify(data));
        total++;
      }
      return res.status(200).json({ ok: true, total });
    }

    if (metodo === 'SYNC_PRECIOS') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Usar POST' });
      const payload = req.body;
      if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'Body inválido' });
      let total = 0;
      for (const [clave, precios] of Object.entries(payload)) {
        await redis.set(`precios:${clave}`, JSON.stringify(precios));
        total++;
      }
      return res.status(200).json({ ok: true, total });
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

    // ── TEST_PEDIDO — prueba con JSON mínimo de la documentación ──
    if (metodo === 'TEST_PEDIDO') {
      const body = {
        Documento: {
          Cliente: {
            Nombre: "LUISD ALBERTO TERAN",
            DirClienteID: 269084,
            NomDireccion: "Otra direccion",
            RFC: "XAXX010101000",
            Clave: "LA12",
            Calle: "CENTRO",
            Num_interior: "305",
            Num_exterior: "4",
            Poblacion: "Puebla",
            Referencia: "Centro",
            Colonia: "Centro",
            Ciudad: "Oaxaca",
            Estado: "Oaxaca",
            Pais: "Mexico",
            Telefono1: "2220000000",
            Telefono2: "",
            Fax: "",
            Email: "SOPORTE@EXSIM.COM.MX",
            CodigoPostal: "72000",
            Notas: "El cliente solo compra los viernes"
          },
          Encabezado: {
            OrdenCompra: "QUO451",
            Descripcion: "QUO451QUO451",
            MetodoPago: "Pago manual",
            EstatusPago: "Pendiente",
            Almacen: "Nombre del almacen"
          },
          Detalle: [{
            NombreArticulo: "Bola de Boliche No. 13",
            Unidades: 1,
            Precio: 880.00,
            Descuento: 0,
            Importe: 880.00,
            DescuentoExtra: 0
          }]
        }
      };
      const response = await fetch(
        `${API_BASE}/exsim/servicios/metodo/PEDIDOS/${TOKEN}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      const text = await response.text();
      let result;
      try { result = JSON.parse(text); } catch { result = { respuesta: text }; }
      return res.status(200).json(result);
    }

    if (metodo === 'PEDIDOS') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
      const body = req.body;
      if (!body || !body.Documento) return res.status(400).json({ error: 'Body inválido.' });
      const response = await fetch(
        `${API_BASE}/exsim/servicios/metodo/PEDIDOS/${TOKEN}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
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
