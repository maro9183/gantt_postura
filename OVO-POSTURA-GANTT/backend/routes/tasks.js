const express = require('express');
const router  = express.Router();
const { getPool }                    = require('../db');
const { calcFechaFin, calcEstado, formatDate, parseDate } = require('../logic/dates');
const { detectCycle, propagateTasks } = require('../logic/propagate');
const { recalcParentBounds } = require('../logic/recalc');
const { requirePermission, requireProjectAccess } = require('../middleware/auth');

// â”€â”€â”€ CONFIGURACIÃ“N CENTRALIZADA (Production-Grade) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const TASK_COLUMNS = [
  'id_tarea', 'id_proyecto', 'id_parent', 'id_subresp', 'id_resp', 
  'tarea', 'descripcion', 'fecha_inicio', 'fecha_fin', 
  'fecha_inicio_proyectada', 'fecha_fin_proyectada', 'fecha_real_iniciada',
  'duracion_dias', 'fecha_completada', 'estado', 'responsable', 
  'avance', 'dependencias', 'costo_tarea', 'costo_real', 'fecha_creacion', 
  'notificado', 'recursos', 'tipo_dias', 'auto_retrasada', 'es_compra'
];

const TIMING_FIELDS = ['tarea', 'descripcion', 'fecha_inicio', 'duracion_dias', 'tipo_dias', 'avance', 'fecha_real_iniciada', 'fecha_completada'];

const UPDATE_WHITELIST = [
  ...TASK_COLUMNS.filter(c => !['id_tarea', 'fecha_creacion'].includes(c)),
  'dependencias', 'recursos', 'compraData'
];

function validateWhitelist(payload, whitelist) {
  const keys = Object.keys(payload);
  if (keys.length === 0) {
    const err = new Error('El cuerpo de la peticiÃ³n no puede estar vacÃ­o');
    err.status = 400;
    throw err;
  }
  for (const key of keys) {
    if (!whitelist.includes(key)) {
      const err = new Error(`Campo no permitido: ${key}`);
      err.status = 400;
      throw err;
    }
  }
}

/**
 * Parsea un string CSV de IDs (mezcla de nÃºmeros y pur_ID) a un array.
 */
