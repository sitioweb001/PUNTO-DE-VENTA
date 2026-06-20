// ═══════════════════════════════════════════════════════════════
// ERP POS v2.0 — FRONTEND (Fases 1 & 2)
// ═══════════════════════════════════════════════════════════════

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwbYNUf0--D2RVqFyaBZHFxQuClX6RBybuhK6kJU9Q02NZyICUIXEnUWIR1x25xMnfMrA/exec';

// ─── ESTADO GLOBAL ────────────────────────────────────────────
let currentUser       = null;
let configEmpresa     = {};
let cachedInventario  = [];
let inventarioGlobal  = [];
let cachedClientes    = [];
let cachedProveedores = [];
let cachedGastos      = [];
let carrito           = [];          // [{producto_id, nombre, cantidad, precio_unitario, descuento_linea, imagen_url}]
let cajaData          = { ventasHoy: 0, gastosHoy: 0 };
let periodoActual     = { ini: null, fin: null };
let reporteActual     = [];
let resumenChart, tendenciasChart;
let html5QrcodeScanner = null;
let scannerPrefix      = '';
let searchTimeout      = null;

const PERMISOS = {
  admin:    ['dashboard','ventas','inventario','productos','categorias','compras','devoluciones','clientes','proveedores','gastos','caja','reportes','papelera','actividad','usuarios','empresa','configuracion'],
  empleado: ['dashboard','ventas','inventario','productos','compras','devoluciones','clientes','proveedores','gastos','caja','reportes'],
  lectura:  ['dashboard','inventario','reportes']
};

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Restaurar sesión
  const saved = sessionStorage.getItem('erp_user');
  if (saved) { currentUser = JSON.parse(saved); }

  // Cargar config empresa (para login screen también)
  cargarConfigEmpresa().then(() => {
    if (currentUser) iniciarApp();
    else mostrarLogin();
  });

  // Dark mode guardado
  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
    const t = document.getElementById('darkModeToggle');
    if (t) t.checked = true;
  }

  // Enter en login
  ['login_usuario','login_password'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        if (id === 'login_usuario') document.getElementById('login_password').focus();
        else handleLogin();
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// EMPRESA CONFIG (se carga al inicio)
// ═══════════════════════════════════════════════════════════════
async function cargarConfigEmpresa() {
  try {
    const res  = await apiFetch('getEmpresa');
    if (res.status === 'success') {
      configEmpresa = res.data || {};
      aplicarConfigEmpresa();
    }
  } catch(e) { /* silencioso al inicio */ }
}

function aplicarConfigEmpresa() {
  const nombre = configEmpresa.nombre || 'ERP POS';
  // Título del navegador
  document.title = nombre;
  // Login
  const lNombre = document.getElementById('loginNombreEmpresa');
  if (lNombre) lNombre.textContent = nombre;
  // Sidebar
  const sNombre = document.getElementById('sidebarNombreEmpresa');
  if (sNombre) sNombre.textContent = nombre;
  // Logo URL
  const logoUrl = configEmpresa.logo_url || 'logo.png';
  document.querySelectorAll('.logo-img.logo-light').forEach(img => img.src = logoUrl);
  // IVA en carrito
  const ivaPct = parseFloat(configEmpresa.iva_pct || 0);
  document.querySelectorAll('#c_iva_pct').forEach(el => el.textContent = ivaPct);
  // Preview empresa si estamos en esa sección
  actualizarPreviewEmpresa();
}

function actualizarPreviewEmpresa() {
  const nombre = configEmpresa.nombre || 'Mi Negocio';
  const slogan = configEmpresa.slogan || '';
  const logoUrl= configEmpresa.logo_url || '';
  const el_n   = document.getElementById('empresaPreviewNombre');
  const el_s   = document.getElementById('empresaPreviewSlogan');
  const el_l   = document.getElementById('empresaLogoPrev');
  if (el_n) el_n.textContent = nombre;
  if (el_s) el_s.textContent = slogan || '—';
  if (el_l) {
    if (logoUrl) el_l.outerHTML = `<img src="${logoUrl}" class="empresa-logo-prev" id="empresaLogoPrev" alt="Logo" onerror="this.style.display='none'">`;
  }
}

function previewLogo(url) {
  configEmpresa.logo_url = url;
  aplicarConfigEmpresa();
}

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
  if (!usuario || !password) { errDiv.textContent = 'Completa todos los campos.'; errDiv.classList.remove('hidden'); return; }
  btn.disabled  = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ingresando...';
  errDiv.classList.add('hidden');
  try {
    const data = await apiPost({ action:'login', usuario, password, pin: password });
    if (data.status === 'success') {
      currentUser = data.data;
      sessionStorage.setItem('erp_user', JSON.stringify(currentUser));
      iniciarApp();
      showToast(`Bienvenido, ${currentUser.usuario}!`, 'success');
    } else {
      errDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${data.message}`;
      errDiv.classList.remove('hidden');
    }
  } catch(e) {
    errDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> Error de conexión.`;
    errDiv.classList.remove('hidden');
  } finally {
    btn.disabled  = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Ingresar';
  }
}

function togglePassword() {
  const inp  = document.getElementById('login_password');
  const icon = document.getElementById('togglePassIcon');
  inp.type   = inp.type === 'password' ? 'text' : 'password';
  icon.className = inp.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
}

function cerrarSesion() {
  if (!confirm('¿Cerrar sesión?')) return;
  currentUser = null;
  sessionStorage.removeItem('erp_user');
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

  document.getElementById('sidebarUserName').textContent = currentUser.usuario;
  const roles = { admin:'Administrador', empleado:'Empleado', lectura:'Solo Lectura' };
  document.getElementById('sidebarUserRole').textContent = roles[currentUser.rol] || currentUser.rol;

  aplicarPermisos();
  setupNavigation();
  setupForms();
  setupModals();
  setupMobile();

  loadInitialData();
  irASeccion('dashboard');

  // Notificaciones
  cargarNotificaciones();
  setInterval(cargarNotificaciones, 300000);
  document.addEventListener('click', e => {
    const panel = document.getElementById('notifPanel');
    if (!panel.classList.contains('hidden') &&
        !panel.contains(e.target) &&
        !e.target.closest('.notif-bell')) {
      panel.classList.add('hidden');
    }
  });
}

function aplicarPermisos() {
  const permitido = PERMISOS[currentUser.rol] || ['dashboard'];
  document.querySelectorAll('.sidebar-nav a[data-section]').forEach(link => {
    const s = link.getAttribute('data-section');
    link.classList.toggle('hidden', !permitido.includes(s));
  });
}

// ═══════════════════════════════════════════════════════════════
// NAVEGACIÓN
// ═══════════════════════════════════════════════════════════════
function setupNavigation() {
  document.querySelectorAll('.sidebar-nav a[data-section]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const id = link.getAttribute('data-section');
      if (!(PERMISOS[currentUser.rol]||[]).includes(id)) { showToast('Sin permiso.','error'); return; }
      irASeccion(id);
      if (window.innerWidth <= 992) document.getElementById('sidebar').classList.remove('active');
    });
  });
  document.getElementById('logoutBtn').addEventListener('click', e => { e.preventDefault(); cerrarSesion(); });
}

function irASeccion(id) {
  document.querySelectorAll('.sidebar-nav a[data-section]').forEach(l => l.classList.toggle('active', l.getAttribute('data-section') === id));
  document.querySelectorAll('.content-section').forEach(s => s.classList.toggle('active', s.id === id));

  const acciones = {
    dashboard:    handleLoadDashboard,
    inventario:   loadInventario,
    clientes:     cargarClientes,
    proveedores:  cargarProveedores,
    papelera:     cargarPapelera,
    usuarios:     cargarUsuarios,
    actividad:    cargarActividad,
    gastos:       cargarGastos,
    caja:         loadCaja,
    devoluciones: cargarDevoluciones,
    empresa:      cargarFormEmpresa,
    combos:       cargarCombos,
    facturas:     cargarFacturas,
    soporte:      cargarTicketsSoporte,
    importador:   resetImportador,
  };
  if (acciones[id]) acciones[id]();
}

// ═══════════════════════════════════════════════════════════════
// MOBILE
// ═══════════════════════════════════════════════════════════════
function setupMobile() {
  const toggle  = document.getElementById('mobileToggle');
  const sidebar = document.getElementById('sidebar');
  const check   = () => {
    toggle.classList.toggle('hidden', window.innerWidth > 992);
    if (window.innerWidth > 992) sidebar.classList.remove('active');
  };
  check();
  window.addEventListener('resize', check);
  toggle.addEventListener('click', e => { e.stopPropagation(); sidebar.classList.toggle('active'); });
  document.addEventListener('click', e => {
    if (window.innerWidth <= 992 && sidebar.classList.contains('active') && !sidebar.contains(e.target) && !toggle.contains(e.target))
      sidebar.classList.remove('active');
  });
}

// ═══════════════════════════════════════════════════════════════
// SETUP FORMS
// ═══════════════════════════════════════════════════════════════
function setupForms() {
  // Categoría
  document.getElementById('categoriaForm').addEventListener('submit', async e => {
    e.preventDefault();
    const r = await apiPost({ action:'agregarCategoria', nombre: document.getElementById('c_nombre').value.trim(), emoji: document.getElementById('c_emoji').value.trim()||'📦', usuario: currentUser.usuario });
    showStatus('statusCategoria', r.status, r.message);
    if (r.status === 'success') { e.target.reset(); loadInitialData(); }
  });

  // Producto
  document.getElementById('productoForm').addEventListener('submit', async e => {
    e.preventDefault();
    const r = await apiPost({
      action:'agregarProducto', usuario: currentUser.usuario,
      codigo: document.getElementById('p_codigo').value,
      nombre: document.getElementById('p_nombre').value,
      categoria: document.getElementById('p_categoria').value,
      precio_compra: document.getElementById('p_precio_compra').value,
      precio_venta:  document.getElementById('p_precio_venta').value,
      stock:         document.getElementById('p_stock').value,
      stock_minimo:  document.getElementById('p_stock_minimo').value,
      imagen_url:    document.getElementById('p_imagen_url').value,
      favorito:      document.getElementById('p_favorito').checked,
    });
    showStatus('statusProducto', r.status, r.message);
    if (r.status === 'success') { e.target.reset(); document.getElementById('p_stock_minimo').value = 5; showToast('Producto registrado','success'); }
  });

  // Búsqueda ventas / compras / devoluciones
  document.getElementById('v_query').addEventListener('input',   e => buscarProductoDebounce(e.target.value, 'v'));
  document.getElementById('co_query').addEventListener('input',  e => buscarProductoDebounce(e.target.value, 'co'));
  document.getElementById('dev_query').addEventListener('input', e => buscarProductoDebounce(e.target.value, 'dev'));

  // Descuento del carrito recalcula
  document.getElementById('v_descuento').addEventListener('input', recalcularCarrito);

  // Compra
  document.getElementById('compraForm').addEventListener('submit', handleCompra);

  // Devolución
  document.getElementById('devolucionForm').addEventListener('submit', handleDevolucion);

  // Gasto
  document.getElementById('gastoForm').addEventListener('submit', async e => {
    e.preventDefault();
    const r = await apiPost({ action:'agregarGasto', descripcion: document.getElementById('g_descripcion').value, monto: document.getElementById('g_monto').value, categoria: document.getElementById('g_categoria').value, usuario: currentUser.usuario });
    showStatus('statusGasto', r.status, r.message);
    if (r.status === 'success') { e.target.reset(); cargarGastos(); showToast('Gasto registrado','success'); }
  });

  // Caja
  document.getElementById('btn_cerrarCaja').addEventListener('click', ejecutarCierreCaja);

  // Empresa
  document.getElementById('empresaForm').addEventListener('submit', async e => {
    e.preventDefault();
    const r = await apiPost({
      action:'guardarEmpresa', usuario: currentUser.usuario,
      nombre: document.getElementById('e_nombre').value,
      slogan: document.getElementById('e_slogan').value,
      nit:    document.getElementById('e_nit').value,
      nrc:    document.getElementById('e_nrc').value,
      iva_pct: document.getElementById('e_iva_pct').value,
      moneda:  document.getElementById('e_moneda').value,
      telefono: document.getElementById('e_telefono').value,
      correo:   document.getElementById('e_correo').value,
      direccion: document.getElementById('e_direccion').value,
      logo_url:  document.getElementById('e_logo_url').value,
      redes:     document.getElementById('e_redes').value,
      mensaje_ticket: document.getElementById('e_mensaje_ticket').value,
    });
    showStatus('statusEmpresa', r.status, r.message);
    if (r.status === 'success') { showToast('Configuración guardada','success'); await cargarConfigEmpresa(); }
  });

  // Configuración
  document.getElementById('iniciarDBBtn').addEventListener('click', () => handleConfigAction('iniciar'));
  document.getElementById('resetDBBtn').addEventListener('click', () => {
    if (confirm('¡ADVERTENCIA! ¿Resetear TODA la base de datos?')) handleConfigAction('resetear');
  });
  document.getElementById('cargarDatosGraficosBtn').addEventListener('click', handleLoadDashboard);
  document.getElementById('cargarInventarioBtn').addEventListener('click', loadInventario);
}

