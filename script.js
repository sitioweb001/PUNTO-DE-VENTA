// ═══════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwbYNUf0--D2RVqFyaBZHFxQuClX6RBybuhK6kJU9Q02NZyICUIXEnUWIR1x25xMnfMrA/exec';

// Activa MODO_OFFLINE = true para probar la app sin un backend real
// (usa localStorage como base de datos simulada).
const MODO_OFFLINE = false;

// ═══════════════════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════════════════
let currentUser       = null; // { id, usuario, rol }
let productDataCache  = {};
let cachedInventario  = [];   // resultado crudo del servidor
let inventarioGlobal  = [];   // alias de trabajo para filtros rápidos
let cachedClientes    = [];
let cachedProveedores = [];
let cachedGastos      = [];
let cajaCalculoTemporal = { ventas: 0, gastos: 0 };
let resumenFinancieroChart, tendenciasChart;
let html5QrcodeScanner;
let searchTimeout;

// Permisos por rol
const PERMISOS = {
  admin:    ['dashboard','ventas','inventario','productos','categorias','compras','clientes','proveedores','gastos','caja','papelera','resumenes','actividad','usuarios','configuracion'],
  empleado: ['dashboard','ventas','inventario','productos','compras','clientes','proveedores','gastos','caja','resumenes'],
  lectura:  ['dashboard','inventario','resumenes']
};