function parseCsvIds(val) {
  if (!val) return [];
  return val.toString().split(',').map(s => {
    const trimmed = s.trim();
    return isNaN(trimmed) ? trimmed : parseInt(trimmed);
  }).filter(Boolean);
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function calcEffectiveStart(conn, tareaId, fecha_inicio, tipo_dias) {
  const baseDate = parseDate(fecha_inicio) || new Date();
  
  if (!tareaId) {
    return { effectiveStart: baseDate, fechaInicioProy: formatDate(baseDate) };
  }

  const [predRows] = await conn.execute(
    `SELECT d.id_predecesora, t.id_tarea, t.es_compra, t.fecha_fin_proyectada, t.fecha_completada,
            c.fecha_arribo_necesaria, c.fecha_comprometida, c.fecha_entregado
     FROM dependencias d
     LEFT JOIN tareas t ON d.id_predecesora = t.id_tarea
     LEFT JOIN compras c ON d.id_predecesora = CONCAT('pur_', c.id_compra) OR t.id_tarea = c.id_tarea
     WHERE d.id_tarea = ?`, [tareaId]
  );
  
  if (predRows.length === 0) {
    return { effectiveStart: baseDate, fechaInicioProy: formatDate(baseDate) };
  }

  const maxFin = predRows.reduce((max, row) => {
    let refDate;
    if (row.es_compra || !row.id_tarea) {
      refDate = parseDate(row.fecha_entregado || row.fecha_comprometida || row.fecha_arribo_necesaria);
    } else {
      refDate = parseDate(row.fecha_completada || row.fecha_fin_proyectada);
    }
    const currentRef = refDate || new Date(0);
    return currentRef > max ? currentRef : max;
  }, new Date(0));

  // Punto de inicio teórico por red de dependencias
  const theoStart = new Date(maxFin);
  theoStart.setUTCDate(theoStart.getUTCDate() + 1);
  if (tipo_dias === 'laboral' && theoStart.getUTCDay() === 0) theoStart.setUTCDate(theoStart.getUTCDate() + 1);
  
  // REGLA SNAP-BACK: La proyección nunca es anterior al Baseline (Plan Original)
  const finalStart = theoStart > baseDate ? theoStart : baseDate;
  
  return { effectiveStart: finalStart, fechaInicioProy: formatDate(finalStart) };
}

async function syncDependencias(conn, tareaId, nuevasPredIds) {
  // Ahora la tabla fÃ­sica soporta IDs mixtos (ej. 'pur_1' y '24')
  const allowedIds = nuevasPredIds.filter(id => id !== undefined && id !== null && id !== '').map(String);

  const [current] = await conn.execute('SELECT id_predecesora FROM dependencias WHERE id_tarea = ?', [tareaId]);
  const currentIds = current.map(r => String(r.id_predecesora));
  
  const toAdd    = allowedIds.filter(id => !currentIds.includes(id));
  const toRemove = currentIds.filter(id => !allowedIds.includes(id));
  
  for (const id of toRemove) await conn.execute('DELETE FROM dependencias WHERE id_tarea = ? AND id_predecesora = ?', [tareaId, id]);
  for (const id of toAdd) await conn.execute('INSERT IGNORE INTO dependencias (id_tarea, id_predecesora) VALUES (?, ?)', [tareaId, id]);
}

/**
 * Verifica si una tarea está bloqueada por predecesoras no finalizadas.
 */
async function checkIfBlocked(conn, tareaId) {
  const [preds] = await conn.execute(
    `SELECT t.fecha_completada, c.fecha_entregado, c.estado as compra_estado
     FROM dependencias d
     LEFT JOIN tareas t ON d.id_predecesora = t.id_tarea
     LEFT JOIN compras c ON d.id_predecesora = CONCAT('pur_', c.id_compra)
     WHERE d.id_tarea = ?`, [tareaId]
  );
  
  for (const row of preds) {
    // Es una tarea y no ha completado
    if (row.fecha_completada === null && row.compra_estado === null) return true;
    // Es una compra y no ha entregado
    if (row.compra_estado !== null && row.compra_estado !== 'entregado' && !row.fecha_entregado) return true;
  }
  return false;
}

async function syncRecursos(conn, tareaId, nuevosRecIds) {
  const [current] = await conn.execute('SELECT id_recurso FROM tarea_recursos WHERE id_tarea = ?', [tareaId]);
  const currentIds = current.map(r => r.id_recurso);
  const toDelete = currentIds.filter(id => !nuevosRecIds.includes(id));
  const toAdd    = nuevosRecIds.filter(id => !currentIds.includes(id));
  for (const id of toDelete) await conn.execute('DELETE FROM tarea_recursos WHERE id_tarea = ? AND id_recurso = ?', [tareaId, id]);
  for (const id of toAdd) await conn.execute('INSERT INTO tarea_recursos (id_tarea, id_recurso) VALUES (?, ?)', [tareaId, id]);
}

async function applyLazyRescheduling(pool, projectIds = null) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    
    // 1. Detección de Atrasos Críticos (Mueve la barra a 'Hoy' si la tarea está vencida y no completada)
    let sql = `SELECT id_tarea FROM tareas WHERE fecha_completada IS NULL AND fecha_fin_proyectada < CURDATE()`;
    let params = [];
    if (projectIds && projectIds.length > 0) {
      sql += ` AND id_proyecto IN (${projectIds.map(() => '?').join(',')})`;
      params = projectIds;
    }
    const [overdue] = await conn.execute(sql, params);
    for (const row of overdue) {
      await conn.execute(`UPDATE tareas SET fecha_fin_proyectada = CURDATE(), auto_retrasada = 1 WHERE id_tarea = ?`, [row.id_tarea]);
      await propagateTasks(conn, row.id_tarea);
    }

    // 2. SINCRONIZACIÓN MASIVA DE ESTADOS (Asegura que el campo 'estado' de la DB refleje la nueva lógica)
    // Realizamos una auditoría completa (incluyendo finalizadas para asegurar consistencia total)
    let syncSql = `SELECT * FROM tareas`;
    let syncParams = [];
    if (projectIds && projectIds.length > 0) {
      syncSql += ` WHERE id_proyecto IN (${projectIds.map(() => '?').join(',')})`;
      syncParams = projectIds;
    }
    const [activeTasks] = await conn.execute(syncSql, syncParams);
    for (const task of activeTasks) {
      const isBlocked = await checkIfBlocked(conn, task.id_tarea);
      const newStatus = calcEstado(task, isBlocked);
      if (newStatus !== task.estado) {
        await conn.execute(`UPDATE tareas SET estado = ? WHERE id_tarea = ?`, [newStatus, task.id_tarea]);
      }
    }

    await conn.commit();
  } catch (err) { 
    console.error('[LazyRescheduling] Error sincronizando estados:', err);
    await conn.rollback(); 
  } finally { conn.release(); }
}

