// api/microsip-documentos.js
// ------------------------------------------------------------------
// Proxy para la API de Microsip - UltraKlean (CTI Consultorias).
// El token NUNCA debe ir en el HTML/JS del navegador. Este endpoint
// corre en el servidor de Vercel, agrega el Bearer token desde una
// variable de entorno y regresa un JSON simple que el frontend puede
// consultar por folio.
//
// Configurar en Vercel:
//   Project Settings -> Environment Variables
//   MICROSIP_API_URL   = http://38.58.46.142:9095
//   MICROSIP_API_TOKEN = XTXWVDNdHP0EI8tdYdWtEsf0Bf60lr8eSXaBEOUP86E
// (usa el valor real del token; no lo dejes en este archivo ni en el repo)
// ------------------------------------------------------------------

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const BASE_URL = process.env.MICROSIP_API_URL;
  const TOKEN    = process.env.MICROSIP_API_TOKEN;

  if (!BASE_URL || !TOKEN) {
    res.status(500).json({ error: 'Faltan variables de entorno MICROSIP_API_URL / MICROSIP_API_TOKEN en Vercel.' });
    return;
  }

  // Rango de fechas: por defecto, últimos 45 días hasta 3 días adelante.
  var hoy = new Date();
  var iniDefault = new Date(hoy); iniDefault.setDate(iniDefault.getDate() - 45);
  var finDefault = new Date(hoy); finDefault.setDate(finDefault.getDate() + 3);
  function fmt(d) { return d.toISOString().slice(0, 10); }

  var fechaIni = (req.query && req.query.fecha_ini) || fmt(iniDefault);
  var fechaFin = (req.query && req.query.fecha_fin) || fmt(finDefault);

  var headers = { Authorization: 'Bearer ' + TOKEN };

  try {
    var urlFacturas   = BASE_URL + '/api/v1/facturas?fecha_ini='   + fechaIni + '&fecha_fin=' + fechaFin;
    var urlRemisiones = BASE_URL + '/api/v1/remisiones?fecha_ini=' + fechaIni + '&fecha_fin=' + fechaFin;

    var [respFact, respRemi] = await Promise.all([
      fetch(urlFacturas,   { headers: headers }),
      fetch(urlRemisiones, { headers: headers })
    ]);

    if (!respFact.ok)   throw new Error('Facturas Microsip HTTP '   + respFact.status);
    if (!respRemi.ok)   throw new Error('Remisiones Microsip HTTP ' + respRemi.status);

    var dataFact = await respFact.json();
    var dataRemi = await respRemi.json();

    var items = [];
    (dataFact.items || []).forEach(function (d) {
      items.push({
        folio: d.folio,
        tipo: 'FACTURA',
        cliente: d.cliente,
        fecha: d.fecha,
        importe_neto: d.importe_neto,
        total_impuestos: d.total_impuestos,
        folio_origen: d.folio_origen || null
      });
    });
    (dataRemi.items || []).forEach(function (d) {
      items.push({
        folio: d.folio,
        tipo: 'REMISION',
        cliente: d.cliente,
        fecha: d.fecha,
        importe_neto: d.importe_neto,
        total_impuestos: d.total_impuestos,
        folio_origen: null
      });
    });

    res.status(200).json({ fecha_ini: fechaIni, fecha_fin: fechaFin, total: items.length, items: items });
  } catch (err) {
    res.status(502).json({ error: 'No se pudo consultar Microsip: ' + err.message });
  }
};