// ═══════════════════════════════════════════════════════════════
// MODO OFFLINE (opcional, para pruebas sin backend)
// ═══════════════════════════════════════════════════════════════
if (MODO_OFFLINE) {
  let localDB = JSON.parse(localStorage.getItem('inv_local_db')) || {
    usuarios: [{ id:'u1', usuario:'admin', password:'admin123', rol:'admin', activo:true }],
    productos: [], categorias: [{ id:'1', nombre:'General' }],
    ventas: [], compras: [], gastos: [], clientes: [], proveedores: [],
    papelera: [], caja: [], actividad: []
  };
  const saveDB = () => localStorage.setItem('inv_local_db', JSON.stringify(localDB));
  const logAction = (u, a, d) => { localDB.actividad.push({id:'L'+Date.now(), fecha:new Date(), usuario:u, accion:a, detalle:d}); saveDB(); };
  const originalFetch = window.fetch;

  window.fetch = async function() {
    const url = arguments[0]; const options = arguments[1];
    if (!url || typeof url !== 'string' || !url.includes('script.google.com')) return originalFetch.apply(this, arguments);

    return new Promise(resolve => {
      setTimeout(() => {
        let action = ''; let req = {};
        if (options && options.method === 'POST') { req = JSON.parse(options.body); action = req.action; }
        else { const urlObj = new URL(url); action = urlObj.searchParams.get('action'); req.sheetName = urlObj.searchParams.get('sheetName'); req.query = urlObj.searchParams.get('query'); }

        let res = { status:'error', message:'Acción offline no soportada: ' + action };
        switch(action) {
          case 'login': {
            const cred = req.password !== undefined ? req.password : req.pin;
            const u = localDB.usuarios.find(x => x.usuario === req.usuario && String(x.password) === String(cred));
            res = u ? { status:'success', data: u, message:`Bienvenido, ${u.usuario}` } : { status:'error', message:'Credenciales inválidas' };
            break;
          }
          case 'getCategorias': res = { status:'success', data: localDB.categorias }; break;
          case 'getInventario': res = { status:'success', data: localDB.productos.filter(p => p.activo !== false) }; break;
          case 'getClientes': res = { status:'success', data: localDB.clientes }; break;
          case 'getProveedores': res = { status:'success', data: localDB.proveedores }; break;
          case 'getGastos': res = { status:'success', data: localDB.gastos }; break;
          case 'getPapelera': res = { status:'success', data: localDB.papelera }; break;
          case 'getCaja': res = { status:'success', data: localDB.caja }; break;
          case 'getActividad': res = { status:'success', data: localDB.actividad }; break;
          case 'getUsuarios': res = { status:'success', data: localDB.usuarios.map(u=>({...u, password:'••••••'})) }; break;
          case 'getBackup': res = { status:'success', data: localDB, message:'Backup offline' }; break;
          case 'getCajaResumen': {
            const hoy = new Date().toLocaleDateString('es-SV');
            const tVentas = localDB.ventas.filter(v=>new Date(v.fecha).toLocaleDateString('es-SV')===hoy).reduce((s,v)=>s+(parseFloat(v.cantidad||0)*parseFloat(v.precio_venta||0)),0);
            const tGastos = localDB.gastos.filter(g=>new Date(g.fecha).toLocaleDateString('es-SV')===hoy).reduce((s,g)=>s+(parseFloat(g.monto||0)),0);
            res = { status:'success', data: { ventasHoy:tVentas, gastosHoy:tGastos, efectivoEsperado:tVentas-tGastos, historial: localDB.caja } };
            break;
          }
          case 'getDashboard': {
            let totalVentas=0, totalCompras=0, totalGastos=0, ventasHoy=0, ventasMes=0;
            const hoy = new Date(); hoy.setHours(0,0,0,0);
            const ventasPorFecha={}, comprasPorFecha={}, ventasPorProducto={};
            localDB.ventas.forEach(v=>{
              const monto=(parseFloat(v.cantidad)||0)*(parseFloat(v.precio_venta)||0); totalVentas+=monto;
              const f=new Date(v.fecha); const fk=f.toLocaleDateString('es-SV');
              ventasPorFecha[fk]=(ventasPorFecha[fk]||0)+monto;
              const fSinHora=new Date(f); fSinHora.setHours(0,0,0,0);
              if(fSinHora.getTime()===hoy.getTime()) ventasHoy+=monto;
              if(f.getMonth()===hoy.getMonth() && f.getFullYear()===hoy.getFullYear()) ventasMes+=monto;
              ventasPorProducto[String(v.producto_id)]=(ventasPorProducto[String(v.producto_id)]||0)+(parseFloat(v.cantidad)||0);
            });
            localDB.compras.forEach(c=>{
              const monto=(parseFloat(c.cantidad)||0)*(parseFloat(c.precio_compra)||0); totalCompras+=monto;
              const fk=new Date(c.fecha).toLocaleDateString('es-SV');
              comprasPorFecha[fk]=(comprasPorFecha[fk]||0)+monto;
            });
            localDB.gastos.forEach(g=>{ totalGastos+=parseFloat(g.monto)||0; });
            const activos = localDB.productos.filter(p=>p.activo!==false);
            let productosAgotados=0, stockBajo=[];
            activos.forEach(p=>{
              const stock=parseInt(p.stock)||0; const limite=parseInt(p.stock_minimo)||5;
              if(stock===0) productosAgotados++;
              if(stock>0 && stock<=limite) stockBajo.push({id:p.id,nombre:p.nombre,stock,stock_minimo:limite});
            });
            const topProductos = activos.map(p=>({id:p.id,nombre:p.nombre,vendidos:ventasPorProducto[String(p.id)]||0})).filter(p=>p.vendidos>0).sort((a,b)=>b.vendidos-a.vendidos).slice(0,5);
            const todasFechas=[...new Set([...Object.keys(ventasPorFecha),...Object.keys(comprasPorFecha)])].sort();
            const grafico = todasFechas.map(f=>({fecha:f, ventas:ventasPorFecha[f]||0, compras:comprasPorFecha[f]||0, ganancia:(ventasPorFecha[f]||0)-(comprasPorFecha[f]||0)}));
            res = { status:'success', data:{ totales:{ventas:totalVentas,compras:totalCompras,gastos:totalGastos,ganancias:totalVentas-totalCompras-totalGastos,ventasHoy,ventasMes}, grafico, topProductos, productosAgotados, stockBajo } };
            break;
          }
          case 'getData': {
            const sheetMap = {'Ventas':'ventas','VENTAS':'ventas','Compras':'compras','COMPRAS':'compras','Gastos':'gastos','Usuarios':'usuarios','Papelera':'papelera','Caja':'caja','Actividad':'actividad'};
            if (sheetMap[req.sheetName]) res = { status:'success', data: localDB[sheetMap[req.sheetName]] };
            else res = { status:'error', message:'Hoja no encontrada (offline)' };
            break;
          }
          case 'buscarProducto': {
            if (!req.query) break;
            const q = req.query.toLowerCase();
            const matches = localDB.productos.filter(p => p.activo !== false && ((p.nombre||'').toLowerCase().includes(q) || (p.código||'').toLowerCase().includes(q) || (p.id||'').toLowerCase().includes(q)));
            res = matches.length > 0 ? { status:'success', data:matches } : { status:'warning', message:'No encontrado' };
            break;
          }
          case 'agregarCategoria':
            localDB.categorias.push({ id:'C'+Date.now(), nombre:req.nombre }); saveDB();
            res = { status:'success', message:'Categoría agregada.' }; break;
          case 'eliminarCategoria':
            localDB.categorias = localDB.categorias.filter(c=>c.id!==req.id); saveDB();
            res = { status:'success', message:'Categoría eliminada.' }; break;
          case 'agregarProducto':
          case 'editarProducto': {
            const r = { ...req };
            r.stock = parseInt(r.stock); r.stock_minimo = parseInt(r.stock_minimo||5);
            r.precio_venta = parseFloat(r.precio_venta); r.precio_compra = parseFloat(r.precio_compra);
            r.código = r.codigo; r.categoría = r.categoria;
            if (action === 'agregarProducto') { r.id = 'ID-' + Math.floor(Math.random()*100000); r.activo = true; r.fecha_creado = new Date(); localDB.productos.push(r); }
            else { const idx = localDB.productos.findIndex(p=>p.id===r.id); if(idx>-1) Object.assign(localDB.productos[idx], r); }
            saveDB(); res = { status:'success', message:'Producto guardado.' }; break;
          }
          case 'eliminarProducto': {
            const idx = localDB.productos.findIndex(p=>p.id===req.id);
            if (idx>-1) {
              const p = localDB.productos[idx];
              localDB.papelera.push({ id:'PAP'+Date.now(), tipo:'Producto', datos_originales: JSON.stringify(p), fecha_eliminado:new Date(), eliminado_por: req.usuario||req.req_user });
              p.activo = false; saveDB();
              res = { status:'success', message:`'${p.nombre}' movido a papelera.` };
              logAction(req.usuario||req.req_user, 'Eliminar producto', p.nombre);
            } else res = { status:'error', message:'No encontrado.' };
            break;
          }
          case 'restaurarProducto': {
            const id = req.papelera_id || req.id;
            const idx = localDB.papelera.findIndex(p=>p.id===id);
            if (idx>-1) {
              const original = JSON.parse(localDB.papelera[idx].datos_originales);
              const pIdx = localDB.productos.findIndex(p=>p.id===original.id);
              if (pIdx>-1) localDB.productos[pIdx].activo = true;
              else localDB.productos.push({...original, activo:true});
              localDB.papelera.splice(idx,1); saveDB();
              res = { status:'success', message:`'${original.nombre}' restaurado.` };
            } else res = { status:'error', message:'No está en la papelera.' };
            break;
          }
          case 'registrarTransaccion': {
            const isC = req.type === 'compra';
            const pIdx = localDB.productos.findIndex(p=>p.id===req.producto_id);
            if (pIdx>-1) {
              const cantidad = parseInt(req.cantidad);
              if (!isC && (localDB.productos[pIdx].stock||0) < cantidad) { res = {status:'warning', message:'Stock insuficiente.'}; break; }
              localDB.productos[pIdx].stock += (isC ? cantidad : -cantidad);
              const trans = { id:'T-'+Math.floor(Math.random()*100000), producto_id:req.producto_id, cantidad:req.cantidad, fecha:new Date() };
              if (isC) { trans.precio_compra = req.precio; trans.proveedor = req.extra_data||''; localDB.compras.push(trans); }
              else { trans.precio_venta = req.precio; trans.cliente = req.extra_data||''; localDB.ventas.push(trans); }
              saveDB();
              res = { status:'success', message:`${isC?'Compra':'Venta'} registrada.`, data:{ ticket_id: trans.id, producto: localDB.productos[pIdx].nombre } };
              logAction(req.usuario||req.req_user, isC?'Registrar compra':'Registrar venta', `${localDB.productos[pIdx].nombre} x${cantidad}`);
            } else res = { status:'error', message:'Producto no encontrado.' };
            break;
          }
          case 'agregarCliente':
            localDB.clientes.push({ id:'CL'+Date.now(), nombre:req.nombre, telefono:req.telefono||'', correo:req.correo||'', direccion:req.direccion||'' }); saveDB();
            res = { status:'success', message:'Cliente agregado.' }; break;
          case 'editarCliente': {
            const idx = localDB.clientes.findIndex(c=>c.id===req.id);
            if (idx>-1) { Object.assign(localDB.clientes[idx], req); saveDB(); res = {status:'success', message:'Cliente actualizado.'}; }
            else res = { status:'error', message:'No encontrado.' };
            break;
          }
          case 'eliminarCliente':
            localDB.clientes = localDB.clientes.filter(c=>c.id!==req.id); saveDB();
            res = { status:'success', message:'Cliente eliminado.' }; break;
          case 'agregarProveedor':
            localDB.proveedores.push({ id:'PV'+Date.now(), nombre:req.nombre, empresa:req.empresa||'', telefono:req.telefono||'', correo:req.correo||'', direccion:req.direccion||'' }); saveDB();
            res = { status:'success', message:'Proveedor agregado.' }; break;
          case 'editarProveedor': {
            const idx = localDB.proveedores.findIndex(p=>p.id===req.id);
            if (idx>-1) { Object.assign(localDB.proveedores[idx], req); saveDB(); res = {status:'success', message:'Proveedor actualizado.'}; }
            else res = { status:'error', message:'No encontrado.' };
            break;
          }
          case 'eliminarProveedor':
            localDB.proveedores = localDB.proveedores.filter(p=>p.id!==req.id); saveDB();
            res = { status:'success', message:'Proveedor eliminado.' }; break;
          case 'agregarGasto':
            localDB.gastos.push({ id:'G-'+Date.now(), descripcion:req.descripcion, monto:parseFloat(req.monto), fecha:new Date(), categoria:req.categoria||'General', usuario:req.usuario||req.req_user }); saveDB();
            res = { status:'success', message:'Gasto registrado.' }; break;
          case 'eliminarGasto':
            localDB.gastos = localDB.gastos.filter(g=>g.id!==req.id); saveDB();
            res = { status:'success', message:'Gasto eliminado.' }; break;
          case 'agregarUsuario': {
            const cred = req.password !== undefined ? req.password : req.pin;
            localDB.usuarios.push({ id:'U'+Date.now(), usuario:req.usuario, password:cred, rol:req.rol, activo:true }); saveDB();
            res = { status:'success', message:'Usuario creado.' }; break;
          }
          case 'editarUsuario': {
            const idx = localDB.usuarios.findIndex(u=>u.id===req.id);
            const cred = req.password !== undefined ? req.password : req.pin;
            if (idx>-1) { if(req.usuario) localDB.usuarios[idx].usuario=req.usuario; if(cred && cred!=='••••••') localDB.usuarios[idx].password=cred; if(req.rol) localDB.usuarios[idx].rol=req.rol; saveDB(); res = {status:'success', message:'Usuario actualizado.'}; }
            else res = { status:'error', message:'No encontrado.' };
            break;
          }
          case 'eliminarUsuario':
            localDB.usuarios = localDB.usuarios.filter(u=>u.id!==req.id); saveDB();
            res = { status:'success', message:'Usuario eliminado.' }; break;
          case 'toggleUsuario': {
            const idx = localDB.usuarios.findIndex(u=>u.id===req.id);
            if (idx>-1) { localDB.usuarios[idx].activo = !localDB.usuarios[idx].activo; saveDB(); res = {status:'success', message:`Usuario ${localDB.usuarios[idx].activo?'activado':'desactivado'}.`}; }
            else res = { status:'error', message:'No encontrado.' };
            break;
          }
          case 'cerrarCaja': {
            const tv = parseFloat(req.total_ventas)||0, tg = parseFloat(req.total_gastos)||0;
            localDB.caja.push({ id:'C-'+Date.now(), fecha:new Date(), usuario:req.usuario||req.req_user, total_ventas:tv, total_gastos:tg, efectivo_final:tv-tg }); saveDB();
            logAction(req.usuario||req.req_user, 'Cierre de Caja', `Neto: $${(tv-tg).toFixed(2)}`);
            res = { status:'success', message:'Corte de caja guardado con éxito.' }; break;
          }
          case 'iniciar':
          case 'resetear':
            res = { status:'success', message:'Base de datos lista (modo offline).' }; break;
        }
        resolve({ json: async () => res });
      }, 200);
    });
  };
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Restaurar sesión
  const saved = sessionStorage.getItem('inventario_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    iniciarApp();
  } else {
    mostrarLogin();
  }

  // Enter en login
  document.getElementById('login_password').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('login_usuario').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login_password').focus();
  });

  // Modo oscuro guardado
  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
    const t = document.getElementById('darkModeToggle');
    if (t) t.checked = true;
  }
});

// ═══════════════════════════════════════════════════════════════
// LOGIN / LOGOUT
// ═══════════════════════════════════════════════════════════════
function mostrarLogin() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('mainApp').classList.add('hidden');
}

async function handleLogin() {
  const usuario  = document.getElementById('login_usuario').value.trim();
  const password = document.getElementById('login_password').value.trim();
  const errDiv   = document.getElementById('loginError');
  const btn      = document.getElementById('loginBtn');

  if (!usuario || !password) {
    errDiv.textContent = 'Completa todos los campos.';
    errDiv.classList.remove('hidden');
    return;
  }

  btn.disabled  = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ingresando...';
  errDiv.classList.add('hidden');

  try {
    const res  = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'login', usuario, password, pin: password }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    const data = await res.json();

    if (data.status === 'success') {
      currentUser = data.data;
      sessionStorage.setItem('inventario_user', JSON.stringify(currentUser));
      iniciarApp();
      showToast(`Bienvenido, ${currentUser.usuario}!`, 'success');
    } else {
      errDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${data.message}`;
      errDiv.classList.remove('hidden');
    }
  } catch(e) {
    errDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> Error de conexión. Verifica la URL del script.`;
    errDiv.classList.remove('hidden');
  } finally {
    btn.disabled  = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Ingresar';
  }
}