// â”€â”€â”€ QUERY BUILDERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const SELECT_BLOCK = TASK_COLUMNS.map(c => `t.${c}`).join(', ');
const EXTRA_FIELDS = `,
  (SELECT COUNT(*) FROM notas n WHERE n.tarea = t.id_tarea) as note_count,
  sr.nombre as subresponsable_nombre,
  COALESCE((SELECT GROUP_CONCAT(id_recurso ORDER BY id_recurso) FROM tarea_recursos WHERE id_tarea = t.id_tarea), "") AS recursos,
  c.cantidad, c.valor_unitario, c.fecha_solicitud, c.fecha_arribo_necesaria, 
  c.fecha_oc_emitida, c.fecha_comprometida, c.fecha_entregado
`;
const JOIN_PART = `
  LEFT JOIN subresponsables sr ON t.id_subresp = sr.id_subresp
  LEFT JOIN responsables res ON t.id_resp = res.id_resp
  LEFT JOIN compras c ON c.id_tarea = t.id_tarea
`;

async function fetchTaskWithExtras(conn, id) {
  const [rows] = await conn.execute(`SELECT ${SELECT_BLOCK} ${EXTRA_FIELDS} FROM tareas t ${JOIN_PART} WHERE t.id_tarea = ?`, [id]);
  return rows[0];
}

/**
 * FunciÃ³n CrÃ­tica: mapTaskToDHTMLX
 * Retorna un objeto nuevo y limpio con el esquema exacto de DHTMLX.
 */
function mapTaskToDHTMLX(row) {
  if (!row) return null;

  // Formateo de fecha robusto sin Moment
  let start_date = null;
  if (row.fecha_inicio) {
    const d = new Date(row.fecha_inicio);
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      start_date = `${y}-${m}-${day} 00:00`;
    }
  }

  const t = {
    id: row.id_tarea,
    text: row.descripcion || row.tarea || "Tarea",
    start_date: start_date,
    duration: row.duracion_dias || 1,
    progress: parseFloat(row.avance) / 100 || 0,
    parent: row.id_parent === null ? 0 : row.id_parent,

    // Metadatos esenciales para motor y UI (Standardized)
    id_proyecto:             row.id_proyecto,
    estado:                  row.estado,
    responsable:             row.responsable || '',
    es_compra:               row.es_compra || 0,
    recursos:                row.recursos || '',
    tarea:                   row.tarea,
    descripcion:             row.descripcion || '',
    avance:                  parseFloat(row.avance) || 0,
    dependencias:            row.dependencias || '',
    tipo_dias:               row.tipo_dias || 'calendario',
    costo_tarea:             row.costo_tarea || 0,
    costo_real:              row.costo_real || 0,
    fecha_inicio:            start_date ? start_date.split(' ')[0] : null,
    fecha_inicio_proyectada: row.fecha_inicio_proyectada ? formatDate(row.fecha_inicio_proyectada) : null,
    fecha_fin_proyectada:    row.fecha_fin_proyectada ? formatDate(row.fecha_fin_proyectada) : null,
    fecha_real_iniciada:     row.fecha_real_iniciada ? formatDate(row.fecha_real_iniciada) : null,
    fecha_completada:        row.fecha_completada ? formatDate(row.fecha_completada) : null,
    note_count:              row.note_count || 0,
    id_subresp:              row.id_subresp || null,
    subresponsable_nombre:   row.subresponsable_nombre || null
  };

  // Datos extendidos de compra (solo si es_compra)
  if (row.es_compra) {
    t._compra = {
      cantidad: row.cantidad,
      valor_unitario: row.valor_unitario,
      f_solicitud: row.fecha_solicitud ? formatDate(row.fecha_solicitud) : null,
      f_arribo_nec: row.fecha_arribo_necesaria ? formatDate(row.fecha_arribo_necesaria) : null,
      f_oc: row.fecha_oc_emitida ? formatDate(row.fecha_oc_emitida) : null,
      f_comp: row.fecha_comprometida ? formatDate(row.fecha_comprometida) : null,
      f_ent: row.fecha_entregado ? formatDate(row.fecha_entregado) : null
    };
  }

  return t;
}

