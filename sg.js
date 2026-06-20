// ═══════════════════════════════════════════════════════════════
// SISTEMA ERP POS v3.0 — BACKEND UNIFICADO (Google Apps Script)
// Sin recursión — compatible con Apps Script
// ═══════════════════════════════════════════════════════════════

const SPREADSHEET_ID = "1g1jENAm0IxzPZ69Gk-KrEZvpfsjOitW31OrgrkKZaoU";

// ─── HOJAS ────────────────────────────────────────────────────
const H_CATEGORIAS   = "Categorias";
const H_PRODUCTOS    = "Productos";
const H_COMPRAS      = "Compras";
const H_VENTAS       = "Ventas";
const H_VENTA_DET    = "VentaDetalle";
const H_DEVOLUCIONES = "Devoluciones";
const H_GASTOS       = "Gastos";
const H_CLIENTES     = "Clientes";
const H_PROVEEDORES  = "Proveedores";
const H_USUARIOS     = "Usuarios";
const H_ACTIVIDAD    = "Actividad";
const H_PAPELERA     = "Papelera";
const H_CAJA         = "Caja";
const H_EMPRESA      = "Empresa";
const H_COMBOS       = "Combos";
const H_COMBO_DET    = "ComboDetalle";
const H_SOPORTE      = "Soporte";
const H_NOTIF        = "Notificaciones";
const H_IMPORTLOG    = "ImportLog";
const H_FACTURAS     = "Facturas";
const H_RESUMEN      = "resumen_diario";

// ─── ENCABEZADOS ──────────────────────────────────────────────
const HDR = {
  Categorias:    ["id","nombre","emoji","activo"],
  Productos:     ["id","nombre","código","categoría","precio_compra","precio_venta","stock","stock_minimo","imagen_url","favorito","activo","fecha_creado"],
  Compras:       ["id","producto_id","cantidad","precio_compra","fecha","proveedor_id","proveedor_nombre","usuario","notas"],
  Ventas:        ["id","fecha","cliente_id","cliente_nombre","subtotal","descuento","impuesto","total","metodo_pago","usuario","estado","notas"],
  VentaDetalle:  ["id","venta_id","producto_id","producto_nombre","cantidad","precio_unitario","descuento_linea","subtotal_linea"],
  Devoluciones:  ["id","venta_id","producto_id","producto_nombre","cantidad","motivo","fecha","usuario","estado"],
  Gastos:        ["id","descripcion","monto","fecha","categoria","usuario"],
  Clientes:      ["id","nombre","apellido","telefono","correo","direccion","dui_nit","tipo","observaciones","estado","fecha_creado"],
  Proveedores:   ["id","nombre","empresa","telefono","correo","direccion","contacto","observaciones","activo","fecha_creado"],
  Usuarios:      ["id","usuario","password","rol","activo","ultimo_acceso","fecha_creado"],
  Actividad:     ["id","fecha","usuario","accion","detalle"],
  Papelera:      ["id","tipo","datos_originales","fecha_eliminado","eliminado_por"],
  Caja:          ["id","fecha","usuario","total_ventas","total_gastos","efectivo_inicial","efectivo_final","diferencia","notas"],
  Empresa:       ["clave","valor"],
  Combos:        ["id","nombre","descripcion","precio_venta","imagen_url","activo","fecha_creado"],
  ComboDetalle:  ["id","combo_id","producto_id","cantidad"],
  Soporte:       ["id","usuario","titulo","descripcion","estado","fecha","fecha_actualizado","respuesta","admin"],
  Notificaciones:["id","fecha","tipo","titulo","mensaje","leida","usuario_destino"],
  ImportLog:     ["id","fecha","usuario","tipo","registros","errores","detalle"],
  Facturas:      ["id","venta_id","numero","cliente_id","cliente_nombre","fecha","subtotal","descuento","impuesto","total","estado","pdf_url"],
  resumen_diario:["fecha","total_ventas","total_compras","ganancia","productos_vendidos"]
};