function togglePassword() {
  const inp  = document.getElementById('login_password');
  const icon = document.getElementById('togglePassIcon');
  if (inp.type === 'password') {
    inp.type       = 'text';
    icon.className = 'fas fa-eye-slash';
  } else {
    inp.type       = 'password';
    icon.className = 'fas fa-eye';
  }
}

function cerrarSesion() {
  if (!confirm('¿Cerrar sesión?')) return;
  currentUser = null;
  sessionStorage.removeItem('inventario_user');
  mostrarLogin();
  document.getElementById('login_usuario').value  = '';
  document.getElementById('login_password').value = '';
}

// ═══════════════════════════════════════════════════════════════
// INICIAR APP
// ═══════════════════════════════════════════════════════════════
function iniciarApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');

  // Mostrar usuario en sidebar
  document.getElementById('sidebarUserName').textContent = currentUser.usuario;
  const rolLabel = { admin:'Administrador', empleado:'Empleado', lectura:'Solo Lectura' };
  document.getElementById('sidebarUserRole').textContent = rolLabel[currentUser.rol] || currentUser.rol;

  // Filtrar menú por permisos
  aplicarPermisos();
  setupNavigation();
  setupForms();
  setupModals();
  setupMobile();
  loadInitialData();

  // Sección inicial según rol
  const permitido = PERMISOS[currentUser.rol] || ['dashboard'];
  const primero   = permitido[0] || 'dashboard';
  irASeccion(primero);
}

function aplicarPermisos() {
  const permitido = PERMISOS[currentUser.rol] || ['dashboard'];
  document.querySelectorAll('.sidebar-nav a[data-section]').forEach(link => {
    const section = link.getAttribute('data-section');
    if (!permitido.includes(section)) link.classList.add('hidden');
    else link.classList.remove('hidden');
  });
}

// ═══════════════════════════════════════════════════════════════
// NAVEGACIÓN
// ═══════════════════════════════════════════════════════════════
function setupNavigation() {
  const navLinks = document.querySelectorAll('.sidebar-nav a[data-section]');

  navLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const targetId = link.getAttribute('data-section');
      const permitido = PERMISOS[currentUser.rol] || [];
      if (!permitido.includes(targetId)) {
        showToast('No tienes permiso para acceder a esta sección.', 'error');
        return;
      }
      irASeccion(targetId);
      if (window.innerWidth <= 992) document.getElementById('sidebar').classList.remove('active');
    });
  });

  document.getElementById('logoutBtn').addEventListener('click', e => {
    e.preventDefault();
    cerrarSesion();
  });
}

function irASeccion(targetId) {
  const navLinks = document.querySelectorAll('.sidebar-nav a[data-section]');
  const sections = document.querySelectorAll('.content-section');

  navLinks.forEach(l => l.classList.toggle('active', l.getAttribute('data-section') === targetId));
  sections.forEach(s => s.classList.toggle('active', s.id === targetId));

  // Acciones automáticas por sección
  if (targetId === 'dashboard')   handleLoadDashboard();
  if (targetId === 'inventario')  loadInventario();
  if (targetId === 'clientes')    cargarClientes();
  if (targetId === 'proveedores') cargarProveedores();
  if (targetId === 'papelera')    cargarPapelera();
  if (targetId === 'usuarios')    cargarUsuarios();
  if (targetId === 'actividad')   cargarActividad();
  if (targetId === 'gastos')      cargarGastos();
  if (targetId === 'caja')        loadCaja();
}

// ═══════════════════════════════════════════════════════════════
// MOBILE
// ═══════════════════════════════════════════════════════════════
function setupMobile() {
  const toggle  = document.getElementById('mobileToggle');
  const sidebar = document.getElementById('sidebar');

  function checkMobile() {
    if (window.innerWidth <= 992) toggle.classList.remove('hidden');
    else { toggle.classList.add('hidden'); sidebar.classList.remove('active'); }
  }
  checkMobile();
  window.addEventListener('resize', checkMobile);

  toggle.addEventListener('click', e => {
    e.stopPropagation();
    sidebar.classList.toggle('active');
  });
  document.addEventListener('click', e => {
    if (window.innerWidth <= 992 && sidebar.classList.contains('active')
        && !sidebar.contains(e.target) && !toggle.contains(e.target))
      sidebar.classList.remove('active');
  });
}

// ═══════════════════════════════════════════════════════════════
// FORMULARIOS Y MODALES (setup)
// ═══════════════════════════════════════════════════════════════
function setupForms() {
  // Config
  document.getElementById('iniciarDBBtn').addEventListener('click', () => handleConfigAction('iniciar'));
  document.getElementById('resetDBBtn').addEventListener('click', () => {
    if (confirm('¡ADVERTENCIA! ¿Resetear TODA la base de datos? Perderás todos los datos.'))
      handleConfigAction('resetear');
  });

  // Categoría
  document.getElementById('categoriaForm').addEventListener('submit', async e => {
    e.preventDefault();
    const nombre = document.getElementById('c_nombre').value.trim();
    if (!nombre) return;
    const res = await postAction({ action:'agregarCategoria', nombre, usuario: currentUser.usuario });
    showStatus('statusCategoria', res.status, res.message);
    if (res.status === 'success') { e.target.reset(); loadInitialData(); }
  });

  // Producto - registrar
  document.getElementById('productoForm').addEventListener('submit', async e => {
    e.preventDefault();
    const data = {
      action: 'agregarProducto',
      codigo: document.getElementById('p_codigo').value,
      nombre: document.getElementById('p_nombre').value,
      categoria: document.getElementById('p_categoria').value,
      precio_compra: document.getElementById('p_precio_compra').value,
      precio_venta: document.getElementById('p_precio_venta').value,
      stock: document.getElementById('p_stock').value,
      stock_minimo: document.getElementById('p_stock_minimo').value,
      usuario: currentUser.usuario
    };
    const res = await postAction(data);
    showStatus('statusProducto', res.status, res.message);
    if (res.status === 'success') { e.target.reset(); document.getElementById('p_stock_minimo').value = 5; showToast('Producto registrado', 'success'); }
  });

  // Compras/Ventas - búsqueda con debounce
  document.getElementById('co_query').addEventListener('input', e => handleQueryFilter(e.target.value, 'co'));
  document.getElementById('v_query').addEventListener('input', e => handleQueryFilter(e.target.value, 'v'));

  document.getElementById('compraForm').addEventListener('submit', e => handleTransactionPost(e, 'compra'));
  document.getElementById('ventaForm').addEventListener('submit', e => handleTransactionPost(e, 'venta'));

  // Gasto
  document.getElementById('gastoForm').addEventListener('submit', async e => {
    e.preventDefault();
    const data = {
      action: 'agregarGasto',
      descripcion: document.getElementById('g_descripcion').value,
      monto: document.getElementById('g_monto').value,
      categoria: document.getElementById('g_categoria').value,
      usuario: currentUser.usuario
    };
    const res = await postAction(data);
    showStatus('statusGasto', res.status, res.message);
    if (res.status === 'success') { e.target.reset(); cargarGastos(); showToast('Gasto registrado', 'success'); }
  });

  // Caja
  document.getElementById('btn_cerrarCaja').addEventListener('click', ejecutarCierreCaja);

  // Dashboard / Inventario botones
  document.getElementById('cargarDatosGraficosBtn').addEventListener('click', handleLoadDashboard);
  document.getElementById('cargarInventarioBtn').addEventListener('click', loadInventario);
}

