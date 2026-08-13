// auth.js — sesión compartida para las herramientas internas de SHS
// Se incluye con <script src="auth.js"></script> en cada página protegida.

function shsGetSession(){
  try{ return JSON.parse(sessionStorage.getItem('shs_session') || 'null'); }
  catch(e){ return null; }
}

function shsLogout(){
  sessionStorage.removeItem('shs_session');
  window.location.href = 'login.html';
}

// Llamar al inicio de cada herramienta protegida, con el id exacto de la
// herramienta (ver tools-data.js):
//   shsRequireAccess('control_facturas');
//   shsRequireAccess();   // solo exige estar logueado, sin checar herramienta
function shsRequireAccess(herramientaId){
  var s = shsGetSession();
  var pagina = location.pathname.split('/').pop();

  if(!s){
    window.location.replace('login.html?next=' + encodeURIComponent(pagina));
    return null;
  }
  if(herramientaId && !(s.permisos && s.permisos[herramientaId])){
    document.documentElement.innerHTML =
      '<meta charset="UTF-8">' +
      '<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;' +
      'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;background:#f0f4f8">' +
      '<div style="background:white;padding:40px 36px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);' +
      'max-width:380px;text-align:center">' +
      '<div style="width:52px;height:52px;border-radius:50%;background:#fef2f2;color:#dc2626;' +
      'display:flex;align-items:center;justify-content:center;font-size:24px;margin:0 auto 16px">&#128274;</div>' +
      '<h2 style="margin:0 0 8px;color:#1a1a2e;font-size:19px">Sin acceso</h2>' +
      '<p style="color:#64748b;font-size:14px;line-height:1.5;margin:0 0 22px">Tu usuario (<b>' + s.nombre + '</b>) ' +
      'no tiene permiso para esta herramienta. Pídele acceso a un administrador.</p>' +
      '<a href="panel.html" style="display:inline-block;background:#173F35;color:white;padding:11px 22px;' +
      'border-radius:10px;text-decoration:none;font-weight:700;font-size:14px">Volver al panel</a>' +
      '</div></body>';
    throw new Error('SHS_ACCESS_DENIED');
  }

  // Páginas con su propio encabezado completo (sidebar + breadcrumb) ponen
  // "window.SHS_CUSTOM_SHELL = true;" ANTES de llamar shsRequireAccess,
  // para que esta barra angosta no se duplique con la suya.
  if(!window.SHS_CUSTOM_SHELL) shsTopbar(s);
  return s;
}

// Barra superior consistente para que cada herramienta se sienta parte
// del mismo sitio, con un camino claro de regreso al panel. Se inyecta
// sola desde shsRequireAccess (no hace falta llamarla a mano); panel.html
// queda afuera porque ya trae su propio encabezado.
function shsTopbar(s){
  document.write(
    '<div style="position:sticky;top:0;z-index:9998;background:#173F35;color:#fff;' +
    'height:42px;display:flex;align-items:center;justify-content:space-between;' +
    'padding:0 16px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;' +
    'font-size:13px;box-shadow:0 1px 0 rgba(0,0,0,.15)">' +
      '<a href="panel.html" style="display:flex;align-items:center;gap:9px;color:#fff;' +
      'text-decoration:none;font-weight:700;white-space:nowrap">' +
        '<span style="letter-spacing:.02em">SHS<span style="color:#7ac143">&#10003;</span></span>' +
        '<span style="opacity:.35">|</span>' +
        '<span style="opacity:.85;font-weight:500">&larr; Volver al panel</span>' +
      '</a>' +
      '<div style="display:flex;align-items:center;gap:12px">' +
        '<span style="opacity:.75;white-space:nowrap">' + s.nombre + '</span>' +
        '<button onclick="shsLogout()" style="background:rgba(255,255,255,.1);' +
        'border:1px solid rgba(255,255,255,.18);color:#fff;border-radius:6px;' +
        'padding:5px 10px;font-size:12px;cursor:pointer;font-family:inherit">Salir</button>' +
      '</div>' +
    '</div>'
  );
}
