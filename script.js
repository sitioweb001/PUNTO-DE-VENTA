// ═══════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwbYNUf0--D2RVqFyaBZHFxQuClX6RBybuhK6kJU9Q02NZyICUIXEnUWIR1x25xMnfMrA/exec';

// ═══════════════════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════════════════
let currentUser   = null; // { id, usuario, rol }
let productDataCache = {};
let cachedInventario = [];
let cachedClientes   = [];
let cachedProveedores= [];
let cachedGastos     = [];
let resumenFinancieroChart, tendenciasChart;

// Permisos por rol
const PERMISOS = {
  admin:    ['dashboard','inventario','productos','categorias','compras','ventas','clientes','proveedores','gastos','papelera','resumenes','actividad','usuarios','configuracion'],
  empleado: ['dashboard','inventario','productos','compras','ventas','clientes','proveedores','gastos','resumenes'],
  lectura:  ['dashboard','inventario','resumenes']
};

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
// LOGIN
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
      body: JSON.stringify({ action: 'login', usuario, password }),
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
  setupMobile();
  loadInitialData();
  handleLoadDashboard();
}

function aplicarPermisos() {
  const PERMISOS = {
    admin: ['dashboard','inventario','productos','categorias','compras','ventas','clientes','proveedores','gastos','papelera','resumenes','actividad','usuarios','configuracion', 'caja'],
    empleado: ['inventario','productos','compras','ventas','clientes','proveedores','gastos', 'caja'],
    lectura: ['dashboard','inventario','resumenes']
  };
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
  const sections = document.querySelectorAll('.content-section');

  navLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const targetId = link.getAttribute('data-section');
      const PERMISOS = {
        admin: ['dashboard','inventario','productos','categorias','compras','ventas','clientes','proveedores','gastos','papelera','resumenes','actividad','usuarios','configuracion', 'caja'],
        empleado: ['inventario','productos','compras','ventas','clientes','proveedores','gastos', 'caja'],
        lectura: ['dashboard','inventario','resumenes']
      };
      const permitido = PERMISOS[currentUser.rol] || [];
      if (!permitido.includes(targetId)) {
        showToast('No tienes permiso para acceder a esta sección.', 'error');
        return;
      }
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
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

      if (window.innerWidth <= 992) document.getElementById('sidebar').classList.remove('active');
    });
  });

  document.getElementById('logoutBtn').addEventListener('click', e => {
    e.preventDefault();
    cerrarSesion();
  });
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
// FORMULARIOS
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

  // Producto
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
      usuario: currentUser.usuario
    };
    const res = await postAction(data);
    showStatus('statusProducto', res.status, res.message);
    if (res.status === 'success') { e.target.reset(); showToast('Producto registrado', 'success'); }
  });

  // Compras/Ventas - búsqueda
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

  // Dashboard botón
  document.getElementById('cargarDatosGraficosBtn').addEventListener('click', handleLoadDashboard);
  document.getElementById('cargarInventarioBtn').addEventListener('click', loadInventario);

  // Filtros inventario
  document.getElementById('inv_buscar').addEventListener('input', filtrarInventario);
  document.getElementById('inv_cat_filter').addEventListener('change', filtrarInventario);
  document.getElementById('inv_stock_filter').addEventListener('change', filtrarInventario);
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
    sel.innerHTML = '<option value="" disabled selected>Seleccione categoría</option>';
    cats.forEach(c => {
      const name = c.nombre || `(${c.id})`;
      sel.innerHTML += `<option value="${name}">${name}</option>`;
    });
  });

  // Actualizar filtro de categorías en inventario
  const catFilter = document.getElementById('inv_cat_filter');
  catFilter.innerHTML = '<option value="">Todas las categorías</option>';
  cats.forEach(c => {
    const name = c.nombre || `(${c.id})`;
    catFilter.innerHTML += `<option value="${name}">${name}</option>`;
  });

  if (list) {
    if (cats.length === 0) { list.innerHTML = '<li>No hay categorías.</li>'; return; }
    list.innerHTML = cats.map(c => `
      <li class="categoria-item">
        <span><b>${c.nombre}</b> <small style="color:var(--gray-500)">${c.id}</small></span>
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
    document.getElementById('totalVentas').textContent   = `$${(d.totales.ventas||0).toFixed(2)}`;
    document.getElementById('totalCompras').textContent  = `$${(d.totales.compras||0).toFixed(2)}`;
    document.getElementById('totalGanancias').textContent= `$${(d.totales.ganancias||0).toFixed(2)}`;
    document.getElementById('totalGastos').textContent   = `$${(d.totales.gastos||0).toFixed(2)}`;
    document.getElementById('ventasHoy').textContent     = `$${(d.totales.ventasHoy||0).toFixed(2)}`;
    document.getElementById('ventasMes').textContent     = `$${(d.totales.ventasMes||0).toFixed(2)}`;

    // Color ganancias
    const gEl = document.getElementById('totalGanancias');
    gEl.style.color = d.totales.ganancias > 0 ? 'var(--success-color)'
                    : d.totales.ganancias < 0 ? 'var(--danger-color)' : 'var(--gray-600)';

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
      html += `<div class="alert-item warning"><i class="fas fa-exclamation-triangle"></i> <b>${p.nombre}</b> — Stock: ${p.stock}</div>`;
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
  const labels   = data.map(r => r.fecha);
  const ventas   = data.map(r => r.ventas  || 0);
  const compras  = data.map(r => r.compras || 0);
  const ganancias= data.map(r => r.ganancia|| 0);

  const ctx1 = document.getElementById('resumenFinancieroChart').getContext('2d');
  if (resumenFinancieroChart) resumenFinancieroChart.destroy();
  resumenFinancieroChart = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Ventas',   data:ventas,  backgroundColor:'rgba(5,93,226,0.7)',  borderColor:'rgba(5,93,226,1)',  borderWidth:1 },
        { label:'Compras',  data:compras, backgroundColor:'rgba(23,162,184,0.7)',borderColor:'rgba(23,162,184,1)',borderWidth:1 },
        { label:'Ganancias',data:ganancias,type:'line',fill:false,backgroundColor:'rgba(40,167,69,0.7)',borderColor:'rgba(40,167,69,1)',borderWidth:2,tension:0.1 }
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
        { label:'Ventas Acumuladas',  data:ventas.reduce((a,c,i)=>[...a,(a[i-1]||0)+c],[]),  borderColor:'rgba(5,93,226,1)',  backgroundColor:'rgba(5,93,226,0.1)',  tension:0.1,fill:true },
        { label:'Compras Acumuladas', data:compras.reduce((a,c,i)=>[...a,(a[i-1]||0)+c],[]), borderColor:'rgba(23,162,184,1)',backgroundColor:'rgba(23,162,184,0.1)',tension:0.1,fill:true }
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
// INVENTARIO
// ═══════════════════════════════════════════════════════════════
async function loadInventario() {
  showStatus('statusInventario','info','Cargando inventario...');
  try {
    const res  = await fetch(`${SCRIPT_URL}?action=getInventario`);
    const data = await res.json();

    if (data.status === 'success' && data.data) {
      cachedInventario = data.data.filter(p => p.activo !== false && p.activo !== 'false' && p.activo !== 0);
      showStatus('statusInventario','success',`${cachedInventario.length} productos cargados.`);
      filtrarInventario();
    } else {
      showStatus('statusInventario','warning', data.message || 'Sin productos.');
      document.getElementById('inventarioTableBody').innerHTML = '<tr><td colspan="8">No hay productos.</td></tr>';
    }
  } catch(e) {
    showStatus('statusInventario','error',`Error: ${e.message}`);
  }
}

function filtrarInventario() {
  const buscar    = document.getElementById('inv_buscar').value.toLowerCase();
  const catFilter = document.getElementById('inv_cat_filter').value;
  const stockFilter= document.getElementById('inv_stock_filter').value;
  const canEdit   = ['admin','empleado'].includes(currentUser?.rol);

  const filtrados = cachedInventario.filter(p => {
    const nombre  = String(p.nombre||'').toLowerCase();
    const codigo  = String(p.código||'').toLowerCase();
    const cat     = String(p.categoría||'').toLowerCase();
    const stock   = parseInt(p.stock) || 0;

    if (buscar && !nombre.includes(buscar) && !codigo.includes(buscar) && !cat.includes(buscar)) return false;
    if (catFilter && p.categoría !== catFilter) return false;
    if (stockFilter === 'bajo'    && !(stock > 0 && stock <= 5)) return false;
    if (stockFilter === 'agotado' && stock !== 0) return false;
    if (stockFilter === 'ok'      && stock <= 5) return false;
    return true;
  });

  const tbody = document.getElementById('inventarioTableBody');
  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8">No se encontraron productos.</td></tr>';
    return;
  }

  tbody.innerHTML = filtrados.map(p => {
    const stock = parseInt(p.stock) || 0;
    const stockClass = stock === 0 ? 'danger' : stock <= 5 ? 'warning' : 'success';
    return `
      <tr>
        <td><small style="color:var(--gray-400)">${p.id}</small></td>
        <td><b>${p.nombre}</b></td>
        <td>${p.código}</td>
        <td>${p.categoría}</td>
        <td><span class="badge badge-${stockClass}">${stock}</span></td>
        <td>$${parseFloat(p.precio_compra||0).toFixed(2)}</td>
        <td>$${parseFloat(p.precio_venta||0).toFixed(2)}</td>
        <td class="acciones-td">
          ${canEdit ? `
            <button onclick="abrirEditarProducto(${JSON.stringify(p).replace(/"/g,'&quot;')})" class="btn-icon primary" title="Editar">
              <i class="fas fa-edit"></i>
            </button>
          ` : ''}
          ${currentUser?.rol === 'admin' ? `
            <button onclick="confirmarEliminarProducto('${p.id}','${p.nombre}')" class="btn-icon danger" title="Eliminar">
              <i class="fas fa-trash"></i>
            </button>
          ` : ''}
        </td>
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
// COMPRAS / VENTAS
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

  try {
    const res  = await fetch(`${SCRIPT_URL}?action=buscarProducto&query=${encodeURIComponent(query)}`);
    const data = await res.json();

    if (data.status === 'success' && data.data && data.data.length > 0) {
      const product = data.data[0];
      productDataCache[product.id] = product;
      updateProductDetails(product, detailDiv, prefix);
      idInput.value = product.id;
      submitBtn.disabled = false;
    } else {
      detailDiv.classList.remove('hidden');
      detailDiv.innerHTML = `<p style="color:var(--danger-color)"><i class="fas fa-exclamation-triangle"></i> ${data.message}</p>`;
    }
  } catch(e) {
    detailDiv.classList.remove('hidden');
    detailDiv.innerHTML = `<p style="color:var(--danger-color)">Error: ${e.message}</p>`;
  }
}

function updateProductDetails(product, detailDiv, prefix) {
  detailDiv.classList.remove('hidden');
  const isCompra = prefix === 'co';
  const price     = isCompra ? product.precio_compra : product.precio_venta;
  const priceLabel= isCompra ? 'Precio Compra' : 'Precio Venta';
  const stockStyle= product.stock < 5 ? 'color:var(--danger-color);font-weight:bold' : 'color:var(--success-color);font-weight:bold';

  detailDiv.innerHTML = `
    <p><b>Producto:</b> ${product.nombre} | <b>Cód:</b> ${product.código} | <b>Categoría:</b> ${product.categoría}</p>
    <p><b>Stock actual:</b> <span style="${stockStyle}">${product.stock}</span> &nbsp; <b>${priceLabel}:</b> $${parseFloat(price).toFixed(2)}</p>
    ${(!isCompra && product.stock < 5) ? `<p style="color:var(--warning-color)"><i class="fas fa-exclamation-triangle"></i> Stock bajo.</p>` : ''}
  `;
  document.getElementById(`${prefix}_precio_${isCompra?'compra':'venta'}`).value = parseFloat(price).toFixed(2);
}

async function handleTransactionPost(e, type) {
  e.preventDefault();
  const prefix    = type === 'compra' ? 'co' : 'v';
  const statusId  = type === 'compra' ? 'statusCompra' : 'statusVenta';
  const submitBtn = document.getElementById(`${prefix}_submit_btn`);
  const productoId= document.getElementById(`${prefix}_producto_id`).value;

  if (!productoId) { showStatus(statusId,'error','Selecciona un producto primero.'); return; }

  submitBtn.disabled = true;
  showStatus(statusId,'info',`Registrando ${type}...`);

  const data = {
    action: 'registrarTransaccion',
    producto_id: productoId,
    cantidad: document.getElementById(`${prefix}_cantidad`).value,
    precio: document.getElementById(`${prefix}_precio_${type==='compra'?'compra':'venta'}`).value,
    type,
    extra_data: document.getElementById(`${prefix}_${type==='compra'?'proveedor':'cliente'}`).value,
    usuario: currentUser.usuario
  };

  const res = await postAction(data);
  showStatus(statusId, res.status, res.message);
  
  if (res.status === 'success') {
      document.getElementById(`${prefix}_product_details`).classList.add('hidden');
      if (type === 'venta') {
          const ticketId = res.data ? res.data.ticket_id : null;
          if (typeof imprimirTicket === 'function') {
              imprimirTicket(ticketId, document.getElementById('v_query').value, data.cantidad, data.cantidad * data.precio, data.extra_data);
          }
      }
      form.reset();
  }
  if (res.status === 'success') {
    e.target.reset();
    delete productDataCache[productoId];
    document.getElementById(`${prefix}_product_details`).classList.add('hidden');
    showToast(res.message, 'success');
  }
  submitBtn.disabled = false;
}

// ═══════════════════════════════════════════════════════════════
// CLIENTES
// ═══════════════════════════════════════════════════════════════
async function cargarClientes() {
  const res  = await fetch(`${SCRIPT_URL}?action=getClientes`);
  const data = await res.json();
  cachedClientes = data.status === 'success' ? data.data : [];
  const tbody = document.getElementById('clientesTableBody');
  const canEdit= ['admin','empleado'].includes(currentUser?.rol);

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
        ${canEdit ? `<button onclick="abrirEditarCliente(${JSON.stringify(c).replace(/"/g,'&quot;')})" class="btn-icon primary"><i class="fas fa-edit"></i></button>` : ''}
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
  if (res.status === 'success') cargarClientes();
}

// ═══════════════════════════════════════════════════════════════
// PROVEEDORES
// ═══════════════════════════════════════════════════════════════
async function cargarProveedores() {
  const res  = await fetch(`${SCRIPT_URL}?action=getProveedores`);
  const data = await res.json();
  cachedProveedores = data.status === 'success' ? data.data : [];
  const tbody= document.getElementById('proveedoresTableBody');
  const canEdit = ['admin','empleado'].includes(currentUser?.rol);

  if (!cachedProveedores.length) {
    tbody.innerHTML = '<tr><td colspan="7">No hay proveedores.</td></tr>';
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
        ${canEdit ? `<button onclick="abrirEditarProveedor(${JSON.stringify(p).replace(/"/g,'&quot;')})" class="btn-icon primary"><i class="fas fa-edit"></i></button>` : ''}
        ${currentUser?.rol === 'admin' ? `<button onclick="eliminarProveedorUI('${p.id}')" class="btn-icon danger"><i class="fas fa-trash"></i></button>` : ''}
      </td>
    </tr>`).join('');
}

function abrirModalNuevoProveedor() {
  ['pv_id','pv_nombre','pv_empresa','pv_telefono','pv_correo','pv_direccion'].forEach(id => {
    document.getElementById(id).value = '';
  });
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
  if (res.status === 'success') cargarProveedores();
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
    try { const d = JSON.parse(datosStr); datosStr = d.nombre || datosStr; } catch(e) {}
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
  if (!confirm('¿Restaurar este elemento?')) return;
  const res = await postAction({ action:'restaurarProducto', papelera_id: papeleraId, usuario: currentUser.usuario });
  showToast(res.message, res.status);
  if (res.status === 'success') { cargarPapelera(); loadInventario(); }
}

// ═══════════════════════════════════════════════════════════════
// RESÚMENES
// ═══════════════════════════════════════════════════════════════
async function loadSummary(sheetName) {
  showStatus('statusResumen','info',`Cargando ${sheetName}...`);
  const table  = document.getElementById('resumenTable');
  const thead  = document.getElementById('resumenTableHead');
  const tbody  = document.getElementById('resumenTableBody');
  table.classList.add('hidden');

  const res  = await fetch(`${SCRIPT_URL}?action=getData&sheetName=${sheetName}`);
  const data = await res.json();

  if (data.status === 'success' && data.data.length > 0) {
    showStatus('statusResumen','success',`${data.data.length} registros.`);
    table.classList.remove('hidden');
    thead.innerHTML = `<tr>${Object.keys(data.data[0]).map(h=>`<th>${h.toUpperCase()}</th>`).join('')}</tr>`;
    tbody.innerHTML = data.data.map(row =>
      `<tr>${Object.values(row).map(v => `<td>${v instanceof Date ? formatFecha(v) : typeof v==='number' ? v.toFixed(2) : v}</td>`).join('')}</tr>`
    ).join('');
  } else {
    showStatus('statusResumen','warning','No hay datos.');
  }
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
          <button onclick="abrirEditarUsuario(${JSON.stringify(u).replace(/"/g,'&quot;')})" class="btn-icon primary"><i class="fas fa-edit"></i></button>
          <button onclick="toggleUsuarioUI('${u.id}')" class="btn-icon ${activo?'warning':'success'}" title="${activo?'Desactivar':'Activar'}">
            <i class="fas fa-${activo?'ban':'check'}"></i>
          </button>
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

// ═══════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════
async function handleConfigAction(action) {
  document.getElementById('iniciarDBBtn').disabled = true;
  document.getElementById('resetDBBtn').disabled   = true;
  showStatus('statusConfig','info',`Procesando "${action}"...`);

  const res  = await fetch(`${SCRIPT_URL}?action=${action}`);
  const data = await res.json();
  showStatus('statusConfig', data.status, data.message);

  if (data.status === 'success') loadInitialData();
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
  let datos = [];
  let nombre = tipo;

  if (tipo === 'inventario') {
    datos  = cachedInventario;
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
  } else {
    // Ventas, Compras, Actividad — cargar de la API
    const sheetMap = { ventas:'VENTAS', compras:'COMPRAS', actividad:'Actividad' };
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
    if (v instanceof Date) v = formatFecha(v);
    return `"${String(v||'').replace(/"/g,'""')}"`;
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

// ═══════════════════════════════════════════════════════════════
// BACKUP
// ═══════════════════════════════════════════════════════════════
async function crearBackup() {
  showToast('Creando backup...','info');
  const hojas = ['VENTAS','COMPRAS','Productos','Categorias','Clientes','Proveedores','Gastos'];
  const backup= {};

  for (const h of hojas) {
    const res  = await fetch(`${SCRIPT_URL}?action=getData&sheetName=${h}`);
    const data = await res.json();
    backup[h]  = data.status === 'success' ? data.data : [];
  }

  backup._metadata = { fecha: new Date().toISOString(), usuario: currentUser.usuario, version:'1.0' };

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], {type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup creado y descargado.','success');
}

// ═══════════════════════════════════════════════════════════════
// MODALES
// ═══════════════════════════════════════════════════════════════
function abrirModal(id) {
  document.getElementById(id).classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function cerrarModal(id) {
  document.getElementById(id).classList.add('hidden');
  document.body.style.overflow = '';
}
// Cerrar modal con click fuera
document.addEventListener('click', e => {
  document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
    if (e.target === modal) cerrarModal(modal.id);
  });
});

