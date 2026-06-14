// ***************************************************************
// ⚠️ REEMPLAZA CON EL ID REAL DE TU GOOGLE SHEET
// ***************************************************************
const SPREADSHEET_ID = "1j4vfZHoaq2YqG63tAuz97gb79IWoOmJFPWlls1eZ64k";

// ─── NOMBRES DE PESTAÑAS ───────────────────────────────────────
const HOJA_CATEGORIAS  = "Categorias";
const HOJA_PRODUCTOS   = "Productos";
const HOJA_COMPRAS     = "Compras";
const HOJA_VENTAS      = "Ventas";
const HOJA_RESUMEN     = "resumen_diario";
const HOJA_USUARIOS    = "Usuarios";
const HOJA_ACTIVIDAD   = "Actividad";
const HOJA_CLIENTES    = "Clientes";
const HOJA_PROVEEDORES = "Proveedores";
const HOJA_GASTOS      = "Gastos";
const HOJA_PAPELERA    = "Papelera";

// ─── ENCABEZADOS ──────────────────────────────────────────────
const CATEGORIAS_HEADERS  = ["id","nombre"];
const PRODUCTOS_HEADERS   = ["id","nombre","código","categoría","precio_compra","precio_venta","stock","fecha_creado","activo"];
const COMPRAS_HEADERS     = ["id","producto_id","cantidad","precio_compra","fecha","proveedor"];
const VENTAS_HEADERS      = ["id","producto_id","cantidad","precio_venta","fecha","cliente"];
const RESUMEN_HEADERS     = ["fecha","total_ventas","total_compras","ganancia","productos_vendidos"];
const USUARIOS_HEADERS    = ["id","usuario","password","rol","activo","ultimo_acceso","fecha_creado"];
const ACTIVIDAD_HEADERS   = ["id","fecha","usuario","accion","detalle"];
const CLIENTES_HEADERS    = ["id","nombre","telefono","correo","direccion","fecha_creado"];
const PROVEEDORES_HEADERS = ["id","nombre","empresa","telefono","correo","direccion","fecha_creado"];
const GASTOS_HEADERS      = ["id","descripcion","monto","fecha","categoria","usuario"];
const PAPELERA_HEADERS    = ["id","tipo","datos_originales","fecha_eliminado","eliminado_por"];

// ─── UTILIDADES ────────────────────────────────────────────────
function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function generateUniqueAppId() {
  return 'id-' + (new Date().getTime().toString(36) + Math.random().toString(36).substring(2, 9)).toUpperCase();
}

function registrarActividad(usuario, accion, detalle) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(HOJA_ACTIVIDAD);
    if (!sheet) return;
    sheet.appendRow([
      generateUniqueAppId(),
      new Date(),
      usuario || 'Sistema',
      accion,
      detalle
    ]);
  } catch(e) { /* silencioso */ }
}

