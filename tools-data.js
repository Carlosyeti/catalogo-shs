// tools-data.js — catálogo único de herramientas internas, compartido por
// usuarios.html (asignar permisos) y panel.html (mostrar el menú).
// Cambiar una herramienta aquí la actualiza en los dos lugares a la vez.

var SHS_CATEGORIAS = [
  {key:'ventas', label:'Ventas y catálogo', icon:'ti-shopping-cart'},
  {key:'finanzas', label:'Cobranza y finanzas', icon:'ti-report-money'},
  {key:'logistica', label:'Logística y operación', icon:'ti-truck'},
  {key:'rrhh', label:'Recursos humanos', icon:'ti-users'},
  {key:'admin', label:'Administración', icon:'ti-settings'},
];

// gated:false = no tiene candado propio (ej. catálogo público de clientes),
// se ofrece igual como acceso directo para quien tenga algo de esa área.
var SHS_TOOLS = [
  {id:'catalogo_pedidos', cat:'ventas', name:'Catálogo de pedidos', desc:'Catálogo digital que ven los clientes para pedir.', icon:'ti-shopping-cart', href:'index.html', gated:false},
  {id:'master_ventas', cat:'ventas', name:'Tabulador de ventas', desc:'Supervisión de ventas por vendedora.', icon:'ti-chart-bar', href:'MASTER_VENTASS.html', gated:true},
  {id:'faltantes_vendedora', cat:'ventas', name:'Faltantes — vendedora', desc:'Productos agotados que reportan las vendedoras.', icon:'ti-alert-triangle', href:'faltantes vendedora.html', gated:true},

  {id:'control_facturas', cat:'finanzas', name:'Control de facturas', desc:'Clasifica cobros: efectivo, cheque o crédito.', icon:'ti-file-invoice', href:'control_facturas.html', gated:true},
  {id:'control_remisiones', cat:'finanzas', name:'Control de remisiones', desc:'Cobranza y caja de remisiones (ventas de mostrador).', icon:'ti-receipt', href:'control_remisiones.html', gated:true},
  {id:'gestoria_cobranza', cat:'finanzas', name:'Gestoría de cobranza', desc:'Seguimiento de cobranza vía Microsip.', icon:'ti-phone-call', href:'gestoria-cobranza.html', gated:true},
  {id:'master_financiero', cat:'finanzas', name:'Estados financieros', desc:'Balance, flujo de efectivo, créditos bancarios.', icon:'ti-report-analytics', href:'master-financiero.html', gated:true},
  {id:'facturas_proveedores', cat:'finanzas', name:'Facturas de proveedores', desc:'Carga de facturas que la empresa recibe.', icon:'ti-file-upload', href:'carga_facturas_proveedores.html', gated:true},
  {id:'calendario_compras', cat:'finanzas', name:'Calendario de compras', desc:'Planeación de compras a proveedores.', icon:'ti-calendar', href:'compras-calendario.html', gated:true},
  {id:'captura_gastos', cat:'finanzas', name:'Captura de gastos', desc:'Registro diario de gastos administrativos.', icon:'ti-notebook', href:'gastos-auxiliar.html', gated:true},

  {id:'bitacora_rutas', cat:'logistica', name:'Bitácora de rutas', desc:'Choferes, unidades y entregas del día.', icon:'ti-truck', href:'LOGISTICA_CHOFERES_Y_UNIDADES.html', gated:true},
  {id:'master_logistica', cat:'logistica', name:'Master logística', desc:'Análisis de rutas y desempeño de reparto.', icon:'ti-route', href:'MASTER_LOGISTICA.html', gated:true},
  {id:'inventario', cat:'logistica', name:'Inventario', desc:'Existencias de almacén.', icon:'ti-boxes', href:'inventario.html', gated:true},
  {id:'faltantes_comprador', cat:'logistica', name:'Faltantes — comprador', desc:'Vista de faltantes para el área de compras.', icon:'ti-clipboard-list', href:'faltantes_comprador.html', gated:true},

  {id:'empleado_mes', cat:'rrhh', name:'Empleado del mes', desc:'Reconocimiento mensual del equipo.', icon:'ti-award', href:'EMPLEADO DEL MES.html', gated:true},

  {id:'panel_sincronizacion', cat:'admin', name:'Panel de sincronización', desc:'Sincroniza catálogo, clientes y precios con Microsip.', icon:'ti-refresh', href:'admin_historial.html', gated:true},
  {id:'usuarios_permisos', cat:'admin', name:'Usuarios y permisos', desc:'Crear usuarios y asignar qué herramientas ve cada quien.', icon:'ti-shield-lock', href:'usuarios.html', gated:true},
];
