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
//
// NOTA TÉCNICA: este proyecto está configurado como ES Module
// ("type": "module" en package.json), por eso se usa import/export
// en vez de require/module.exports. Y se usan los módulos nativos
// http/https en vez de fetch() para máxima compatibilidad.
// ------------------------------------------------------------------

import http from 'http';
import https from 'https';
import { parse as parseUrl } from 'url';

function fetchJson(urlStr, headers) {
  return new Promise(function (resolve, reject) {
    var parsed = parseUrl(urlStr);
    var lib = parsed.protocol === 'https:' ? https : http;
    var req = lib.get(
      { hostname: parsed.hostname, port: parsed.port, path: parsed.path, headers: headers, timeout: 15000 },
      function (res) {
        var data = '';
        res.on('data', function (chunk) { data += chunk; });
        res.on('end', function () {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error('HTTP ' + res.statusCode + ' en ' + urlStr + ' -> ' + data.slice(0, 300)));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Respuesta no es JSON valido desde ' + urlStr + ': ' + data.slice(0, 300)));
          }
        });
      }
    );
    req.on('timeout', function () { req.destroy(); reject(new Error('Timeout consultando ' + urlStr)); });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  try {
    var BASE_URL = process.env.MICROSIP_API_URL;
    var TOKEN    = process.env.MICROSIP_API_TOKEN;

    if (!BASE_URL || !TOKEN) {
      res.status(500).json({ error: 'Faltan variables de entorno MICROSIP_API_URL / MICROSIP_API_TOKEN en Vercel.' });
      return;
    }

    var hoy = new Date();
    var iniDefault = new Date(hoy); iniDefault.setDate(iniDefault.getDate() - 45);
    var finDefault = new Date(hoy); finDefault.setDate(finDefault.getDate() + 3);
    function fmt(d) { return d.toISOString().slice(0, 10); }

    var fechaIni = (req.query && req.query.fecha_ini) || fmt(iniDefault);
    var fechaFin = (req.query && req.query.fecha_fin) || fmt(finDefault);

    var headers = { Authorization: 'Bearer ' + TOKEN };
    var urlFacturas   = BASE_URL + '/api/v1/facturas?fecha_ini='   + fechaIni + '&fecha_fin=' + fechaFin;
    var urlRemisiones = BASE_URL + '/api/v1/remisiones?fecha_ini=' + fechaIni + '&fecha_fin=' + fechaFin;

    var resultados = await Promise.all([
      fetchJson(urlFacturas, headers),
      fetchJson(urlRemisiones, headers)
    ]);
    var dataFact = resultados[0];
    var dataRemi = resultados[1];

    var items = [];
    (dataFact.items || []).forEach(function (d) {
      items.push({
        folio: d.folio, tipo: 'FACTURA', cliente: d.cliente, fecha: d.fecha,
        importe_neto: d.importe_neto, total_impuestos: d.total_impuestos,
        folio_origen: d.folio_origen || null
      });
    });
    (dataRemi.items || []).forEach(function (d) {
      items.push({
        folio: d.folio, tipo: 'REMISION', cliente: d.cliente, fecha: d.fecha,
        importe_neto: d.importe_neto, total_impuestos: d.total_impuestos,
        folio_origen: null
      });
    });

    res.status(200).json({ fecha_ini: fechaIni, fecha_fin: fechaFin, total: items.length, items: items });
  } catch (err) {
    console.error('microsip-documentos error:', err);
    res.status(502).json({ error: 'No se pudo consultar Microsip: ' + err.message });
  }
}