// ─── doGet ─────────────────────────────────────────────────────
function doGet(e) {
  const action    = e.parameter.action;
  const query     = e.parameter.query;
  const sheetName = e.parameter.sheetName;
  let result;

  try {
    switch(action) {
      case "iniciar":          result = iniciarBaseDeDatos(); break;
      case "resetear":         result = resetearBaseDeDatos(); break;
      case "getCategorias":    result = getCategorias(); break;
      case "buscarProducto":   result = buscarProducto(query); break;
      case "getInventario":    result = getInventario(); break;
      case "getResumenDiario": result = getResumenDiario(); break;
      case "getActividad":     result = getData(HOJA_ACTIVIDAD); break;
      case "getClientes":      result = getData(HOJA_CLIENTES); break;
      case "getProveedores":   result = getData(HOJA_PROVEEDORES); break;
      case "getGastos":        result = getData(HOJA_GASTOS); break;
      case "getPapelera":      result = getData(HOJA_PAPELERA); break;
      case "getUsuarios":      result = getUsuarios(); break;
      case "getDashboard":     result = getDashboardData(); break;
      case "getData":          result = sheetName ? getData(sheetName) : {status:"error",message:"Falta sheetName"}; break;
      default:                 result = {status:"error", message:`Acción '${action}' no válida.`};
    }
  } catch(error) {
    result = {status:"error", message:`Error en doGet: ${error.message}`};
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── doPost ────────────────────────────────────────────────────
function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents)
      return ContentService.createTextOutput(JSON.stringify({status:"error",message:"Sin datos POST."}))
        .setMimeType(ContentService.MimeType.JSON);

    const req    = JSON.parse(e.postData.contents);
    const action = req.action;
    let result;

    switch(action) {
      case "login":               result = loginUsuario(req); break;
      case "agregarCategoria":    result = agregarCategoria(req); break;
      case "agregarProducto":     result = agregarProducto(req); break;
      case "editarProducto":      result = editarProducto(req); break;
      case "eliminarProducto":    result = eliminarProducto(req); break;
      case "restaurarProducto":   result = restaurarProducto(req); break;
      case "registrarTransaccion":result = registrarTransaccion(req); break;
      case "agregarCliente":      result = agregarCliente(req); break;
      case "editarCliente":       result = editarCliente(req); break;
      case "eliminarCliente":     result = eliminarCliente(req); break;
      case "agregarProveedor":    result = agregarProveedor(req); break;
      case "editarProveedor":     result = editarProveedor(req); break;
      case "eliminarProveedor":   result = eliminarProveedor(req); break;
      case "agregarGasto":        result = agregarGasto(req); break;
      case "eliminarGasto":       result = eliminarGasto(req); break;
      case "agregarUsuario":      result = agregarUsuario(req); break;
      case "editarUsuario":       result = editarUsuario(req); break;
      case "toggleUsuario":       result = toggleUsuario(req); break;
      case "eliminarCategoria":   result = eliminarCategoria(req); break;
      default: result = {status:"error", message:"Acción POST no reconocida."};
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({status:"error",message:`Error POST: ${error.message}`}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ══════════════════════════════════════════════════════════════
// USUARIOS & LOGIN
// ══════════════════════════════════════════════════════════════
function loginUsuario(data) {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(HOJA_USUARIOS);
  if (!sheet || sheet.getLastRow() < 2)
    return {status:"error", message:"No hay usuarios registrados."};

  const rows    = sheet.getDataRange().getValues();
  const headers = rows[0];

  for (let i = 1; i < rows.length; i++) {
    const row      = rows[i];
    const usuario  = String(row[1] || '').toLowerCase().trim();
    const password = String(row[2] || '').trim();
    const rol      = String(row[3] || '').trim();
    const activo   = row[4];

    if (usuario === data.usuario.toLowerCase().trim() && password === data.password.trim()) {
      if (!activo) return {status:"error", message:"Usuario desactivado. Contacta al administrador."};

      // Actualizar último acceso
      sheet.getRange(i + 1, 6).setValue(new Date());
      registrarActividad(usuario, "Login", `Inicio de sesión exitoso`);

      return {
        status: "success",
        message: `Bienvenido, ${row[1]}`,
        data: { id: row[0], usuario: row[1], rol: rol }
      };
    }
  }
  return {status:"error", message:"Usuario o contraseña incorrectos."};
}

function getUsuarios() {
  const data = getData(HOJA_USUARIOS);
  if (data.status !== 'success') return data;
  // Ocultar contraseñas
  data.data = data.data.map(u => ({...u, password: '••••••'}));
  return data;
}

function agregarUsuario(data) {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(HOJA_USUARIOS);
  if (!sheet) return {status:"error", message:"Pestaña Usuarios no existe."};

  // Verificar duplicado
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1]).toLowerCase() === data.usuario.toLowerCase())
      return {status:"error", message:`El usuario '${data.usuario}' ya existe.`};
  }

  const newId = generateUniqueAppId();
  sheet.appendRow([newId, data.usuario, data.password, data.rol || 'empleado', true, '', new Date()]);
  registrarActividad(data.usuarioActual || 'Admin', "Crear usuario", `Usuario '${data.usuario}' creado con rol '${data.rol}'`);
  return {status:"success", message:`Usuario '${data.usuario}' creado exitosamente.`};
}

