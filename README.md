# 🛒 Sistema ERP & POS Web (Punto de Venta)
![Versión](https://img.shields.io/badge/Versión-3.0-blue.svg)
![Stack Frontend](https://img.shields.io/badge/Frontend-HTML5%20%7C%20CSS3%20%7C%20Vanilla%20JS-F37626.svg)
![Stack Backend](https://img.shields.io/badge/Backend-Google%20Apps%20Script-4285F4.svg)
![Database](https://img.shields.io/badge/Base%20de%20Datos-Google%20Sheets-0F9D58.svg)

Un sistema integral de Planificación de Recursos Empresariales (ERP) y Punto de Venta (POS) diseñado para operar íntegramente en la nube. Está construido bajo el paradigma de **Single Page Application (SPA)**, garantizando una navegación fluida sin recargas de página. Utiliza tecnologías web nativas en el frontend y la infraestructura de Google Workspace (Apps Script + Sheets) en el backend.

---

## 📑 Índice
1. [Características Principales](#1-características-principales)
2. [Arquitectura del Sistema](#2-arquitectura-del-sistema)
3. [Estructura del Proyecto (Archivos)](#3-estructura-del-proyecto-archivos)
4. [Módulos del Sistema](#4-módulos-del-sistema)
5. [Modelo de Base de Datos (Google Sheets)](#5-modelo-de-base-de-datos-google-sheets)
6. [Guía de Instalación y Despliegue](#6-guía-de-instalación-y-despliegue)
7. [Seguridad y Control de Acceso](#7-seguridad-y-control-de-acceso)
8. [Roadmap y Oportunidades de Mejora](#8-roadmap-y-oportunidades-de-mejora)

---

## 1. Características Principales

* ⚡ **Punto de Venta (POS) Reactivo:** Carrito de compras dinámico, cálculo de impuestos automáticos y generación de tickets de impresión (80mm/58mm) o Facturas A4.
* 📷 **Escáner Integrado:** Lector nativo de códigos de barras y QR utilizando la cámara del dispositivo móvil o webcam (`html5-qrcode`).
* 📦 **Gestión Avanzada de Inventario:** Control de stock físico, alertas visuales de stock crítico, registro de productos favoritos y gestión de "Combos" (productos compuestos por múltiples insumos).
* 📊 **Dashboards e Inteligencia de Negocio:** Paneles con KPIs financieros, gráficos de tendencias y rentabilidad impulsados por `Chart.js`.
* 🌙 **UI/UX Moderno:** Diseño totalmente responsivo (móvil, tablet, escritorio) con soporte nativo para **Modo Oscuro**.
* 🔄 **Importación Masiva:** Capacidad de cargar inventarios, clientes o proveedores de golpe mediante archivos `.csv` o `.json`.
* 💾 **Respaldos Automáticos:** Sistema programado (Triggers) para exportar copias de seguridad de la base de datos en formato JSON a Google Drive de forma diaria.

---

## 2. Arquitectura del Sistema

El proyecto sigue una arquitectura **Cliente-Servidor API-Driven**, donde el frontend y el backend están completamente desacoplados y se comunican exclusivamente mediante formato JSON.

* **Frontend (Cliente):** Ejecuta la lógica de presentación y el estado local. Funciona de manera asíncrona mediante promesas y funciones `async/await` (`apiFetch` y `apiPost`) para evitar bloqueos en el Hilo Principal (Main Thread) del navegador.
* **Backend (Servidor - `sg.js`):** Actúa como una API RESTful simulada. Expone un único *endpoint* a través de Google Apps Script. Utiliza un enrutador basado en sentencias `switch` sobre el parámetro `action` de la petición HTTP para derivar el flujo a controladores específicos.
* **Base de Datos:** Google Sheets actúa como motor de almacenamiento, donde cada pestaña (Sheet) simula una tabla relacional, y la primera fila actúa como el esquema de columnas.

---

## 3. Estructura del Proyecto (Archivos)

### 📄 `index.html` (Vista y Estructura)
Contiene la totalidad del DOM de la aplicación SPA.
* **Zonas de Impresión (`#ticketPrintZone`, `#facturaPrintZone`):** Contenedores inyectados dinámicamente que permanecen ocultos en pantalla pero se revelan mediante CSS exclusivo de impresión (`@media print`).
* **Secciones de la SPA (`.content-section`):** Cada módulo del ERP (Inventario, Clientes, Dashboard) está precargado como una etiqueta `<section>` que se oculta o muestra iterando la clase `.active`.
* **Modales y Toasts:** Plantillas HTML ancladas al final del cuerpo para diálogos modales (Escáner, Edición, PIN de seguridad) y notificaciones efímeras.

### 🎨 `estilo.css` (Sistema de Diseño)
Implementa la UI/UX sin depender de librerías como Bootstrap o Tailwind, optimizando el peso de carga.
* **Variables CSS (`:root`):** Define paletas de colores (`--primary-color`, `--danger-color`), espaciados y sombras. El **Modo Oscuro** se logra reasignando estas variables en la clase `body.dark-mode`.
* **Grid y Flexbox:** Uso intensivo para layouts complejos (Dashboard, Formularios, Panel de Carrito).
* **Media Queries:** Configuración responsiva para Desktop (1200px+), Tablets y menús colapsables (768px-1100px), y móviles (<=640px).

### ⚙️ `script.js` (Lógica de Negocio y Estado Frontend)
Controlador principal de la experiencia de usuario.
* **Gestión de Estado Global:** Variables como `currentUser`, `inventarioGlobal`, `carrito` y `configEmpresa` mantienen la aplicación rápida al cachear datos y reducir llamadas a la API.
* **Debounce Search:** Implementa lógica de retraso (`searchTimeout`) en los buscadores de ventas y compras para no saturar el backend con peticiones por cada tecla presionada.
* **Validación de Formularios:** Pre-procesamiento de datos y armado del JSON *payload* antes de enviarlo al backend.

### 🗄️ `sg.js` (Backend y ORM de Apps Script)
* **Enrutadores (`doGet` / `doPost`):** Puntos de entrada para recibir solicitudes HTTP GET y POST.
* **Funciones Utilitarias (`getData`, `findRow`):** Actúan como un ORM básico, iterando sobre matrices bidimensionales (Arrays de GAS) para buscar registros por ID (`uid()`), insertar filas (`appendRow()`) o actualizar valores.
* **Logs y Auditoría:** Función `log()` que registra silenciosamente cualquier mutación en la pestaña "Actividad".

---

## 4. Módulos del Sistema

| Módulo | Descripción |
| :--- | :--- |
| **Dashboard** | Pantalla de inicio con KPI's del día/mes, alertas de stock agotado/crítico, y gráficos comparativos de Ventas vs. Gastos. |
| **Punto de Venta (POS)** | Interfaz optimizada para cajeros. Incluye buscador rápido, integración con cámara para códigos de barras, adición de descuentos, selección de clientes y métodos de pago. |
| **Inventario & Productos** | Catálogo general. Permite filtrado complejo, edición rápida de precios y definición de stock mínimo para alertas automáticas. |
| **Combos** | Capacidad de crear paquetes promocionales (Ej: Combo Hamburguesa = 1 Pan + 1 Carne + 1 Refresco). Vender un combo descuenta el stock de sus componentes individuales. |
| **Compras & Gastos** | Registro de ingreso de mercadería actualizando precios de costo promedio, y captura de gastos operativos fijos (Luz, Internet, Nómina). |
| **Corte de Caja** | Cierre de turno. Compara ventas registradas vs. efectivo contado, generando un historial de sobrantes/faltantes en caja. |
| **Devoluciones** | Gestión logística inversa. Registra el retorno de productos por garantías o errores, con opción de reintegrar el ítem al stock físico. |
| **Reportes por Fecha** | Generador de resúmenes financieros personalizados (Hoy, Mes, Año, Rango). Exportables a `.csv`. |
| **Roles y Permisos** | Gestión administrativa. Roles definidos: `Admin` (Acceso total), `Empleado` (POS e Inventario), `Lectura` (Visualización de datos sin mutación). Protección de acciones críticas mediante PIN de 4-6 dígitos. |

---

## 5. Modelo de Base de Datos (Google Sheets)

El script inicializa automáticamente 21 hojas si no existen. A continuación, el esquema principal:

1. **`Productos`**: `[id, nombre, código, categoría, precio_compra, precio_venta, stock, stock_minimo, imagen_url, favorito, activo, fecha_creado]`
2. **`Ventas`**: `[id, fecha, cliente_id, cliente_nombre, subtotal, descuento, impuesto, total, metodo_pago, usuario, estado, notas]`
3. **`VentaDetalle`**: `[id, venta_id, producto_id, producto_nombre, cantidad, precio_unitario, descuento_linea, subtotal_linea]`
4. **`Compras`**: `[id, producto_id, cantidad, precio_compra, fecha, proveedor_id, proveedor_nombre, usuario, notas]`
5. **`Combos` y `ComboDetalle`**: Mapeo de paquetes a productos base.
6. **`Caja`**: `[id, fecha, usuario, total_ventas, total_gastos, efectivo_inicial, efectivo_final, diferencia, notas]`
7. **`Usuarios`**: Tabla de autenticación con contraseñas/pines.
8. **`Actividad` / `Papelera`**: Registros de auditoría inmutables y almacenamiento temporal de borrados lógicos.
9. **`Empresa`**: Configuración key-value (Nombre, Logo, % IVA, Moneda).

---

## 6. Guía de Instalación y Despliegue

### Paso 1: Configurar el Backend (Google Apps Script)
1. Ve a [Google Sheets](https://sheets.google.com) y crea una nueva hoja de cálculo en blanco.
2. Copia el ID de la URL de tu hoja (ej: `1g1jENAm0IxzPZ...`).
3. Ve a `Extensiones > Apps Script`.
4. Borra el código por defecto, pega el contenido del archivo `sg.js` de este proyecto.
5. Modifica la primera línea del código con tu ID: `const SPREADSHEET_ID = "TU_NUEVO_ID_AQUI";`.
6. Haz clic en **Implementar > Nueva Implementación**.
7. Selecciona tipo: **Aplicación Web**.
   * Ejecutar como: *Tú*.
   * Quién tiene acceso: *Cualquier persona*.
8. Despliega, otorga los permisos de Google solicitados y copia la **URL de la Aplicación Web** generada.

### Paso 2: Inicializar la Base de Datos
1. En el editor de Apps Script, selecciona la función `testConexion` o ejecuta `iniciarBD()`. Esto creará todas las pestañas necesarias en tu Google Sheet automáticamente, junto con el usuario por defecto (`admin` / `admin123`).

### Paso 3: Configurar el Frontend
1. Abre el archivo `script.js`.
2. Reemplaza la variable `SCRIPT_URL` en la línea 6 con la URL que obtuviste en el Paso 1.
3. Sirve los archivos `index.html`, `estilo.css` y `script.js` en cualquier servidor web estático (GitHub Pages, Vercel, Netlify, o localmente con Live Server).

---

## 7. Seguridad y Control de Acceso

* **Autenticación Frontend:** El sistema requiere un login inicial. La sesión se almacena en el `sessionStorage` del navegador.
* **Autorización Backend:** Aunque no usa JWT actualmente, cada acción que modifica datos (`doPost`) viaja con el ID del usuario (`usuarioActual`) para dejar traza de auditoría en la pestaña `Actividad`.
* **Muro PIN:** Las configuraciones críticas (como Resetear la Base de Datos desde el Frontend) invocan `solicitarPIN()`, requiriendo confirmación de identidad in situ.
* **Borrado Lógico (Soft Delete):** Eliminar productos no los borra de la hoja, cambia la bandera `activo` a `false` y migra un JSON de respaldo a la pestaña `Papelera`, protegiendo la integridad referencial de los reportes de ventas históricos.

---

## 8. Roadmap y Oportunidades de Mejora

Este proyecto es excelente como MVP (Producto Mínimo Viable) y para Pymes operando volúmenes de datos bajos/medios. Para escalar a nivel Enterprise, se recomiendan las siguientes actualizaciones arquitectónicas:

### Fase 1: Mejora de la Persistencia (Migración de BD)
Google Sheets tiene límites de lectura/escritura concurrente.
* **Acción:** Migrar el backend a **Node.js/Express** conectado a **PostgreSQL** o utilizar una plataforma BaaS como **Supabase/Firebase**.
* **Beneficio:** Soporte para claves foráneas estrictas, resolución de concurrencia (condiciones de carrera cuando múltiples cajas facturan a la vez) y tiempos de respuesta de la API de ~100ms (frente a los ~1000ms de Apps Script).

### Fase 2: Robustecimiento del Frontend
* **Acción:** Migrar la lógica de manipulación directa del DOM (Vanilla JS) a un framework reactivo como **React**, **Vue 3** o **Svelte**.
* **Beneficio:** Menor riesgo de desincronización de estado, código más modular basado en componentes, y gestión del estado global robusta (Redux, Pinia).

### Fase 3: Seguridad y Autenticación
* **Acción:** Implementar **JWT (JSON Web Tokens)** o OAuth 2.0 y cifrar las contraseñas en la base de datos usando `bcrypt`.
* **Beneficio:** Evita el almacenamiento de pines en texto plano, y asegura que cada endpoint verifique la caducidad y validez criptográfica de la sesión de quien la invoca.

### Fase 4: Modo Offline (PWA)
* **Acción:** Integrar **Service Workers** e **IndexedDB** para convertir la web en una *Progressive Web App*.
* **Beneficio:** Permitirá que la caja siga vendiendo y escaneando productos incluso si falla la conexión a internet, sincronizando localmente el carrito y realizando un *batch upload* (subida por lotes) cuando regrese la conexión.

---
*Documentación generada para mantener, escalar y auditar el sistema ERP POS.*