// â”€â”€â”€ ENDPOINTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

router.get('/', async (req, res) => {
  try {
    await applyLazyRescheduling(getPool());
    let sql = `SELECT ${SELECT_BLOCK} ${EXTRA_FIELDS} FROM tareas t ${JOIN_PART} `;
    const whereClauses = [];
    const params = [];

    if (req.user && req.user.proyectos !== 'ALL') {
      const allowedIds = req.user.proyectos.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
      if (allowedIds.length === 0) return res.json([]);
      whereClauses.push(`t.id_proyecto IN (${allowedIds.join(',')})`);
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ` + whereClauses.join(' AND ');
    }
    
    sql += ` ORDER BY t.fecha_inicio, t.id_tarea`;
    
    const [rows] = await getPool().execute(sql);
    res.json(rows.map(mapTaskToDHTMLX));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/project/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    await applyLazyRescheduling(getPool(), [projectId]);
    const [rows] = await getPool().execute(
      `SELECT ${SELECT_BLOCK} ${EXTRA_FIELDS} FROM tareas t ${JOIN_PART} WHERE t.id_proyecto = ? ORDER BY t.fecha_inicio, t.id_tarea`, 
      [projectId]
    );
    res.json(rows.map(mapTaskToDHTMLX));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const task = await fetchTaskWithExtras(getPool(), req.params.id);
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json(mapTaskToDHTMLX(task));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', requirePermission('CREATE'), requireProjectAccess, async (req, res) => {
  const conn = await getPool().getConnection();
  try {
    // 1. Mapeo de campos nativos de DHTMLX a las columnas SQL (Preservando si ya vienen mapeados)
    req.body.tarea = req.body.text || req.body.tarea || "Nueva Tarea";
    req.body.fecha_inicio = req.body.start_date || req.body.fecha_inicio || null;
    
    // Protocol Converter: Map duration to duracion_dias
    if (req.body.duration !== undefined) {
      req.body.duracion_dias = req.body.duration;
    }
    req.body.duracion_dias = req.body.duracion_dias || 1;
    
    // Protocol Converter: Map duration to duracion_dias
    if (req.body.duration !== undefined) {
      req.body.duracion_dias = Number(req.body.duration);
    }
    
    req.body.avance = (req.body.progress !== undefined) ? Math.round(parseFloat(req.body.progress) * 100) : (req.body.avance || 0);

    // 2. Mapeo de campos personalizados (quitando el prefijo de DHTMLX)
    if (req.body._estado !== undefined) req.body.estado = req.body._estado;
    if (req.body._tipo_dias !== undefined) req.body.tipo_dias = req.body._tipo_dias;
    if (req.body._dependencias !== undefined) req.body.dependencias = req.body._dependencias;
    if (req.body._es_compra !== undefined) req.body.es_compra = req.body._es_compra;

    // 3. Manejo estricto de JerarquÃ­a (Foreign Key id_parent)
    const rawParent = req.body.parent !== undefined ? req.body.parent : req.body.id_parent;
    req.body.id_parent = (rawParent === 0 || rawParent === "0" || rawParent === "") ? null : rawParent;

    // 4. SanitizaciÃ³n Masiva: Convertir "" a null para campos INT/DATE/DECIMAL
    const nullableFields = [
        'id_proyecto', 'id_subresp', 'id_resp', 
        'fecha_inicio_proyectada', 'fecha_fin_proyectada', 'fecha_real_iniciada',
        'fecha_fin', 'fecha_completada', 'costo_tarea', 'costo_real'
    ];
    nullableFields.forEach(field => {
        if (req.body[field] === "") {
            req.body[field] = null;
        }
    });

    // 5. Limpieza Final: Destruir la "basura" de DHTMLX para que no falle el INSERT
    const dhtmlxKeys = ['text', 'start_date', 'duration', 'progress', 'parent', 'end_date', 'id'];
    dhtmlxKeys.forEach(key => delete req.body[key]);

    // Borrar cualquier clave original que haya quedado con prefijo '_'
    Object.keys(req.body).forEach(key => {
        if (key.startsWith('_')) delete req.body[key];
    });
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    validateWhitelist(req.body, UPDATE_WHITELIST);
    await conn.beginTransaction();
    const { id_proyecto, id_parent = null, id_subresp = null, id_resp = null, tarea, fecha_inicio, duracion_dias = 1, avance = 0, tipo_dias = 'calendario' } = req.body;
    if (!id_proyecto || !tarea || !fecha_inicio) return res.status(400).json({ error: 'id_proyecto, tarea y fecha_inicio son requeridos' });
    const fechaFinBase = formatDate(calcFechaFin(new Date(fecha_inicio), duracion_dias, tipo_dias));
    const isCompra = req.body.es_compra ? 1 : 0;
    const [result] = await conn.execute(
      `INSERT INTO tareas (id_proyecto, id_parent, id_subresp, id_resp, tarea, descripcion, fecha_inicio, fecha_fin, fecha_inicio_proyectada, fecha_fin_proyectada, duracion_dias, estado, responsable, avance, tipo_dias, notificado, costo_tarea, costo_real, es_compra, fecha_real_iniciada, fecha_completada, dependencias, recursos) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id_proyecto, id_parent, id_subresp, id_resp, tarea, req.body.descripcion || null, fecha_inicio, fechaFinBase, fecha_inicio, fechaFinBase, duracion_dias, calcEstado(avance), req.body.responsable || null, avance, tipo_dias, req.body.notificado ? 1 : 0, req.body.costo_tarea || 0, req.body.costo_real || 0, isCompra, req.body.fecha_real_iniciada || null, req.body.fecha_completada || null, req.body.dependencias || null, req.body.recursos || null]
    );
    const newTaskId = result.insertId;
    
    if (req.body.dependencias !== undefined) await syncDependencias(conn, newTaskId, parseCsvIds(req.body.dependencias));
    if (req.body.recursos !== undefined)     await syncRecursos(conn, newTaskId, parseCsvIds(req.body.recursos));
    
    const { effectiveStart, fechaInicioProy } = await calcEffectiveStart(conn, newTaskId, fecha_inicio, tipo_dias);
    const fechaFinProy = formatDate(calcFechaFin(effectiveStart, duracion_dias, tipo_dias));
    
    // AUTOMATIZACIÓN DE ESTADO PARA TAREA NUEVA
    const isBlocked = await checkIfBlocked(conn, newTaskId);
    const autoStatus = calcEstado({
      fecha_completada: req.body.fecha_completada || null,
      fecha_real_iniciada: req.body.fecha_real_iniciada || null,
      fecha_inicio_proyectada: fechaInicioProy,
      fecha_fin_proyectada: fechaFinProy
    }, isBlocked);

    await conn.execute(
      `UPDATE tareas SET fecha_inicio_proyectada = ?, fecha_fin_proyectada = ?, estado = ? WHERE id_tarea = ?`, 
      [fechaInicioProy, fechaFinProy, autoStatus, newTaskId]
    );
    let summaryTasks = [];
    if (id_parent) summaryTasks = await recalcParentBounds(conn, id_parent);
    await conn.commit();
    const newTaskRaw = await fetchTaskWithExtras(conn, newTaskId);
    const newTask = mapTaskToDHTMLX(newTaskRaw);
    res.status(201).json({ id: newTaskId, task: newTask, updatedTasks: [newTask, ...summaryTasks.map(mapTaskToDHTMLX)] });
  } catch (err) { await conn.rollback(); res.status(err.status || 500).json({ error: err.message }); } finally { conn.release(); }
});