function setupModals() {
  document.querySelectorAll('.modal-close, .close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.id === 'closeScanner') closeScannerModal();
      else { const m = btn.closest('.modal'); if (m) cerrarModal(m.id); }
    });
  });
  document.addEventListener('click', e => {
    document.querySelectorAll('.modal:not(.hidden)').forEach(m => {
      if (e.target === m) { if (m.id === 'scannerModal') closeScannerModal(); else cerrarModal(m.id); }
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// DATOS INICIALES
// ═══════════════════════════════════════════════════════════════
async function loadInitialData() {
  await Promise.all([
    cargarCategorias(),
    cargarDatalistClientes(),
    cargarDatalistProveedores(),
  ]);
}

async function cargarCategorias() {
  try {
    const r = await apiFetch('getCategorias');
    if (r.status === 'success') poblarCategorias(r.data);
    else poblarCategorias([]);
  } catch(e) { poblarCategorias([]); }
}

function poblarCategorias(cats) {
  // Selects
  ['p_categoria','ep_categoria'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const val = sel.value;
    sel.innerHTML = '<option value="" disabled selected>Seleccione categoría</option>';
    cats.forEach(c => sel.innerHTML += `<option value="${c.nombre}">${c.emoji||'📦'} ${c.nombre}</option>`);
    if (val) sel.value = val;
  });
  // Filtro inventario
  const cf = document.getElementById('f_categoria');
  if (cf) {
    cf.innerHTML = '<option value="">Todas las categorías</option>';
    cats.forEach(c => cf.innerHTML += `<option value="${c.nombre}">${c.emoji||'📦'} ${c.nombre}</option>`);
  }
  // Lista visual
  const list = document.getElementById('listaCategorias');
  if (!list) return;
  if (!cats.length) { list.innerHTML = '<li>No hay categorías.</li>'; return; }
  list.innerHTML = cats.map(c => `
    <li class="categoria-item">
      <span style="font-size:1.3rem">${c.emoji||'📦'}</span>
      <b>${c.nombre}</b>
      ${currentUser?.rol==='admin' ? `<button onclick="eliminarCategoriaUI('${c.id}','${c.nombre}')" class="btn-icon danger"><i class="fas fa-trash"></i></button>` : ''}
    </li>`).join('');
}

async function eliminarCategoriaUI(id, nombre) {
  if (!confirm(`¿Eliminar categoría "${nombre}"?`)) return;
  const r = await apiPost({ action:'eliminarCategoria', id, usuario: currentUser.usuario });
  showToast(r.message, r.status);
  if (r.status === 'success') cargarCategorias();
}

async function cargarDatalistClientes() {
  try {
    const r = await apiFetch('getClientes');
    if (r.status === 'success') {
      cachedClientes = r.data;
      const dl = document.getElementById('listClientes');
      if (dl) dl.innerHTML = r.data.map(c => `<option value="${c.nombre} ${c.apellido||''}"></option>`).join('');
    }
  } catch(e) {}
}

async function cargarDatalistProveedores() {
  try {
    const r = await apiFetch('getProveedores');
    if (r.status === 'success') {
      cachedProveedores = r.data;
      const dl = document.getElementById('listProveedores');
      if (dl) dl.innerHTML = r.data.map(p => `<option value="${p.nombre}"></option>`).join('');
    }
  } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// (función completa handleLoadDashboard con KPIs y gráfico de
//  categoría está definida más abajo, junto al resto de Fase 3)
// ═══════════════════════════════════════════════════════════════

function renderAlertasStock(bajo, agotados) {
  const el = document.getElementById('stockAlerts');
  if (!bajo?.length && !agotados) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  let h = '';
  if (agotados) h += `<div class="alert-item danger"><i class="fas fa-times-circle"></i> <b>${agotados}</b> producto(s) agotado(s)</div>`;
  bajo?.forEach(p => h += `<div class="alert-item warning"><i class="fas fa-exclamation-triangle"></i> <b>${p.nombre}</b> — Stock: ${p.stock} / mín: ${p.stock_minimo}</div>`);
  el.innerHTML = `<div class="alerts-wrap">${h}</div>`;
}

function renderTopVendidos(top) {
  const el = document.getElementById('topProductos');
  if (!top?.length) { el.innerHTML = '<p class="text-muted">Sin ventas aún.</p>'; return; }
  el.innerHTML = top.map((p,i) => `
    <div class="top-item">
      <span class="top-rank">${i+1}</span>
      ${p.imagen ? `<img src="${p.imagen}" style="width:28px;height:28px;border-radius:4px;object-fit:cover">` : ''}
      <span class="top-name">${p.nombre}</span>
      <span class="top-value">${p.vendidos} uds</span>
    </div>`).join('');
}

function renderTopRentables(top) {
  const el = document.getElementById('topRentables');
  if (!top?.length) { el.innerHTML = '<p class="text-muted">Sin datos.</p>'; return; }
  const M = configEmpresa.moneda || '$';
  el.innerHTML = top.map((p,i) => `
    <div class="top-item">
      <span class="top-rank">${i+1}</span>
      <span class="top-name">${p.nombre}</span>
      <span class="top-value">${M}${fmt(p.ganancia_total)}</span>
    </div>`).join('');
}

function renderStockCritico(bajo) {
  const el = document.getElementById('stockCritico');
  if (!bajo?.length) { el.innerHTML = '<p class="text-muted" style="color:var(--success-color)"><i class="fas fa-check-circle"></i> Todo bien.</p>'; return; }
  el.innerHTML = bajo.map(p => `
    <div class="top-item">
      <span class="badge-stock ${p.stock===0?'danger':'warning'}">${p.stock}</span>
      <span class="top-name">${p.nombre}</span>
    </div>`).join('');
}

function renderCharts(data) {
  const labels   = data.map(r => r.fecha);
  const ventas   = data.map(r => r.ventas  || 0);
  const compras  = data.map(r => r.compras || 0);
  const ganancias= data.map(r => r.ganancia|| 0);

  const ctx1 = document.getElementById('resumenFinancieroChart').getContext('2d');
  if (resumenChart) resumenChart.destroy();
  resumenChart = new Chart(ctx1, {
    type:'bar',
    data:{ labels, datasets:[
      {label:'Ventas',    data:ventas,   backgroundColor:'rgba(5,93,226,.7)',  borderColor:'rgba(5,93,226,1)',  borderWidth:1},
      {label:'Compras',   data:compras,  backgroundColor:'rgba(23,162,184,.7)',borderColor:'rgba(23,162,184,1)',borderWidth:1},
      {label:'Ganancias', data:ganancias,type:'line',fill:false,borderColor:'rgba(40,167,69,1)',borderWidth:2,tension:.1}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{title:{display:true,text:'Ventas vs Compras vs Ganancias'},tooltip:{mode:'index',intersect:false}},scales:{y:{beginAtZero:true}}}
  });

  const ctx2 = document.getElementById('tendenciasChart').getContext('2d');
  if (tendenciasChart) tendenciasChart.destroy();
  tendenciasChart = new Chart(ctx2, {
    type:'line',
    data:{ labels, datasets:[
      {label:'Ventas Acumuladas', data:ventas.reduce((a,c,i)=>[...a,(a[i-1]||0)+c],[]),borderColor:'rgba(5,93,226,1)',backgroundColor:'rgba(5,93,226,.1)',fill:true,tension:.1},
      {label:'Compras Acumuladas',data:compras.reduce((a,c,i)=>[...a,(a[i-1]||0)+c],[]),borderColor:'rgba(23,162,184,1)',backgroundColor:'rgba(23,162,184,.1)',fill:true,tension:.1}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{title:{display:true,text:'Tendencias Acumuladas'}},scales:{y:{beginAtZero:true}}}
  });
}

// ═══════════════════════════════════════════════════════════════
// INVENTARIO
// ═══════════════════════════════════════════════════════════════
async function loadInventario() {
  const tbody = document.getElementById('inventarioTableBody');
  showStatus('statusInventario','info','Cargando...');
  tbody.innerHTML = '<tr><td colspan="9" class="text-center"><i class="fas fa-spinner fa-spin"></i> Cargando...</td></tr>';
  try {
    const r = await apiFetch('getInventario');
    if (r.status === 'success') {
      cachedInventario = r.data;
      inventarioGlobal = r.data;
      showStatus('statusInventario','success',`${r.data.length} productos.`);
      setTimeout(() => document.getElementById('statusInventario').classList.add('hidden'), 2000);
      filtrarInventario();
    } else {
      tbody.innerHTML = `<tr><td colspan="9">${r.message}</td></tr>`;
      showStatus('statusInventario','warning', r.message);
    }
  } catch(e) {
    tbody.innerHTML = '<tr><td colspan="9">Error al cargar.</td></tr>';
    showStatus('statusInventario','error', e.message);
  }
}

function filtrarInventario() {
  const tbody    = document.getElementById('inventarioTableBody');
  const texto    = (document.getElementById('f_texto')?.value||'').toLowerCase();
  const cat      = document.getElementById('f_categoria')?.value||'';
  const stock    = document.getElementById('f_stock')?.value||'';
  const fav      = document.getElementById('f_favorito')?.value||'';
  const pMin     = parseFloat(document.getElementById('f_min_precio')?.value)||0;
  const pMax     = parseFloat(document.getElementById('f_max_precio')?.value)||Infinity;

  const filtrados = inventarioGlobal.filter(p => {
    const s    = parseInt(p.stock)||0;
    const lim  = parseInt(p.stock_minimo)||5;
    const pv   = parseFloat(p.precio_venta)||0;
    if (texto && !(`${p.nombre} ${p['código']}`.toLowerCase().includes(texto))) return false;
    if (cat && p['categoría'] !== cat) return false;
    if (pv < pMin || pv > pMax) return false;
    if (fav === 'si' && !p.favorito) return false;
    if (stock === 'bajo'   && !(s>0 && s<=lim)) return false;
    if (stock === 'agotado'&& s!==0) return false;
    if (stock === 'ok'     && s<=lim) return false;
    return true;
  });

  if (!filtrados.length) { tbody.innerHTML = '<tr><td colspan="9" class="text-center">Sin resultados.</td></tr>'; return; }

  const canEdit = ['admin','empleado'].includes(currentUser?.rol);
  const isAdmin = currentUser?.rol === 'admin';
  const M = configEmpresa.moneda || '$';

  tbody.innerHTML = filtrados.map(p => {
    const s   = parseInt(p.stock)||0;
    const lim = parseInt(p.stock_minimo)||5;
    const sc  = s===0?'danger':s<=lim?'warning':'success';
    const img = p.imagen_url
      ? `<img src="${p.imagen_url}" style="width:36px;height:36px;border-radius:6px;object-fit:cover" onerror="this.style.display='none'">`
      : `<span style="font-size:1.3rem">📦</span>`;
    return `<tr class="${s===0?'row-alert':''}">
      <td>${img}</td>
      <td><strong>${p.nombre}</strong>${p.favorito?'<span style="color:gold;margin-left:4px">⭐</span>':''}</td>
      <td><code>${p['código']||'—'}</code></td>
      <td>${p['categoría']||'—'}</td>
      <td><span class="badge-stock ${sc}">${s}</span><small style="color:var(--text-muted)"> /mín${lim}</small></td>
      <td>${M}${fmt(p.precio_compra)}</td>
      <td><strong>${M}${fmt(p.precio_venta)}</strong></td>
      <td>${p.favorito?'⭐':'—'}</td>
      <td class="acciones-td">
        ${canEdit?`<button onclick='abrirEditarProducto(${JSON.stringify(p).replace(/'/g,"&#39;")})' class="btn-icon primary" title="Editar"><i class="fas fa-edit"></i></button>`:''}
        ${isAdmin?`<button onclick="confirmarEliminarProducto('${p.id}','${(p.nombre||'').replace(/'/g,"\\'")}') " class="btn-icon danger" title="Eliminar"><i class="fas fa-trash"></i></button>`:''}
      </td>
    </tr>`;
  }).join('');
  agregarBotonesEstadisticas();
}

function abrirEditarProducto(p) {
  document.getElementById('ep_id').value           = p.id;
  document.getElementById('ep_codigo').value        = p['código']||'';
  document.getElementById('ep_nombre').value        = p.nombre||'';
  document.getElementById('ep_precio_compra').value = fmt(p.precio_compra);
  document.getElementById('ep_precio_venta').value  = fmt(p.precio_venta);
  document.getElementById('ep_stock').value         = p.stock||0;
  document.getElementById('ep_stock_minimo').value  = p.stock_minimo||5;
  document.getElementById('ep_imagen_url').value    = p.imagen_url||'';
  document.getElementById('ep_favorito').checked    = !!p.favorito;
  const sel = document.getElementById('ep_categoria');
  Array.from(sel.options).forEach(o => { if(o.value === p['categoría']) o.selected=true; });
  abrirModal('modalEditarProducto');
}

async function guardarEdicionProducto() {
  const r = await apiPost({
    action:'editarProducto', usuario: currentUser.usuario,
    id:    document.getElementById('ep_id').value,
    codigo: document.getElementById('ep_codigo').value,
    nombre: document.getElementById('ep_nombre').value,
    categoria: document.getElementById('ep_categoria').value,
    precio_compra: document.getElementById('ep_precio_compra').value,
    precio_venta:  document.getElementById('ep_precio_venta').value,
    stock:         document.getElementById('ep_stock').value,
    stock_minimo:  document.getElementById('ep_stock_minimo').value,
    imagen_url:    document.getElementById('ep_imagen_url').value,
    favorito:      document.getElementById('ep_favorito').checked,
  });
  showToast(r.message, r.status);
  if (r.status === 'success') { cerrarModal('modalEditarProducto'); loadInventario(); }
}

async function confirmarEliminarProducto(id, nombre) {
  if (!confirm(`¿Eliminar "${nombre}"? Será movido a la papelera.`)) return;
  const r = await apiPost({ action:'eliminarProducto', id, usuario: currentUser.usuario });
  showToast(r.message, r.status);
  if (r.status === 'success') loadInventario();
}

// ═══════════════════════════════════════════════════════════════
// BUSCADOR PRODUCTO (ventas, compras, devoluciones)
// ═══════════════════════════════════════════════════════════════
function buscarProductoDebounce(query, prefix) {
  clearTimeout(searchTimeout);
  if (query.length < 2) { ocultarSugerencias(prefix); return; }
  searchTimeout = setTimeout(() => buscarProductoAPI(query, prefix), 300);
}

async function buscarProductoAPI(query, prefix) {
  try {
    // Primero buscar en caché local para respuesta inmediata
    if (inventarioGlobal.length) {
      const q = query.toLowerCase();
      const locales = inventarioGlobal.filter(p =>
        p.nombre?.toLowerCase().includes(q) || String(p['código']||'').toLowerCase().includes(q)
      ).slice(0, 6);
      if (locales.length) { mostrarSugerencias(locales, prefix); return; }
    }
    // Si no, ir al servidor
    const r = await apiFetch(`buscarProducto&query=${encodeURIComponent(query)}`);
    if (r.status === 'success') mostrarSugerencias(r.data.slice(0,6), prefix);
    else ocultarSugerencias(prefix);
  } catch(e) { ocultarSugerencias(prefix); }
}

function mostrarSugerencias(productos, prefix) {
  const cont = document.getElementById(`${prefix}_sugerencias`);
  if (!cont) return;
  cont.innerHTML = productos.map(p => {
    const s   = parseInt(p.stock)||0;
    const sc  = s===0?'color:var(--danger-color)':s<=5?'color:var(--warning-color)':'color:var(--success-color)';
    const M   = configEmpresa.moneda||'$';
    const precio = prefix==='co' ? p.precio_compra : p.precio_venta;
    return `<div class="sug-item" onclick='seleccionarProducto(${JSON.stringify(p).replace(/'/g,"&#39;")}, "${prefix}")'>
      ${p.imagen_url?`<img src="${p.imagen_url}" style="width:32px;height:32px;border-radius:4px;object-fit:cover">`:
        `<span style="font-size:1.2rem">📦</span>`}
      <div style="flex:1">
        <div style="font-weight:600;font-size:.875rem">${p.nombre}</div>
        <div style="font-size:.75rem;color:var(--text-muted)">${p['código']||''} | ${M}${fmt(precio)} | <span style="${sc}">Stock: ${s}</span></div>
      </div>
    </div>`;
  }).join('');
  cont.classList.remove('hidden');
}

function ocultarSugerencias(prefix) {
  document.getElementById(`${prefix}_sugerencias`)?.classList.add('hidden');
}

function seleccionarProducto(p, prefix) {
  ocultarSugerencias(prefix);
  if (prefix === 'v') {
    document.getElementById('v_query').value      = p.nombre;
    document.getElementById('v_prod_id').value    = p.id;
    document.getElementById('v_prod_nombre').textContent = p.nombre;
    const M = configEmpresa.moneda||'$';
    const s = parseInt(p.stock)||0;
    const lim = parseInt(p.stock_minimo)||5;
    const sc = s===0?'color:var(--danger-color)':s<=lim?'color:var(--warning-color)':'color:var(--success-color)';
    document.getElementById('v_prod_info').innerHTML = `<b>Código:</b> ${p['código']||'—'} | <b>Precio:</b> ${M}${fmt(p.precio_venta)} | <b>Stock:</b> <span style="${sc}">${s}</span>`;
    document.getElementById('v_precio_unit').value  = fmt(p.precio_venta);
    if (p.imagen_url) {
      document.getElementById('v_prod_img_wrap').outerHTML = `<img src="${p.imagen_url}" class="prod-img" id="v_prod_img_wrap" alt="${p.nombre}">`;
    }
    document.getElementById('v_producto_seleccionado').classList.remove('hidden');
    document.getElementById('v_qty').focus();
  } else if (prefix === 'co') {
    document.getElementById('co_query').value          = p.nombre;
    document.getElementById('co_producto_id').value    = p.id;
    document.getElementById('co_prod_nombre').textContent = p.nombre;
    document.getElementById('co_prod_info').textContent = `Código: ${p['código']||'—'} | Stock actual: ${p.stock||0}`;
    document.getElementById('co_precio_compra').value  = fmt(p.precio_compra);
    document.getElementById('co_producto_seleccionado').classList.remove('hidden');
    document.getElementById('co_submit_btn').disabled  = false;
  } else if (prefix === 'dev') {
    document.getElementById('dev_query').value           = p.nombre;
    document.getElementById('dev_producto_id').value     = p.id;
    document.getElementById('dev_producto_nombre').value = p.nombre;
  } else if (prefix === 'combo') {
    document.getElementById('combo_prod_query').value      = p.nombre;
    document.getElementById('combo_prod_id').value         = p.id;
    document.getElementById('combo_prod_nombre_sel').value = p.nombre;
    document.getElementById('combo_sugerencias').classList.add('hidden');
    document.getElementById('combo_comp_qty').focus();
  }
}

// ═══════════════════════════════════════════════════════════════
// CARRITO
// ═══════════════════════════════════════════════════════════════
function agregarAlCarrito() {
  const id  = document.getElementById('v_prod_id').value;
  const qty = parseInt(document.getElementById('v_qty').value)||1;
  const precio = parseFloat(document.getElementById('v_precio_unit').value)||0;
  const nombre = document.getElementById('v_prod_nombre').textContent;
  if (!id) { showToast('Selecciona un producto primero.','warning'); return; }
  if (qty < 1) { showToast('Cantidad inválida.','warning'); return; }

  const idx = carrito.findIndex(i => i.producto_id === id);
  if (idx > -1) {
    carrito[idx].cantidad += qty;
  } else {
    const prod = inventarioGlobal.find(p => p.id === id);
    carrito.push({ producto_id:id, nombre, cantidad:qty, precio_unitario:precio, descuento_linea:0, imagen_url: prod?.imagen_url||'' });
  }
  renderCarrito();
  // Limpiar buscador
  document.getElementById('v_query').value = '';
  document.getElementById('v_prod_id').value = '';
  document.getElementById('v_producto_seleccionado').classList.add('hidden');
  document.getElementById('v_qty').value = 1;
}

function renderCarrito() {
  const cont  = document.getElementById('carritoItems');
  const count = document.getElementById('carrito_count');
  count.textContent = carrito.reduce((s,i) => s + i.cantidad, 0);

  if (!carrito.length) {
    cont.innerHTML = '<div class="carrito-vacio"><i class="fas fa-shopping-cart"></i><p>Carrito vacío</p></div>';
    recalcularCarrito();
    return;
  }

  const M = configEmpresa.moneda||'$';
  cont.innerHTML = carrito.map((item, idx) => `
    <div class="carrito-item">
      ${item.imagen_url?`<img src="${item.imagen_url}" style="width:36px;height:36px;border-radius:6px;object-fit:cover">`:'<span style="font-size:1.2rem">📦</span>'}
      <div style="flex:1;min-width:0">
        <div class="carrito-item-nombre">${item.nombre}</div>
        <div class="carrito-item-precio">${M}${fmt(item.precio_unitario)} c/u</div>
      </div>
      <div class="carrito-qty">
        <button onclick="cambiarQty(${idx},-1)">−</button>
        <input type="number" value="${item.cantidad}" min="1" onchange="setQty(${idx},this.value)" style="width:42px;text-align:center;border:1px solid var(--border-color);border-radius:4px;background:var(--bg-card);color:var(--text-main)">
        <button onclick="cambiarQty(${idx},1)">+</button>
      </div>
      <div style="font-weight:700;min-width:60px;text-align:right">${M}${fmt(item.precio_unitario*item.cantidad)}</div>
      <button class="btn-quitar-item" onclick="quitarDelCarrito(${idx})"><i class="fas fa-times"></i></button>
    </div>`).join('');
  recalcularCarrito();
}

function cambiarQty(idx, delta) {
  carrito[idx].cantidad = Math.max(1, carrito[idx].cantidad + delta);
  renderCarrito();
}
function setQty(idx, val) {
  carrito[idx].cantidad = Math.max(1, parseInt(val)||1);
  renderCarrito();
}
function quitarDelCarrito(idx) {
  carrito.splice(idx, 1);
  renderCarrito();
}
function limpiarCarrito() {
  if (carrito.length && !confirm('¿Vaciar el carrito?')) return;
  carrito = [];
  renderCarrito();
}

function recalcularCarrito() {
  const M = configEmpresa.moneda||'$';
  const ivaPct    = parseFloat(configEmpresa.iva_pct||0)/100;
  const descuento = parseFloat(document.getElementById('v_descuento')?.value)||0;
  const subtotal  = carrito.reduce((s,i) => s+(i.precio_unitario*i.cantidad), 0);
  const base      = Math.max(0, subtotal - descuento);
  const iva       = Math.round(base * ivaPct * 100)/100;
  const total     = base + iva;

  document.getElementById('c_subtotal').textContent = `${M}${fmt(subtotal)}`;
  document.getElementById('c_descuento').textContent= `-${M}${fmt(descuento)}`;
  document.getElementById('c_iva').textContent      = `${M}${fmt(iva)}`;
  document.getElementById('c_total').textContent    = `${M}${fmt(total)}`;
}

async function finalizarVenta() {
  if (!carrito.length) { showToast('El carrito está vacío.','warning'); return; }
  const btn = document.getElementById('btnFinalizarVenta');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
  showStatus('statusVenta','info','Registrando venta...');

  const descuento = parseFloat(document.getElementById('v_descuento').value)||0;
  const req = {
    action: 'registrarVenta',
    usuario: currentUser.usuario,
    cliente_nombre: document.getElementById('v_cliente_nombre').value||'Mostrador',
    cliente_id:     document.getElementById('v_cliente_id').value||'',
    metodo_pago:    document.getElementById('v_metodo_pago').value,
    descuento, notas: document.getElementById('v_notas').value,
    items: carrito.map(i => ({
      producto_id: i.producto_id, nombre: i.nombre,
      cantidad: i.cantidad, precio_unitario: i.precio_unitario,
      descuento_linea: i.descuento_linea||0
    }))
  };

  try {
    const r = await apiPost(req);
    showStatus('statusVenta', r.status, r.message);
    if (r.status === 'success') {
      showToast(`Venta registrada. Total: ${configEmpresa.moneda||'$'}${fmt(r.data.total)}`, 'success');
      imprimirTicket(r.data);
      carrito = [];
      renderCarrito();
      document.getElementById('v_descuento').value = 0;
      document.getElementById('v_cliente_nombre').value = '';
      document.getElementById('v_notas').value = '';
    }
  } catch(e) { showStatus('statusVenta','error', e.message); }
  finally {
    btn.disabled  = false;
    btn.innerHTML = '<i class="fas fa-check-circle"></i> Cobrar y Emitir Ticket';
  }
}

// ═══════════════════════════════════════════════════════════════
// TICKET DE IMPRESIÓN
// ═══════════════════════════════════════════════════════════════
function imprimirTicket(data) {
  const emp = configEmpresa;
  const M   = emp.moneda||'$';
  // Logo
  const logoWrap = document.getElementById('t_logo_wrap');
  logoWrap.innerHTML = emp.logo_url ? `<img src="${emp.logo_url}" alt="Logo" style="max-height:50px;max-width:120px">` : '';
  // Empresa
  document.getElementById('t_empresa').textContent     = emp.nombre||'Mi Negocio';
  document.getElementById('t_empresa_dir').textContent = emp.direccion||'';
  document.getElementById('t_empresa_tel').textContent = emp.telefono||'';
  document.getElementById('t_fecha').textContent       = new Date().toLocaleString('es-SV');
  document.getElementById('t_id').textContent          = data.ticket_id||'—';
  document.getElementById('t_cliente').textContent     = data.cliente||'Mostrador';
  document.getElementById('t_cajero').textContent      = currentUser.usuario;
  document.getElementById('t_pago').textContent        = data.metodo_pago||'Efectivo';
  // Items
  document.getElementById('t_items').innerHTML = (data.items||[]).map(i =>
    `<tr><td>${i.cantidad}</td><td>${i.nombre||i._nombre}</td><td style="text-align:right">${M}${fmt(i._subtotal||i.precio_unitario*i.cantidad)}</td></tr>`
  ).join('');
  // Totales
  document.getElementById('t_subtotal').textContent  = `${M}${fmt(data.subtotal)}`;
  document.getElementById('t_descuento').textContent = `-${M}${fmt(data.descuento||0)}`;
  document.getElementById('t_iva_pct').textContent   = emp.iva_pct||'0';
  document.getElementById('t_iva').textContent       = `${M}${fmt(data.impuesto)}`;
  document.getElementById('t_total').textContent     = `${M}${fmt(data.total)}`;
  // Footer
  document.getElementById('t_mensaje').textContent   = emp.mensaje_ticket||'¡Gracias por su compra!';
  document.getElementById('t_redes').textContent     = emp.redes||'';
  // Ticket width
  const tw = emp.ticket_ancho||'80mm';
  document.getElementById('ticketPrintZone').style.setProperty('--ticket-width', tw);

  window.print();
}

// ═══════════════════════════════════════════════════════════════
// COMPRAS
// ═══════════════════════════════════════════════════════════════
async function handleCompra(e) {
  e.preventDefault();
  const productoId = document.getElementById('co_producto_id').value;
  if (!productoId) { showStatus('statusCompra','error','Selecciona un producto.'); return; }
  const btn = document.getElementById('co_submit_btn');
  btn.disabled = true;
  const r = await apiPost({
    action:'registrarCompra', usuario: currentUser.usuario,
    producto_id: productoId,
    cantidad:    document.getElementById('co_cantidad').value,
    precio_compra: document.getElementById('co_precio_compra').value,
    proveedor_nombre: document.getElementById('co_proveedor_nombre').value,
    actualizar_precio: document.getElementById('co_actualizar_precio').value === '1',
    notas: document.getElementById('co_notas').value,
  });
  showStatus('statusCompra', r.status, r.message);
  if (r.status === 'success') {
    showToast(r.message, 'success');
    e.target.reset();
    document.getElementById('co_submit_btn').disabled = true;
    document.getElementById('co_producto_seleccionado').classList.add('hidden');
  }
  btn.disabled = false;
}

// ═══════════════════════════════════════════════════════════════
// DEVOLUCIONES
// ═══════════════════════════════════════════════════════════════
async function handleDevolucion(e) {
  e.preventDefault();
  const r = await apiPost({
    action:'registrarDevolucion', usuario: currentUser.usuario,
    venta_id:        document.getElementById('dev_venta_id').value,
    producto_id:     document.getElementById('dev_producto_id').value,
    producto_nombre: document.getElementById('dev_producto_nombre').value||document.getElementById('dev_query').value,
    cantidad:        document.getElementById('dev_cantidad').value,
    motivo:          document.getElementById('dev_motivo').value,
    regresar_stock:  document.getElementById('dev_regresar_stock').checked,
  });
  showStatus('statusDevolucion', r.status, r.message);
  if (r.status === 'success') { showToast('Devolución registrada.','success'); e.target.reset(); cargarDevoluciones(); }
}

async function cargarDevoluciones() {
  const r = await apiFetch('getDevoluciones');
  const tbody = document.getElementById('devolucionesTableBody');
  if (r.status !== 'success' || !r.data.length) { tbody.innerHTML = '<tr><td colspan="7">No hay devoluciones.</td></tr>'; return; }
  tbody.innerHTML = [...r.data].reverse().map(d => `
    <tr>
      <td>${formatFecha(d.fecha)}</td>
      <td><code>${d.venta_id||'—'}</code></td>
      <td>${d.producto_nombre}</td>
      <td>${d.cantidad}</td>
      <td>${d.motivo}</td>
      <td>${d.usuario}</td>
      <td><span class="badge-estado ${d.estado}">${d.estado}</span></td>
    </tr>`).join('');
}

// ═══════════════════════════════════════════════════════════════
// CLIENTES
// ═══════════════════════════════════════════════════════════════
async function cargarClientes() {
  const r = await apiFetch('getClientes');
  cachedClientes = r.status==='success' ? r.data : [];
  renderClientes(cachedClientes);
}

function filtrarClientes() {
  const q = (document.getElementById('f_clientes')?.value||'').toLowerCase();
  renderClientes(q ? cachedClientes.filter(c => `${c.nombre} ${c.apellido||''} ${c.telefono||''} ${c.dui_nit||''}`.toLowerCase().includes(q)) : cachedClientes);
}

function renderClientes(data) {
  const tbody   = document.getElementById('clientesTableBody');
  const canEdit = ['admin','empleado'].includes(currentUser?.rol);
  const isAdmin = currentUser?.rol === 'admin';
  if (!data.length) { tbody.innerHTML = '<tr><td colspan="7">No hay clientes.</td></tr>'; return; }
  tbody.innerHTML = data.map(c => `
    <tr>
      <td><b>${c.nombre}</b></td>
      <td>${c.apellido||'—'}</td>
      <td><span class="badge-tipo ${c.tipo||'regular'}">${c.tipo||'regular'}</span></td>
      <td>${c.telefono||'—'}</td>
      <td>${c.dui_nit||'—'}</td>
      <td>${c.correo||'—'}</td>
      <td class="acciones-td">
        ${canEdit?`<button onclick='abrirEditarCliente(${JSON.stringify(c).replace(/'/g,"&#39;")})' class="btn-icon primary"><i class="fas fa-edit"></i></button>`:''}
        ${isAdmin?`<button onclick="eliminarClienteUI('${c.id}')" class="btn-icon danger"><i class="fas fa-trash"></i></button>`:''}
      </td>
    </tr>`).join('');
}

function abrirModalNuevoCliente() {
  ['cl_id','cl_nombre','cl_apellido','cl_telefono','cl_dui_nit','cl_correo','cl_direccion','cl_observaciones'].forEach(id => document.getElementById(id).value='');
  document.getElementById('cl_tipo').value='regular';
  document.getElementById('modalClienteTitulo').innerHTML='<i class="fas fa-user-plus"></i> Nuevo Cliente';
  abrirModal('modalCliente');
}
function abrirEditarCliente(c) {
  document.getElementById('cl_id').value           = c.id;
  document.getElementById('cl_nombre').value        = c.nombre||'';
  document.getElementById('cl_apellido').value      = c.apellido||'';
  document.getElementById('cl_telefono').value      = c.telefono||'';
  document.getElementById('cl_dui_nit').value       = c.dui_nit||'';
  document.getElementById('cl_correo').value        = c.correo||'';
  document.getElementById('cl_direccion').value     = c.direccion||'';
  document.getElementById('cl_observaciones').value = c.observaciones||'';
  document.getElementById('cl_tipo').value          = c.tipo||'regular';
  document.getElementById('modalClienteTitulo').innerHTML='<i class="fas fa-edit"></i> Editar Cliente';
  abrirModal('modalCliente');
}
async function guardarCliente() {
  const id = document.getElementById('cl_id').value;
  const r  = await apiPost({
    action: id?'editarCliente':'agregarCliente', id, usuario: currentUser.usuario,
    nombre:        document.getElementById('cl_nombre').value,
    apellido:      document.getElementById('cl_apellido').value,
    telefono:      document.getElementById('cl_telefono').value,
    dui_nit:       document.getElementById('cl_dui_nit').value,
    correo:        document.getElementById('cl_correo').value,
    direccion:     document.getElementById('cl_direccion').value,
    observaciones: document.getElementById('cl_observaciones').value,
    tipo:          document.getElementById('cl_tipo').value,
  });
  showToast(r.message, r.status);
  if (r.status==='success') { cerrarModal('modalCliente'); cargarClientes(); cargarDatalistClientes(); }
}
async function eliminarClienteUI(id) {
  if (!confirm('¿Eliminar este cliente?')) return;
  const r = await apiPost({ action:'eliminarCliente', id, usuario: currentUser.usuario });
  showToast(r.message, r.status);
  if (r.status==='success') { cargarClientes(); cargarDatalistClientes(); }
}

// ═══════════════════════════════════════════════════════════════
// PROVEEDORES
// ═══════════════════════════════════════════════════════════════
async function cargarProveedores() {
  const r = await apiFetch('getProveedores');
  cachedProveedores = r.status==='success' ? r.data : [];
  const tbody   = document.getElementById('proveedoresTableBody');
  const canEdit = ['admin','empleado'].includes(currentUser?.rol);
  const isAdmin = currentUser?.rol==='admin';
  if (!cachedProveedores.length) { tbody.innerHTML='<tr><td colspan="6">No hay proveedores.</td></tr>'; return; }
  tbody.innerHTML = cachedProveedores.map(p => `
    <tr>
      <td><b>${p.nombre}</b></td>
      <td>${p.empresa||'—'}</td>
      <td>${p.telefono||'—'}</td>
      <td>${p.correo||'—'}</td>
      <td>${p.contacto||'—'}</td>
      <td class="acciones-td">
        ${canEdit?`<button onclick='abrirEditarProveedor(${JSON.stringify(p).replace(/'/g,"&#39;")})' class="btn-icon primary"><i class="fas fa-edit"></i></button>`:''}
        ${isAdmin?`<button onclick="eliminarProveedorUI('${p.id}')" class="btn-icon danger"><i class="fas fa-trash"></i></button>`:''}
      </td>
    </tr>`).join('');
}

function abrirModalNuevoProveedor() {
  ['pv_id','pv_nombre','pv_empresa','pv_telefono','pv_correo','pv_contacto','pv_direccion','pv_observaciones'].forEach(id => document.getElementById(id).value='');
  document.getElementById('modalProveedorTitulo').innerHTML='<i class="fas fa-building"></i> Nuevo Proveedor';
  abrirModal('modalProveedor');
}
function abrirEditarProveedor(p) {
  document.getElementById('pv_id').value           = p.id;
  document.getElementById('pv_nombre').value        = p.nombre||'';
  document.getElementById('pv_empresa').value       = p.empresa||'';
  document.getElementById('pv_telefono').value      = p.telefono||'';
  document.getElementById('pv_correo').value        = p.correo||'';
  document.getElementById('pv_contacto').value      = p.contacto||'';
  document.getElementById('pv_direccion').value     = p.direccion||'';
  document.getElementById('pv_observaciones').value = p.observaciones||'';
  document.getElementById('modalProveedorTitulo').innerHTML='<i class="fas fa-edit"></i> Editar Proveedor';
  abrirModal('modalProveedor');
}
async function guardarProveedor() {
  const id = document.getElementById('pv_id').value;
  const r  = await apiPost({
    action: id?'editarProveedor':'agregarProveedor', id, usuario: currentUser.usuario,
    nombre:       document.getElementById('pv_nombre').value,
    empresa:      document.getElementById('pv_empresa').value,
    telefono:     document.getElementById('pv_telefono').value,
    correo:       document.getElementById('pv_correo').value,
    contacto:     document.getElementById('pv_contacto').value,
    direccion:    document.getElementById('pv_direccion').value,
    observaciones:document.getElementById('pv_observaciones').value,
  });
  showToast(r.message, r.status);
  if (r.status==='success') { cerrarModal('modalProveedor'); cargarProveedores(); cargarDatalistProveedores(); }
}
async function eliminarProveedorUI(id) {
  if (!confirm('¿Eliminar este proveedor?')) return;
  const r = await apiPost({ action:'eliminarProveedor', id, usuario: currentUser.usuario });
  showToast(r.message, r.status);
  if (r.status==='success') { cargarProveedores(); cargarDatalistProveedores(); }
}

// ═══════════════════════════════════════════════════════════════
// GASTOS
// ═══════════════════════════════════════════════════════════════
async function cargarGastos() {
  const r = await apiFetch('getGastos');
  cachedGastos  = r.status==='success' ? r.data : [];
  const tbody   = document.getElementById('gastosTableBody');
  const M       = configEmpresa.moneda||'$';
  const isAdmin = currentUser?.rol==='admin';
  if (!cachedGastos.length) { tbody.innerHTML='<tr><td colspan="6">No hay gastos.</td></tr>'; return; }
  tbody.innerHTML = [...cachedGastos].reverse().map(g => `
    <tr>
      <td>${g.descripcion}</td>
      <td><b>${M}${fmt(g.monto)}</b></td>
      <td>${g.categoria||'—'}</td>
      <td>${formatFecha(g.fecha)}</td>
      <td>${g.usuario||'—'}</td>
      <td>${isAdmin?`<button onclick="eliminarGastoUI('${g.id}')" class="btn-icon danger"><i class="fas fa-trash"></i></button>`:'—'}</td>
    </tr>`).join('');
}
async function eliminarGastoUI(id) {
  if (!confirm('¿Eliminar este gasto?')) return;
  const r = await apiPost({ action:'eliminarGasto', id, usuario: currentUser.usuario });
  showToast(r.message, r.status);
  if (r.status==='success') cargarGastos();
}

// ═══════════════════════════════════════════════════════════════
// CORTE DE CAJA
// ═══════════════════════════════════════════════════════════════
async function loadCaja() {
  const r = await apiFetch('getCajaResumen');
  if (r.status !== 'success') return;
  cajaData = r.data;
  const M = r.data.moneda || configEmpresa.moneda || '$';
  document.getElementById('caja_ventas').textContent = `${M}${fmt(r.data.ventasHoy)}`;
  document.getElementById('caja_gastos').textContent = `${M}${fmt(r.data.gastosHoy)}`;
  document.getElementById('caja_neto').textContent   = `${M}${fmt(r.data.efectivoEsperado)}`;

  const tbody = document.getElementById('historialCajaBody');
  if (r.data.historial?.length) {
    tbody.innerHTML = [...r.data.historial].reverse().map(c => `
      <tr>
        <td>${formatFecha(c.fecha)}</td>
        <td>${c.usuario}</td>
        <td>${M}${fmt(c.total_ventas)}</td>
        <td>${M}${fmt(c.total_gastos)}</td>
        <td>${M}${fmt(c.efectivo_inicial)}</td>
        <td><b>${M}${fmt(c.efectivo_final)}</b></td>
        <td style="color:${parseFloat(c.diferencia||0)>=0?'var(--success-color)':'var(--danger-color)'}">${M}${fmt(c.diferencia)}</td>
      </tr>`).join('');
  } else tbody.innerHTML = '<tr><td colspan="7">Sin cortes.</td></tr>';
}

async function ejecutarCierreCaja() {
  if (!confirm('¿Confirmar cierre de caja?')) return;
  const btn = document.getElementById('btn_cerrarCaja');
  btn.disabled = true;
  const r = await apiPost({
    action:'cerrarCaja', usuario: currentUser.usuario,
    total_ventas:   cajaData.ventasHoy,
    total_gastos:   cajaData.gastosHoy,
    efectivo_inicial: parseFloat(document.getElementById('caja_efectivo_inicial').value)||0,
    efectivo_contado: parseFloat(document.getElementById('caja_efectivo_contado').value)||0,
    notas: document.getElementById('caja_notas').value,
  });
  showStatus('statusCaja', r.status, r.message);
  if (r.status==='success') { showToast(r.message,'success'); loadCaja(); }
  btn.disabled = false;
}

// ═══════════════════════════════════════════════════════════════
// REPORTES POR FECHA (Fase 2)
// ═══════════════════════════════════════════════════════════════
function setPeriodo(tipo) {
  document.querySelectorAll('.btn-periodo').forEach(b => b.classList.remove('activo'));
  event.currentTarget.classList.add('activo');
  const hoy  = new Date();
  let ini, fin;
  if (tipo === 'hoy')   { ini = fin = hoy; }
  else if (tipo==='ayer') { const a=new Date(hoy); a.setDate(a.getDate()-1); ini=fin=a; }
  else if (tipo==='semana') { ini=new Date(hoy); ini.setDate(hoy.getDate()-hoy.getDay()); fin=hoy; }
  else if (tipo==='mes')  { ini=new Date(hoy.getFullYear(),hoy.getMonth(),1); fin=hoy; }
  else if (tipo==='anio') { ini=new Date(hoy.getFullYear(),0,1); fin=hoy; }
  else if (tipo==='personalizado') {
    document.getElementById('rango_personalizado').classList.remove('hidden');
    return;
  }
  document.getElementById('rango_personalizado').classList.add('hidden');
  periodoActual.ini = ini ? ini.toISOString().split('T')[0] : null;
  periodoActual.fin = fin ? fin.toISOString().split('T')[0] : null;
}

async function cargarReporte(tipo) {
  showStatus('statusReporte','info','Cargando reporte...');
  document.getElementById('reporteTable').classList.add('hidden');
  document.getElementById('reporte_resumen_cards').classList.add('hidden');
  reporteActual = [];

  // Usar rango personalizado si está visible
  const rangoPers = document.getElementById('rango_personalizado');
  if (!rangoPers.classList.contains('hidden')) {
    periodoActual.ini = document.getElementById('r_fecha_ini').value;
    periodoActual.fin = document.getElementById('r_fecha_fin').value;
  }
  if (!periodoActual.ini) { showStatus('statusReporte','warning','Selecciona un período primero.'); return; }

  const M = configEmpresa.moneda||'$';
  const url = `getReporte&tipo=${tipo}&fecha_inicio=${periodoActual.ini}&fecha_fin=${periodoActual.fin}`;
  const r   = await apiFetch(url);
  if (r.status !== 'success') { showStatus('statusReporte','error', r.message); return; }

  // Resumen cards
  const cards = document.getElementById('reporte_resumen_cards');
  cards.classList.remove('hidden');
  const res = r.resumen || {};
  if (tipo === 'ventas') {
    cards.innerHTML = `
      <div class="reporte-card ventas"><div class="rc-label">Total Ventas</div><div class="rc-valor">${M}${fmt(res.total)}</div></div>
      <div class="reporte-card"><div class="rc-label">N° Tickets</div><div class="rc-valor">${res.tickets||0}</div></div>
      <div class="reporte-card"><div class="rc-label">Ticket Promedio</div><div class="rc-valor">${M}${fmt(res.promedio)}</div></div>`;
  } else if (tipo === 'compras') {
    cards.innerHTML = `<div class="reporte-card compras"><div class="rc-label">Total Invertido</div><div class="rc-valor">${M}${fmt(res.total)}</div></div><div class="reporte-card"><div class="rc-label">Registros</div><div class="rc-valor">${res.registros||0}</div></div>`;
  } else if (tipo === 'gastos') {
    cards.innerHTML = `<div class="reporte-card gastos"><div class="rc-label">Total Gastos</div><div class="rc-valor">${M}${fmt(res.total)}</div></div>` +
      Object.entries(res.porCategoria||{}).map(([k,v]) => `<div class="reporte-card gastos"><div class="rc-label">${k}</div><div class="rc-valor">${M}${fmt(v)}</div></div>`).join('');
  } else if (tipo === 'ganancias') {
    cards.innerHTML = `
      <div class="reporte-card ventas"><div class="rc-label">Ventas</div><div class="rc-valor">${M}${fmt(res.ventas)}</div></div>
      <div class="reporte-card compras"><div class="rc-label">Compras</div><div class="rc-valor">${M}${fmt(res.compras)}</div></div>
      <div class="reporte-card gastos"><div class="rc-label">Gastos</div><div class="rc-valor">${M}${fmt(res.gastos)}</div></div>
      <div class="reporte-card ganancia"><div class="rc-label">Ganancia Neta</div><div class="rc-valor">${M}${fmt(res.ganancia_neta)}</div></div>`;
    showStatus('statusReporte','success','Reporte generado.');
    return;
  }

  // Tabla
  if (r.data?.length) {
    const heads = Object.keys(r.data[0]);
    const thead = document.getElementById('reporteTableHead');
    const tbody = document.getElementById('reporteTableBody');
    thead.innerHTML = `<tr>${heads.map(h=>`<th>${h.toUpperCase()}</th>`).join('')}</tr>`;
    tbody.innerHTML = r.data.map(row =>
      `<tr>${Object.values(row).map(v=>`<td>${isFechaISO(v)?formatFecha(v):typeof v==='number'?fmt(v):v}</td>`).join('')}</tr>`
    ).join('');
    document.getElementById('reporteTable').classList.remove('hidden');
    reporteActual = r.data;
  }
  showStatus('statusReporte','success',`Reporte listo. ${r.data?.length||0} registros.`);
}

// ═══════════════════════════════════════════════════════════════
// PAPELERA
// ═══════════════════════════════════════════════════════════════
async function cargarPapelera() {
  const r     = await apiFetch('getPapelera');
  const tbody = document.getElementById('papeleraTableBody');
  if (r.status!=='success'||!r.data.length) { tbody.innerHTML='<tr><td colspan="5">La papelera está vacía.</td></tr>'; return; }
  tbody.innerHTML = r.data.map(item => {
    let datos = item.datos_originales||'';
    try { const d=JSON.parse(datos); datos=`${d.nombre||''} (Cód: ${d['código']||'—'})`; } catch(e){}
    return `<tr>
      <td>${item.tipo}</td>
      <td>${datos}</td>
      <td>${formatFecha(item.fecha_eliminado)}</td>
      <td>${item.eliminado_por}</td>
      <td><button onclick="restaurarDePapelera('${item.id}')" class="btn secondary-btn" style="height:32px;min-width:auto;padding:0 .75rem;font-size:.8rem"><i class="fas fa-undo"></i> Restaurar</button></td>
    </tr>`;
  }).join('');
}
async function restaurarDePapelera(id) {
  if (!confirm('¿Restaurar este elemento?')) return;
  const r = await apiPost({ action:'restaurarProducto', papelera_id:id, usuario: currentUser.usuario });
  showToast(r.message, r.status);
  if (r.status==='success') { cargarPapelera(); loadInventario(); }
}

// ═══════════════════════════════════════════════════════════════
// ACTIVIDAD
// ═══════════════════════════════════════════════════════════════
async function cargarActividad() {
  const r     = await apiFetch('getActividad');
  const tbody = document.getElementById('actividadTableBody');
  if (r.status!=='success'||!r.data.length) { tbody.innerHTML='<tr><td colspan="4">Sin actividad.</td></tr>'; return; }
  tbody.innerHTML = [...r.data].reverse().map(a => `
    <tr>
      <td>${formatFecha(a.fecha)}</td>
      <td><b>${a.usuario}</b></td>
      <td><span class="badge badge-primary" style="font-size:.7rem">${a.accion}</span></td>
      <td>${a.detalle}</td>
    </tr>`).join('');
}

// ═══════════════════════════════════════════════════════════════
// USUARIOS
// ═══════════════════════════════════════════════════════════════
async function cargarUsuarios() {
  const r     = await apiFetch('getUsuarios');
  const tbody = document.getElementById('usuariosTableBody');
  if (r.status!=='success'||!r.data.length) { tbody.innerHTML='<tr><td colspan="5">Sin usuarios.</td></tr>'; return; }
  const roles = {admin:'Administrador',empleado:'Empleado',lectura:'Solo Lectura'};
  tbody.innerHTML = r.data.map(u => {
    const activo = u.activo!==false&&u.activo!=='false'&&u.activo!==0;
    return `<tr>
      <td><b>${u.usuario}</b></td>
      <td><span class="badge ${u.rol==='admin'?'badge-danger':u.rol==='empleado'?'badge-primary':'badge-warning'}">${roles[u.rol]||u.rol}</span></td>
      <td><span class="badge ${activo?'badge-success':'badge-danger'}">${activo?'Activo':'Inactivo'}</span></td>
      <td>${formatFecha(u.ultimo_acceso)}</td>
      <td class="acciones-td">
        <button onclick='abrirEditarUsuario(${JSON.stringify(u).replace(/'/g,"&#39;")})' class="btn-icon primary"><i class="fas fa-edit"></i></button>
        <button onclick="toggleUsuarioUI('${u.id}')" class="btn-icon ${activo?'warning':'success'}"><i class="fas fa-${activo?'ban':'check'}"></i></button>
        ${currentUser.usuario!==u.usuario?`<button onclick="eliminarUsuarioUI('${u.id}','${u.usuario}')" class="btn-icon danger"><i class="fas fa-trash"></i></button>`:''}
      </td>
    </tr>`;
  }).join('');
}
function abrirModalNuevoUsuario() {
  ['u_id','u_usuario','u_password'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('u_rol').value='empleado';
  document.getElementById('modalUsuarioTitulo').innerHTML='<i class="fas fa-user-plus"></i> Nuevo Usuario';
  abrirModal('modalUsuario');
}
function abrirEditarUsuario(u) {
  document.getElementById('u_id').value       = u.id;
  document.getElementById('u_usuario').value  = u.usuario;
  document.getElementById('u_password').value = '';
  document.getElementById('u_rol').value      = u.rol;
  document.getElementById('modalUsuarioTitulo').innerHTML='<i class="fas fa-edit"></i> Editar Usuario';
  abrirModal('modalUsuario');
}
async function guardarUsuario() {
  const id = document.getElementById('u_id').value;
  const r  = await apiPost({ action:id?'editarUsuario':'agregarUsuario', id, usuarioActual: currentUser.usuario, usuario: document.getElementById('u_usuario').value, password: document.getElementById('u_password').value, rol: document.getElementById('u_rol').value });
  showToast(r.message, r.status);
  if (r.status==='success') { cerrarModal('modalUsuario'); cargarUsuarios(); }
}
async function toggleUsuarioUI(id) {
  const r = await apiPost({ action:'toggleUsuario', id, usuarioActual: currentUser.usuario });
  showToast(r.message, r.status);
  if (r.status==='success') cargarUsuarios();
}
async function eliminarUsuarioUI(id, nombre) {
  if (!confirm(`¿Eliminar al usuario "${nombre}"?`)) return;
  const r = await apiPost({ action:'eliminarUsuario', id, usuarioActual: currentUser.usuario });
  showToast(r.message, r.status);
  if (r.status==='success') cargarUsuarios();
}

// ═══════════════════════════════════════════════════════════════
// EMPRESA (formulario)
// ═══════════════════════════════════════════════════════════════
async function cargarFormEmpresa() {
  await cargarConfigEmpresa();
  const c = configEmpresa;
  document.getElementById('e_nombre').value          = c.nombre||'';
  document.getElementById('e_slogan').value          = c.slogan||'';
  document.getElementById('e_nit').value             = c.nit||'';
  document.getElementById('e_nrc').value             = c.nrc||'';
  document.getElementById('e_iva_pct').value         = c.iva_pct||'13';
  document.getElementById('e_moneda').value          = c.moneda||'$';
  document.getElementById('e_telefono').value        = c.telefono||'';
  document.getElementById('e_correo').value          = c.correo||'';
  document.getElementById('e_direccion').value       = c.direccion||'';
  document.getElementById('e_logo_url').value        = c.logo_url||'';
  document.getElementById('e_redes').value           = c.redes||'';
  document.getElementById('e_mensaje_ticket').value  = c.mensaje_ticket||'¡Gracias por su compra!';
  actualizarPreviewEmpresa();

  // Agregar opción de backup automático si no existe ya
  if (!document.getElementById('btnBackupAuto')) {
    const empForm = document.getElementById('empresaForm');
    if (empForm) {
      const div = document.createElement('div');
      div.className = 'card mt-6';
      div.innerHTML = `
        <h3><i class="fas fa-clock"></i> Backup Automático</h3>
        <p style="color:var(--text-muted);margin:.75rem 0">Guardar respaldo diario automáticamente en Google Drive a las 11:00 PM.</p>
        <button id="btnBackupAuto" onclick="configurarBackupAutomatico()" class="btn secondary-btn">
          <i class="fas fa-calendar-check"></i> Activar Backup Diario Automático
        </button>`;
      empForm.after(div);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════
async function ejecutarConfigAction(action) {
  document.getElementById('iniciarDBBtn').disabled = true;
  document.getElementById('resetDBBtn').disabled   = true;
  showStatus('statusConfig','info',`Procesando...`);
  const r = await apiFetch(action);
  showStatus('statusConfig', r.status, r.message);
  if (r.status==='success') loadInitialData();
  document.getElementById('iniciarDBBtn').disabled = false;
  document.getElementById('resetDBBtn').disabled   = false;
}

function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}

// ═══════════════════════════════════════════════════════════════
// EXPORTAR CSV
// ═══════════════════════════════════════════════════════════════
async function exportarCSV(tipo) {
  let datos=[], nombre=tipo;
  if (tipo==='inventario') { datos=inventarioGlobal; }
  else if (tipo==='clientes')    { datos=cachedClientes; }
  else if (tipo==='proveedores') { datos=cachedProveedores; }
  else if (tipo==='gastos')      { datos=cachedGastos; }
  else if (tipo==='actividad')   { const r=await apiFetch('getActividad'); datos=r.data||[]; }
  else if (tipo==='reporte') {
    if (!reporteActual.length) { showToast('No hay datos en la tabla.','warning'); return; }
    datos=reporteActual;
  }
  if (!datos.length) { showToast('No hay datos para exportar.','warning'); return; }
  const headers = Object.keys(datos[0]);
  const rows    = datos.map(d => headers.map(h => {
    let v = d[h];
    if (isFechaISO(v)) v = formatFecha(v);
    return `"${String(v??'').replace(/"/g,'""')}"`;
  }).join(','));
  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=`${nombre}_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
  showToast('CSV descargado.','success');
}

// ═══════════════════════════════════════════════════════════════
// BACKUP
// ═══════════════════════════════════════════════════════════════
async function crearBackup() {
  showToast('Creando backup...','info');
  const r = await apiFetch('getBackup');
  if (r.status!=='success') { showToast('Error al crear backup.','error'); return; }
  const blob = new Blob([JSON.stringify(r.data,null,2)], {type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=`Backup_ERP_${new Date().toISOString().slice(0,10)}.json`; a.click();
  URL.revokeObjectURL(url);
  showToast('Backup descargado.','success');
}

// ═══════════════════════════════════════════════════════════════
// ESCÁNER
// ═══════════════════════════════════════════════════════════════
function openScanner(prefix) {
  scannerPrefix = prefix;
  document.getElementById('scannerModal').classList.remove('hidden');
  html5QrcodeScanner = new Html5QrcodeScanner("reader", {fps:10, qrbox:{width:250,height:150}}, false);
  html5QrcodeScanner.render(decoded => {
    const inputId = prefix==='p' ? 'p_codigo' : `${prefix}_query`;
    const inp = document.getElementById(inputId);
    if (inp) {
      inp.value = decoded;
      inp.dispatchEvent(new Event('input'));
      if (prefix!=='p') buscarProductoDebounce(decoded, prefix);
    }
    closeScannerModal();
    showToast('Código escaneado.','success');
  }, () => {});
}
function closeScannerModal() {
  const m = document.getElementById('scannerModal');
  m.classList.add('hidden');
  if (html5QrcodeScanner) { html5QrcodeScanner.clear().catch(()=>{}); html5QrcodeScanner=null; }
}

// ═══════════════════════════════════════════════════════════════
// MODALES
// ═══════════════════════════════════════════════════════════════
function abrirModal(id)  { const m=document.getElementById(id); m.classList.remove('hidden'); m.classList.add('active'); document.body.style.overflow='hidden'; }
function cerrarModal(id) { const m=document.getElementById(id); m.classList.add('hidden'); m.classList.remove('active'); document.body.style.overflow=''; }

// ═══════════════════════════════════════════════════════════════
// TOAST & STATUS
// ═══════════════════════════════════════════════════════════════
function showToast(msg, type='info') {
  const c = document.getElementById('toastContainer');
  const t = document.createElement('div');
  const icons = {success:'check-circle',error:'times-circle',warning:'exclamation-triangle',info:'info-circle'};
  t.className = `toast toast-${type}`;
  t.innerHTML = `<i class="fas fa-${icons[type]||'info-circle'}"></i> <span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(()=>t.classList.add('show'),10);
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),400); },4000);
}