function editarUsuario(data) {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(HOJA_USUARIOS);
  if (!sheet) return {status:"error", message:"Pestaña Usuarios no existe."};

  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.id)) {
      if (data.usuario)  sheet.getRange(i+1, 2).setValue(data.usuario);
      if (data.password && data.password !== '••••••') sheet.getRange(i+1, 3).setValue(data.password);
      if (data.rol)      sheet.getRange(i+1, 4).setValue(data.rol);
      registrarActividad(data.usuarioActual || 'Admin', "Editar usuario", `Usuario ID ${data.id} modificado`);
      return {status:"success", message:"Usuario actualizado."};
    }
  }
  return {status:"error", message:"Usuario no encontrado."};
}

function toggleUsuario(data) {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(HOJA_USUARIOS);
  if (!sheet) return {status:"error", message:"Pestaña Usuarios no existe."};

  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.id)) {
      const nuevoEstado = !rows[i][4];
      sheet.getRange(i+1, 5).setValue(nuevoEstado);
      registrarActividad(data.usuarioActual || 'Admin', nuevoEstado ? "Activar usuario" : "Desactivar usuario", `Usuario '${rows[i][1]}'`);
      return {status:"success", message:`Usuario ${nuevoEstado ? 'activado' : 'desactivado'}.`};
    }
  }
  return {status:"error", message:"Usuario no encontrado."};
}

// ══════════════════════════════════════════════════════════════
// CATEGORÍAS
// ══════════════════════════════════════════════════════════════
function getCategorias() { return getData(HOJA_CATEGORIAS); }

function agregarCategoria(data) {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(HOJA_CATEGORIAS);
  if (!sheet) return {status:"error", message:`Pestaña '${HOJA_CATEGORIAS}' no existe.`};

  const newId = generateUniqueAppId();
  sheet.appendRow([newId, data.nombre]);
  registrarActividad(data.usuario || 'Sistema', "Agregar categoría", `'${data.nombre}'`);
  return {status:"success", message:`Categoría '${data.nombre}' agregada.`};
}

function eliminarCategoria(data) {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(HOJA_CATEGORIAS);
  if (!sheet) return {status:"error", message:"Pestaña no existe."};

  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.id)) {
      const nombre = rows[i][1];
      sheet.deleteRow(i + 1);
      registrarActividad(data.usuario || 'Sistema', "Eliminar categoría", `'${nombre}'`);
      return {status:"success", message:`Categoría '${nombre}' eliminada.`};
    }
  }
  return {status:"error", message:"Categoría no encontrada."};
}

// ══════════════════════════════════════════════════════════════
// PRODUCTOS
// ══════════════════════════════════════════════════════════════
function getInventario() { return getData(HOJA_PRODUCTOS); }

function buscarProducto(query) {
  const data = getData(HOJA_PRODUCTOS);
  if (data.status !== 'success') return data;

  const lowerQuery = String(query || '').toLowerCase().trim();
  if (!lowerQuery) return {status:"warning", message:"Especifique un término de búsqueda."};

  const results = data.data.filter(p => {
    if (p.activo === false || p.activo === 'false' || p.activo === 0) return false;
    return String(p.id||'').toLowerCase().includes(lowerQuery)
        || String(p.código||'').toLowerCase().includes(lowerQuery)
        || String(p.nombre||'').toLowerCase().includes(lowerQuery);
  });

  return results.length > 0
    ? {status:"success", data:results, message:`${results.length} coincidencias.`}
    : {status:"warning", message:"Producto no encontrado."};
}

