import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_BASE = 'http://38.58.46.142:9091';
  const TOKEN = '0hHps6mamAd6qDwcjqp5S5lUUu86JP';
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

  // ── Convierte campos numéricos que Microsip espera como número ──
  function fixClienteTypes(c) {
    return {
      ...c,
      Num_exterior:  c.Num_exterior  !== undefined && c.Num_exterior !== '' ? parseInt(c.Num_exterior)  || 0 : 0,
      Telefono1:     c.Telefono1     !== undefined && c.Telefono1    !== '' ? parseInt(String(c.Telefono1).replace(/\D/g,''))  || 0 : 0,
      Telefono2:     c.Telefono2     !== undefined && c.Telefono2    !== '' ? parseInt(String(c.Telefono2).replace(/\D/g,''))  || 0 : 0,
      CodigoPostal:  c.CodigoPostal  !== undefined && c.CodigoPostal !== '' ? parseInt(String(c.CodigoPostal).replace(/\D/g,'')) || 0 : 0,
      DirClienteID:  c.DirClienteID  !== undefined ? parseInt(c.DirClienteID) || 0 : 0,
    };
  }

  try {

    // ── ARTICULOS — sirve desde Redis si está cacheado ──
    if (metodo === 'ARTICULOS') {
      const cantidad = req.query.cantidad || '50';
      const pagina   = req.query.pagina   || '0';
      const artId    = req.query.articuloId || '0';

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

    // ── SYNC_ARTICULOS ──
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

    // ── CATALOGO_COMPLETO ──
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
          await redis.set(`cliente:${String(c.clave).trim()}`, JSON.stringify(c));
          total++;
        }
        if (data.length < 100) break;
        pagina++;
      }
      return res.status(200).json({ ok: true, total, mensaje: `${total} clientes sincronizados` });
    }

    // ── TEST_PEDIDO — usa tipos correctos igual que Postman ──
    if (metodo === 'TEST_PEDIDO') {
      const body = {
        Documento: {
          Cliente: fixClienteTypes({
            Nombre: "PUBLICO EN GENERAL",
            DirClienteID: 10922,
            NomDireccion: "PUBLICO EN GENERAL_100",
            RFC: "XAXX010101000",
            Clave: "MOST100",
            Calle: "AV. CRISTOBAL COLON",
            Num_interior: "",
            Num_exterior: 501,
            Poblacion: "",
            Referencia: "",
            Colonia: "LOS VIVEROS",
            Ciudad: "COLIMA",
            Estado: "COLIMA",
            Pais: "MEXICO",
            Telefono1: 3120000000,
            Telefono2: "",
            Fax: "",
            Email: "asesores_vargas@hotmail.com",
            CodigoPostal: 28070,
            Notas: "Pedido de prueba app SHS",
            CP_FechaNacimiento: "",
            CP_CURP: "",
            CP_TelefonoSucesor: "",
            CP_CorreoElectronicoSucesor: ""
          }),
          Encabezado: {
            Folio: "",
            OrdenCompra: "TEST-001",
            Descripcion: "COMPRA ONLINE",
            MetodoPago: "Pago manual",
            EstatusPago: "Pendiente",
            CP_inv_inicial: 0,
            CP_pagos: 0,
            CP_pagos_letra: "",
            CP_meses: 0,
            CP_meses_letra: "",
            CP_consultor: "",
            CP_nota: "",
            CP_n_solicitud: "",
            CP_contrato: "",
            CP_empresa: ""
          },
          Detalle: [{
            NombreArticulo: "AGUA PURIFICADA",
            Unidades: 1,
            Precio: 41.85,
            Descuento: 0,
            Importe: 41.85,
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

      // Corregir tipos del Cliente antes de mandar a Microsip
      if (body.Documento.Cliente) {
        body.Documento.Cliente = fixClienteTypes(body.Documento.Cliente);
      }

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

    // ── STRIPE ──
    if (metodo === 'CREAR_PAGO') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Usar POST' });
      let bodyData = req.body;
      if (typeof bodyData === 'string') { try { bodyData = JSON.parse(bodyData); } catch(e) {} }
      const { items, clienteNombre, clienteId, conComision } = bodyData || {};
      if (!items || !items.length) return res.status(400).json({ error: 'Sin artículos', body: bodyData });

      const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
      const totalConIva = subtotal * 1.16;
      const comision = conComision ? totalConIva * 0.03 : 0;

      const lineItems = items.map(item => ({
        price_data: {
          currency: 'mxn',
          product_data: { name: item.nombre },
          unit_amount: Math.round(item.precio * 1.16 * 100)
        },
        quantity: item.cantidad
      }));

      if (conComision && comision > 0) {
        lineItems.push({
          price_data: {
            currency: 'mxn',
            product_data: { name: 'Comisión pago con tarjeta (3%)' },
            unit_amount: Math.round(comision * 100)
          },
          quantity: 1
        });
      }

      const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          'payment_method_types[]': 'card',
          'mode': 'payment',
          'success_url': `https://pedidos.surtidorahigienicos.com/?cliente=${clienteId}&pago=exitoso`,
          'cancel_url': `https://pedidos.surtidorahigienicos.com/?cliente=${clienteId}&pago=cancelado`,
          'metadata[clienteId]': clienteId,
          'metadata[clienteNombre]': clienteNombre,
          ...Object.fromEntries(lineItems.flatMap((item, i) => [
            [`line_items[${i}][price_data][currency]`, item.price_data.currency],
            [`line_items[${i}][price_data][product_data][name]`, item.price_data.product_data.name],
            [`line_items[${i}][price_data][unit_amount]`, item.price_data.unit_amount],
            [`line_items[${i}][quantity]`, item.quantity]
          ]))
        }).toString()
      });

      const session = await stripeRes.json();
      if (session.error) return res.status(400).json({ error: session.error.message });
      return res.status(200).json({ url: session.url });
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
