# — 3MGAS Project Management

Sistema corporativo de gestión de proyectos con diagrama de Gantt interactivo, persistencia en tiempo real y arquitectura robusta.

## 🚀 Stack Tecnológico
- **Frontend**: HTML5 Semántico + CSS3 (Variables & Glassmorphism) + Vanilla JS (ES6+).
- **Gantt Core**: [dhtmlx-gantt](https://dhtmlx.com/docs/products/dhtmlxGantt/) (Versión GPL).
- **Backend**: Node.js + Express.
- **Base de Datos**: MySQL 8 (Gestión mediante Pool de conexiones y transacciones).
- **Exportación**: Integración con servicios de PDF, Excel (xlsx) y CSV.

## 🏗 Estructura del Proyecto
```text
OVO2/
├── backend/              → API Node.js/Express
│   ├── routes/           → Endpoints (tasks, projects, auth, users, etc.)
│   ├── logic/            → Motores de propagación y cálculo de fechas
│   ├── db.js             → Configuración Pool MySQL + Auto-Migración
│   └── server.js         → Punto de entrada y Servidor Estático
├── frontend/             → Aplicación SPA (Single Page Application)
│   ├── index.html        → Estructura principal y Modales
│   ├── css/app.css       → Sistema de diseño (Dark Mode Premium)
│   ├── js/               → Lógica de UI, API, Inicialización del Gantt y Auth
│   └── img/              → Assets de marca (Logo OVOBRAND)
└── sql/schema.sql        → Referencia de base de datos
```

## ✨ Características Principales

### 📊 Gestión de Tareas y Gantt
- **Interactividad Total**: Drag & Drop para mover tareas, reescalar duraciones y establecer progreso.
- **Inmersión Inmediata**: La grilla inicializa oculta con vista mensual y el panel izquierdo colapsado, priorizando 100% de la pantalla al diagrama de tiempo.
- **Jerarquías Interconectadas**: Enlaces de progreso inteligentes calculan los estados de "Retrasada" y "Bloqueada" en tiempo real con sus respectivos badges visuales integrados.
- **Calendarios Flexibles**: Posibilidad de elegir entre días **calendario** (7 días) o **laborales** (Lunes a Sábado) por cada tarea.

### 🎛 Dashboard y Control Operativo
- **Métricas Híbridas**: Tarjetas KPIs (resumen) computan matemática paralela separando tareas troncales ("T:") de subtareas anidadas ("S:") optimizando espacio visual.
- **Filtros Avanzados**: Componentes "Dropdown Custom" creados desde cero superan las limitaciones nativas de HTML, embebiendo badges y colores funcionales directamente en los menús desplegables.

### 👥 Recursos y Responsables
- **Herencia de Liderazgo**: Las subtareas heredan automáticamente al responsable líder y su equipo.
- **Gestión de Equipos**: Seguimiento detallado por líder y subresponsables.
- **Cálculo de Costos**: Seguimiento financiero por tarea y totales (costos proyectados vs costo aplicado al progreso) tabulados.

### 🔐 Seguridad y Administración
- **Sistema de Auth**: Login seguro con gestión de sesiones.
- **Permisos Granulares**: Roles de Administrador y Usuario con restricciones de creación/edición configurables.
- **Gestión de Usuarios**: Panel administrativo para crear y gestionar usuarios y sus accesos.

### 📥 Exportación y Reportes
- **Multi-formato**: Exportación nativa del diagrama a PDF con configuración Premium.
- **Datos**: Descarga de la planificación completa en formato Excel (.xlsx) y CSV.

## 🛠 Instalación y Arranque

### 1. Requisitos
- Node.js (v14+)
- MySQL Server 8.0+

### 2. Configurar Entorno
Crea o edita `backend/.env` con tus credenciales:
```env
DB_HOST=localhost
DB_NAME=ovo2
DB_USER=root
DB_PASSWORD=tu_password
PORT=3000
```

### 3. Iniciar Sistema (Manual)
```bash
cd backend
npm install
node server.js
```
*Nota: La base de datos y las tablas se crean **automáticamente** al primer arranque.*

## 🐳 Despliegue con Docker (Recomendado)

Si tienes Docker instalado, puedes levantar todo el stack (App + MySQL) con un solo comando:

1. **Levantar contenedores**:
   ```bash
   docker-compose up -d --build
   ```
2. **Acceder a la aplicación**:
   Abre tu navegador en `http://localhost:3000`.

*Los datos de la base de datos se guardarán de forma persistente en un volumen de Docker.*

## 🔌 API Endpoints (Resumen)

| Categoría | Endpoints |
|-----------|-----------|
| **Auth** | `/api/auth/login`, `/api/auth/me` |
| **Proyectos**| `GET /api/projects`, `POST /api/projects` |
| **Tareas** | `GET/POST /api/tasks`, `PUT /api/tasks/:id`, `DELETE /api/tasks/:id` |
| **Notas** | `GET /api/tasks/:id/notes`, `POST /api/notes`, `DELETE /api/notes/:id` |
| **Config** | `/api/responsables`, `/api/subresponsables`, `/api/resources` |
| **Admin** | `GET/POST/PUT /api/users` |

## 💾 Respaldo y Restauración (Universal)

He incluido scripts automáticos y manuales para gestionar tus datos de forma segura, ya sea que uses **Windows (PowerShell)** o **Linux (Bash)**.

### 🤖 Backup Automático
El sistema ahora incluye un servicio que realiza un respaldo completo de la base de datos **todos los días a las 00:00**. 
- Los archivos se guardan en la carpeta `backups/`.
- El sistema mantiene automáticamente solo los últimos **7 días**.

### 🛠 Gestión Manual (Scripts)

| Acción | Windows (PowerShell) | Linux/Mac (Bash) |
|---|---|---|
| **Crear Backup** | `.\scripts\backup.ps1` | `bash scripts/backup.sh` |
| **Restaurar** | `.\scripts\restore.ps1` | `bash scripts/restore.sh` |

*Para restaurar un archivo específico:*
- **Windows:** `.\scripts\restore.ps1 -BackupFile backups\archivo.sql`
- **Linux:** `bash scripts/restore.sh backups/archivo.sql`

---
*Desarrollado para la excelencia operativa en la gestión de proyectos de 3MGAS.*