function agregarProducto(data) {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(HOJA_PRODUCTOS);
  if (!sheet) return {status:"error", message:"Pestaña Productos no existe."};

  const newId = generateUniqueAppId();
  sheet.appendRow([newId, data.nombre, data.codigo, data.categoria,
    parseFloat(data.precio_compra), parseFloat(data.precio_venta),
    parseInt(data.stock), new Date(), true]);
  registrarActividad(data.usuario || 'Sistema', "Registrar producto", `'${data.nombre}' (Stock: ${data.stock})`);
  return {status:"success", message:`Producto '${data.nombre}' registrado. ID: ${newId}`};
}

function editarProducto(data) {
  const ss         = getSpreadsheet();
  const sheetProd  = ss.getSheetByName(HOJA_PRODUCTOS);
  if (!sheetProd) return {status:"error", message:"Pestaña Productos no existe."};

  const {rowData, rowIndex} = findProductRow(sheetProd, data.id);
  if (rowIndex === -1) return {status:"error", message:"Producto no encontrado."};

  // Columnas: 0=id,1=nombre,2=código,3=categoría,4=precio_compra,5=precio_venta,6=stock,7=fecha,8=activo
  if (data.nombre)        sheetProd.getRange(rowIndex+1, 2).setValue(data.nombre);
  if (data.codigo)        sheetProd.getRange(rowIndex+1, 3).setValue(data.codigo);
  if (data.categoria)     sheetProd.getRange(rowIndex+1, 4).setValue(data.categoria);
  if (data.precio_compra) sheetProd.getRange(rowIndex+1, 5).setValue(parseFloat(data.precio_compra));
  if (data.precio_venta)  sheetProd.getRange(rowIndex+1, 6).setValue(parseFloat(data.precio_venta));
  if (data.stock !== undefined) sheetProd.getRange(rowIndex+1, 7).setValue(parseInt(data.stock));

  registrarActividad(data.usuario || 'Sistema', "Editar producto", `ID: ${data.id} - '${data.nombre||rowData[1]}'`);
  return {status:"success", message:`Producto '${data.nombre||rowData[1]}' actualizado.`};
}

function eliminarProducto(data) {
  const ss        = getSpreadsheet();
  const sheetProd = ss.getSheetByName(HOJA_PRODUCTOS);
  const sheetPap  = ss.getSheetByName(HOJA_PAPELERA);
  if (!sheetProd) return {status:"error", message:"Pestaña Productos no existe."};

  const {rowData, rowIndex} = findProductRow(sheetProd, data.id);
  if (rowIndex === -1) return {status:"error", message:"Producto no encontrado."};

  // Mover a papelera
  if (sheetPap) {
    sheetPap.appendRow([
      generateUniqueAppId(), "Producto",
      JSON.stringify({
        id: rowData[0], nombre: rowData[1], código: rowData[2],
        categoría: rowData[3], precio_compra: rowData[4],
        precio_venta: rowData[5], stock: rowData[6]
      }),
      new Date(), data.usuario || 'Sistema'
    ]);
  }

  // Marcar como inactivo (soft delete)
  sheetProd.getRange(rowIndex+1, 9).setValue(false);
  registrarActividad(data.usuario || 'Sistema', "Eliminar producto", `'${rowData[1]}' movido a papelera`);
  return {status:"success", message:`Producto '${rowData[1]}' eliminado y movido a papelera.`};
}

function restaurarProducto(data) {
  const ss       = getSpreadsheet();
  const sheetPap = ss.getSheetByName(HOJA_PAPELERA);
  const sheetProd= ss.getSheetByName(HOJA_PRODUCTOS);
  if (!sheetPap || !sheetProd) return {status:"error", message:"Pestañas requeridas no existen."};

  const rows = sheetPap.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.papelera_id)) {
      try {
        const original = JSON.parse(rows[i][2]);
        // Reactivar en Productos
        const {rowIndex} = findProductRow(sheetProd, original.id);
        if (rowIndex !== -1) {
          sheetProd.getRange(rowIndex+1, 9).setValue(true);
        } else {
          sheetProd.appendRow([original.id, original.nombre, original['código'],
            original['categoría'], original.precio_compra, original.precio_venta,
            original.stock, new Date(), true]);
        }
        sheetPap.deleteRow(i + 1);
        registrarActividad(data.usuario || 'Sistema', "Restaurar producto", `'${original.nombre}'`);
        return {status:"success", message:`Producto '${original.nombre}' restaurado.`};
      } catch(e) {
        return {status:"error", message:`Error al restaurar: ${e.message}`};
      }
    }
  }
  return {status:"error", message:"Elemento no encontrado en papelera."};
}

