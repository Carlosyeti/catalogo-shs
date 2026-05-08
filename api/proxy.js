export const config = { runtime: 'edge' };

export default async function handler(req) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 's-maxage=3600, stale-while-revalidate=600'
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  const url = new URL(req.url);
  const metodo = url.searchParams.get('metodo') || 'ARTICULOS';
  const cantidad = url.searchParams.get('cantidad') || '700';

  const API_BASE = 'http://38.58.46.142:9091';
  const TOKEN = '6GmrWp2KvHh2R4682ciDY09Klu92bv';

  let apiUrl = '';
  if (metodo === 'ARTICULOS') {
    apiUrl = `${API_BASE}/exsim/servicios/metodo/ARTICULOS/${TOKEN}/${cantidad}`;
  } else if (metodo === 'CLIENTES') {
    apiUrl = `${API_BASE}/exsim/servicios/metodo/CLIENTES/${TOKEN}/${cantidad}`;
  } else if (metodo === 'IMAGENES') {
    const id = url.searchParams.get('id') || '';
    apiUrl = `${API_BASE}/exsim/servicios/metodo/IMAGENES/${TOKEN}/${id}`;
  } else {
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  try {
    const resp = await fetch(apiUrl);
    let text = await resp.text();
    text = text.replace(/[\x00-\x1F\x7F]/g, ' ');

    let data;
    try {
      data = JSON.parse(text);
    } catch(e) {
      try {
        let fixed = text;
        while(fixed.length > 10){
          try {
            data = JSON.parse(fixed + (fixed.trimEnd().endsWith(']') ? '' : ']'));
            break;
          } catch(e2){
            const lc = fixed.lastIndexOf('},{');
            if(lc < 0){ data = []; break; }
            fixed = fixed.substring(0, lc+1) + ']';
          }
        }
      } catch(e3){ data = []; }
    }

    if(!data) data = [];

    // Filtrar solo campos necesarios
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

    return new Response(JSON.stringify(data), { headers });
  } catch(err){
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