router.put('/:id', requirePermission('UPDATE'), requireProjectAccess, async (req, res) => {
  const conn = await getPool().getConnection();
  try {
    const { id } = req.params;
    
    // â”€â”€â”€ SANITIZACIÃ“N BLINDADA (Compatibilidad DHTMLX -> DB) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // 1. Mapeo de campos nativos de DHTMLX a las columnas SQL
    if (req.body.text !== undefined) req.body.tarea = req.body.text;
    
    // PROTECCIÓN DE BASELINE: start_date de Gantt impacta en la proyección
    if (req.body.start_date !== undefined) {
      req.body.fecha_inicio_proyectada = req.body.start_date;
    }
    
    // Protocol Converter: Map duration to duracion_dias
    if (req.body.duration !== undefined) {
      req.body.duracion_dias = Number(req.body.duration);
    }
    
    if (req.body.progress !== undefined) req.body.avance = Math.round(parseFloat(req.body.progress) * 100);

    // 2. Mapeo de campos personalizados (quitando el prefijo de DHTMLX)
    if (req.body._estado !== undefined) req.body.estado = req.body._estado;
    if (req.body._tipo_dias !== undefined) req.body.tipo_dias = req.body._tipo_dias;
    if (req.body._dependencias !== undefined) req.body.dependencias = req.body._dependencias;
    if (req.body._es_compra !== undefined) req.body.es_compra = req.body._es_compra;

    // 3. Manejo estricto de JerarquÃ­a (Foreign Key id_parent)
    const rawParent = req.body.parent !== undefined ? req.body.parent : req.body.id_parent;
    if (rawParent !== undefined) {
      req.body.id_parent = (rawParent === 0 || rawParent === "0" || rawParent === "") ? null : rawParent;
    }

    // 4. SanitizaciÃ³n Masiva: Convertir "" a null para campos INT/DATE/DECIMAL
    const nullableFields = [
        'id_proyecto', 'id_subresp', 'id_resp', 
        'fecha_inicio_proyectada', 'fecha_fin_proyectada', 'fecha_real_iniciada',
        'fecha_fin', 'fecha_completada', 'costo_tarea', 'costo_real'
    ];
    nullableFields.forEach(field => {
        if (req.body[field] === "") {
            req.body[field] = null;
        }
    });

    // 5. Limpieza Final: Destruir la "basura" de DHTMLX
    const dhtmlxKeys = ['text', 'start_date', 'duration', 'progress', 'parent', 'end_date', 'id'];
    dhtmlxKeys.forEach(key => delete req.body[key]);

    // Borrar cualquier clave original que haya quedado con prefijo '_'
    Object.keys(req.body).forEach(key => {
        if (key.startsWith('_')) delete req.body[key];
    });
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    validateWhitelist(req.body, UPDATE_WHITELIST);
    await conn.beginTransaction();
    const [curRows] = await conn.execute(`SELECT ${TASK_COLUMNS.join(',')} FROM tareas WHERE id_tarea = ?`, [id]);
    if (!curRows.length) throw new Error('Tarea no encontrada');
    const cur = curRows[0];
    const updates = [];
    const values = [];
    const physicalWhitelist = TASK_COLUMNS.filter(c => !['id_tarea', 'fecha_creacion'].includes(c));
    let timingChanged = false;
    for (const key of Object.keys(req.body)) {
      if (physicalWhitelist.includes(key)) {
        // EXCLUIMOS las proyectadas del loop manual: 
        // Solo el motor de cálculo al final del handler tiene autoridad para setearlas.
        if (['fecha_inicio_proyectada', 'fecha_fin_proyectada'].includes(key)) continue;

        updates.push(`${key} = ?`);
        values.push(req.body[key] === undefined ? null : req.body[key]);
        if (TIMING_FIELDS.includes(key)) timingChanged = true;
      }
    }
    if (timingChanged) updates.push('auto_retrasada = 0');
    if (updates.length > 0) await conn.execute(`UPDATE tareas SET ${updates.join(', ')} WHERE id_tarea = ?`, [...values, id]);
    
    if (req.body.dependencias !== undefined) await syncDependencias(conn, parseInt(id), parseCsvIds(req.body.dependencias));
    if (req.body.recursos !== undefined)     await syncRecursos(conn, parseInt(id), parseCsvIds(req.body.recursos));

    const updatedTask = { ...cur, ...req.body };
    const { effectiveStart, fechaInicioProy } = await calcEffectiveStart(conn, id, updatedTask.fecha_inicio, updatedTask.tipo_dias);
    
    // REGLA DINÁMICA DE CÁLCULO (SNAP-BACK)
    // El inicio proyectado es el mayor entre: (Red de dependencias/Baseline) y (Movimiento manual en este request)
    let finalInicioProy = fechaInicioProy;
    const manualStartStr = req.body.fecha_inicio_proyectada;
    if (manualStartStr) {
      const manualDate = parseDate(manualStartStr);
      const theoDate   = parseDate(fechaInicioProy);
      if (manualDate > theoDate) finalInicioProy = manualStartStr;
    }
    
    // El cálculo de fin es AUTORITATIVO por el backend
    // Se basa en Realidad (si ya inició) o en la proyección final calculada (Baseline/Red)
    const puntoInicioParaFin = updatedTask.fecha_real_iniciada || finalInicioProy;
    const finalFinProy = formatDate(calcFechaFin(parseDate(puntoInicioParaFin), updatedTask.duracion_dias));

    // AUTOMATIZACIÓN DE ESTADO
    const isBlocked = await checkIfBlocked(conn, id);
    const autoStatus = calcEstado({
      ...updatedTask,
      fecha_inicio_proyectada: finalInicioProy,
      fecha_fin_proyectada: finalFinProy
    }, isBlocked);

    // Persistencia final de los campos automáticos y calculados
    await conn.execute(
      `UPDATE tareas SET fecha_inicio_proyectada = ?, fecha_fin_proyectada = ?, estado = ? WHERE id_tarea = ?`, 
      [finalInicioProy, finalFinProy, autoStatus, id]
    );
    const updatedTasks = await propagateTasks(conn, parseInt(id));
    let summaryTasks = [];
    if (updatedTask.id_parent) summaryTasks = await recalcParentBounds(conn, updatedTask.id_parent);
    await conn.commit();
    const newTaskRaw = await fetchTaskWithExtras(conn, id);
    const newTask = mapTaskToDHTMLX(newTaskRaw);
    res.json({ task: newTask, updatedTasks: [newTask, ...updatedTasks.map(mapTaskToDHTMLX), ...summaryTasks.map(mapTaskToDHTMLX)] });
  } catch (err) {
    console.error('ERROR EN UPDATE TASK:', err);
    await conn.rollback(); 
    res.status(err.status || 500).json({ error: err.message }); 
  } finally { 
    conn.release(); 
  }
});