// Configura modales (cerrar con click fuera, X, escáner)
function setupModals() {
  document.querySelectorAll('.modal-close, .close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.id === 'closeScanner') closeScannerModal();
      else {
        const modal = btn.closest('.modal');
        if (modal) cerrarModal(modal.id);
      }
    });
  });

  // Cerrar modal con click fuera
  document.addEventListener('click', e => {
    document.querySelectorAll('.modal.active, .modal:not(.hidden)').forEach(modal => {
      if (e.target === modal) {
        if (modal.id === 'scannerModal') closeScannerModal();
        else cerrarModal(modal.id);
      }
    });
  });

  // Formulario de edición de producto
  const editForm = document.getElementById('editProductoForm');
  if (editForm) {
    editForm.addEventListener('submit', e => {
      e.preventDefault();
      guardarEdicionProducto();
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// DATOS INICIALES
// ═══════════════════════════════════════════════════════════════
async function loadInitialData() {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=getCategorias`);
    const data = await res.json();
    if (data.status === 'success') populateCategories(data.data);
    else populateCategories([]);
  } catch(e) {
    populateCategories([]);
  }

  // Cargar clientes y proveedores para datalists
  cargarDatalistClientes();
  cargarDatalistProveedores();
}

function populateCategories(cats) {
  const selects = [
    document.getElementById('p_categoria'),
    document.getElementById('ep_categoria')
  ];
  const list = document.getElementById('listaCategorias');

  selects.forEach(sel => {
    if (!sel) return;
    const seleccionado = sel.value;
    sel.innerHTML = '<option value="" disabled selected>Seleccione categoría</option>';
    cats.forEach(c => {
      const name = c.nombre || `(${c.id})`;
      sel.innerHTML += `<option value="${name}">${name}</option>`;
    });
    if (seleccionado) sel.value = seleccionado;
  });

  // Actualizar filtro de categorías en inventario
  const catFilter = document.getElementById('f_categoria');
  if (catFilter) {
    catFilter.innerHTML = '<option value="">Todas las Categorías</option>';
    cats.forEach(c => {
      const name = c.nombre || `(${c.id})`;
      catFilter.innerHTML += `<option value="${name}">${name}</option>`;
    });
  }

  if (list) {
    if (cats.length === 0) { list.innerHTML = '<li>No hay categorías.</li>'; return; }
    list.innerHTML = cats.map(c => `
      <li class="categoria-item">
        <span><b>${c.nombre}</b> <small style="color:var(--text-muted)">${c.id}</small></span>
        ${currentUser && currentUser.rol === 'admin' ?
          `<button onclick="eliminarCategoriaUI('${c.id}','${c.nombre}')" class="btn-icon danger">
            <i class="fas fa-trash"></i>
          </button>` : ''}
      </li>
    `).join('');
  }
}

async function eliminarCategoriaUI(id, nombre) {
  if (!confirm(`¿Eliminar categoría "${nombre}"?`)) return;
  const res = await postAction({ action:'eliminarCategoria', id, usuario: currentUser.usuario });
  showToast(res.message, res.status);
  if (res.status === 'success') loadInitialData();
}

async function cargarDatalistClientes() {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=getClientes`);
    const data = await res.json();
    const dl = document.getElementById('listClientes');
    if (dl && data.status === 'success') {
      dl.innerHTML = data.data.map(c => `<option value="${c.nombre}">`).join('');
      cachedClientes = data.data;
    }
  } catch(e) {}
}

async function cargarDatalistProveedores() {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=getProveedores`);
    const data = await res.json();
    const dl = document.getElementById('listProveedores');
    if (dl && data.status === 'success') {
      dl.innerHTML = data.data.map(p => `<option value="${p.nombre}">`).join('');
      cachedProveedores = data.data;
    }
  } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════
async function handleLoadDashboard() {
  showStatus('statusDashboard', 'info', 'Cargando dashboard...');
  try {
    const res  = await fetch(`${SCRIPT_URL}?action=getDashboard`);
    const data = await res.json();

    if (data.status !== 'success') {
      showStatus('statusDashboard', 'error', data.message);
      return;
    }

    const d = data.data;

    // Actualizar stats
    document.getElementById('totalVentas').textContent    = `$${(d.totales.ventas||0).toFixed(2)}`;
    document.getElementById('totalCompras').textContent   = `$${(d.totales.compras||0).toFixed(2)}`;
    document.getElementById('totalGastos').textContent    = `$${(d.totales.gastos||0).toFixed(2)}`;
    document.getElementById('totalGanancias').textContent = `$${(d.totales.ganancias||0).toFixed(2)}`;
    document.getElementById('ventasHoy').textContent      = `$${(d.totales.ventasHoy||0).toFixed(2)}`;
    document.getElementById('ventasMes').textContent      = `$${(d.totales.ventasMes||0).toFixed(2)}`;

    // Color ganancias
    const gEl = document.getElementById('totalGanancias');
    gEl.style.color = d.totales.ganancias > 0 ? 'var(--success-color)'
                    : d.totales.ganancias < 0 ? 'var(--danger-color)' : 'var(--text-muted)';

    // Alertas stock bajo
    renderStockAlerts(d.stockBajo, d.productosAgotados);

    // Top productos
    renderTopProductos(d.topProductos);

    // Stock crítico
    renderStockCritico(d.stockBajo);

    // Gráficos
    if (d.grafico && d.grafico.length > 0) renderCharts(d.grafico);

    showStatus('statusDashboard', 'success', 'Dashboard actualizado.');
    setTimeout(() => document.getElementById('statusDashboard').classList.add('hidden'), 3000);

  } catch(e) {
    showStatus('statusDashboard', 'error', `Error: ${e.message}`);
  }
}

function renderStockAlerts(stockBajo, agotados) {
  const container = document.getElementById('stockAlerts');
  if ((!stockBajo || stockBajo.length === 0) && !agotados) {
    container.classList.add('hidden');
    return;
  }
  container.classList.remove('hidden');
  let html = '';
  if (agotados > 0) html += `<div class="alert-item danger"><i class="fas fa-times-circle"></i> <b>${agotados}</b> producto(s) agotado(s)</div>`;
  if (stockBajo && stockBajo.length > 0) {
    stockBajo.forEach(p => {
      html += `<div class="alert-item warning"><i class="fas fa-exclamation-triangle"></i> <b>${p.nombre}</b> — Stock: ${p.stock}/${p.stock_minimo||5}</div>`;
    });
  }
  container.innerHTML = `<div class="alerts-wrap">${html}</div>`;
}

function renderTopProductos(top) {
  const el = document.getElementById('topProductos');
  if (!top || top.length === 0) { el.innerHTML = '<p class="text-muted">Sin datos de ventas aún.</p>'; return; }
  el.innerHTML = top.map((p, i) => `
    <div class="top-item">
      <span class="top-rank">${i+1}</span>
      <span class="top-name">${p.nombre}</span>
      <span class="top-value">${p.vendidos} uds</span>
    </div>
  `).join('');
}

function renderStockCritico(stockBajo) {
  const el = document.getElementById('stockCritico');
  if (!stockBajo || stockBajo.length === 0) { el.innerHTML = '<p class="text-muted" style="color:var(--success-color)"><i class="fas fa-check-circle"></i> Todo el stock está bien.</p>'; return; }
  el.innerHTML = stockBajo.map(p => `
    <div class="top-item">
      <span class="badge badge-danger">${p.stock}</span>
      <span class="top-name">${p.nombre}</span>
    </div>
  `).join('');
}

function renderCharts(data) {
  const labels    = data.map(r => r.fecha);
  const ventas    = data.map(r => r.ventas   || 0);
  const compras   = data.map(r => r.compras  || 0);
  const ganancias = data.map(r => r.ganancia || 0);

  const ctx1 = document.getElementById('resumenFinancieroChart').getContext('2d');
  if (resumenFinancieroChart) resumenFinancieroChart.destroy();
  resumenFinancieroChart = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Ventas',    data:ventas,   backgroundColor:'rgba(5,93,226,0.7)',   borderColor:'rgba(5,93,226,1)',   borderWidth:1 },
        { label:'Compras',   data:compras,  backgroundColor:'rgba(23,162,184,0.7)', borderColor:'rgba(23,162,184,1)', borderWidth:1 },
        { label:'Ganancias', data:ganancias,type:'line', fill:false, backgroundColor:'rgba(40,167,69,0.7)', borderColor:'rgba(40,167,69,1)', borderWidth:2, tension:0.1 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        title:{ display:true, text:'Resumen Financiero - Ventas, Compras y Ganancias' },
        tooltip:{ mode:'index', intersect:false }
      },
      scales:{ y:{ beginAtZero:true, title:{ display:true, text:'Monto ($)' } } }
    }
  });

  const ctx2 = document.getElementById('tendenciasChart').getContext('2d');
  if (tendenciasChart) tendenciasChart.destroy();
  tendenciasChart = new Chart(ctx2, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label:'Ventas Acumuladas',  data:ventas.reduce((a,c,i)=>[...a,(a[i-1]||0)+c],[]),  borderColor:'rgba(5,93,226,1)',  backgroundColor:'rgba(5,93,226,0.1)',  tension:0.1, fill:true },
        { label:'Compras Acumuladas', data:compras.reduce((a,c,i)=>[...a,(a[i-1]||0)+c],[]), borderColor:'rgba(23,162,184,1)',backgroundColor:'rgba(23,162,184,0.1)',tension:0.1, fill:true }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ title:{ display:true, text:'Tendencias Acumuladas - Ventas vs Compras' } },
      scales:{ y:{ beginAtZero:true, title:{ display:true, text:'Monto Acumulado ($)' } } }
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// INVENTARIO (con filtros avanzados - Fase 7)
// ═══════════════════════════════════════════════════════════════
async function loadInventario() {
  const tbody = document.getElementById('inventarioTableBody');
  showStatus('statusInventario','info','Cargando inventario desde el servidor...');
  tbody.innerHTML = '<tr><td colspan="8" class="text-center">Cargando inventario...</td></tr>';

  try {
    const res  = await fetch(`${SCRIPT_URL}?action=getInventario`);
    const data = await res.json();

    if (data.status === 'success' && data.data) {
      cachedInventario = data.data.filter(p => p.activo !== false && p.activo !== 'false' && p.activo !== 0);
      inventarioGlobal = cachedInventario;
      showStatus('statusInventario','success',`${cachedInventario.length} productos cargados.`);
      setTimeout(() => document.getElementById('statusInventario').classList.add('hidden'), 2500);
      filtrarInventario();
    } else {
      cachedInventario = []; inventarioGlobal = [];
      showStatus('statusInventario','warning', data.message || 'Sin productos.');
      tbody.innerHTML = '<tr><td colspan="8">No hay productos.</td></tr>';
    }
  } catch(e) {
    showStatus('statusInventario','error',`Error: ${e.message}`);
    tbody.innerHTML = '<tr><td colspan="8">Error al cargar.</td></tr>';
  }
}

// Filtra el inventario en milisegundos sin ir al servidor
function filtrarInventario() {
  const tbody = document.getElementById('inventarioTableBody');

  const texto       = (document.getElementById('f_texto')?.value || '').toLowerCase().trim();
  const cat         = document.getElementById('f_categoria')?.value || '';
  const stockFilter = document.getElementById('f_stock')?.value || '';
  const pMin        = parseFloat(document.getElementById('f_min_precio')?.value) || 0;
  const pMax        = parseFloat(document.getElementById('f_max_precio')?.value) || Infinity;

  const filtrados = inventarioGlobal.filter(p => {
    const nombre = String(p.nombre||'').toLowerCase();
    const codigo = String(p.código||'').toLowerCase();
    const stock  = parseInt(p.stock) || 0;
    const limite = parseInt(p.stock_minimo) || 5;
    const precioVenta = parseFloat(p.precio_venta) || 0;

    const matchTexto  = !texto || nombre.includes(texto) || codigo.includes(texto);
    const matchCat    = !cat || p.categoría === cat;
    const matchPrecio = precioVenta >= pMin && precioVenta <= pMax;

    let matchStock = true;
    if (stockFilter === 'bajo')    matchStock = stock > 0 && stock <= limite;
    if (stockFilter === 'agotado') matchStock = stock === 0;
    if (stockFilter === 'ok')      matchStock = stock > limite;

    return matchTexto && matchCat && matchPrecio && matchStock;
  });

  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">No se encontraron productos con estos filtros.</td></tr>';
    return;
  }

  const canEdit = ['admin','empleado'].includes(currentUser?.rol);
  const isAdmin = currentUser?.rol === 'admin';

  tbody.innerHTML = filtrados.map(p => {
    const stock  = parseInt(p.stock) || 0;
    const limite = parseInt(p.stock_minimo) || 5;
    let sClass = 'success', rClass = '';
    if (stock <= 0) { sClass = 'danger'; rClass = 'row-alert'; }
    else if (stock <= limite) sClass = 'warning';

    let acciones = '';
    if (canEdit) acciones += `<button onclick='abrirEditarProducto(${JSON.stringify(p).replace(/'/g,"&#39;")})' class="btn-icon primary" title="Editar"><i class="fas fa-edit"></i></button>`;
    if (isAdmin) acciones += `<button onclick="confirmarEliminarProducto('${p.id}','${(p.nombre||'').replace(/'/g,"\\'")}')" class="btn-icon danger" title="Eliminar"><i class="fas fa-trash"></i></button>`;

    return `
      <tr class="${rClass}">
        <td><small style="color:var(--text-muted)">${p.id}</small></td>
        <td><strong>${p.nombre}</strong></td>
        <td><span style="background:var(--primary-light); padding:2px 6px; border-radius:4px">${p.código}</span></td>
        <td>${p.categoría}</td>
        <td><span class="badge-stock ${sClass}">${stock}</span></td>
        <td>$${parseFloat(p.precio_compra||0).toFixed(2)}</td>
        <td>$${parseFloat(p.precio_venta||0).toFixed(2)}</td>
        <td class="acciones-td">${acciones || '—'}</td>
      </tr>`;
  }).join('');
}