// ══════════════════════════════════════════════════════════════
// TRANSACCIONES (COMPRAS / VENTAS)
// ══════════════════════════════════════════════════════════════
function registrarTransaccion(data) {
  const ss           = getSpreadsheet();
  const isCompra     = data.type === "compra";
  const sheetTx      = ss.getSheetByName(isCompra ? HOJA_COMPRAS : HOJA_VENTAS);
  const sheetProd    = ss.getSheetByName(HOJA_PRODUCTOS);

  if (!sheetTx || !sheetProd)
    return {status:"error", message:"Pestañas necesarias no existen."};

  const {rowData, rowIndex} = findProductRow(sheetProd, data.producto_id);
  if (rowIndex === -1) return {status:"error", message:`Producto ID ${data.producto_id} no encontrado.`};

  const cantidad  = parseInt(data.cantidad);
  const precio    = parseFloat(data.precio);
  let   stockAct  = parseFloat(rowData[6]) || 0;
  let   nuevoStock;

  if (!isCompra) {
    if (stockAct < cantidad)
      return {status:"warning", message:`Stock insuficiente. Disponible: ${stockAct} unidades.`};
    nuevoStock = stockAct - cantidad;
  } else {
    nuevoStock = stockAct + cantidad;
  }

  // Registrar transacción
  const txId = generateUniqueAppId();
  try {
    sheetTx.appendRow([txId, data.producto_id, cantidad, precio, new Date(), data.extra_data || '']);
  } catch(e) {
    return {status:"error", message:`Error al registrar transacción: ${e.message}`};
  }

  // Actualizar stock y precio
  try {
    sheetProd.getRange(rowIndex+1, 7).setValue(nuevoStock);
    const precioColIdx = isCompra ? 5 : 6;
    const precioActual = parseFloat(rowData[precioColIdx-1]) || 0;
    if (precio !== precioActual) sheetProd.getRange(rowIndex+1, precioColIdx).setValue(precio);

    const nombreProd = rowData[1];
    registrarActividad(data.usuario || 'Sistema',
      isCompra ? "Registrar compra" : "Registrar venta",
      `${nombreProd} x${cantidad} @ $${precio} — Stock: ${nuevoStock}`);

    return {status:"success", message:`${isCompra?'Compra':'Venta'} registrada. Stock actualizado: ${nuevoStock} unidades.`};
  } catch(e) {
    sheetTx.deleteRow(sheetTx.getLastRow());
    return {status:"error", message:`Error al actualizar inventario: ${e.message}`};
  }
}

// ══════════════════════════════════════════════════════════════
// CLIENTES
// ══════════════════════════════════════════════════════════════
function agregarCliente(data) {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(HOJA_CLIENTES);
  if (!sheet) return {status:"error", message:"Pestaña Clientes no existe."};

  const newId = generateUniqueAppId();
  sheet.appendRow([newId, data.nombre, data.telefono||'', data.correo||'', data.direccion||'', new Date()]);
  registrarActividad(data.usuario||'Sistema', "Agregar cliente", `'${data.nombre}'`);
  return {status:"success", message:`Cliente '${data.nombre}' agregado.`};
}

function editarCliente(data) {
  return editarEntidad(HOJA_CLIENTES, data, ['nombre','telefono','correo','direccion'], [2,3,4,5], "cliente");
}