router.delete('/:id', requirePermission('DELETE'), async (req, res) => {
  const { id } = req.params;
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    // 1. Verificación de Integridad Referencial (Dependencias)
    // Buscamos si el ID de esta tarea existe en el campo 'dependencias' (CSV) de cualquier otra tarea
    const [dependents] = await conn.execute(
      'SELECT id_tarea, tarea FROM tareas WHERE FIND_IN_SET(?, dependencias) > 0',
      [id]
    );

    if (dependents.length > 0) {
      const names = dependents.map(d => `"${d.tarea}"`).join(', ');
      return res.status(400).json({ 
        error: `No se puede eliminar: Existen tareas (${names}) que dependen de esta. Elimine las dependencias primero.` 
      });
    }

    await conn.beginTransaction();
    
    // Obtener parent para recalcular bounds después si es necesario
    const [toDel] = await conn.execute('SELECT id_parent FROM tareas WHERE id_tarea = ?', [id]);
    
    // 2. Eliminación física
    await conn.execute('DELETE FROM tareas WHERE id_tarea = ?', [id]);
    
    if (toDel.length && toDel[0].id_parent) {
      await recalcParentBounds(conn, toDel[0].id_parent);
    }
    
    await conn.commit();
    res.json({ success: true });
  } catch (err) { 
    await conn.rollback(); 
    console.error('[DELETE TASK] Error:', err);
    res.status(500).json({ error: err.message }); 
  } finally { 
    conn.release(); 
  }
});

module.exports = router;