function showStatus(elId, type, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  const icons = {success:'check-circle',error:'times-circle',warning:'exclamation-triangle',info:'info-circle'};
  el.className = `status-message ${type}`;
  el.innerHTML = `<i class="fas fa-${icons[type]||'info-circle'}"></i> ${msg}`;
  el.classList.remove('hidden');
}

// ═══════════════════════════════════════════════════════════════
// API HELPERS
// ═══════════════════════════════════════════════════════════════
async function apiFetch(action) {
  const r = await fetch(`${SCRIPT_URL}?action=${action}`);
  return r.json();
}
async function apiPost(data) {
  const r = await fetch(SCRIPT_URL, {
    method:'POST',
    body: JSON.stringify(data),
    headers:{'Content-Type':'text/plain;charset=utf-8'}
  });
  return r.json();
}

// ═══════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════
function fmt(n)      { return (parseFloat(n)||0).toFixed(2); }
function isFechaISO(v){ return typeof v==='string' && /^\d{4}-\d{2}-\d{2}T/.test(v); }
function formatFecha(v) {
  if (!v||v==='') return '—';
  try {
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return d.toLocaleDateString('es-SV',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  } catch(e){ return String(v); }
}

// ═══════════════════════════════════════════════════════════════
// FASES 3 & 4 — FRONTEND EXTENSIONS
// ═══════════════════════════════════════════════════════════════

// ─── PERMISOS EXTENDIDOS ──────────────────────────────────────
PERMISOS.admin    = [...PERMISOS.admin,    'combos','importador','facturas','soporte'];
PERMISOS.empleado = [...PERMISOS.empleado, 'combos','soporte'];

// Dashboard V3 (reemplaza la función original handleLoadDashboard)
async function handleLoadDashboard() {
  showStatus('statusDashboard','info','Cargando...');
  try {
    const r = await apiFetch('getDashboardV3');
    if (r.status !== 'success') { showStatus('statusDashboard','error', r.message); return; }
    const d = r.data;
    const M = configEmpresa.moneda || '$';

    document.getElementById('totalVentas').textContent    = `${M}${fmt(d.totales.ventas)}`;
    document.getElementById('totalCompras').textContent   = `${M}${fmt(d.totales.compras)}`;
    document.getElementById('totalGastos').textContent    = `${M}${fmt(d.totales.gastos)}`;
    document.getElementById('totalGanancias').textContent = `${M}${fmt(d.totales.ganancias)}`;
    document.getElementById('ventasHoy').textContent      = `${M}${fmt(d.totales.ventasHoy)}`;
    document.getElementById('ventasMes').textContent      = `${M}${fmt(d.totales.ventasMes)}`;
    document.getElementById('totalGanancias').style.color = d.totales.ganancias >= 0 ? 'var(--success-color)' : 'var(--danger-color)';

    renderAlertasStock(d.stockBajo, d.productosAgotados);
    renderTopVendidos(d.topVendidos);
    renderTopRentables(d.topRentables);
    renderStockCritico(d.stockBajo);
    renderKPIsV3(d);
    if (d.grafico?.length) renderCharts(d.grafico);
    if (d.porCategoria)    renderGraficoCategoria(d.porCategoria);

    showStatus('statusDashboard','success','Dashboard actualizado.');
    setTimeout(() => document.getElementById('statusDashboard').classList.add('hidden'), 2500);
  } catch(e) { showStatus('statusDashboard','error', e.message); }
}

function renderKPIsV3(d) {
  const M = configEmpresa.moneda || '$';
  // Insertar KPIs extra si no existen
  let kpiZone = document.getElementById('kpiZoneV3');
  if (!kpiZone) {
    kpiZone = document.createElement('div');
    kpiZone.id = 'kpiZoneV3';
    kpiZone.className = 'dashboard-v3-extra';
    const statsGrid = document.querySelector('#dashboard .stats-grid');
    if (statsGrid) statsGrid.after(kpiZone);
  }
  kpiZone.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-icon azul"><i class="fas fa-receipt"></i></div>
      <div><div class="kpi-val">${M}${fmt(d.ticketPromedio)}</div><div class="kpi-label">Ticket Promedio</div></div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon verde"><i class="fas fa-users"></i></div>
      <div><div class="kpi-val">${d.clientesAtendidos||0}</div><div class="kpi-label">Clientes Atendidos</div></div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon naranja"><i class="fas fa-box-open"></i></div>
      <div><div class="kpi-val">${d.productosAgotados||0}</div><div class="kpi-label">Productos Agotados</div></div>
    </div>
    <div class="kpi-card">
      <div class="kpi-icon rojo"><i class="fas fa-ghost"></i></div>
      <div><div class="kpi-val">${d.sinMovimiento||0}</div><div class="kpi-label">Sin Movimiento (30d)</div></div>
    </div>`;
}

function renderGraficoCategoria(porCategoria) {
  // Crear contenedor si no existe
  let row = document.getElementById('chartRowV3');
  if (!row) {
    row = document.createElement('div');
    row.id = 'chartRowV3';
    row.className = 'chart-row';
    row.innerHTML = `
      <div class="card"><h3><i class="fas fa-chart-pie"></i> Ventas por Categoría</h3>
        <div class="chart-container-sm"><canvas id="catChart"></canvas></div>
      </div>
      <div class="card">
        <h3><i class="fas fa-ghost"></i> Top Rentables</h3>
        <div id="topRentablesV3"></div>
      </div>`;
    const existingChart = document.querySelector('#dashboard .chart-container');
    if (existingChart) existingChart.after(row);
  }

  const labels = Object.keys(porCategoria);
  const values = Object.values(porCategoria);
  if (!labels.length) return;

  const ctx = document.getElementById('catChart');
  if (!ctx) return;

  const colors = ['#055de2','#17a2b8','#28a745','#ffc107','#dc3545','#6f42c1','#fd7e14','#20c997'];
  if (window._catChart) window._catChart.destroy();
  window._catChart = new Chart(ctx.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets:[{ data:values, backgroundColor: colors.slice(0, labels.length), borderWidth:2 }]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ position:'bottom', labels:{ font:{ size:11 } } } }
    }
  });
}

// ─── NOTIFICACIONES ──────────────────────────────────────────
async function cargarNotificaciones() {
  try {
    const r = await apiFetch(`getNotificaciones&usuario=${encodeURIComponent(currentUser?.usuario||'')}`);
    if (r.status === 'success') {
      const badge = document.getElementById('notifBadge');
      const total = r.total || 0;
      badge.textContent = total > 9 ? '9+' : total;
      badge.classList.toggle('hidden', total === 0);
      renderNotificaciones(r.data);
    }
  } catch(e) {}
}

function renderNotificaciones(notifs) {
  const list = document.getElementById('notifList');
  if (!notifs?.length) { list.innerHTML = '<div class="notif-vacia"><i class="fas fa-check-circle" style="color:var(--success-color);font-size:1.5rem;display:block;margin-bottom:.5rem"></i>Sin notificaciones</div>'; return; }
  list.innerHTML = notifs.map(n => `
    <div class="notif-item ${n.leida?'':'no-leida'}" onclick="marcarNotifLeida('${n.id}')">
      <div class="notif-item-titulo">${n.titulo}</div>
      <div class="notif-item-msg">${n.mensaje}</div>
      <div style="font-size:.7rem;color:var(--text-muted);margin-top:.25rem">${formatFecha(n.fecha)}</div>
    </div>`).join('');
}

function toggleNotifPanel() {
  const panel = document.getElementById('notifPanel');
  panel.classList.toggle('hidden');
}

async function marcarNotifLeida(id) {
  await apiPost({ action:'marcarNotifLeida', id, usuario: currentUser.usuario });
  cargarNotificaciones();
}

async function marcarTodasLeidas() {
  await apiPost({ action:'marcarNotifLeida', id:'todas', usuario: currentUser.usuario });
  document.getElementById('notifPanel').classList.add('hidden');
  cargarNotificaciones();
}

// ─── COMBOS ──────────────────────────────────────────────────
let combosCache = [];
let comboComponentes = [];

async function cargarCombos() {
  const r = await apiFetch('getCombos');
  combosCache = r.status === 'success' ? r.data.filter(c => c.activo !== false) : [];
  const grid = document.getElementById('combosGrid');
  const M = configEmpresa.moneda || '$';

  if (!combosCache.length) {
    grid.innerHTML = '<p class="text-muted" style="grid-column:1/-1">No hay combos. Crea el primero con el botón "Nuevo Combo".</p>';
    return;
  }

  grid.innerHTML = combosCache.map(c => `
    <div class="combo-card">
      <div class="combo-card-img">
        ${c.imagen_url ? `<img src="${c.imagen_url}" alt="${c.nombre}">` : '🎁'}
      </div>
      <div class="combo-card-body">
        <div class="combo-card-nombre">${c.nombre}</div>
        <div class="combo-card-desc">${c.descripcion||'—'}</div>
        <div class="combo-card-precio">${M}${fmt(c.precio_venta)}</div>
        <div style="display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap">
          <button onclick="abrirVenderCombo('${c.id}','${c.nombre}',${c.precio_venta})" class="btn primary-btn" style="height:34px;min-width:auto;padding:0 .75rem;font-size:.8rem">
            <i class="fas fa-cash-register"></i> Vender
          </button>
          <button onclick="abrirEditarCombo('${c.id}')" class="btn secondary-btn" style="height:34px;min-width:auto;padding:0 .75rem;font-size:.8rem">
            <i class="fas fa-edit"></i>
          </button>
          <button onclick="verFichaCombo('${c.id}')" class="btn secondary-btn" style="height:34px;min-width:auto;padding:0 .75rem;font-size:.8rem">
            <i class="fas fa-info-circle"></i>
          </button>
          ${currentUser?.rol==='admin'?`<button onclick="eliminarComboUI('${c.id}','${c.nombre}')" class="btn-icon danger"><i class="fas fa-trash"></i></button>`:''}
        </div>
      </div>
    </div>`).join('');
}

function abrirModalNuevoCombo() {
  comboComponentes = [];
  ['combo_id','combo_nombre','combo_descripcion','combo_imagen'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('combo_precio').value = '';
  document.getElementById('modalComboTitulo').innerHTML = '<i class="fas fa-layer-group"></i> Nuevo Combo';
  renderComboComponentes();
  abrirModal('modalCombo');
}

async function abrirEditarCombo(id) {
  const combo = combosCache.find(c => c.id === id);
  if (!combo) return;
  document.getElementById('combo_id').value          = combo.id;
  document.getElementById('combo_nombre').value      = combo.nombre;
  document.getElementById('combo_precio').value      = fmt(combo.precio_venta);
  document.getElementById('combo_descripcion').value = combo.descripcion||'';
  document.getElementById('combo_imagen').value      = combo.imagen_url||'';
  document.getElementById('modalComboTitulo').innerHTML = '<i class="fas fa-edit"></i> Editar Combo';
  // Cargar componentes
  const r = await apiFetch(`getComboDetalle&combo_id=${id}`);
  comboComponentes = r.status==='success' ? r.data.map(d => ({producto_id:d.producto_id, nombre:d.producto_nombre, cantidad:d.cantidad})) : [];
  renderComboComponentes();
  abrirModal('modalCombo');
}

function renderComboComponentes() {
  const el = document.getElementById('combo_componentes_list');
  if (!comboComponentes.length) { el.innerHTML = '<p class="text-muted" style="font-size:.875rem;margin-bottom:.5rem">Sin componentes. Agrega productos abajo.</p>'; return; }
  el.innerHTML = comboComponentes.map((c, i) => `
    <div class="combo-comp-item" style="background:var(--gray-50);padding:.5rem .75rem;border-radius:var(--radius);margin-bottom:.4rem">
      <i class="fas fa-box"></i>
      <span style="flex:1">${c.nombre}</span>
      <span style="font-weight:600">x${c.cantidad}</span>
      <button onclick="quitarComponenteCombo(${i})" class="btn-quitar-item" style="margin-left:.5rem"><i class="fas fa-times"></i></button>
    </div>`).join('');
}

function agregarComponenteCombo() {
  const id     = document.getElementById('combo_prod_id').value;
  const nombre = document.getElementById('combo_prod_nombre_sel').value;
  const qty    = parseInt(document.getElementById('combo_comp_qty').value)||1;
  if (!id || !nombre) { showToast('Selecciona un producto.','warning'); return; }
  const existe = comboComponentes.findIndex(c => c.producto_id === id);
  if (existe > -1) comboComponentes[existe].cantidad += qty;
  else comboComponentes.push({ producto_id:id, nombre, cantidad:qty });
  renderComboComponentes();
  document.getElementById('combo_prod_query').value = '';
  document.getElementById('combo_prod_id').value    = '';
  document.getElementById('combo_prod_nombre_sel').value = '';
  document.getElementById('combo_comp_qty').value   = 1;
  document.getElementById('combo_sugerencias').classList.add('hidden');
}

function quitarComponenteCombo(idx) {
  comboComponentes.splice(idx, 1);
  renderComboComponentes();
}

async function guardarCombo() {
  if (!comboComponentes.length) { showToast('Agrega al menos un componente.','warning'); return; }
  const id = document.getElementById('combo_id').value;
  const r  = await apiPost({
    action: id ? 'editarCombo' : 'agregarCombo',
    id, usuario: currentUser.usuario,
    nombre:      document.getElementById('combo_nombre').value,
    precio_venta:document.getElementById('combo_precio').value,
    descripcion: document.getElementById('combo_descripcion').value,
    imagen_url:  document.getElementById('combo_imagen').value,
    componentes: comboComponentes
  });
  showToast(r.message, r.status);
  if (r.status === 'success') { cerrarModal('modalCombo'); cargarCombos(); }
}

async function eliminarComboUI(id, nombre) {
  if (!confirm(`¿Eliminar combo "${nombre}"?`)) return;
  const r = await apiPost({ action:'eliminarCombo', id, usuario: currentUser.usuario });
  showToast(r.message, r.status);
  if (r.status === 'success') cargarCombos();
}

let comboVenderActual = null;
function abrirVenderCombo(id, nombre, precio) {
  comboVenderActual = { id, nombre, precio };
  const qty = prompt(`¿Cuántos combos de "${nombre}" vender?`, '1');
  if (!qty || isNaN(qty) || parseInt(qty) < 1) return;
  confirmarVentaCombo(parseInt(qty));
}

async function confirmarVentaCombo(cantidad) {
  if (!comboVenderActual) return;
  const r = await apiPost({
    action:'venderCombo', usuario: currentUser.usuario,
    combo_id: comboVenderActual.id,
    cantidad,
    cliente_nombre: 'Mostrador',
    metodo_pago: 'Efectivo'
  });
  showToast(r.message, r.status);
  if (r.status === 'success') {
    imprimirTicket(r.data);
    cargarCombos();
  }
}

async function verFichaCombo(id) {
  const r = await apiFetch(`getComboDetalle&combo_id=${id}`);
  const combo = combosCache.find(c => c.id === id);
  const M = configEmpresa.moneda || '$';
  const el = document.getElementById('fichaProductoBody');
  el.innerHTML = `
    <h3 style="margin-bottom:1rem">${combo?.nombre||'Combo'}</h3>
    <p style="color:var(--text-muted);margin-bottom:1rem">${combo?.descripcion||'—'}</p>
    <p style="font-size:1.5rem;font-weight:800;color:var(--primary-color);margin-bottom:1rem">${M}${fmt(combo?.precio_venta)}</p>
    <h4 style="margin-bottom:.75rem">Componentes:</h4>
    ${r.status==='success'&&r.data.length ? r.data.map(d=>`
      <div class="combo-comp-item" style="background:var(--gray-50);padding:.5rem .75rem;border-radius:var(--radius);margin-bottom:.4rem">
        <i class="fas fa-box"></i>
        <span style="flex:1">${d.producto_nombre}</span>
        <span>x${d.cantidad}</span>
        <span style="color:${parseInt(d.stock_disponible)>0?'var(--success-color)':'var(--danger-color)'}">Stock: ${d.stock_disponible}</span>
      </div>`).join('') : '<p class="text-muted">Sin componentes.</p>'}`;
  abrirModal('modalFichaProducto');
}

// (función seleccionarProducto fusionada arriba, con soporte para combos)

// ─── FICHA ESTADÍSTICAS PRODUCTO ──────────────────────────────
async function verFichaProducto(productoId) {
  abrirModal('modalFichaProducto');
  document.getElementById('fichaProductoBody').innerHTML = '<div class="text-muted text-center"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
  const r = await apiFetch(`getEstadisticasProducto&producto_id=${productoId}`);
  if (r.status !== 'success') { document.getElementById('fichaProductoBody').innerHTML = `<p class="text-muted">${r.message}</p>`; return; }
  const d = r.data;
  const M = configEmpresa.moneda || '$';
  document.getElementById('fichaProductoBody').innerHTML = `
    <div class="ficha-producto-header">
      <div class="ficha-producto-img">${d.producto.imagen_url?`<img src="${d.producto.imagen_url}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-lg)">`:'📦'}</div>
      <div>
        <h3 style="margin:0 0 .25rem">${d.producto.nombre}</h3>
        <p style="color:var(--text-muted);font-size:.875rem">Código: ${d.producto['código']||'—'} | Categoría: ${d.producto['categoría']||'—'}</p>
        <p style="font-size:1.25rem;font-weight:700;color:var(--primary-color);margin-top:.5rem">${M}${fmt(d.producto.precio_venta)}</p>
      </div>
    </div>
    <div class="stats-producto-grid">
      <div class="stat-prod-card"><div class="stat-prod-valor">${d.totalVendido}</div><div class="stat-prod-label">Unidades Vendidas</div></div>
      <div class="stat-prod-card"><div class="stat-prod-valor">${d.totalComprado}</div><div class="stat-prod-label">Unidades Compradas</div></div>
      <div class="stat-prod-card"><div class="stat-prod-valor">${M}${fmt(d.montoVentas)}</div><div class="stat-prod-label">Ingresos Generados</div></div>
      <div class="stat-prod-card"><div class="stat-prod-valor" style="color:var(--success-color)">${M}${fmt(d.gananciaGenerada)}</div><div class="stat-prod-label">Ganancia Generada</div></div>
      <div class="stat-prod-card"><div class="stat-prod-valor">${d.rotacion}%</div><div class="stat-prod-label">Rotación</div></div>
      <div class="stat-prod-card"><div class="stat-prod-valor" style="font-size:.9rem">${d.ultimaVenta?formatFecha(d.ultimaVenta):'—'}</div><div class="stat-prod-label">Última Venta</div></div>
    </div>`;
}

// Agrega el botón de estadísticas a cada fila del inventario (llamado al final de filtrarInventario)
function agregarBotonesEstadisticas() {
  document.querySelectorAll('#inventarioTableBody tr').forEach(tr => {
    const td = tr.querySelector('.acciones-td');
    if (!td) return;
    if (td.querySelector('.btn-stats')) return; // ya tiene botón
    const editBtn = td.querySelector('.btn-icon.primary');
    if (editBtn) {
      const onclickStr = editBtn.getAttribute('onclick')||'';
      const idExtract  = onclickStr.match(/"id":"([^"]+)"/);
      if (idExtract) {
        const pid = idExtract[1];
        const statsBtn = document.createElement('button');
        statsBtn.className = 'btn-icon btn-stats';
        statsBtn.style.cssText = 'background:none;border:1px solid var(--border-color);border-radius:4px;width:28px;height:28px;cursor:pointer;color:var(--text-muted)';
        statsBtn.title = 'Ver estadísticas';
        statsBtn.innerHTML = '<i class="fas fa-chart-bar"></i>';
        statsBtn.onclick = () => verFichaProducto(pid);
        td.appendChild(statsBtn);
      }
    }
  });
}

// ─── IMPORTADOR CSV / JSON ────────────────────────────────────
let importarDatosParsed = [];

function resetImportador() {
  importarDatosParsed = [];
  document.getElementById('imp_preview').classList.add('hidden');
  document.getElementById('imp_resultado').classList.add('hidden');
  document.getElementById('imp_file').value = '';
}

function handleFileDrop(e) {
  e.preventDefault();
  document.getElementById('importadorZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) procesarArchivoImport(file);
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) procesarArchivoImport(file);
}

function procesarArchivoImport(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const contenido = e.target.result;
    try {
      if (file.name.endsWith('.json')) {
        const json = JSON.parse(contenido);
        importarDatosParsed = Array.isArray(json) ? json : [json];
      } else {
        importarDatosParsed = parsearCSV(contenido);
      }
      mostrarPreviewImport();
    } catch(err) {
      showToast(`Error al leer archivo: ${err.message}`, 'error');
    }
  };
  reader.readAsText(file, 'UTF-8');
}

function parsearCSV(texto) {
  const lineas = texto.trim().split('\n');
  if (lineas.length < 2) return [];
  const separador = lineas[0].includes(';') ? ';' : ',';
  const headers   = lineas[0].split(separador).map(h => h.trim().replace(/^"|"$/g,'').toLowerCase());
  return lineas.slice(1).filter(l => l.trim()).map(l => {
    const vals = l.split(separador).map(v => v.trim().replace(/^"|"$/g,''));
    const obj  = {};
    headers.forEach((h, i) => obj[h] = vals[i]||'');
    return obj;
  });
}

function mostrarPreviewImport() {
  if (!importarDatosParsed.length) { showToast('Archivo sin datos.', 'warning'); return; }
  const preview = document.getElementById('imp_preview');
  const info    = document.getElementById('imp_preview_info');
  const thead   = document.getElementById('imp_thead');
  const tbody   = document.getElementById('imp_tbody');
  const tipo    = document.getElementById('imp_tipo').value;

  info.textContent = `${importarDatosParsed.length} registros de "${tipo}" listos para importar`;
  const heads = Object.keys(importarDatosParsed[0]);
  thead.innerHTML = `<tr>${heads.map(h=>`<th>${h}</th>`).join('')}</tr>`;
  tbody.innerHTML = importarDatosParsed.slice(0,10).map(row =>
    `<tr>${heads.map(h=>`<td>${row[h]||'—'}</td>`).join('')}</tr>`
  ).join('') + (importarDatosParsed.length>10 ? `<tr><td colspan="${heads.length}" class="text-center text-muted">... y ${importarDatosParsed.length-10} más</td></tr>` : '');

  preview.classList.remove('hidden');
  document.getElementById('imp_resultado').classList.add('hidden');
}

async function ejecutarImportacion() {
  if (!importarDatosParsed.length) { showToast('Sin datos.','warning'); return; }
  showStatus('statusImportador','info','Importando...');
  const tipo = document.getElementById('imp_tipo').value;
  const r    = await apiPost({ action:'importarDatos', tipo, filas: importarDatosParsed, usuario: currentUser.usuario });

  const res = document.getElementById('imp_resultado');
  res.className = `importador-resultado ${r.status==='success'?'ok':'error'}`;
  res.innerHTML = `<b>${r.message}</b>${r.data?.detalle?.length ? '<br><small>'+r.data.detalle.join('<br>')+'</small>' : ''}`;
  res.classList.remove('hidden');

  showStatus('statusImportador', r.status, r.message);
  if (r.status==='success') { resetImportador(); loadInitialData(); }
}

// ─── FACTURAS ────────────────────────────────────────────────
let facturasCache = [];

async function cargarFacturas() {
  const r = await apiFetch('getFacturas');
  facturasCache = r.status==='success' ? r.data : [];
  const tbody = document.getElementById('facturasTableBody');
  const M = configEmpresa.moneda||'$';
  if (!facturasCache.length) { tbody.innerHTML='<tr><td colspan="7">No hay facturas.</td></tr>'; return; }
  tbody.innerHTML = [...facturasCache].reverse().map(f => `
    <tr>
      <td><b>#${f.numero||f.id.slice(-6)}</b></td>
      <td><code>${f.venta_id||'—'}</code></td>
      <td>${f.cliente_nombre||'—'}</td>
      <td>${formatFecha(f.fecha)}</td>
      <td><b>${M}${fmt(f.total)}</b></td>
      <td><span class="badge-estado ${f.estado||'emitida'}">${f.estado||'emitida'}</span></td>
      <td class="acciones-td">
        <button onclick="imprimirFacturaA4('${f.id}')" class="btn-icon primary" title="Imprimir A4"><i class="fas fa-print"></i></button>
      </td>
    </tr>`).join('');
}

async function generarFacturaDesdeVenta(ventaId) {
  const r = await apiPost({ action:'generarFactura', venta_id:ventaId, usuario: currentUser.usuario });
  showToast(r.message, r.status);
  if (r.status==='success') cargarFacturas();
  return r;
}

async function imprimirFacturaA4(facturaId) {
  const factura = facturasCache.find(f => f.id === facturaId);
  if (!factura) { showToast('Factura no encontrada.','error'); return; }
  const emp = configEmpresa;
  const M   = emp.moneda||'$';

  document.getElementById('facturaContenido').innerHTML = `
    <div class="factura-encabezado">
      <div>
        ${emp.logo_url?`<img src="${emp.logo_url}" class="factura-logo" alt="Logo">`:''}
        <h2 style="margin:.5rem 0 .25rem;font-size:1.5rem">${emp.nombre||'Mi Negocio'}</h2>
        <p style="font-size:.8rem;color:#555">${emp.direccion||''}</p>
        <p style="font-size:.8rem;color:#555">${emp.telefono||''} ${emp.correo||''}</p>
        ${emp.nit?`<p style="font-size:.8rem;color:#555">NIT: ${emp.nit} | NRC: ${emp.nrc||'—'}</p>`:''}
      </div>
      <div class="factura-numero">
        <h2>FACTURA</h2>
        <p><b>#${factura.numero||factura.id.slice(-6)}</b></p>
        <p>Fecha: ${formatFecha(factura.fecha)}</p>
        <p>Estado: ${factura.estado||'emitida'}</p>
      </div>
    </div>
    <div class="factura-partes">
      <div class="factura-parte">
        <h4>Emisor</h4>
        <p><b>${emp.nombre||'Mi Negocio'}</b></p>
        <p>${emp.direccion||'—'}</p>
        <p>${emp.telefono||'—'}</p>
      </div>
      <div class="factura-parte">
        <h4>Cliente</h4>
        <p><b>${factura.cliente_nombre||'Mostrador'}</b></p>
      </div>
    </div>
    <table class="factura-tabla">
      <thead><tr><th>Descripción</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>
        <tr><td>Venta #${factura.venta_id?.slice(-8)||'—'}</td><td style="text-align:right">${M}${fmt(factura.subtotal)}</td></tr>
      </tbody>
    </table>
    <div class="factura-totales">
      <div class="factura-totales-box">
        <div class="ft-linea"><span>Subtotal:</span><span>${M}${fmt(factura.subtotal)}</span></div>
        <div class="ft-linea"><span>Descuento:</span><span>-${M}${fmt(factura.descuento)}</span></div>
        <div class="ft-linea"><span>IVA (${emp.iva_pct||0}%):</span><span>${M}${fmt(factura.impuesto)}</span></div>
        <div class="ft-total"><span>TOTAL:</span><span>${M}${fmt(factura.total)}</span></div>
      </div>
    </div>
    <div class="factura-footer">
      <p>${emp.mensaje_ticket||'¡Gracias por su compra!'}</p>
      ${emp.redes?`<p>${emp.redes}</p>`:''}
    </div>`;

  document.getElementById('facturaPrintZone').style.display = 'block';
  window.print();
  setTimeout(() => document.getElementById('facturaPrintZone').style.display = 'none', 1000);
}

// ─── SOPORTE ─────────────────────────────────────────────────
let ticketsSoporteCache = [];
let filtroTicketActual  = 'todos';

async function cargarTicketsSoporte() {
  const r = await apiFetch('getSoporte');
  ticketsSoporteCache = r.status==='success' ? r.data : [];
  filtrarTickets(filtroTicketActual);
}

function filtrarTickets(estado) {
  filtroTicketActual = estado;
  document.querySelectorAll('#soporte .btn-periodo').forEach(b => b.classList.toggle('activo', b.getAttribute('onclick')?.includes(`'${estado}'`)));
  const lista = estado==='todos' ? ticketsSoporteCache : ticketsSoporteCache.filter(t => t.estado===estado);
  renderTicketsSoporte(lista);
}

function renderTicketsSoporte(tickets) {
  const el    = document.getElementById('ticketsSoporteList');
  const isAdm = currentUser?.rol==='admin';
  if (!tickets.length) { el.innerHTML='<p class="text-muted">Sin tickets.</p>'; return; }
  el.innerHTML = [...tickets].reverse().map(t => `
    <div class="ticket-soporte-card">
      <div class="ticket-soporte-header">
        <div>
          <div class="ticket-soporte-titulo">${t.titulo}</div>
          <div class="ticket-soporte-meta">${t.usuario} · ${formatFecha(t.fecha)}</div>
        </div>
        <span class="badge-soporte ${t.estado||'nuevo'}">${t.estado||'nuevo'}</span>
      </div>
      <div class="ticket-soporte-desc">${t.descripcion}</div>
      ${t.respuesta?`<div class="ticket-soporte-respuesta"><b><i class="fas fa-reply"></i> Respuesta (${t.admin||'Admin'}):</b><br>${t.respuesta}</div>`:''}
      ${isAdm?`<div style="margin-top:.75rem;display:flex;gap:.5rem">
        <button onclick='abrirResponderTicket(${JSON.stringify(t).replace(/'/g,"&#39;")})' class="btn secondary-btn" style="height:32px;min-width:auto;padding:0 .75rem;font-size:.8rem"><i class="fas fa-reply"></i> Responder</button>
        <button onclick="cambiarEstadoTicketUI('${t.id}','cerrado')" class="btn secondary-btn" style="height:32px;min-width:auto;padding:0 .75rem;font-size:.8rem"><i class="fas fa-times"></i> Cerrar</button>
      </div>`:''}
    </div>`).join('');
}

function abrirModalTicket() {
  document.getElementById('tk_titulo').value       = '';
  document.getElementById('tk_descripcion').value  = '';
  abrirModal('modalTicketSoporte');
}

async function enviarTicketSoporte() {
  const titulo = document.getElementById('tk_titulo').value.trim();
  const desc   = document.getElementById('tk_descripcion').value.trim();
  if (!titulo || !desc) { showToast('Completa todos los campos.','warning'); return; }
  const r = await apiPost({ action:'crearTicketSoporte', titulo, descripcion:desc, usuario: currentUser.usuario });
  showToast(r.message, r.status);
  if (r.status==='success') { cerrarModal('modalTicketSoporte'); cargarTicketsSoporte(); }
}

function abrirResponderTicket(ticket) {
  document.getElementById('resp_ticket_id').value = ticket.id;
  document.getElementById('resp_estado').value    = 'respondido';
  document.getElementById('resp_texto').value     = '';
  document.getElementById('resp_ticket_detalle').innerHTML = `
    <b>${ticket.titulo}</b><br>
    <span style="font-size:.8rem;color:var(--text-muted)">${ticket.usuario} · ${formatFecha(ticket.fecha)}</span><br>
    <p style="margin-top:.5rem;font-size:.875rem">${ticket.descripcion}</p>`;
  abrirModal('modalResponderTicket');
}

async function enviarRespuestaTicket() {
  const id       = document.getElementById('resp_ticket_id').value;
  const texto    = document.getElementById('resp_texto').value.trim();
  const estado   = document.getElementById('resp_estado').value;
  if (!texto) { showToast('Escribe una respuesta.','warning'); return; }
  const r = await apiPost({ action:'responderTicket', id, respuesta:texto, estado, usuario: currentUser.usuario, admin: currentUser.usuario });
  showToast(r.message, r.status);
  if (r.status==='success') { cerrarModal('modalResponderTicket'); cargarTicketsSoporte(); }
}

async function cambiarEstadoTicketUI(id, estado) {
  const r = await apiPost({ action:'cambiarEstadoTicket', id, estado, usuario: currentUser.usuario });
  showToast(r.message, r.status);
  if (r.status==='success') cargarTicketsSoporte();
}

// ─── PIN DE SEGURIDAD ─────────────────────────────────────────
let pinActual       = '';
let pinCallbackFn   = null;

function solicitarPIN(motivo, callback) {
  pinActual     = '';
  pinCallbackFn = callback;
  document.getElementById('pinMotivo').textContent  = motivo;
  document.getElementById('pinDisplay').textContent = '——';
  document.getElementById('pinError').classList.add('hidden');
  abrirModal('modalPIN');
}

function pinInput(digito) {
  if (pinActual.length >= 8) return;
  pinActual += digito;
  document.getElementById('pinDisplay').textContent = '●'.repeat(pinActual.length);
}

function pinBorrar() {
  pinActual = pinActual.slice(0, -1);
  document.getElementById('pinDisplay').textContent = pinActual.length ? '●'.repeat(pinActual.length) : '——';
}

async function pinConfirmar() {
  if (!pinActual) { showStatus('pinError','error','Ingresa tu PIN.'); return; }
  const r = await apiPost({ action:'verificarPIN', usuario: currentUser.usuario, pin: pinActual });
  if (r.status === 'success') {
    cerrarModal('modalPIN');
    pinActual = '';
    if (pinCallbackFn) { pinCallbackFn(); pinCallbackFn = null; }
  } else {
    document.getElementById('pinError').innerHTML = '<i class="fas fa-times-circle"></i> PIN incorrecto.';
    document.getElementById('pinError').classList.remove('hidden');
    pinActual = '';
    document.getElementById('pinDisplay').textContent = '——';
  }
}

// Protege reset BD con PIN; esta es la única función pública handleConfigAction
async function handleConfigAction(action) {
  if (action === 'resetear') {
    solicitarPIN('⚠️ Confirma con PIN para RESETEAR la base de datos', () => ejecutarConfigAction(action));
  } else {
    await ejecutarConfigAction(action);
  }
}

// ─── BACKUP AUTOMÁTICO ────────────────────────────────────────
async function configurarBackupAutomatico() {
  const r = await apiFetch('configurarTriggerBackup');
  showToast(r.message||'Backup automático configurado (diario 23:00).','success');
}