function abrirEditarProducto(p) {
  document.getElementById('ep_id').value           = p.id;
  document.getElementById('ep_codigo').value        = p['código'] || p.codigo || '';
  document.getElementById('ep_nombre').value        = p.nombre || '';
  document.getElementById('ep_precio_compra').value = parseFloat(p.precio_compra||0).toFixed(2);
  document.getElementById('ep_precio_venta').value  = parseFloat(p.precio_venta||0).toFixed(2);
  document.getElementById('ep_stock').value         = p.stock || 0;
  document.getElementById('ep_stock_minimo').value  = p.stock_minimo || 5;

  // Categoría
  const sel = document.getElementById('ep_categoria');
  for (let opt of sel.options) { if (opt.value === p['categoría']) { opt.selected = true; break; } }

  abrirModal('modalEditarProducto');
}

async function guardarEdicionProducto() {
  const data = {
    action: 'editarProducto',
    id: document.getElementById('ep_id').value,
    codigo: document.getElementById('ep_codigo').value,
    nombre: document.getElementById('ep_nombre').value,
    categoria: document.getElementById('ep_categoria').value,
    precio_compra: document.getElementById('ep_precio_compra').value,
    precio_venta: document.getElementById('ep_precio_venta').value,
    stock: document.getElementById('ep_stock').value,
    stock_minimo: document.getElementById('ep_stock_minimo').value,
    usuario: currentUser.usuario
  };
  const res = await postAction(data);
  showToast(res.message, res.status);
  if (res.status === 'success') { cerrarModal('modalEditarProducto'); loadInventario(); }
}

async function confirmarEliminarProducto(id, nombre) {
  if (!confirm(`¿Eliminar "${nombre}"? Será movido a la papelera.`)) return;
  const res = await postAction({ action:'eliminarProducto', id, usuario: currentUser.usuario });
  showToast(res.message, res.status);
  if (res.status === 'success') loadInventario();
}

// ═══════════════════════════════════════════════════════════════
// ESCÁNER DE CÓDIGO DE BARRAS / QR (Fase 7)
// ═══════════════════════════════════════════════════════════════
function openScanner(prefix) {
  document.getElementById('scannerModal').classList.remove('hidden');
  document.getElementById('scannerModal').classList.add('active');

  html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 150 } }, false);
  html5QrcodeScanner.render((decodedText) => {
    const input = document.getElementById(`${prefix}_codigo`) || document.getElementById(`${prefix}_query`);
    if (input) {
      input.value = decodedText;
      if (input.id.endsWith('_query')) handleQueryFilter(decodedText, prefix);
      else input.dispatchEvent(new Event('input'));
    }
    closeScannerModal();
    showToast('Código escaneado', 'success');
  }, () => { /* Ignorar errores de lectura de frames */ });
}

function closeScannerModal() {
  const modal = document.getElementById('scannerModal');
  modal.classList.remove('active');
  modal.classList.add('hidden');
  if (html5QrcodeScanner) {
    html5QrcodeScanner.clear().catch(() => {});
    html5QrcodeScanner = null;
  }
}

// ═══════════════════════════════════════════════════════════════
// COMPRAS / VENTAS (con búsqueda con debounce e impresión de ticket)
// ═══════════════════════════════════════════════════════════════
async function handleQueryFilter(query, prefix) {
  const detailDiv = document.getElementById(`${prefix}_product_details`);
  const submitBtn = document.getElementById(`${prefix}_submit_btn`);
  const idInput   = document.getElementById(`${prefix}_producto_id`);

  detailDiv.classList.add('hidden');
  detailDiv.innerHTML = '';
  idInput.value = '';
  submitBtn.disabled = true;
  if (query.length < 2) return;

  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    try {
      const res  = await fetch(`${SCRIPT_URL}?action=buscarProducto&query=${encodeURIComponent(query)}`);
      const data = await res.json();

      if (data.status === 'success' && data.data && data.data.length > 0) {
        const product = data.data[0];
        productDataCache[product.id] = product;
        updateProductDetails(product, detailDiv, prefix);
        idInput.value = product.id;
        submitBtn.disabled = false;
        if (String(product.código) === query.trim()) {
          document.getElementById(`${prefix}_cantidad`).focus();
        }
      } else {
        detailDiv.classList.remove('hidden');
        detailDiv.innerHTML = `<p style="color:var(--danger-color)"><i class="fas fa-exclamation-triangle"></i> ${data.message || 'No encontrado'}</p>`;
      }
    } catch(e) {
      detailDiv.classList.remove('hidden');
      detailDiv.innerHTML = `<p style="color:var(--danger-color)">Error: ${e.message}</p>`;
    }
  }, 350);
}