function eliminarCliente(data) {
  return eliminarEntidad(HOJA_CLIENTES, data, "cliente");
}

// ══════════════════════════════════════════════════════════════
// PROVEEDORES
// ══════════════════════════════════════════════════════════════
function agregarProveedor(data) {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(HOJA_PROVEEDORES);
  if (!sheet) return {status:"error", message:"Pestaña Proveedores no existe."};

  const newId = generateUniqueAppId();
  sheet.appendRow([newId, data.nombre, data.empresa||'', data.telefono||'', data.correo||'', data.direccion||'', new Date()]);
  registrarActividad(data.usuario||'Sistema', "Agregar proveedor", `'${data.nombre}'`);
  return {status:"success", message:`Proveedor '${data.nombre}' agregado.`};
}

function editarProveedor(data) {
  return editarEntidad(HOJA_PROVEEDORES, data, ['nombre','empresa','telefono','correo','direccion'], [2,3,4,5,6], "proveedor");
}

function eliminarProveedor(data) {
  return eliminarEntidad(HOJA_PROVEEDORES, data, "proveedor");
}

// ══════════════════════════════════════════════════════════════
// GASTOS
// ══════════════════════════════════════════════════════════════
function agregarGasto(data) {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(HOJA_GASTOS);
  if (!sheet) return {status:"error", message:"Pestaña Gastos no existe."};

  const newId = generateUniqueAppId();
  sheet.appendRow([newId, data.descripcion, parseFloat(data.monto), new Date(), data.categoria||'General', data.usuario||'Sistema']);
  registrarActividad(data.usuario||'Sistema', "Registrar gasto", `'${data.descripcion}' - $${data.monto}`);
  return {status:"success", message:`Gasto '${data.descripcion}' registrado.`};
}