// ─── UTILIDADES ───────────────────────────────────────────────
function ss()  { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function uid() { return 'id-' + (Date.now().toString(36) + Math.random().toString(36).substring(2,9)).toUpperCase(); }
function sh(n) { return ss().getSheetByName(n); }

function log(usuario, accion, detalle) {
  try { sh(H_ACTIVIDAD).appendRow([uid(), new Date(), usuario||'Sistema', accion, detalle||'']); } catch(e){}
}

function resp(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getData(nombre) {
  const hoja = sh(nombre);
  if (!hoja || hoja.getLastRow() < 2) return { status:'error', message:`'${nombre}' vacía o no existe.` };
  const vals  = hoja.getDataRange().getValues();
  const heads = vals[0];
  const rows  = vals.slice(1).map(r => {
    const o = {};
    heads.forEach((h, i) => {
      let v = r[i];
      if (v === '' || v == null) v = '';
      else if (v instanceof Date) v = v.toISOString();
      o[h] = v;
    });
    return o;
  }).filter(r => Object.values(r).some(v => v !== ''));
  return { status:'success', data: rows };
}

function findRow(hoja, id) {
  const vals = hoja.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++)
    if (String(vals[i][0]).toLowerCase() === String(id).toLowerCase())
      return { row: vals[i], idx: i };
  return { row: null, idx: -1 };
}

function crearHoja(nombre) {
  const spreadsheet = ss();
  const headers = HDR[nombre];
  if (!headers) return;
  let hoja = spreadsheet.getSheetByName(nombre);
  if (!hoja) hoja = spreadsheet.insertSheet(nombre);
  if (hoja.getLastRow() === 0) {
    hoja.getRange(1,1,1,headers.length).setValues([headers]);
    hoja.setFrozenRows(1);
  }
}

// ─── doGet ────────────────────────────────────────────────────
function doGet(e) {
  const p = e.parameter;
  let r;
  try {
    switch(p.action) {
      case 'iniciar':          r = iniciarBD(); break;
      case 'resetear':         r = resetearBD(); break;
      case 'getEmpresa':       r = getEmpresa(); break;
      case 'getCategorias':    r = getData(H_CATEGORIAS); break;
      case 'getInventario':    r = getInventario(); break;
      case 'buscarProducto':   r = buscarProducto(p.query); break;
      case 'getClientes':      r = getData(H_CLIENTES); break;
      case 'getProveedores':   r = getData(H_PROVEEDORES); break;
      case 'getGastos':        r = getData(H_GASTOS); break;
      case 'getPapelera':      r = getData(H_PAPELERA); break;
      case 'getCaja':          r = getData(H_CAJA); break;
      case 'getActividad':     r = getData(H_ACTIVIDAD); break;
      case 'getUsuarios':      r = getUsuarios(); break;
      case 'getDashboard':
      case 'getDashboardV3':   r = getDashboard(); break;
      case 'getCajaResumen':   r = getCajaResumen(); break;
      case 'getDevoluciones':  r = getData(H_DEVOLUCIONES); break;
      case 'getVentas':        r = getVentasConDetalle(p.fecha_inicio, p.fecha_fin); break;
      case 'getReporte':       r = getReporte(p.tipo, p.fecha_inicio, p.fecha_fin); break;
      case 'getCombos':        r = getData(H_COMBOS); break;
      case 'getComboDetalle':  r = getComboDetalle(p.combo_id); break;
      case 'getNotificaciones':r = getNotificaciones(p.usuario); break;
      case 'getSoporte':       r = getData(H_SOPORTE); break;
      case 'getFacturas':      r = getData(H_FACTURAS); break;
      case 'getEstadisticasProducto': r = getEstadisticasProducto(p.producto_id); break;
      case 'getProductosSinMovimiento': r = getProductosSinMovimiento(parseInt(p.dias)||30); break;
      case 'configurarTriggerBackup': r = configurarTriggerBackup(); break;
      case 'getBackup':        r = getBackup(); break;
      case 'getData':          r = p.sheetName ? getData(p.sheetName) : {status:'error',message:'Falta sheetName'}; break;
      default: r = {status:'error', message:`Acción '${p.action}' no válida.`};
    }
  } catch(ex) { r = {status:'error', message:'Error GET: '+ex.message}; }
  return resp(r);
}

// ─── doPost ───────────────────────────────────────────────────
function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) return resp({status:'error',message:'Sin datos.'});
    const req = JSON.parse(e.postData.contents);
    let r;
    switch(req.action) {
      case 'login':               r = login(req); break;
      case 'guardarEmpresa':      r = guardarEmpresa(req); break;
      case 'agregarCategoria':    r = agregarCategoria(req); break;
      case 'editarCategoria':     r = editarCategoria(req); break;
      case 'eliminarCategoria':   r = eliminarEntidad(H_CATEGORIAS, req, 'categoría'); break;
      case 'agregarProducto':     r = agregarProducto(req); break;
      case 'editarProducto':      r = editarProducto(req); break;
      case 'eliminarProducto':    r = eliminarProducto(req); break;
      case 'restaurarProducto':   r = restaurarProducto(req); break;
      case 'registrarVenta':      r = registrarVenta(req); break;
      case 'anularVenta':         r = anularVenta(req); break;
      case 'registrarCompra':     r = registrarCompra(req); break;
      case 'registrarDevolucion': r = registrarDevolucion(req); break;
      case 'agregarCliente':      r = agregarCliente(req); break;
      case 'editarCliente':       r = editarCliente(req); break;
      case 'eliminarCliente':     r = eliminarEntidad(H_CLIENTES, req, 'cliente'); break;
      case 'agregarProveedor':    r = agregarProveedor(req); break;
      case 'editarProveedor':     r = editarProveedor(req); break;
      case 'eliminarProveedor':   r = eliminarEntidad(H_PROVEEDORES, req, 'proveedor'); break;
      case 'agregarGasto':        r = agregarGasto(req); break;
      case 'eliminarGasto':       r = eliminarEntidad(H_GASTOS, req, 'gasto'); break;
      case 'agregarUsuario':      r = agregarUsuario(req); break;
      case 'editarUsuario':       r = editarUsuario(req); break;
      case 'eliminarUsuario':     r = eliminarEntidad(H_USUARIOS, req, 'usuario'); break;
      case 'toggleUsuario':       r = toggleUsuario(req); break;
      case 'cerrarCaja':          r = cerrarCaja(req); break;
      case 'agregarCombo':        r = agregarCombo(req); break;
      case 'editarCombo':         r = editarCombo(req); break;
      case 'eliminarCombo':       r = eliminarEntidad(H_COMBOS, req, 'combo'); break;
      case 'venderCombo':         r = venderCombo(req); break;
      case 'crearTicketSoporte':  r = crearTicketSoporte(req); break;
      case 'responderTicket':     r = responderTicket(req); break;
      case 'cambiarEstadoTicket': r = cambiarEstadoTicket(req); break;
      case 'marcarNotifLeida':    r = marcarNotifLeida(req); break;
      case 'importarDatos':       r = importarDatos(req); break;
      case 'generarFactura':      r = generarFactura(req); break;
      case 'verificarPIN':        r = verificarPIN(req); break;
      case 'registrarTransaccion':r = compatTransaccion(req); break;
      default: r = {status:'error', message:'Acción POST no reconocida: '+req.action};
    }
    return resp(r);
  } catch(ex) { return resp({status:'error', message:'Error POST: '+ex.message}); }
}

// ═══════════════════════════════════════════════════════════════
// LOGIN / USUARIOS
// ═══════════════════════════════════════════════════════════════
function login(data) {
  const hoja = sh(H_USUARIOS);
  if (!hoja || hoja.getLastRow() < 2) return {status:'error', message:'Sin usuarios.'};
  const cred = String(data.password !== undefined ? data.password : data.pin || '').trim();
  const rows = hoja.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[1]).toLowerCase().trim() === String(data.usuario||'').toLowerCase().trim()
        && String(r[2]).trim() === cred) {
      if (!r[4]) return {status:'error', message:'Usuario desactivado.'};
      hoja.getRange(i+1,6).setValue(new Date());
      log(r[1], 'Login', 'Sesión iniciada');
      return {status:'success', message:`Bienvenido, ${r[1]}`, data:{id:r[0], usuario:r[1], rol:r[3]}};
    }
  }
  return {status:'error', message:'Usuario o contraseña incorrectos.'};
}

function getUsuarios() {
  const d = getData(H_USUARIOS);
  if (d.status !== 'success') return d;
  d.data = d.data.map(u => ({...u, password:'••••••'}));
  return d;
}

function agregarUsuario(data) {
  const hoja = sh(H_USUARIOS);
  const rows = hoja.getLastRow() > 1 ? hoja.getDataRange().getValues() : [];
  if (rows.slice(1).find(r => String(r[1]).toLowerCase() === String(data.usuario||'').toLowerCase()))
    return {status:'error', message:`El usuario '${data.usuario}' ya existe.`};
  hoja.appendRow([uid(), data.usuario, data.password||data.pin, data.rol||'empleado', true, '', new Date()]);
  log(data.usuarioActual, 'Crear usuario', data.usuario);
  return {status:'success', message:`Usuario '${data.usuario}' creado.`};
}

function editarUsuario(data) {
  const hoja = sh(H_USUARIOS);
  const {idx} = findRow(hoja, data.id);
  if (idx < 0) return {status:'error', message:'No encontrado.'};
  if (data.usuario) hoja.getRange(idx+1,2).setValue(data.usuario);
  const cred = data.password||data.pin;
  if (cred && cred !== '••••••') hoja.getRange(idx+1,3).setValue(cred);
  if (data.rol) hoja.getRange(idx+1,4).setValue(data.rol);
  log(data.usuarioActual, 'Editar usuario', data.usuario||data.id);
  return {status:'success', message:'Usuario actualizado.'};
}

function toggleUsuario(data) {
  const hoja = sh(H_USUARIOS);
  const {row, idx} = findRow(hoja, data.id);
  if (idx < 0) return {status:'error', message:'No encontrado.'};
  const nuevo = !row[4];
  hoja.getRange(idx+1,5).setValue(nuevo);
  log(data.usuarioActual, nuevo?'Activar usuario':'Desactivar usuario', row[1]);
  return {status:'success', message:`Usuario ${nuevo?'activado':'desactivado'}.`};
}

function verificarPIN(data) {
  const r = login({usuario: data.usuario, password: data.pin, pin: data.pin});
  return r.status === 'success' ? {status:'success', message:'PIN correcto.'} : {status:'error', message:'PIN incorrecto.'};
}

