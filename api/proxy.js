import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const CLD_KEY    = '642717449888493';
const CLD_SECRET = 'loHF1m-IHkYwZHyBzbuWu2YJ_dI';
const CLD_CLOUD  = 'dkaqcxipf';

const SYNC_MAX_PAGINAS = parseInt(process.env.SYNC_MAX_PAGINAS || '30');
const CRON_SECRET = process.env.CRON_SECRET || 'SHS_CRON_2026';

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

  function toNum(v) {
    if (v === undefined || v === null || v === '' || v === 0) return 0;
    const limpio = String(v).replace(/\D/g, '');
    return limpio.length > 0 ? parseInt(limpio) || 0 : 0;
  }

  function fixClienteTypes(c) {
    return {
      ...c,
      Num_exterior: toNum(c.Num_exterior),
      Num_interior: toNum(c.Num_interior),
      Telefono1:    toNum(c.Telefono1),
      Telefono2:    toNum(c.Telefono2),
      Fax:          toNum(c.Fax),
      CodigoPostal: toNum(c.CodigoPostal),
      DirClienteID: toNum(c.DirClienteID),
    };
  }

  try {

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

    // ── SYNC_ARTICULOS — merge inteligente ────────────────────────────────────
    // Acumula páginas en catalogo:sync_sesion.
    // fin:true cuando Exsim devuelve menos de 100 artículos (última página real)
    // o cuando devuelve 0. En ambos casos ejecuta el merge y publica en catalogo:completo.
    if (metodo === 'SYNC_ARTICULOS') {
      const pagina = parseInt(req.query.pagina || '0');
      res.setHeader('Cache-Control', 'no-store');

      const url = `${API_BASE}/exsim/servicios/metodo/ARTICULOS/${TOKEN}/100/${pagina}/0`;
      const data = await fetchMicrosip(url);

      const esUltimaPagina = !Array.isArray(data) || data.length < 100;

      // Acumular artículos de esta página (si hay)
      const mapped = Array.isArray(data) ? data.map(a => ({
        id: a.id, clave: a.clave, nombre: a.nombre,
        unidadmed: a.unidadmed, imagen: a.imagen, precios: a.precios
      })) : [];

      const sesionRaw    = pagina === 0 ? null : await redis.get('catalogo:sync_sesion');
      const acumulado    = sesionRaw ? JSON.parse(sesionRaw) : [];
      const nueva_sesion = acumulado.concat(mapped);

      if (!esUltimaPagina) {
        // Página intermedia — guardar sesión y seguir
        await redis.set('catalogo:sync_sesion', JSON.stringify(nueva_sesion));
        await redis.expire('catalogo:sync_sesion', 3600);
        return res.status(200).json({
          ok: true,
          fin: false,
          pagina,
          enEstaPagina:   mapped.length,
          totalAcumulado: nueva_sesion.length
        });
      }

      // Última página — hacer merge y publicar
      const anteriorRaw = await redis.get('catalogo:completo');
      const anterior    = anteriorRaw ? JSON.parse(anteriorRaw) : [];

      // Merge: anterior es la base (preserva artículos que Exsim omite),
      // nueva_sesion sobreescribe precio/nombre para los que sí llegaron
      const mapaFinal = new Map();
      for (const art of anterior)    mapaFinal.set(art.clave, art);
      for (const art of nueva_sesion) mapaFinal.set(art.clave, art);

      const merged = Array.from(mapaFinal.values());

      await redis.set('catalogo:completo', JSON.stringify(merged));
      await redis.set('catalogo:ultimo_sync', new Date().toISOString());
      await redis.del('catalogo:sync_sesion');

      return res.status(200).json({
        ok: true,
        fin: true,
        pagina,
        enEstaPagina:   mapped.length,
        totalExsim:     nueva_sesion.length,
        totalAnterior:  anterior.length,
        totalFinal:     merged.length,
        preservados:    merged.length - nueva_sesion.length
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── SYNC_AUTO — sync completo automático (cron de Vercel, cada hora) ─────
    if (metodo === 'SYNC_AUTO') {
      if (req.query.secret !== CRON_SECRET) {
        return res.status(401).json({ error: 'No autorizado' });
      }

      const maxPaginas = parseInt(req.query.maxPaginas || SYNC_MAX_PAGINAS);
      const nuevos = [];

      for (let pagina = 0; pagina < maxPaginas; pagina++) {
        const url = `${API_BASE}/exsim/servicios/metodo/ARTICULOS/${TOKEN}/100/${pagina}/0`;
        let data;
        try { data = await fetchMicrosip(url); } catch (e) { break; }
        if (!Array.isArray(data) || data.length === 0) break;
        const mapped = data.map(a => ({
          id: a.id, clave: a.clave, nombre: a.nombre,
          unidadmed: a.unidadmed, imagen: a.imagen, precios: a.precios
        }));
        nuevos.push(...mapped);
        if (data.length < 100) break;
      }

      if (nuevos.length === 0) {
        return res.status(200).json({
          ok: false,
          motivo: 'Exsim devolvió 0 artículos — catalogo:completo no fue modificado'
        });
      }

      const anteriorRaw = await redis.get('catalogo:completo');
      const anterior    = anteriorRaw ? JSON.parse(anteriorRaw) : [];

      const mapaFinal = new Map();
      for (const art of anterior) mapaFinal.set(art.clave, art);
      for (const art of nuevos)   mapaFinal.set(art.clave, art);

      const merged = Array.from(mapaFinal.values());

      await redis.set('catalogo:completo', JSON.stringify(merged));
      await redis.set('catalogo:ultimo_sync', new Date().toISOString());

      return res.status(200).json({
        ok: true,
        timestamp:     new Date().toISOString(),
        totalExsim:    nuevos.length,
        totalAnterior: anterior.length,
        totalFinal:    merged.length,
        preservados:   merged.length - nuevos.length
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (metodo === 'CATALOGO_COMPLETO') {
      const cached = await redis.get('catalogo:completo');
      if (cached) return res.status(200).json(JSON.parse(cached));
      return res.status(200).json([]);
    }

    if (metodo === 'ULTIMO_SYNC') {
      const ts = await redis.get('catalogo:ultimo_sync');
      return res.status(200).json({ ultimoSync: ts || null });
    }

    if (metodo === 'TODOS_CLIENTES') {
      const keys = await redis.keys('cliente:*');
      const clientes = [];
      for (const key of keys) {
        const raw = await redis.get(key);
        if (raw) {
          const c = JSON.parse(raw);
          if (c.clave && c.nombre) clientes.push({ clave: c.clave, nombre: c.nombre });
        }
      }
      clientes.sort((a, b) => a.nombre.localeCompare(b.nombre));
      return res.status(200).json(clientes);
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

    if (metodo === 'TEST_PEDIDO') {
      const body = {
        Documento: {
          Cliente: fixClienteTypes({
            Nombre: "PUBLICO EN GENERAL",
            DirClienteID: 10922,
            NomDireccion: "PUBLICO EN GENERAL",
            RFC: "XAXX010101000",
            Clave: "",
            Calle: "AV. CRISTOBAL COLON",
            Num_interior:0,
            Num_exterior: 501,
            Poblacion: "",
            Referencia: "",
            Colonia: "LOS VIVEROS",
            Ciudad: "COLIMA",
            Estado: "COLIMA",
            Pais: "MEXICO",
            Telefono1: 3120000000,
            Telefono2: 0,
            Fax: 0,
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
            Almacen: "CEDIS COLIMA",
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
            NombreArticulo: "AGUA",
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

      if (body.Documento?.Cliente && !body.Documento.Cliente.RFC) {
        const clienteId = body.Documento.Cliente.Clave || req.query.clienteId || '';
        const clienteRaw = clienteId ? await redis.get(`cliente:${clienteId}`) : null;
        const clienteRedis = clienteRaw ? JSON.parse(clienteRaw) : null;
        body.Documento.Cliente.RFC = clienteRedis?.RFC || clienteRedis?.rfc || 'XAXX010101000';
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

    if (metodo === 'CLOUDINARY_IMAGENES') {
      const auth = Buffer.from(`${CLD_KEY}:${CLD_SECRET}`).toString('base64');
      let todas = [];
      let nextCursor = null;
      do {
        const url = `https://api.cloudinary.com/v1_1/${CLD_CLOUD}/resources/image?max_results=500${nextCursor ? '&next_cursor=' + nextCursor : ''}`;
        const r = await fetch(url, { headers: { 'Authorization': `Basic ${auth}` } });
        const d = await r.json();
        if (Array.isArray(d.resources)) todas = todas.concat(d.resources);
        nextCursor = d.next_cursor || null;
      } while (nextCursor);
      const resultado = todas.map(img => ({
        public_id: img.public_id,
        format: img.format,
        url: `https://res.cloudinary.com/${CLD_CLOUD}/image/upload/w_200,h_200,c_fit/${img.public_id}.${img.format}`
      }));
      return res.status(200).json(resultado);
    }

    if (metodo === 'GET_IMAGEN') {
      const clave = (req.query.clave || '').trim();
      if (!clave) return res.status(400).json({ error: 'clave requerida' });
      const url = await redis.get(`imagen:${clave}`);
      return res.status(200).json({ url: url || null });
    }

    if (metodo === 'SET_IMAGEN') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Usar POST' });
      const { clave, url } = req.body || {};
      if (!clave || !url) return res.status(400).json({ error: 'clave y url requeridos' });
      await redis.set(`imagen:${clave.trim()}`, url.trim());
      return res.status(200).json({ ok: true });
    }

    if (metodo === 'DELETE_IMAGEN') {
      const clave = (req.query.clave || '').trim();
      if (!clave) return res.status(400).json({ error: 'clave requerida' });
      await redis.del(`imagen:${clave}`);
      return res.status(200).json({ ok: true });
    }

    if (metodo === 'GENERAR_TOKEN') {
      const clienteId = (req.query.clienteId || '').trim();
      if (!clienteId) return res.status(400).json({ error: 'clienteId requerido' });
      const existente = await redis.get(`token_cliente:${clienteId}`);
      if (existente) return res.status(200).json({ token: existente, clienteId, nuevo: false });
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let token = '';
      for (let i = 0; i < 12; i++) token += chars[Math.floor(Math.random() * chars.length)];
      await redis.set(`token:${token}`, clienteId);
      await redis.set(`token_cliente:${clienteId}`, token);
      return res.status(200).json({ token, clienteId, nuevo: true });
    }

    if (metodo === 'RESOLVER_TOKEN') {
      const token = (req.query.token || '').trim().toLowerCase();
      if (!token) return res.status(400).json({ error: 'token requerido' });
      const clienteId = await redis.get(`token:${token}`);
      if (!clienteId) return res.status(404).json({ error: 'Token inválido' });
      return res.status(200).json({ clienteId });
    }

    if (metodo === 'GET_IMAGENES') {
      const keys = await redis.keys('imagen:*');
      const result = {};
      for (const key of keys) {
        const clave = key.replace('imagen:', '');
        result[clave] = await redis.get(key);
      }
      return res.status(200).json(result);
    }

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

      const tokenCliente = await redis.get(`token_cliente:${clienteId}`);
      const urlParam = tokenCliente ? `t=${tokenCliente}` : `cliente=${clienteId}`;

      const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_SECRET}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          'payment_method_types[]': 'card',
          'mode': 'payment',
          'success_url': `https://pedidos.surtidorahigienicos.com/?${urlParam}&pago=exitoso`,
          'cancel_url': `https://pedidos.surtidorahigienicos.com/?${urlParam}&pago=cancelado`,
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

    if (metodo === 'RESTORE_CATALOGO') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Usar POST' });
      const { catalogo } = req.body || {};
      if (!Array.isArray(catalogo)) return res.status(400).json({ error: 'Body inválido: se espera { catalogo: [...] }' });
      await redis.set('catalogo:completo', JSON.stringify(catalogo));
      return res.status(200).json({ ok: true, total: catalogo.length });
    }

    return res.status(200).json({ ok: true });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