function eliminarGasto(data) {
  return eliminarEntidad(HOJA_GASTOS, data, "gasto");
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD DATOS
// ══════════════════════════════════════════════════════════════
function getDashboardData() {
  try {
    const ventasData   = getData(HOJA_VENTAS);
    const comprasData  = getData(HOJA_COMPRAS);
    const gastosData   = getData(HOJA_GASTOS);
    const productosData= getData(HOJA_PRODUCTOS);

    let totalVentas = 0, totalCompras = 0, totalGastos = 0;
    const ventasPorFecha = {}, comprasPorFecha = {};
    const ventasPorProducto = {};

    const hoy   = new Date(); hoy.setHours(0,0,0,0);
    const mesAct = hoy.getMonth();
    const anioAct= hoy.getFullYear();

    let ventasHoy = 0, ventasMes = 0;

    if (ventasData.status === 'success' && ventasData.data) {
      ventasData.data.forEach(v => {
        const monto = (parseFloat(v.cantidad)||0) * (parseFloat(v.precio_venta)||0);
        totalVentas += monto;
        const fecha = new Date(v.fecha);
        const fechaKey = fecha.toLocaleDateString('es-SV');
        ventasPorFecha[fechaKey] = (ventasPorFecha[fechaKey]||0) + monto;

        const fSinHora = new Date(fecha); fSinHora.setHours(0,0,0,0);
        if (fSinHora.getTime() === hoy.getTime()) ventasHoy += monto;
        if (fecha.getMonth() === mesAct && fecha.getFullYear() === anioAct) ventasMes += monto;

        const pid = String(v.producto_id);
        ventasPorProducto[pid] = (ventasPorProducto[pid]||0) + (parseFloat(v.cantidad)||0);
      });
    }

    if (comprasData.status === 'success' && comprasData.data) {
      comprasData.data.forEach(c => {
        const monto = (parseFloat(c.cantidad)||0) * (parseFloat(c.precio_compra)||0);
        totalCompras += monto;
        const fechaKey = new Date(c.fecha).toLocaleDateString('es-SV');
        comprasPorFecha[fechaKey] = (comprasPorFecha[fechaKey]||0) + monto;
      });
    }

    if (gastosData.status === 'success' && gastosData.data) {
      gastosData.data.forEach(g => { totalGastos += parseFloat(g.monto)||0; });
    }

    // Top productos vendidos
    let topProductos = [];
    let productosAgotados = 0;
    let stockBajo = [];

    if (productosData.status === 'success' && productosData.data) {
      const activos = productosData.data.filter(p => p.activo !== false && p.activo !== 'false' && p.activo !== 0);
      activos.forEach(p => {
        const stock = parseInt(p.stock)||0;
        if (stock === 0) productosAgotados++;
        if (stock > 0 && stock <= 5) stockBajo.push({id:p.id, nombre:p.nombre, stock});
      });

      topProductos = activos
        .map(p => ({id:p.id, nombre:p.nombre, vendidos: ventasPorProducto[String(p.id)]||0}))
        .filter(p => p.vendidos > 0)
        .sort((a,b) => b.vendidos - a.vendidos)
        .slice(0, 5);
    }

    // Fechas combinadas para gráficos
    const todasFechas = [...new Set([...Object.keys(ventasPorFecha),...Object.keys(comprasPorFecha)])].sort();
    const datosGrafico = todasFechas.map(f => ({
      fecha: f,
      ventas:  ventasPorFecha[f]||0,
      compras: comprasPorFecha[f]||0,
      ganancia:(ventasPorFecha[f]||0) - (comprasPorFecha[f]||0)
    }));

    return {
      status: "success",
      data: {
        totales: {
          ventas: totalVentas, compras: totalCompras,
          gastos: totalGastos,
          ganancias: totalVentas - totalCompras - totalGastos,
          ventasHoy, ventasMes
        },
        grafico: datosGrafico,
        topProductos,
        productosAgotados,
        stockBajo
      }
    };
  } catch(e) {
    return {status:"error", message:`Error en dashboard: ${e.message}`};
  }
}

// ══════════════════════════════════════════════════════════════
// UTILIDADES GENÉRICAS
// ══════════════════════════════════════════════════════════════
function editarEntidad(hojaName, data, campos, columnas, tipo) {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(hojaName);
  if (!sheet) return {status:"error", message:`Pestaña '${hojaName}' no existe.`};

  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.id)) {
      campos.forEach((campo, idx) => {
        if (data[campo] !== undefined) sheet.getRange(i+1, columnas[idx]).setValue(data[campo]);
      });
      registrarActividad(data.usuario||'Sistema', `Editar ${tipo}`, `ID: ${data.id}`);
      return {status:"success", message:`${tipo.charAt(0).toUpperCase()+tipo.slice(1)} actualizado.`};
    }
  }
  return {status:"error", message:`${tipo} no encontrado.`};
}

function eliminarEntidad(hojaName, data, tipo) {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(hojaName);
  if (!sheet) return {status:"error", message:`Pestaña '${hojaName}' no existe.`};

  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(data.id)) {
      const nombre = rows[i][1] || rows[i][0];
      sheet.deleteRow(i + 1);
      registrarActividad(data.usuario||'Sistema', `Eliminar ${tipo}`, `'${nombre}'`);
      return {status:"success", message:`${tipo.charAt(0).toUpperCase()+tipo.slice(1)} '${nombre}' eliminado.`};
    }
  }
  return {status:"error", message:`${tipo} no encontrado.`};
}

function getData(sheetName) {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2)
    return {status:"error", message:`Pestaña '${sheetName}' vacía o no existe.`};

  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const rows    = data.slice(1);

  const mapped = rows.map(row => {
    let entry = {};
    headers.forEach((h, i) => {
      let v = row[i];
      if (v === '' || v === null || v === undefined) v = '';
      else if (typeof v === 'number') {}
      else if (v instanceof Date) {}
      else if (typeof v === 'boolean') {}
      else if (typeof v === 'string' && !isNaN(v) && v.trim() !== '' && h !== 'código') v = parseFloat(v);
      else v = String(v);
      entry[h] = v;
    });
    return entry;
  });

  const filtered = mapped.filter(e => Object.values(e).some(v => v !== '' && v !== null));
  return {status:"success", data: filtered};
}