// ═══════════════════════════════════════════════════════════════
// EMPRESA
// ═══════════════════════════════════════════════════════════════
function getEmpresa() {
  const hoja = sh(H_EMPRESA);
  if (!hoja || hoja.getLastRow() < 2) return {status:'success', data:{}};
  const vals = hoja.getDataRange().getValues();
  const obj  = {};
  vals.slice(1).forEach(r => { if(r[0]) obj[r[0]] = r[1]; });
  return {status:'success', data: obj};
}

function guardarEmpresa(data) {
  const hoja = sh(H_EMPRESA);
  if (!hoja) return {status:'error', message:'Pestaña Empresa no existe. Ejecuta iniciarBD primero.'};
  const campos = ['nombre','slogan','direccion','telefono','correo','nit','nrc','iva_pct','moneda','logo_url','redes','mensaje_ticket','tema','ticket_ancho'];
  const vals   = hoja.getLastRow() > 1 ? hoja.getDataRange().getValues() : [['clave','valor']];
  campos.forEach(campo => {
    if (data[campo] === undefined) return;
    let encontrado = false;
    for (let i = 1; i < vals.length; i++) {
      if (vals[i][0] === campo) {
        hoja.getRange(i+1, 2).setValue(data[campo]);
        encontrado = true; break;
      }
    }
    if (!encontrado) hoja.appendRow([campo, data[campo]]);
  });
  log(data.usuario||'admin', 'Guardar empresa', 'Configuración actualizada');
  return {status:'success', message:'Configuración de empresa guardada.'};
}

// ═══════════════════════════════════════════════════════════════
// CATEGORÍAS
// ═══════════════════════════════════════════════════════════════
function agregarCategoria(data) {
  sh(H_CATEGORIAS).appendRow([uid(), data.nombre, data.emoji||'📦', true]);
  log(data.usuario, 'Agregar categoría', data.nombre);
  return {status:'success', message:`Categoría '${data.nombre}' agregada.`};
}

function editarCategoria(data) {
  const hoja = sh(H_CATEGORIAS);
  const {idx} = findRow(hoja, data.id);
  if (idx < 0) return {status:'error', message:'No encontrada.'};
  if (data.nombre) hoja.getRange(idx+1,2).setValue(data.nombre);
  if (data.emoji)  hoja.getRange(idx+1,3).setValue(data.emoji);
  return {status:'success', message:'Categoría actualizada.'};
}

// ═══════════════════════════════════════════════════════════════
// PRODUCTOS
// ═══════════════════════════════════════════════════════════════
function getInventario() {
  const d = getData(H_PRODUCTOS);
  if (d.status !== 'success') return d;
  d.data = d.data.filter(p => p.activo !== false && p.activo !== 'false' && p.activo !== 0 && p.activo !== '0');
  return d;
}

function buscarProducto(query) {
  const d = getData(H_PRODUCTOS);
  if (d.status !== 'success') return d;
  const q = String(query||'').toLowerCase().trim();
  if (!q) return {status:'warning', message:'Especifica búsqueda.'};
  const res = d.data.filter(p =>
    (p.activo !== false && p.activo !== 'false') &&
    (String(p.id||'').toLowerCase().includes(q) ||
     String(p['código']||'').toLowerCase().includes(q) ||
     String(p.nombre||'').toLowerCase().includes(q))
  );
  return res.length ? {status:'success', data:res} : {status:'warning', message:'No encontrado.'};
}

function agregarProducto(data) {
  const id = uid();
  sh(H_PRODUCTOS).appendRow([
    id, data.nombre, data.codigo, data.categoria,
    parseFloat(data.precio_compra)||0, parseFloat(data.precio_venta)||0,
    parseInt(data.stock)||0, parseInt(data.stock_minimo)||5,
    data.imagen_url||'', data.favorito||false, true, new Date()
  ]);
  log(data.usuario, 'Agregar producto', data.nombre);
  return {status:'success', message:`Producto '${data.nombre}' registrado.`, data:{id}};
}

function editarProducto(data) {
  const hoja = sh(H_PRODUCTOS);
  const {idx} = findRow(hoja, data.id);
  if (idx < 0) return {status:'error', message:'Producto no encontrado.'};
  const map = {codigo:3, nombre:2, categoria:4, precio_compra:5, precio_venta:6, stock:7, stock_minimo:8, imagen_url:9, favorito:10};
  if (data.nombre)        hoja.getRange(idx+1, 2).setValue(data.nombre);
  if (data.codigo)        hoja.getRange(idx+1, 3).setValue(data.codigo);
  if (data.categoria)     hoja.getRange(idx+1, 4).setValue(data.categoria);
  if (data.precio_compra) hoja.getRange(idx+1, 5).setValue(parseFloat(data.precio_compra));
  if (data.precio_venta)  hoja.getRange(idx+1, 6).setValue(parseFloat(data.precio_venta));
  if (data.stock !== undefined && data.stock !== '') hoja.getRange(idx+1, 7).setValue(parseInt(data.stock));
  if (data.stock_minimo !== undefined && data.stock_minimo !== '') hoja.getRange(idx+1, 8).setValue(parseInt(data.stock_minimo));
  if (data.imagen_url !== undefined) hoja.getRange(idx+1, 9).setValue(data.imagen_url);
  if (data.favorito !== undefined)   hoja.getRange(idx+1, 10).setValue(data.favorito);
  log(data.usuario, 'Editar producto', data.nombre||data.id);
  return {status:'success', message:'Producto actualizado.'};
}

function eliminarProducto(data) {
  const hoja    = sh(H_PRODUCTOS);
  const papelera= sh(H_PAPELERA);
  const {row, idx} = findRow(hoja, data.id);
  if (idx < 0) return {status:'error', message:'No encontrado.'};
  if (papelera) {
    papelera.appendRow([uid(), 'Producto', JSON.stringify({
      id:row[0], nombre:row[1], código:row[2], categoría:row[3],
      precio_compra:row[4], precio_venta:row[5], stock:row[6], stock_minimo:row[7]
    }), new Date(), data.usuario||'Sistema']);
  }
  hoja.getRange(idx+1, 11).setValue(false);
  log(data.usuario, 'Eliminar producto', row[1]);
  return {status:'success', message:`'${row[1]}' movido a papelera.`};
}

function restaurarProducto(data) {
  const shPap  = sh(H_PAPELERA);
  const shProd = sh(H_PRODUCTOS);
  const id     = data.papelera_id || data.id;
  const rows   = shPap.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(id)) {
      try {
        const orig = JSON.parse(rows[i][2]);
        const {idx} = findRow(shProd, orig.id);
        if (idx > -1) shProd.getRange(idx+1, 11).setValue(true);
        else shProd.appendRow([orig.id, orig.nombre, orig['código'], orig['categoría'], orig.precio_compra, orig.precio_venta, orig.stock, orig.stock_minimo||5, '', false, true, new Date()]);
        shPap.deleteRow(i+1);
        log(data.usuario, 'Restaurar producto', orig.nombre);
        return {status:'success', message:`'${orig.nombre}' restaurado.`};
      } catch(e) { return {status:'error', message:'Error al restaurar: '+e.message}; }
    }
  }
  return {status:'error', message:'No está en la papelera.'};
}