// ═══════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast     = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = { success:'check-circle', error:'times-circle', warning:'exclamation-triangle', info:'info-circle' };
  toast.innerHTML = `<i class="fas fa-${icons[type]||'info-circle'}"></i> ${message}`;

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


// --- CÓDIGO INYECTADO: ESCÁNER, TICKETS Y CAJA ---

// 1. TICKET
window.imprimirTicket = function(transId, nombreProd, cant, precioTotal, cliente) {
    document.getElementById('t_fecha').innerText = new Date().toLocaleString(); 
    document.getElementById('t_id').innerText = transId || Math.floor(Math.random()*10000);
    document.getElementById('t_cliente').innerText = cliente || "Mostrador";
    document.getElementById('t_items').innerHTML = `<tr><td>${cant}</td><td>${nombreProd}</td><td>$${parseFloat(precioTotal).toFixed(2)}</td></tr>`;
    document.getElementById('t_total').innerText = parseFloat(precioTotal).toFixed(2); 
    window.print();
};

// 2. CAJA
let cajaCalculoTemporal = { ventas: 0, gastos: 0 };
window.loadCaja = async function() {
    try {
        const [vRes, gRes, cRes] = await Promise.all([ 
            fetch(SCRIPT_URL + '?action=getData&sheetName=VENTAS'), 
            fetch(SCRIPT_URL + '?action=getData&sheetName=Gastos'), 
            fetch(SCRIPT_URL + '?action=getData&sheetName=Caja') 
        ]);
        const vData = await vRes.json(), gData = await gRes.json(), cData = await cRes.json();
        const hoy = new Date().toLocaleDateString(); let tVentas = 0, tGastos = 0;
        if (vData.status === 'success') tVentas = vData.data.filter(v=>new Date(v.fecha).toLocaleDateString() === hoy).reduce((s, v) => s + (parseFloat(v.cantidad||0) * parseFloat(v.precio_venta||0)), 0);
        if (gData.status === 'success') tGastos = gData.data.filter(g=>new Date(g.fecha).toLocaleDateString() === hoy).reduce((s, g) => s + parseFloat(g.monto||0), 0);
        
        cajaCalculoTemporal = { ventas: tVentas, gastos: tGastos };
        document.getElementById('caja_ventas').textContent = `$${tVentas.toFixed(2)}`; 
        document.getElementById('caja_gastos').textContent = `$${tGastos.toFixed(2)}`;
        document.getElementById('caja_neto').textContent = `$${(tVentas - tGastos).toFixed(2)}`;

        if (cData.status === 'success' && cData.data) {
            document.getElementById('historialCajaBody').innerHTML = cData.data.reverse().map(c => `<tr><td>${new Date(c.fecha).toLocaleString()}</td><td>${c.usuario}</td><td>$${c.total_ventas.toFixed(2)}</td><td>$${c.total_gastos.toFixed(2)}</td><td><b>$${c.efectivo_final.toFixed(2)}</b></td></tr>`).join('');
        }
    } catch(e) { showToast('Error en caja', 'error'); }
};