function findProductRow(sheet, productoId) {
  try {
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]||'').toLowerCase() === String(productoId||'').toLowerCase())
        return {rowData: data[i], rowIndex: i};
    }
    return {rowData: null, rowIndex: -1};
  } catch(e) {
    return {rowData: null, rowIndex: -1};
  }
}

function getResumenDiario() { return getData(HOJA_RESUMEN); }

// ══════════════════════════════════════════════════════════════
// BASE DE DATOS
// ══════════════════════════════════════════════════════════════
function createOrResetSheet(ss, name, headers) {
  let sheet  = ss.getSheetByName(name);
  const action = sheet ? "verificada" : "creada";
  if (!sheet) sheet = ss.insertSheet(name);
  sheet.clearContents();
  sheet.getRange(1,1,1,headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return `'${name}' ${action}.`;
}

function iniciarBaseDeDatos() {
  const ss  = getSpreadsheet();
  const msg = [];
  msg.push(createOrResetSheet(ss, HOJA_CATEGORIAS,  CATEGORIAS_HEADERS));
  msg.push(createOrResetSheet(ss, HOJA_PRODUCTOS,   PRODUCTOS_HEADERS));
  msg.push(createOrResetSheet(ss, HOJA_COMPRAS,     COMPRAS_HEADERS));
  msg.push(createOrResetSheet(ss, HOJA_VENTAS,      VENTAS_HEADERS));
  msg.push(createOrResetSheet(ss, HOJA_RESUMEN,     RESUMEN_HEADERS));
  msg.push(createOrResetSheet(ss, HOJA_USUARIOS,    USUARIOS_HEADERS));
  msg.push(createOrResetSheet(ss, HOJA_ACTIVIDAD,   ACTIVIDAD_HEADERS));
  msg.push(createOrResetSheet(ss, HOJA_CLIENTES,    CLIENTES_HEADERS));
  msg.push(createOrResetSheet(ss, HOJA_PROVEEDORES, PROVEEDORES_HEADERS));
  msg.push(createOrResetSheet(ss, HOJA_GASTOS,      GASTOS_HEADERS));
  msg.push(createOrResetSheet(ss, HOJA_PAPELERA,    PAPELERA_HEADERS));

  // Crear usuario admin por defecto si no existe
  const sheetU = ss.getSheetByName(HOJA_USUARIOS);
  if (sheetU && sheetU.getLastRow() < 2) {
    sheetU.appendRow([generateUniqueAppId(), 'admin', 'admin123', 'admin', true, '', new Date()]);
    msg.push("Usuario admin creado (pass: admin123).");
  }

  return {status:"success", message:`BD inicializada: ${msg.join(" ")}`};
}

function resetearBaseDeDatos() {
  const ss  = getSpreadsheet();
  const msg = [];
  ss.getSheets().forEach(s => {
    if (s.getName() !== "Hoja 1") { ss.deleteSheet(s); msg.push(`'${s.getName()}' eliminada.`); }
  });
  return iniciarBaseDeDatos();
}


// --- CÓDIGO INYECTADO: CAJA ---
function cerrarCaja(data) {
    const ss = getSpreadsheet(); const sheetCaja = ss.getSheetByName(HOJA_CAJA);
    try {
        const totalNeto = parseFloat(data.total_ventas) - parseFloat(data.total_gastos);
        sheetCaja.appendRow([generateUniqueAppId(), new Date(), data.req_user, parseFloat(data.total_ventas), parseFloat(data.total_gastos), totalNeto]);
        registrarActividad(data.req_user, "Cierre de Caja", `Corte realizado. Neto: $${totalNeto}`);
        return { status: "success", message: `Corte de caja guardado con éxito.` };
    } catch(e) { return { status: "error", message: e.message }; }
}