// ═══════════════════════════════════════════════════════════════
// VENTAS CON CARRITO
// ═══════════════════════════════════════════════════════════════
function registrarVenta(data) {
  const shV   = sh(H_VENTAS);
  const shD   = sh(H_VENTA_DET);
  const shP   = sh(H_PRODUCTOS);
  const items = data.items;
  if (!items || !items.length) return {status:'error', message:'El carrito está vacío.'};

  const emp    = getEmpresa().data;
  const ivaPct = parseFloat(emp.iva_pct||0) / 100;
  const desc   = parseFloat(data.descuento||0);
  let subtotal = 0;

  // Validar stock
  for (const item of items) {
    const {row, idx} = findRow(shP, item.producto_id);
    if (!row) return {status:'error', message:`Producto ${item.producto_id} no encontrado.`};
    const stock = parseInt(row[6])||0;
    if (stock < parseInt(item.cantidad)) return {status:'warning', message:`Stock insuficiente: ${row[1]} (disponible: ${stock})`};
    item._rowIdx  = idx;
    item._nombre  = row[1];
    item._subtotal= (parseFloat(item.precio_unitario)*parseInt(item.cantidad)) - parseFloat(item.descuento_linea||0);
    subtotal += item._subtotal;
  }

  const base     = Math.max(0, subtotal - desc);
  const impuesto = Math.round(base * ivaPct * 100) / 100;
  const total    = Math.round((base + impuesto) * 100) / 100;
  const ventaId  = uid();
  const fecha    = new Date();

  shV.appendRow([ventaId, fecha, data.cliente_id||'', data.cliente_nombre||'Mostrador', subtotal, desc, impuesto, total, data.metodo_pago||'Efectivo', data.usuario||'Sistema', 'completada', data.notas||'']);

  for (const item of items) {
    shD.appendRow([uid(), ventaId, item.producto_id, item._nombre, parseInt(item.cantidad), parseFloat(item.precio_unitario), parseFloat(item.descuento_linea||0), item._subtotal]);
    const s = parseInt(shP.getRange(item._rowIdx+1, 7).getValue())||0;
    shP.getRange(item._rowIdx+1, 7).setValue(s - parseInt(item.cantidad));
  }

  log(data.usuario, 'Registrar venta', `#${ventaId} Total:$${total}`);
  return {status:'success', message:`Venta registrada. Total: $${total.toFixed(2)}`, data:{ticket_id:ventaId, total, subtotal, impuesto, descuento:desc, fecha:fecha.toISOString(), cliente:data.cliente_nombre||'Mostrador', metodo_pago:data.metodo_pago||'Efectivo', items}};
}

function anularVenta(data) {
  const shV = sh(H_VENTAS);
  const shD = sh(H_VENTA_DET);
  const shP = sh(H_PRODUCTOS);
  const {row, idx} = findRow(shV, data.venta_id);
  if (!row) return {status:'error', message:'Venta no encontrada.'};
  if (row[10] === 'anulada') return {status:'warning', message:'Ya estaba anulada.'};
  if (shD.getLastRow() > 1) {
    shD.getDataRange().getValues().slice(1).forEach(d => {
      if (String(d[1]) === String(data.venta_id)) {
        const {idx:pi} = findRow(shP, String(d[2]));
        if (pi > -1) { const s = parseInt(shP.getRange(pi+1,7).getValue())||0; shP.getRange(pi+1,7).setValue(s + parseInt(d[4])); }
      }
    });
  }
  shV.getRange(idx+1, 11).setValue('anulada');
  log(data.usuario, 'Anular venta', `#${data.venta_id}`);
  return {status:'success', message:'Venta anulada y stock restaurado.'};
}

function compatTransaccion(data) {
  if (data.type === 'venta') {
    return registrarVenta({ items:[{producto_id:data.producto_id, nombre:'', cantidad:data.cantidad, precio_unitario:data.precio, descuento_linea:0}], cliente_nombre:data.extra_data||'Mostrador', usuario:data.usuario });
  }
  return registrarCompra({ producto_id:data.producto_id, cantidad:data.cantidad, precio_compra:data.precio, proveedor_nombre:data.extra_data||'', usuario:data.usuario });
}

// ═══════════════════════════════════════════════════════════════
// COMPRAS
// ═══════════════════════════════════════════════════════════════
function registrarCompra(data) {
  const shP = sh(H_PRODUCTOS);
  const {row, idx} = findRow(shP, data.producto_id);
  if (!row) return {status:'error', message:'Producto no encontrado.'};
  const cantidad = parseInt(data.cantidad)||0;
  sh(H_COMPRAS).appendRow([uid(), data.producto_id, cantidad, parseFloat(data.precio_compra)||0, new Date(), data.proveedor_id||'', data.proveedor_nombre||'', data.usuario||'Sistema', data.notas||'']);
  const s = parseInt(shP.getRange(idx+1,7).getValue())||0;
  shP.getRange(idx+1,7).setValue(s + cantidad);
  if (data.actualizar_precio) shP.getRange(idx+1,5).setValue(parseFloat(data.precio_compra));
  log(data.usuario, 'Registrar compra', `${row[1]} x${cantidad}`);
  return {status:'success', message:`Compra registrada. Nuevo stock: ${s+cantidad}`};
}

// ═══════════════════════════════════════════════════════════════
// DEVOLUCIONES
// ═══════════════════════════════════════════════════════════════
function registrarDevolucion(data) {
  const id = uid();
  sh(H_DEVOLUCIONES).appendRow([id, data.venta_id||'', data.producto_id||'', data.producto_nombre||'', parseInt(data.cantidad)||1, data.motivo||'', new Date(), data.usuario||'Sistema', 'procesada']);
  if (data.producto_id && data.regresar_stock) {
    const shP = sh(H_PRODUCTOS);
    const {idx} = findRow(shP, data.producto_id);
    if (idx > -1) { const s = parseInt(shP.getRange(idx+1,7).getValue())||0; shP.getRange(idx+1,7).setValue(s + (parseInt(data.cantidad)||1)); }
  }
  log(data.usuario, 'Devolución', `${data.producto_nombre} x${data.cantidad}`);
  return {status:'success', message:'Devolución registrada.', data:{id}};
}

// ═══════════════════════════════════════════════════════════════
// CLIENTES
// ═══════════════════════════════════════════════════════════════
function agregarCliente(data) {
  const id = uid();
  sh(H_CLIENTES).appendRow([id, data.nombre||'', data.apellido||'', data.telefono||'', data.correo||'', data.direccion||'', data.dui_nit||'', data.tipo||'regular', data.observaciones||'', data.estado||'activo', new Date()]);
  log(data.usuario, 'Agregar cliente', `${data.nombre} ${data.apellido||''}`);
  return {status:'success', message:`Cliente '${data.nombre}' agregado.`, data:{id}};
}

function editarCliente(data) {
  const hoja = sh(H_CLIENTES);
  const {idx} = findRow(hoja, data.id);
  if (idx < 0) return {status:'error', message:'Cliente no encontrado.'};
  const cols = {nombre:2, apellido:3, telefono:4, correo:5, direccion:6, dui_nit:7, tipo:8, observaciones:9, estado:10};
  Object.entries(cols).forEach(([k,c]) => { if(data[k]!==undefined) hoja.getRange(idx+1,c).setValue(data[k]); });
  log(data.usuario, 'Editar cliente', data.nombre||data.id);
  return {status:'success', message:'Cliente actualizado.'};
}