function updateProductDetails(product, detailDiv, prefix) {
  detailDiv.classList.remove('hidden');
  const isCompra  = prefix === 'co';
  const price     = isCompra ? product.precio_compra : product.precio_venta;
  const priceLabel= isCompra ? 'Precio Compra' : 'Precio Venta';
  const limite    = parseInt(product.stock_minimo) || 5;
  const stockStyle= product.stock <= limite ? 'color:var(--danger-color);font-weight:bold' : 'color:var(--success-color);font-weight:bold';

  detailDiv.innerHTML = `
    <p><b>Producto:</b> ${product.nombre} | <b>Cód:</b> ${product.código} | <b>Categoría:</b> ${product.categoría}</p>
    <p><b>Stock actual:</b> <span style="${stockStyle}">${product.stock}</span> &nbsp; <b>${priceLabel}:</b> $${parseFloat(price).toFixed(2)}</p>
    ${(!isCompra && product.stock <= limite) ? `<p style="color:var(--warning-color)"><i class="fas fa-exclamation-triangle"></i> Stock bajo.</p>` : ''}
  `;
  document.getElementById(`${prefix}_precio_${isCompra ? 'compra' : 'venta'}`).value = parseFloat(price).toFixed(2);
}

async function handleTransactionPost(e, type) {
  e.preventDefault();
  const prefix     = type === 'compra' ? 'co' : 'v';
  const statusId   = type === 'compra' ? 'statusCompra' : 'statusVenta';
  const submitBtn  = document.getElementById(`${prefix}_submit_btn`);
  const productoId = document.getElementById(`${prefix}_producto_id`).value;

  if (!productoId) { showStatus(statusId,'error','Selecciona un producto primero.'); return; }

  submitBtn.disabled = true;
  showStatus(statusId,'info',`Registrando ${type}...`);

  const cantidad = document.getElementById(`${prefix}_cantidad`).value;
  const precio   = document.getElementById(`${prefix}_precio_${type==='compra'?'compra':'venta'}`).value;
  const extra    = document.getElementById(`${prefix}_${type==='compra'?'proveedor':'cliente'}`).value;

  const data = {
    action: 'registrarTransaccion',
    producto_id: productoId,
    cantidad, precio, type,
    extra_data: extra,
    usuario: currentUser.usuario
  };

  const res = await postAction(data);
  showStatus(statusId, res.status, res.message);

  if (res.status === 'success') {
    // Imprimir ticket en ventas
    if (type === 'venta' && res.data && res.data.ticket_id) {
      const nombreProd = res.data.producto || productDataCache[productoId]?.nombre || '';
      imprimirTicket(res.data.ticket_id, nombreProd, cantidad, cantidad * precio, extra);
    }
    e.target.reset();
    document.getElementById(`${prefix}_cantidad`).value = 1;
    delete productDataCache[productoId];
    document.getElementById(`${prefix}_product_details`).classList.add('hidden');
    showToast(res.message, 'success');
    if (type === 'venta') loadInventario(); // refresca stock para futuras búsquedas
  }
  submitBtn.disabled = false;
}

function imprimirTicket(transId, nombreProd, cant, total, cliente) {
  document.getElementById('t_fecha').innerText   = new Date().toLocaleString('es-SV');
  document.getElementById('t_id').innerText      = transId;
  document.getElementById('t_cliente').innerText = cliente || 'Mostrador';
  document.getElementById('t_items').innerHTML   = `<tr><td>${cant}</td><td>${nombreProd}</td><td>$${parseFloat(total).toFixed(2)}</td></tr>`;
  document.getElementById('t_total').innerText   = parseFloat(total).toFixed(2);
  window.print();
}

