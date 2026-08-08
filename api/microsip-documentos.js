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
// NOTA TÉCNICA #1: este proyecto es ES Module ("type":"module" en su
// package.json), por eso se usa import/export en vez de require.
//
// NOTA TÉCNICA #2 (importante): la API de Microsip-UltraKlean parece
// truncar la respuesta cuando el rango de fechas es amplio (se detectó
// que para un rango de 48 días regresaba solo ~174 documentos, muy por
// debajo del volumen real del negocio, ~40 facturas/día). Para evitar
// perder documentos, aquí partimos el rango solicitado en "chunks"
// (ventanas) de pocos días, consultamos cada chunk por separado (con
// concurrencia limitada para no saturar el servidor de Microsip) y
// juntamos todos los resultados. Si en algún momento CTI Consultorias
// agrega paginación explícita a su API, esto se puede simplificar.
// ------------------------------------------------------------------

import http from 'http';
import https from 'https';
import { parse as parseUrl } from 'url';

// Le damos hasta 60s a la función: con meses de historial y chunks
// pequeños, la primera consulta (sin caché) puede tardar varios
// segundos. Si tu plan de Vercel no respeta esto, ajusta en
// vercel.json -> functions -> maxDuration.
export const config = { maxDuration: 60 };

var CHUNK_DAYS = 4;       // tamaño de cada ventana consultada a Microsip
var CONCURRENCIA = 6;     // cuántos chunks se piden al mismo tiempo
var MAX_RANGO_DIAS = 210; // tope de seguridad (~7 meses) por consulta

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

function toDateUTC(s) {
  var p = s.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
}
function fmtUTC(d) { return d.toISOString().slice(0, 10); }
function sumarDias(fechaStr, n) { return fmtUTC(new Date(toDateUTC(fechaStr).getTime() + n * 86400000)); }

function construirChunks(fechaIni, fechaFin, chunkDias) {
  var chunks = [];
  var cur = toDateUTC(fechaIni);
  var fin = toDateUTC(fechaFin);
  while (cur.getTime() <= fin.getTime()) {
    var chunkFin = new Date(cur.getTime() + (chunkDias - 1) * 86400000);
    if (chunkFin.getTime() > fin.getTime()) chunkFin = fin;
    chunks.push({ ini: fmtUTC(cur), fin: fmtUTC(chunkFin) });
    cur = new Date(chunkFin.getTime() + 86400000);
  }
  return chunks;
}

// Ejecuta las tareas con un límite de concurrencia (para no tronar el
// servidor de Microsip con decenas de peticiones simultáneas).
async function conConcurrencia(tareas, limite) {
  var resultados = new Array(tareas.length);
  var idx = 0;
  async function worker() {
    while (idx < tareas.length) {
      var i = idx++;
      resultados[i] = await tareas[i]();
    }
  }
  var workers = [];
  for (var w = 0; w < limite; w++) workers.push(worker());
  await Promise.all(workers);
  return resultados;
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
    var iniDefault = new Date(hoy); iniDefault.setDate(iniDefault.getDate() - 30);
    var finDefault = new Date(hoy); finDefault.setDate(finDefault.getDate() + 2);
    function fmtLocal(d) { return d.toISOString().slice(0, 10); }

    var fechaIni = (req.query && req.query.fecha_ini) || fmtLocal(iniDefault);
    var fechaFin = (req.query && req.query.fecha_fin) || fmtLocal(finDefault);

    // Tope de seguridad: si piden un rango absurdo, lo recortamos.
    var diasTotales = Math.round((toDateUTC(fechaFin) - toDateUTC(fechaIni)) / 86400000);
    if (diasTotales > MAX_RANGO_DIAS) {
      var iniRecortada = new Date(toDateUTC(fechaFin).getTime() - MAX_RANGO_DIAS * 86400000);
      fechaIni = fmtUTC(iniRecortada);
    }

    var headers = { Authorization: 'Bearer ' + TOKEN };
    var chunks = construirChunks(fechaIni, fechaFin, CHUNK_DAYS);

    var tareas = chunks.map(function (ch) {
      return function () {
        // Se pide un día extra al final (fecha_fin + 1) porque la API de
        // Microsip parece tratar fecha_fin como "antes de la medianoche"
        // de ese día, perdiendo casi todos los documentos del último día
        // del rango. Pedir un día de más y dejar que el deduplicado por
        // folio se encargue de no duplicar nada compensa ese comportamiento.
        var finConColchon = sumarDias(ch.fin, 1);
        var urlFacturas   = BASE_URL + '/api/v1/facturas?fecha_ini='   + ch.ini + '&fecha_fin=' + finConColchon;
        var urlRemisiones = BASE_URL + '/api/v1/remisiones?fecha_ini=' + ch.ini + '&fecha_fin=' + finConColchon;
        return Promise.all([
          fetchJson(urlFacturas, headers).catch(function (e) { return { items: [], _error: e.message }; }),
          fetchJson(urlRemisiones, headers).catch(function (e) { return { items: [], _error: e.message }; })
        ]);
      };
    });

    var resultadosChunks = await conConcurrencia(tareas, CONCURRENCIA);

    var items = [];
    var vistos = {};
    var erroresChunks = [];
    var detalleChunks = [];
    resultadosChunks.forEach(function (par, i) {
      var dataFact = par[0], dataRemi = par[1];
      if (dataFact._error) erroresChunks.push('facturas ' + chunks[i].ini + '..' + chunks[i].fin + ': ' + dataFact._error);
      if (dataRemi._error) erroresChunks.push('remisiones ' + chunks[i].ini + '..' + chunks[i].fin + ': ' + dataRemi._error);
      detalleChunks.push({
        rango: chunks[i].ini + '..' + chunks[i].fin,
        facturas: (dataFact.items || []).length,
        remisiones: (dataRemi.items || []).length
      });

      (dataFact.items || []).forEach(function (d) {
        var key = 'F:' + d.folio;
        if (vistos[key]) return;
        vistos[key] = true;
        items.push({
          folio: d.folio, tipo: 'FACTURA', cliente: d.cliente, fecha: d.fecha,
          importe_neto: d.importe_neto, total_impuestos: d.total_impuestos,
          folio_origen: d.folio_origen || null
        });
      });
      (dataRemi.items || []).forEach(function (d) {
        var key = 'R:' + d.folio;
        if (vistos[key]) return;
        vistos[key] = true;
        items.push({
          folio: d.folio, tipo: 'REMISION', cliente: d.cliente, fecha: d.fecha,
          importe_neto: d.importe_neto, total_impuestos: d.total_impuestos,
          folio_origen: null
        });
      });
    });

    res.status(200).json({
      fecha_ini: fechaIni,
      fecha_fin: fechaFin,
      total: items.length,
      chunks_consultados: chunks.length,
      detalle_chunks: detalleChunks,
      errores: erroresChunks.length ? erroresChunks : undefined,
      items: items
    });
  } catch (err) {
    console.error('microsip-documentos error:', err);
    res.status(502).json({ error: 'No se pudo consultar Microsip: ' + err.message });
  }
}