// ═══════════════════════════════════════════════════════════════
// PROVEEDORES
// ═══════════════════════════════════════════════════════════════
function agregarProveedor(data) {
  const id = uid();
  sh(H_PROVEEDORES).appendRow([id, data.nombre||'', data.empresa||'', data.telefono||'', data.correo||'', data.direccion||'', data.contacto||'', data.observaciones||'', true, new Date()]);
  log(data.usuario, 'Agregar proveedor', data.nombre);
  return {status:'success', message:`Proveedor '${data.nombre}' agregado.`, data:{id}};
}

function editarProveedor(data) {
  const hoja = sh(H_PROVEEDORES);
  const {idx} = findRow(hoja, data.id);
  if (idx < 0) return {status:'error', message:'Proveedor no encontrado.'};
  const cols = {nombre:2, empresa:3, telefono:4, correo:5, direccion:6, contacto:7, observaciones:8};
  Object.entries(cols).forEach(([k,c]) => { if(data[k]!==undefined) hoja.getRange(idx+1,c).setValue(data[k]); });
  log(data.usuario, 'Editar proveedor', data.nombre||data.id);
  return {status:'success', message:'Proveedor actualizado.'};
}

// ═══════════════════════════════════════════════════════════════
// GASTOS
// ═══════════════════════════════════════════════════════════════
function agregarGasto(data) {
  sh(H_GASTOS).appendRow([uid(), data.descripcion, parseFloat(data.monto)||0, new Date(), data.categoria||'General', data.usuario||'Sistema']);
  log(data.usuario, 'Agregar gasto', `$${data.monto} — ${data.descripcion}`);
  return {status:'success', message:'Gasto registrado.'};
}

// ═══════════════════════════════════════════════════════════════
// CAJA
// ═══════════════════════════════════════════════════════════════
function getCajaResumen() {
  const ventasD = getData(H_VENTAS);
  const gastosD = getData(H_GASTOS);
  const cajaD   = getData(H_CAJA);
  const emp     = getEmpresa().data;
  const hoy     = new Date().toLocaleDateString('es-SV');
  let tVentas   = 0, tGastos = 0;
  if (ventasD.status === 'success')
    tVentas = ventasD.data.filter(v => new Date(v.fecha).toLocaleDateString('es-SV')===hoy && v.estado!=='anulada').reduce((s,v)=>s+(parseFloat(v.total)||0), 0);
  if (gastosD.status === 'success')
    tGastos = gastosD.data.filter(g => new Date(g.fecha).toLocaleDateString('es-SV')===hoy).reduce((s,g)=>s+(parseFloat(g.monto)||0), 0);
  return {status:'success', data:{ventasHoy:tVentas, gastosHoy:tGastos, efectivoEsperado:tVentas-tGastos, moneda:emp.moneda||'$', historial:cajaD.status==='success'?cajaD.data:[]}};
}

function cerrarCaja(data) {
  const res = getCajaResumen().data;
  const eIni= parseFloat(data.efectivo_inicial)||0;
  const eFin= res.ventasHoy - res.gastosHoy + eIni;
  const dif = eFin - (parseFloat(data.efectivo_contado)||eFin);
  sh(H_CAJA).appendRow([uid(), new Date(), data.usuario, res.ventasHoy, res.gastosHoy, eIni, eFin, dif, data.notas||'']);
  log(data.usuario, 'Cierre de caja', `Ventas:$${res.ventasHoy} Gastos:$${res.gastosHoy} Neto:$${eFin}`);
  return {status:'success', message:`Corte guardado. Neto: $${eFin.toFixed(2)}`, data:{ventasHoy:res.ventasHoy, gastosHoy:res.gastosHoy, efectivoInicial:eIni, efectivoFinal:eFin, diferencia:dif}};
}

// ═══════════════════════════════════════════════════════════════
// VENTAS CON DETALLE / REPORTES
// ═══════════════════════════════════════════════════════════════
function getVentasConDetalle(fechaIni, fechaFin) {
  const ventasD = getData(H_VENTAS);
  const detD    = getData(H_VENTA_DET);
  if (ventasD.status !== 'success') return ventasD;
  let ventas = ventasD.data;
  if (fechaIni) {
    const fi = new Date(fechaIni); fi.setHours(0,0,0,0);
    const ff = fechaFin ? new Date(fechaFin) : new Date(); ff.setHours(23,59,59,999);
    ventas = ventas.filter(v => { const f=new Date(v.fecha); return f>=fi&&f<=ff; });
  }
  const detalles = detD.status==='success' ? detD.data : [];
  ventas = ventas.map(v => ({...v, items: detalles.filter(d=>String(d.venta_id)===String(v.id))}));
  return {status:'success', data: ventas};
}