window.ejecutarCierreCaja = async function() {
    if(!confirm('¿Seguro que quieres hacer el cierre de caja? Esto guardará los totales del día.')) return;
    try {
        const req = { action: 'cerrarCaja', req_user: currentUser.usuario, total_ventas: cajaCalculoTemporal.ventas, total_gastos: cajaCalculoTemporal.gastos };
        const data = await postAction(req);
        if(data.status === 'success') { showToast(data.message, 'success'); loadCaja(); } else showToast(data.message, 'error');
    } catch(e) { showToast('Error al cerrar caja.', 'error'); }
};

// Hook btn_cerrarCaja
const btnCaja = document.getElementById('btn_cerrarCaja');
if (btnCaja) btnCaja.addEventListener('click', window.ejecutarCierreCaja);

// 3. ESCÁNER
let html5QrcodeScanner;
window.openScanner = function(prefix) {
    document.getElementById('scannerModal').classList.remove('hidden');
    document.getElementById('scannerModal').classList.add('active');
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 150} }, false);
    
    html5QrcodeScanner.render((decodedText) => {
        document.getElementById(prefix + '_query').value = decodedText; 
        buscarDatosProducto(decodedText, prefix);
        closeScannerModal();
        showToast('Código escaneado', 'success');
    }, (error) => {});
}

window.closeScanner = function() { closeScannerModal(); }
window.closeScannerModal = function() {
    document.getElementById('scannerModal').classList.remove('active');
    document.getElementById('scannerModal').classList.add('hidden');
    if(html5QrcodeScanner) {
        html5QrcodeScanner.clear().catch(e => console.error("Error", e));
    }
}