// ═══════════════════════════════════════════════════════════════
// CLIENTES
// ═══════════════════════════════════════════════════════════════
async function cargarClientes() {
  const res  = await fetch(`${SCRIPT_URL}?action=getClientes`);
  const data = await res.json();
  cachedClientes = data.status === 'success' ? data.data : [];
  const tbody = document.getElementById('clientesTableBody');
  const canEdit = ['admin','empleado'].includes(currentUser?.rol);

  if (!cachedClientes.length) {
    tbody.innerHTML = '<tr><td colspan="6">No hay clientes registrados.</td></tr>';
    return;
  }
  tbody.innerHTML = cachedClientes.map(c => `
    <tr>
      <td><small>${c.id}</small></td>
      <td><b>${c.nombre}</b></td>
      <td>${c.telefono||'—'}</td>
      <td>${c.correo||'—'}</td>
      <td>${c.direccion||'—'}</td>
      <td class="acciones-td">
        ${canEdit ? `<button onclick='abrirEditarCliente(${JSON.stringify(c).replace(/'/g,"&#39;")})' class="btn-icon primary"><i class="fas fa-edit"></i></button>` : ''}
        ${currentUser?.rol === 'admin' ? `<button onclick="eliminarClienteUI('${c.id}')" class="btn-icon danger"><i class="fas fa-trash"></i></button>` : ''}
      </td>
    </tr>`).join('');
}

function abrirModalNuevoCliente() {
  document.getElementById('cl_id').value        = '';
  document.getElementById('cl_nombre').value    = '';
  document.getElementById('cl_telefono').value  = '';
  document.getElementById('cl_correo').value    = '';
  document.getElementById('cl_direccion').value = '';
  document.getElementById('modalClienteTitulo').innerHTML = '<i class="fas fa-user-plus"></i> Nuevo Cliente';
  abrirModal('modalCliente');
}

function abrirEditarCliente(c) {
  document.getElementById('cl_id').value        = c.id;
  document.getElementById('cl_nombre').value    = c.nombre;
  document.getElementById('cl_telefono').value  = c.telefono||'';
  document.getElementById('cl_correo').value    = c.correo||'';
  document.getElementById('cl_direccion').value = c.direccion||'';
  document.getElementById('modalClienteTitulo').innerHTML = '<i class="fas fa-edit"></i> Editar Cliente';
  abrirModal('modalCliente');
}

async function guardarCliente() {
  const id = document.getElementById('cl_id').value;
  const data = {
    action: id ? 'editarCliente' : 'agregarCliente',
    id, nombre: document.getElementById('cl_nombre').value,
    telefono: document.getElementById('cl_telefono').value,
    correo: document.getElementById('cl_correo').value,
    direccion: document.getElementById('cl_direccion').value,
    usuario: currentUser.usuario
  };
  const res = await postAction(data);
  showToast(res.message, res.status);
  if (res.status === 'success') { cerrarModal('modalCliente'); cargarClientes(); cargarDatalistClientes(); }
}

async function eliminarClienteUI(id) {
  if (!confirm('¿Eliminar este cliente?')) return;
  const res = await postAction({ action:'eliminarCliente', id, usuario: currentUser.usuario });
  showToast(res.message, res.status);
  if (res.status === 'success') { cargarClientes(); cargarDatalistClientes(); }
}

// ═══════════════════════════════════════════════════════════════
// PROVEEDORES
// ═══════════════════════════════════════════════════════════════
async function cargarProveedores() {
  const res  = await fetch(`${SCRIPT_URL}?action=getProveedores`);
  const data = await res.json();
  cachedProveedores = data.status === 'success' ? data.data : [];
  const tbody = document.getElementById('proveedoresTableBody');
  const canEdit = ['admin','empleado'].includes(currentUser?.rol);

  if (!cachedProveedores.length) {
    tbody.innerHTML = '<tr><td colspan="7">No hay proveedores registrados.</td></tr>';
    return;
  }
  tbody.innerHTML = cachedProveedores.map(p => `
    <tr>
      <td><small>${p.id}</small></td>
      <td><b>${p.nombre}</b></td>
      <td>${p.empresa||'—'}</td>
      <td>${p.telefono||'—'}</td>
      <td>${p.correo||'—'}</td>
      <td>${p.direccion||'—'}</td>
      <td class="acciones-td">
        ${canEdit ? `<button onclick='abrirEditarProveedor(${JSON.stringify(p).replace(/'/g,"&#39;")})' class="btn-icon primary"><i class="fas fa-edit"></i></button>` : ''}
        ${currentUser?.rol === 'admin' ? `<button onclick="eliminarProveedorUI('${p.id}')" class="btn-icon danger"><i class="fas fa-trash"></i></button>` : ''}
      </td>
    </tr>`).join('');
}

function abrirModalNuevoProveedor() {
  document.getElementById('pv_id').value        = '';
  document.getElementById('pv_nombre').value    = '';
  document.getElementById('pv_empresa').value   = '';
  document.getElementById('pv_telefono').value  = '';
  document.getElementById('pv_correo').value    = '';
  document.getElementById('pv_direccion').value = '';
  document.getElementById('modalProveedorTitulo').innerHTML = '<i class="fas fa-building"></i> Nuevo Proveedor';
  abrirModal('modalProveedor');
}

function abrirEditarProveedor(p) {
  document.getElementById('pv_id').value        = p.id;
  document.getElementById('pv_nombre').value    = p.nombre;
  document.getElementById('pv_empresa').value   = p.empresa||'';
  document.getElementById('pv_telefono').value  = p.telefono||'';
  document.getElementById('pv_correo').value    = p.correo||'';
  document.getElementById('pv_direccion').value = p.direccion||'';
  document.getElementById('modalProveedorTitulo').innerHTML = '<i class="fas fa-edit"></i> Editar Proveedor';
  abrirModal('modalProveedor');
}

async function guardarProveedor() {
  const id = document.getElementById('pv_id').value;
  const data = {
    action: id ? 'editarProveedor' : 'agregarProveedor',
    id, nombre: document.getElementById('pv_nombre').value,
    empresa: document.getElementById('pv_empresa').value,
    telefono: document.getElementById('pv_telefono').value,
    correo: document.getElementById('pv_correo').value,
    direccion: document.getElementById('pv_direccion').value,
    usuario: currentUser.usuario
  };
  const res = await postAction(data);
  showToast(res.message, res.status);
  if (res.status === 'success') { cerrarModal('modalProveedor'); cargarProveedores(); cargarDatalistProveedores(); }
}

async function eliminarProveedorUI(id) {
  if (!confirm('¿Eliminar este proveedor?')) return;
  const res = await postAction({ action:'eliminarProveedor', id, usuario: currentUser.usuario });
  showToast(res.message, res.status);
  if (res.status === 'success') { cargarProveedores(); cargarDatalistProveedores(); }
}

// ═══════════════════════════════════════════════════════════════
// GASTOS
// ═══════════════════════════════════════════════════════════════
async function cargarGastos() {
  const res  = await fetch(`${SCRIPT_URL}?action=getGastos`);
  const data = await res.json();
  cachedGastos = data.status === 'success' ? data.data : [];
  const tbody = document.getElementById('gastosTableBody');
  const isAdmin = currentUser?.rol === 'admin';

  if (!cachedGastos.length) {
    tbody.innerHTML = '<tr><td colspan="7">No hay gastos registrados.</td></tr>';
    return;
  }
  tbody.innerHTML = cachedGastos.map(g => `
    <tr>
      <td><small>${g.id}</small></td>
      <td>${g.descripcion}</td>
      <td><b>$${parseFloat(g.monto||0).toFixed(2)}</b></td>
      <td>${formatFecha(g.fecha)}</td>
      <td>${g.categoria||'—'}</td>
      <td>${g.usuario||'—'}</td>
      <td>${isAdmin ? `<button onclick="eliminarGastoUI('${g.id}')" class="btn-icon danger"><i class="fas fa-trash"></i></button>` : '—'}</td>
    </tr>`).join('');
}

async function eliminarGastoUI(id) {
  if (!confirm('¿Eliminar este gasto?')) return;
  const res = await postAction({ action:'eliminarGasto', id, usuario: currentUser.usuario });
  showToast(res.message, res.status);
  if (res.status === 'success') cargarGastos();
}

// ═══════════════════════════════════════════════════════════════
// CORTE DE CAJA
// ═══════════════════════════════════════════════════════════════
async function loadCaja() {
  try {
    const res  = await fetch(`${SCRIPT_URL}?action=getCajaResumen`);
    const data = await res.json();
    if (data.status !== 'success') { showToast('Error al cargar caja.', 'error'); return; }

    const d = data.data;
    cajaCalculoTemporal = { ventas: d.ventasHoy, gastos: d.gastosHoy };

    document.getElementById('caja_ventas').textContent = `$${d.ventasHoy.toFixed(2)}`;
    document.getElementById('caja_gastos').textContent = `$${d.gastosHoy.toFixed(2)}`;
    document.getElementById('caja_neto').textContent   = `$${d.efectivoEsperado.toFixed(2)}`;

    const tbody = document.getElementById('historialCajaBody');
    if (d.historial && d.historial.length) {
      tbody.innerHTML = [...d.historial].reverse().map(c => `
        <tr>
          <td>${formatFecha(c.fecha)}</td>
          <td>${c.usuario}</td>
          <td>$${parseFloat(c.total_ventas||0).toFixed(2)}</td>
          <td>$${parseFloat(c.total_gastos||0).toFixed(2)}</td>
          <td><b>$${parseFloat(c.efectivo_final||0).toFixed(2)}</b></td>
        </tr>`).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="5">Sin cortes registrados.</td></tr>';
    }
  } catch(e) {
    showToast('Error al calcular caja.', 'error');
  }
}

async function ejecutarCierreCaja() {
  if (!confirm('¿Seguro que quieres hacer el cierre de caja? Esto guardará los totales del día.')) return;
  const btn = document.getElementById('btn_cerrarCaja');
  btn.disabled = true;
  try {
    const req = {
      action: 'cerrarCaja',
      usuario: currentUser.usuario,
      total_ventas: cajaCalculoTemporal.ventas,
      total_gastos: cajaCalculoTemporal.gastos
    };
    const res = await postAction(req);
    showStatus('statusCaja', res.status, res.message);
    if (res.status === 'success') { showToast(res.message, 'success'); loadCaja(); }
    else showToast(res.message, res.status);
  } catch(e) {
    showStatus('statusCaja','error','Error al cerrar caja.');
  } finally {
    btn.disabled = false;
  }
}

// ═══════════════════════════════════════════════════════════════
// PAPELERA
// ═══════════════════════════════════════════════════════════════
async function cargarPapelera() {
  const res  = await fetch(`${SCRIPT_URL}?action=getPapelera`);
  const data = await res.json();
  const tbody = document.getElementById('papeleraTableBody');

  if (data.status !== 'success' || !data.data.length) {
    tbody.innerHTML = '<tr><td colspan="6">La papelera está vacía.</td></tr>';
    return;
  }
  tbody.innerHTML = data.data.map(item => {
    let datosStr = item.datos_originales;
    try { const d = JSON.parse(datosStr); datosStr = `${d.nombre} (Cód: ${d['código']||d.codigo||'—'})`; } catch(e) {}
    return `
      <tr>
        <td><small>${item.id}</small></td>
        <td>${item.tipo}</td>
        <td>${datosStr}</td>
        <td>${formatFecha(item.fecha_eliminado)}</td>
        <td>${item.eliminado_por}</td>
        <td>
          <button onclick="restaurarDesPapelera('${item.id}')" class="btn secondary-btn" style="height:32px;min-width:auto;padding:0 12px;font-size:0.8rem">
            <i class="fas fa-undo"></i> Restaurar
          </button>
        </td>
      </tr>`;
  }).join('');
}

async function restaurarDesPapelera(papeleraId) {
  if (!confirm('¿Restaurar este elemento al inventario?')) return;
  const res = await postAction({ action:'restaurarProducto', papelera_id: papeleraId, usuario: currentUser.usuario });
  showToast(res.message, res.status);
  if (res.status === 'success') { cargarPapelera(); loadInventario(); }
}

// ═══════════════════════════════════════════════════════════════
// RESÚMENES Y REPORTES
// ═══════════════════════════════════════════════════════════════
const RESUMEN_SHEET_MAP = { 'Ventas':'Ventas', 'Compras':'Compras', 'Gastos':'Gastos', 'Actividad':'Actividad' };

async function loadSummary(nombre) {
  showStatus('statusResumen','info',`Cargando ${nombre}...`);
  const table  = document.getElementById('resumenTable');
  const thead  = document.getElementById('resumenTableHead');
  const tbody  = document.getElementById('resumenTableBody');
  table.classList.add('hidden');

  const sheetName = RESUMEN_SHEET_MAP[nombre] || nombre;
  const res  = await fetch(`${SCRIPT_URL}?action=getData&sheetName=${sheetName}`);
  const data = await res.json();

  if (data.status === 'success' && data.data.length > 0) {
    showStatus('statusResumen','success',`${data.data.length} registros.`);
    table.classList.remove('hidden');
    thead.innerHTML = `<tr>${Object.keys(data.data[0]).map(h=>`<th>${h.toUpperCase()}</th>`).join('')}</tr>`;
    // Más reciente primero si hay fecha
    const filas = data.data.slice().reverse();
    tbody.innerHTML = filas.map(row =>
      `<tr>${Object.values(row).map(v => `<td>${v instanceof Date ? formatFecha(v) : typeof v==='number' ? v.toFixed(2) : (isFechaISO(v) ? formatFecha(v) : v)}</td>`).join('')}</tr>`
    ).join('');
  } else {
    showStatus('statusResumen','warning','No hay datos.');
  }
}

function isFechaISO(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v);
}

// ═══════════════════════════════════════════════════════════════
// ACTIVIDAD
// ═══════════════════════════════════════════════════════════════
async function cargarActividad() {
  const res  = await fetch(`${SCRIPT_URL}?action=getActividad`);
  const data = await res.json();
  const tbody = document.getElementById('actividadTableBody');

  if (data.status !== 'success' || !data.data.length) {
    tbody.innerHTML = '<tr><td colspan="4">No hay actividad registrada.</td></tr>';
    return;
  }
  // Mostrar más reciente primero
  const sorted = [...data.data].reverse();
  tbody.innerHTML = sorted.map(a => `
    <tr>
      <td>${formatFecha(a.fecha)}</td>
      <td><b>${a.usuario}</b></td>
      <td><span class="badge badge-primary" style="font-size:0.7rem">${a.accion}</span></td>
      <td>${a.detalle}</td>
    </tr>`).join('');
}

// ═══════════════════════════════════════════════════════════════
// USUARIOS
// ═══════════════════════════════════════════════════════════════
async function cargarUsuarios() {
  const res  = await fetch(`${SCRIPT_URL}?action=getUsuarios`);
  const data = await res.json();
  const tbody = document.getElementById('usuariosTableBody');

  if (data.status !== 'success' || !data.data.length) {
    tbody.innerHTML = '<tr><td colspan="6">No hay usuarios.</td></tr>';
    return;
  }
  tbody.innerHTML = data.data.map(u => {
    const rolLabel = { admin:'Administrador', empleado:'Empleado', lectura:'Solo Lectura' };
    const rolClass = u.rol === 'admin' ? 'badge-danger' : u.rol === 'empleado' ? 'badge-primary' : 'badge-warning';
    const activo   = u.activo !== false && u.activo !== 'false' && u.activo !== 0;
    return `
      <tr>
        <td><small>${u.id}</small></td>
        <td><b>${u.usuario}</b></td>
        <td><span class="badge ${rolClass}">${rolLabel[u.rol]||u.rol}</span></td>
        <td><span class="badge ${activo?'badge-success':'badge-danger'}">${activo?'Activo':'Inactivo'}</span></td>
        <td>${formatFecha(u.ultimo_acceso)}</td>
        <td class="acciones-td">
          <button onclick='abrirEditarUsuario(${JSON.stringify(u).replace(/'/g,"&#39;")})' class="btn-icon primary" title="Editar"><i class="fas fa-edit"></i></button>
          <button onclick="toggleUsuarioUI('${u.id}')" class="btn-icon ${activo?'warning':'success'}" title="${activo?'Desactivar':'Activar'}">
            <i class="fas fa-${activo?'ban':'check'}"></i>
          </button>
          ${currentUser.usuario !== u.usuario ? `<button onclick="eliminarUsuarioUI('${u.id}','${u.usuario}')" class="btn-icon danger" title="Eliminar"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      </tr>`;
  }).join('');
}