function getReporte(tipo, fechaIni, fechaFin) {
  const fi = fechaIni ? new Date(fechaIni) : new Date(0);
  const ff = fechaFin ? new Date(fechaFin) : new Date();
  fi.setHours(0,0,0,0); ff.setHours(23,59,59,999);
  switch(tipo) {
    case 'ventas': {
      const d = getData(H_VENTAS);
      if (d.status!=='success') return d;
      const f = d.data.filter(v=>{const x=new Date(v.fecha);return x>=fi&&x<=ff&&v.estado!=='anulada';});
      const t = f.reduce((s,v)=>s+(parseFloat(v.total)||0),0);
      return {status:'success', data:f, resumen:{total:t, tickets:f.length, promedio:f.length?t/f.length:0}};
    }
    case 'compras': {
      const d = getData(H_COMPRAS);
      if (d.status!=='success') return d;
      const f = d.data.filter(c=>{const x=new Date(c.fecha);return x>=fi&&x<=ff;});
      const t = f.reduce((s,c)=>s+((parseFloat(c.precio_compra)*parseInt(c.cantidad))||0),0);
      return {status:'success', data:f, resumen:{total:t, registros:f.length}};
    }
    case 'gastos': {
      const d = getData(H_GASTOS);
      if (d.status!=='success') return d;
      const f = d.data.filter(g=>{const x=new Date(g.fecha);return x>=fi&&x<=ff;});
      const t = f.reduce((s,g)=>s+(parseFloat(g.monto)||0),0);
      const pc= f.reduce((o,g)=>{o[g.categoria]=(o[g.categoria]||0)+(parseFloat(g.monto)||0);return o;},{});
      return {status:'success', data:f, resumen:{total:t, porCategoria:pc}};
    }
    case 'ganancias': {
      const v = getData(H_VENTAS);
      const c = getData(H_COMPRAS);
      const g = getData(H_GASTOS);
      const tV=v.status==='success'?v.data.filter(x=>{const f=new Date(x.fecha);return f>=fi&&f<=ff&&x.estado!=='anulada';}).reduce((s,x)=>s+(parseFloat(x.total)||0),0):0;
      const tC=c.status==='success'?c.data.filter(x=>{const f=new Date(x.fecha);return f>=fi&&f<=ff;}).reduce((s,x)=>s+((parseFloat(x.precio_compra)*parseInt(x.cantidad))||0),0):0;
      const tG=g.status==='success'?g.data.filter(x=>{const f=new Date(x.fecha);return f>=fi&&f<=ff;}).reduce((s,x)=>s+(parseFloat(x.monto)||0),0):0;
      return {status:'success', resumen:{ventas:tV,compras:tC,gastos:tG,ganancia_bruta:tV-tC,ganancia_neta:tV-tC-tG}};
    }
    default: return {status:'error', message:`Tipo '${tipo}' no soportado.`};
  }
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════
function getDashboard() {
  try {
    const vD  = getData(H_VENTAS);
    const vDD = getData(H_VENTA_DET);
    const cD  = getData(H_COMPRAS);
    const gD  = getData(H_GASTOS);
    const pD  = getData(H_PRODUCTOS);
    const emp = getEmpresa().data;
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const mes = hoy.getMonth(), anio = hoy.getFullYear();
    let tV=0,tC=0,tG=0,vHoy=0,vMes=0;
    const vpF={},cpF={},vpP={},porCat={};

    if (vD.status==='success') vD.data.filter(v=>v.estado!=='anulada').forEach(v=>{
      const m=parseFloat(v.total)||0; tV+=m;
      const f=new Date(v.fecha); const fk=f.toLocaleDateString('es-SV');
      vpF[fk]=(vpF[fk]||0)+m;
      const fsh=new Date(f); fsh.setHours(0,0,0,0);
      if(fsh.getTime()===hoy.getTime()) vHoy+=m;
      if(f.getMonth()===mes&&f.getFullYear()===anio) vMes+=m;
    });

    if (vDD.status==='success') vDD.data.forEach(d=>{
      vpP[d.producto_id]=(vpP[d.producto_id]||0)+(parseInt(d.cantidad)||0);
    });

    if (cD.status==='success') cD.data.forEach(c=>{
      const m=(parseFloat(c.precio_compra)*parseInt(c.cantidad))||0; tC+=m;
      const fk=new Date(c.fecha).toLocaleDateString('es-SV');
      cpF[fk]=(cpF[fk]||0)+m;
    });

    if (gD.status==='success') gD.data.forEach(g=>{ tG+=parseFloat(g.monto)||0; });

    let agotados=0,stockBajo=[],topVendidos=[],topRentables=[];
    let ticketPromedio=0,clientesAtendidos=0;

    if (pD.status==='success') {
      const activos=pD.data.filter(p=>p.activo!==false&&p.activo!=='false');
      activos.forEach(p=>{
        const s=parseInt(p.stock)||0,lim=parseInt(p.stock_minimo)||5;
        if(s===0) agotados++;
        if(s>0&&s<=lim) stockBajo.push({id:p.id,nombre:p.nombre,stock:s,stock_minimo:lim});
      });
      topVendidos=activos.map(p=>({id:p.id,nombre:p.nombre,vendidos:vpP[p.id]||0,imagen:p.imagen_url})).filter(p=>p.vendidos>0).sort((a,b)=>b.vendidos-a.vendidos).slice(0,10);
      topRentables=activos.map(p=>({id:p.id,nombre:p.nombre,ganancia_total:(parseFloat(p.precio_venta)-parseFloat(p.precio_compra))*(vpP[p.id]||0)})).filter(p=>p.ganancia_total>0).sort((a,b)=>b.ganancia_total-a.ganancia_total).slice(0,10);

      // Ventas por categoría
      if (vDD.status==='success') {
        vDD.data.forEach(d=>{
          const prod=activos.find(p=>String(p.id)===String(d.producto_id));
          const cat=prod?.['categoría']||'Sin categoría';
          porCat[cat]=(porCat[cat]||0)+(parseFloat(d.subtotal_linea)||0);
        });
      }
    }

    if (vD.status==='success') {
      const validas=vD.data.filter(v=>v.estado!=='anulada');
      const tTotal=validas.reduce((s,v)=>s+(parseFloat(v.total)||0),0);
      ticketPromedio=validas.length?tTotal/validas.length:0;
      clientesAtendidos=new Set(validas.map(v=>v.cliente_id||v.cliente_nombre).filter(Boolean)).size;
    }

    const sinMovD=getProductosSinMovimiento(30);
    const todasFechas=[...new Set([...Object.keys(vpF),...Object.keys(cpF)])].sort();
    const grafico=todasFechas.map(f=>({fecha:f,ventas:vpF[f]||0,compras:cpF[f]||0,ganancia:(vpF[f]||0)-(cpF[f]||0)}));

    // Generar notificación automática si hay stock bajo
    if (agotados>0||stockBajo.length>0) generarNotifAuto(agotados, stockBajo.length);

    return {status:'success', data:{
      totales:{ventas:tV,compras:tC,gastos:tG,ganancias:tV-tC-tG,ventasHoy:vHoy,ventasMes:vMes},
      grafico,topVendidos,topRentables,stockBajo,productosAgotados:agotados,
      porCategoria:porCat,ticketPromedio,clientesAtendidos,
      sinMovimiento:sinMovD.data?sinMovD.data.length:0,
      moneda:emp.moneda||'$'
    }};
  } catch(ex) { return {status:'error',message:'Error dashboard: '+ex.message}; }
}

// ═══════════════════════════════════════════════════════════════
// COMBOS
// ═══════════════════════════════════════════════════════════════
function agregarCombo(data) {
  const id=uid();
  sh(H_COMBOS).appendRow([id,data.nombre,data.descripcion||'',parseFloat(data.precio_venta)||0,data.imagen_url||'',true,new Date()]);
  if (data.componentes&&data.componentes.length) {
    data.componentes.forEach(c=>sh(H_COMBO_DET).appendRow([uid(),id,c.producto_id,parseInt(c.cantidad)||1]));
  }
  log(data.usuario,'Agregar combo',data.nombre);
  return {status:'success',message:`Combo '${data.nombre}' creado.`,data:{id}};
}

function editarCombo(data) {
  const hoja=sh(H_COMBOS);
  const {idx}=findRow(hoja,data.id);
  if(idx<0) return {status:'error',message:'Combo no encontrado.'};
  if(data.nombre) hoja.getRange(idx+1,2).setValue(data.nombre);
  if(data.descripcion!==undefined) hoja.getRange(idx+1,3).setValue(data.descripcion);
  if(data.precio_venta) hoja.getRange(idx+1,4).setValue(parseFloat(data.precio_venta));
  if(data.imagen_url!==undefined) hoja.getRange(idx+1,5).setValue(data.imagen_url);
  if(data.componentes&&data.componentes.length) {
    const shD=sh(H_COMBO_DET);
    if(shD.getLastRow()>1) {
      const rows=shD.getDataRange().getValues();
      for(let i=rows.length-1;i>=1;i--) { if(String(rows[i][1])===String(data.id)) shD.deleteRow(i+1); }
    }
    data.componentes.forEach(c=>shD.appendRow([uid(),data.id,c.producto_id,parseInt(c.cantidad)||1]));
  }
  log(data.usuario,'Editar combo',data.nombre||data.id);
  return {status:'success',message:'Combo actualizado.'};
}

function getComboDetalle(comboId) {
  const detD=getData(H_COMBO_DET);
  const prodD=getData(H_PRODUCTOS);
  if(detD.status!=='success') return {status:'success',data:[]};
  const prods=prodD.status==='success'?prodD.data:[];
  const items=detD.data.filter(d=>String(d.combo_id)===String(comboId)).map(d=>{
    const prod=prods.find(p=>String(p.id)===String(d.producto_id));
    return {...d,producto_nombre:prod?.nombre||'?',stock_disponible:prod?.stock||0};
  });
  return {status:'success',data:items};
}

function venderCombo(data) {
  const detalle=getComboDetalle(data.combo_id);
  if(detalle.status!=='success'||!detalle.data.length) return {status:'error',message:'Combo sin componentes.'};
  const shP=sh(H_PRODUCTOS);
  const cant=parseInt(data.cantidad)||1;
  for(const comp of detalle.data) {
    const {row,idx}=findRow(shP,comp.producto_id);
    if(!row) return {status:'error',message:`Producto ${comp.producto_nombre} no encontrado.`};
    if((parseInt(row[6])||0)<parseInt(comp.cantidad)*cant) return {status:'warning',message:`Stock insuficiente: ${comp.producto_nombre}`};
  }
  const itemsV=[];
  for(const comp of detalle.data) {
    const {row,idx}=findRow(shP,comp.producto_id);
    const desc=parseInt(comp.cantidad)*cant;
    shP.getRange(idx+1,7).setValue((parseInt(row[6])||0)-desc);
    itemsV.push({producto_id:comp.producto_id,nombre:comp.producto_nombre,cantidad:desc,precio_unitario:parseFloat(row[5])||0,descuento_linea:0,_subtotal:(parseFloat(row[5])||0)*desc});
  }
  const comboRow=findRow(sh(H_COMBOS),data.combo_id).row;
  const precio=comboRow?parseFloat(comboRow[3])||0:0;
  const total=precio*cant;
  const ventaId=uid();
  sh(H_VENTAS).appendRow([ventaId,new Date(),data.cliente_id||'',data.cliente_nombre||'Mostrador',total,0,0,total,data.metodo_pago||'Efectivo',data.usuario||'Sistema','completada',`Combo: ${comboRow?.[1]||''}`]);
  itemsV.forEach(i=>sh(H_VENTA_DET).appendRow([uid(),ventaId,i.producto_id,i.nombre,i.cantidad,i.precio_unitario,0,i._subtotal]));
  log(data.usuario,'Vender combo',`${comboRow?.[1]||comboRow} x${cant} = $${total}`);
  return {status:'success',message:`Combo vendido. Total: $${total.toFixed(2)}`,data:{ticket_id:ventaId,total,items:itemsV,cliente:data.cliente_nombre||'Mostrador',metodo_pago:data.metodo_pago||'Efectivo',subtotal:total,impuesto:0,descuento:0}};
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICACIONES
// ═══════════════════════════════════════════════════════════════
function generarNotifAuto(agotados, bajos) {
  try {
    const shN=sh(H_NOTIF);
    if(!shN) return;
    const hoy=new Date().toLocaleDateString('es-SV');
    const exist=getData(H_NOTIF);
    if(exist.status==='success'&&exist.data.some(n=>new Date(n.fecha).toLocaleDateString('es-SV')===hoy&&n.tipo==='stock_auto')) return;
    shN.appendRow([uid(),new Date(),'stock_auto','⚠️ Alerta de Stock',`${agotados} agotado(s) y ${bajos} con stock bajo.`,false,'todos']);
  } catch(e){}
}

function getNotificaciones(usuario) {
  const d=getData(H_NOTIF);
  if(d.status!=='success') return {status:'success',data:[],total:0};
  const f=d.data.filter(n=>!n.leida&&(n.usuario_destino==='todos'||n.usuario_destino===usuario)).reverse().slice(0,20);
  return {status:'success',data:f,total:f.length};
}

function marcarNotifLeida(data) {
  const hoja=sh(H_NOTIF);
  if(data.id==='todas') {
    const rows=hoja.getLastRow()>1?hoja.getDataRange().getValues():[];
    for(let i=1;i<rows.length;i++) hoja.getRange(i+1,6).setValue(true);
    return {status:'success',message:'Todas marcadas como leídas.'};
  }
  const {idx}=findRow(hoja,data.id);
  if(idx<0) return {status:'error',message:'No encontrada.'};
  hoja.getRange(idx+1,6).setValue(true);
  return {status:'success',message:'Marcada como leída.'};
}

// ═══════════════════════════════════════════════════════════════
// SOPORTE
// ═══════════════════════════════════════════════════════════════
function crearTicketSoporte(data) {
  const id=uid();
  sh(H_SOPORTE).appendRow([id,data.usuario,data.titulo,data.descripcion,'nuevo',new Date(),new Date(),'','']);
  log(data.usuario,'Crear ticket soporte',data.titulo);
  return {status:'success',message:'Ticket creado.',data:{id}};
}

function responderTicket(data) {
  const hoja=sh(H_SOPORTE);
  const {idx}=findRow(hoja,data.id);
  if(idx<0) return {status:'error',message:'Ticket no encontrado.'};
  hoja.getRange(idx+1,8).setValue(data.respuesta);
  hoja.getRange(idx+1,9).setValue(data.admin||data.usuario);
  hoja.getRange(idx+1,7).setValue(new Date());
  hoja.getRange(idx+1,5).setValue(data.estado||'respondido');
  log(data.usuario,'Responder ticket',`ID: ${data.id}`);
  return {status:'success',message:'Respuesta guardada.'};
}

function cambiarEstadoTicket(data) {
  const hoja=sh(H_SOPORTE);
  const {idx}=findRow(hoja,data.id);
  if(idx<0) return {status:'error',message:'No encontrado.'};
  hoja.getRange(idx+1,5).setValue(data.estado);
  hoja.getRange(idx+1,7).setValue(new Date());
  return {status:'success',message:`Estado: ${data.estado}`};
}

// ═══════════════════════════════════════════════════════════════
// IMPORTADOR
// ═══════════════════════════════════════════════════════════════
function importarDatos(data) {
  const tipo=data.tipo; const filas=data.filas;
  if(!filas||!filas.length) return {status:'error',message:'Sin datos para importar.'};
  let ok=0,errores=0,msgs=[];
  filas.forEach((fila,idx)=>{
    try {
      let r;
      if(tipo==='productos') r=agregarProducto({...fila,usuario:data.usuario});
      else if(tipo==='clientes') r=agregarCliente({...fila,usuario:data.usuario});
      else if(tipo==='proveedores') r=agregarProveedor({...fila,usuario:data.usuario});
      if(r&&r.status==='success') ok++;
      else { errores++; msgs.push(`Fila ${idx+1}: ${r?.message||'Error'}`); }
    } catch(e){ errores++; msgs.push(`Fila ${idx+1}: ${e.message}`); }
  });
  if(sh(H_IMPORTLOG)) sh(H_IMPORTLOG).appendRow([uid(),new Date(),data.usuario,tipo,ok,errores,msgs.slice(0,5).join(' | ')]);
  log(data.usuario,'Importar '+tipo,`OK:${ok} Errores:${errores}`);
  return {status:'success',message:`Importados: ${ok} | Errores: ${errores}`,data:{ok,errores,detalle:msgs}};
}

// ═══════════════════════════════════════════════════════════════
// FACTURAS
// ═══════════════════════════════════════════════════════════════
function generarFactura(data) {
  const shV=sh(H_VENTAS);
  const {row}=findRow(shV,data.venta_id);
  if(!row) return {status:'error',message:'Venta no encontrada.'};
  const shF=sh(H_FACTURAS);
  const num=String(shF?shF.getLastRow():1).padStart(6,'0');
  const id=uid();
  if(shF) shF.appendRow([id,data.venta_id,num,row[2],row[3],new Date(),row[4],row[5],row[6],row[7],'emitida','']);
  log(data.usuario,'Generar factura',`#${num} - Venta: ${data.venta_id}`);
  return {status:'success',message:`Factura #${num} generada.`,data:{id,numero:num,venta_id:data.venta_id,total:row[7]}};
}

// ═══════════════════════════════════════════════════════════════
// ESTADÍSTICAS PRODUCTO / SIN MOVIMIENTO
// ═══════════════════════════════════════════════════════════════
function getEstadisticasProducto(productoId) {
  const prodD=getData(H_PRODUCTOS);
  if(prodD.status!=='success') return {status:'error',message:'Sin productos.'};
  const prod=prodD.data.find(p=>String(p.id)===String(productoId));
  if(!prod) return {status:'error',message:'Producto no encontrado.'};
  let totalVendido=0,montoVentas=0,totalComprado=0,montoCompras=0,ultimaVenta=null,ultimaCompra=null;
  const vDD=getData(H_VENTA_DET);
  const cD=getData(H_COMPRAS);
  if(vDD.status==='success') vDD.data.filter(d=>String(d.producto_id)===String(productoId)).forEach(d=>{
    totalVendido+=parseInt(d.cantidad)||0; montoVentas+=parseFloat(d.subtotal_linea)||0;
    if(!ultimaVenta||new Date(d.fecha||0)>new Date(ultimaVenta)) ultimaVenta=d.fecha;
  });
  if(cD.status==='success') cD.data.filter(c=>String(c.producto_id)===String(productoId)).forEach(c=>{
    totalComprado+=parseInt(c.cantidad)||0; montoCompras+=(parseFloat(c.precio_compra)*parseInt(c.cantidad))||0;
    if(!ultimaCompra||new Date(c.fecha||0)>new Date(ultimaCompra)) ultimaCompra=c.fecha;
  });
  return {status:'success',data:{producto:prod,totalVendido,totalComprado,montoVentas,montoCompras,gananciaGenerada:montoVentas-montoCompras,ultimaVenta,ultimaCompra,rotacion:totalComprado>0?(totalVendido/totalComprado*100).toFixed(1):'0'}};
}

function getProductosSinMovimiento(dias) {
  const prodD=getData(H_PRODUCTOS);
  const vDD=getData(H_VENTA_DET);
  if(prodD.status!=='success') return {status:'success',data:[]};
  const corte=new Date(); corte.setDate(corte.getDate()-dias);
  const vendidos=new Set();
  if(vDD.status==='success') {
    const ventasD=getData(H_VENTAS);
    const ventasMap={};
    if(ventasD.status==='success') ventasD.data.forEach(v=>ventasMap[v.id]=v.fecha);
    vDD.data.forEach(d=>{
      const fVenta=ventasMap[d.venta_id];
      if(fVenta&&new Date(fVenta)>=corte) vendidos.add(String(d.producto_id));
    });
  }
  const sinMov=prodD.data.filter(p=>p.activo!==false&&p.activo!=='false'&&!vendidos.has(String(p.id))).map(p=>({id:p.id,nombre:p.nombre,stock:p.stock,categoria:p['categoría']}));
  return {status:'success',data:sinMov,total:sinMov.length};
}

// ═══════════════════════════════════════════════════════════════
// BACKUP
// ═══════════════════════════════════════════════════════════════
function getBackup() {
  return {status:'success',message:'Backup generado.',data:{
    empresa:getEmpresa().data,
    categorias:getData(H_CATEGORIAS).data||[],
    productos:getData(H_PRODUCTOS).data||[],
    ventas:getData(H_VENTAS).data||[],
    venta_det:getData(H_VENTA_DET).data||[],
    compras:getData(H_COMPRAS).data||[],
    gastos:getData(H_GASTOS).data||[],
    clientes:getData(H_CLIENTES).data||[],
    proveedores:getData(H_PROVEEDORES).data||[],
    devoluciones:getData(H_DEVOLUCIONES).data||[],
    combos:getData(H_COMBOS).data||[],
    caja:getData(H_CAJA).data||[],
    usuarios:getUsuarios().data||[],
    actividad:getData(H_ACTIVIDAD).data||[],
    papelera:getData(H_PAPELERA).data||[],
    facturas:getData(H_FACTURAS).data||[],
    _v:'3.0',_fecha:new Date().toISOString()
  }};
}

// ═══════════════════════════════════════════════════════════════
// ELIMINAR ENTIDAD GENÉRICA
// ═══════════════════════════════════════════════════════════════
function eliminarEntidad(hoja, data, tipo) {
  const hojaObj=sh(hoja);
  const {row,idx}=findRow(hojaObj,data.id);
  if(idx<0) return {status:'error',message:`${tipo} no encontrado.`};
  hojaObj.deleteRow(idx+1);
  log(data.usuario||data.usuarioActual,'Eliminar '+tipo,String(row[1]||row[0]));
  return {status:'success',message:`${tipo} eliminado.`};
}

// ═══════════════════════════════════════════════════════════════
// INICIAR / RESETEAR BD
// ═══════════════════════════════════════════════════════════════
function iniciarBD() {
  const hojas=[H_CATEGORIAS,H_PRODUCTOS,H_COMPRAS,H_VENTAS,H_VENTA_DET,H_DEVOLUCIONES,H_GASTOS,H_CLIENTES,H_PROVEEDORES,H_USUARIOS,H_ACTIVIDAD,H_PAPELERA,H_CAJA,H_EMPRESA,H_COMBOS,H_COMBO_DET,H_SOPORTE,H_NOTIF,H_IMPORTLOG,H_FACTURAS,H_RESUMEN];
  hojas.forEach(n=>crearHoja(n));
  const shU=sh(H_USUARIOS);
  if(shU&&shU.getLastRow()<2) shU.appendRow([uid(),'admin','admin123','admin',true,'',new Date()]);
  const shE=sh(H_EMPRESA);
  if(shE&&shE.getLastRow()<2) {
    [['nombre','Mi Negocio'],['moneda','$'],['iva_pct','13'],['tema','claro'],['mensaje_ticket','¡Gracias por su compra!'],['ticket_ancho','80mm']].forEach(r=>shE.appendRow(r));
  }
  return {status:'success',message:'BD v3.0 inicializada. Pestañas creadas: '+hojas.join(', ')};
}

function resetearBD() {
  ss().getSheets().forEach(s=>{ if(s.getName()!=='Hoja 1') ss().deleteSheet(s); });
  return iniciarBD();
}

// Función de prueba rápida desde el editor
function testConexion() { Logger.log(JSON.stringify(iniciarBD())); }
function testLogin()    { Logger.log(JSON.stringify(login({usuario:'admin',password:'admin123'}))); }

// ═══════════════════════════════════════════════════════════════
// RESPALDO AUTOMÁTICO (trigger diario)
// ═══════════════════════════════════════════════════════════════
function configurarTriggerBackup() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'backupAutomaticoV3')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backupAutomaticoV3').timeBased().everyDays(1).atHour(23).create();
  return {status:'success', message:'Backup automático configurado (diario 23:00).'};
}

function backupAutomaticoV3() {
  const emp    = getEmpresa().data;
  const nombre = (emp.nombre || 'backup').replace(/\s/g, '_');
  const datos  = JSON.stringify(getBackup().data);
  const fecha  = new Date().toISOString().split('T')[0];
  const blob   = Utilities.newBlob(datos, 'application/json', `${nombre}_${fecha}.json`);
  DriveApp.createFile(blob);
  log('Sistema', 'Backup Automático', `Respaldo diario guardado en Drive: ${nombre}_${fecha}.json`);
}