function abrirModalNuevoUsuario() {
  document.getElementById('u_id').value       = '';
  document.getElementById('u_usuario').value  = '';
  document.getElementById('u_password').value = '';
  document.getElementById('u_rol').value      = 'empleado';
  document.getElementById('modalUsuarioTitulo').innerHTML = '<i class="fas fa-user-plus"></i> Nuevo Usuario';
  abrirModal('modalUsuario');
}

function abrirEditarUsuario(u) {
  document.getElementById('u_id').value       = u.id;
  document.getElementById('u_usuario').value  = u.usuario;
  document.getElementById('u_password').value = '';
  document.getElementById('u_rol').value      = u.rol;
  document.getElementById('modalUsuarioTitulo').innerHTML = '<i class="fas fa-edit"></i> Editar Usuario';
  abrirModal('modalUsuario');
}

async function guardarUsuario() {
  const id = document.getElementById('u_id').value;
  const data = {
    action: id ? 'editarUsuario' : 'agregarUsuario',
    id, usuario: document.getElementById('u_usuario').value,
    password: document.getElementById('u_password').value,
    rol: document.getElementById('u_rol').value,
    usuarioActual: currentUser.usuario
  };
  const res = await postAction(data);
  showToast(res.message, res.status);
  if (res.status === 'success') { cerrarModal('modalUsuario'); cargarUsuarios(); }
}

async function toggleUsuarioUI(id) {
  const res = await postAction({ action:'toggleUsuario', id, usuarioActual: currentUser.usuario });
  showToast(res.message, res.status);
  if (res.status === 'success') cargarUsuarios();
}

async function eliminarUsuarioUI(id, nombre) {
  if (!confirm(`¿Eliminar al usuario "${nombre}"? Esta acción no se puede deshacer.`)) return;
  const res = await postAction({ action:'eliminarUsuario', id, usuarioActual: currentUser.usuario });
  showToast(res.message, res.status);
  if (res.status === 'success') cargarUsuarios();
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════
async function handleConfigAction(action) {
  document.getElementById('iniciarDBBtn').disabled = true;
  document.getElementById('resetDBBtn').disabled   = true;
  showStatus('statusConfig','info',`Procesando "${action}"...`);

  try {
    const res  = await fetch(`${SCRIPT_URL}?action=${action}`);
    const data = await res.json();
    showStatus('statusConfig', data.status, data.message);
    if (data.status === 'success') loadInitialData();
  } catch(e) {
    showStatus('statusConfig','error',`Error: ${e.message}`);
  } finally {
    document.getElementById('iniciarDBBtn').disabled = false;
    document.getElementById('resetDBBtn').disabled   = false;
  }
}

function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}

// ═══════════════════════════════════════════════════════════════
// EXPORTAR CSV
// ═══════════════════════════════════════════════════════════════
async function exportarCSV(tipo) {
  let datos = [];
  let nombre = tipo;

  if (tipo === 'inventario') {
    datos  = inventarioGlobal.length ? inventarioGlobal : cachedInventario;
    nombre = 'inventario';
  } else if (tipo === 'clientes') {
    datos  = cachedClientes;
    nombre = 'clientes';
  } else if (tipo === 'proveedores') {
    datos  = cachedProveedores;
    nombre = 'proveedores';
  } else if (tipo === 'gastos') {
    datos  = cachedGastos;
    nombre = 'gastos';
  } else if (tipo === 'resumen') {
    // Exporta lo que esté actualmente en la tabla de resúmenes
    return exportarTablaHTML('resumenTable', `reporte_${new Date().toISOString().slice(0,10)}.csv`);
  } else {
    // Ventas, Compras, Actividad — cargar de la API
    const sheetMap = { ventas:'Ventas', compras:'Compras', actividad:'Actividad' };
    const sn = sheetMap[tipo] || tipo;
    const res  = await fetch(`${SCRIPT_URL}?action=getData&sheetName=${sn}`);
    const data = await res.json();
    if (data.status !== 'success') { showToast('No hay datos para exportar.','warning'); return; }
    datos = data.data;
  }

  if (!datos || !datos.length) { showToast('No hay datos para exportar.','warning'); return; }

  const headers = Object.keys(datos[0]);
  const rows    = datos.map(d => headers.map(h => {
    let v = d[h];
    if (v instanceof Date || isFechaISO(v)) v = formatFecha(v);
    return `"${String(v??'').replace(/"/g,'""')}"`;
  }).join(','));

  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${nombre}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(`CSV de ${nombre} descargado.`, 'success');
}

function exportarTablaHTML(tableId, filename) {
  const table = document.getElementById(tableId);
  if (!table || table.classList.contains('hidden')) { showToast('No hay datos para exportar.','warning'); return; }
  let csv = [];
  for (let i = 0; i < table.rows.length; i++) {
    let row = [], cols = table.rows[i].querySelectorAll('td, th');
    for (let j = 0; j < cols.length; j++) row.push('"' + cols[j].innerText.replace(/"/g,'""') + '"');
    csv.push(row.join(','));
  }
  const blob = new Blob(['\ufeff'+csv.join('\n')], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  showToast('CSV descargado.', 'success');
}

// ═══════════════════════════════════════════════════════════════
// BACKUP
// ═══════════════════════════════════════════════════════════════
async function crearBackup() {
  showToast('Creando backup...','info');
  try {
    const res  = await fetch(`${SCRIPT_URL}?action=getBackup`);
    const data = await res.json();
    if (data.status !== 'success') { showToast('Error al crear backup.','error'); return; }

    const json = JSON.stringify(data.data, null, 2);
    const blob = new Blob([json], {type:'application/json'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `Backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup creado y descargado.','success');
  } catch(e) {
    showToast(`Error: ${e.message}`,'error');
  }
}

// ═══════════════════════════════════════════════════════════════
// MODALES
// ═══════════════════════════════════════════════════════════════
function abrirModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove('hidden');
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}
function cerrarModal(id) {
  const modal = document.getElementById(id);
  modal.classList.add('hidden');
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

// ═══════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast     = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = { success:'check-circle', error:'times-circle', warning:'exclamation-triangle', info:'info-circle' };
  toast.innerHTML = `<i class="fas fa-${icons[type]||'info-circle'}"></i> <span>${message}</span>`;

  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// ═══════════════════════════════════════════════════════════════
// STATUS MESSAGES
// ═══════════════════════════════════════════════════════════════
function showStatus(elementId, type, message) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const icons = { success:'check-circle', error:'times-circle', warning:'exclamation-triangle', info:'info-circle' };
  el.className = `status-message ${type}`;
  el.innerHTML = `<i class="fas fa-${icons[type]||'info-circle'}"></i> ${message}`;
  el.classList.remove('hidden');
}

// ═══════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════
async function postAction(data) {
  try {
    const res  = await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }
    });
    return await res.json();
  } catch(e) {
    return { status:'error', message:`Error de conexión: ${e.message}` };
  }
}

function formatFecha(valor) {
  if (!valor || valor === '') return '—';
  try {
    const d = new Date(valor);
    if (isNaN(d.getTime())) return String(valor);
    return d.toLocaleDateString('es-SV', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch(e) { return String(valor); }
}
