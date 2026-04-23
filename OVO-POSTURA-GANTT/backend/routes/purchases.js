const express = require('express');
const router  = express.Router();
const { getPool } = require('../db');
const { requirePermission } = require('../middleware/auth');

// ─── CONFIGURACIÓN CENTRALIZADA (Production-Grade) ──────────────────────────

const PURCHASE_COLUMNS = [
  'id_compra', 'id_tarea', 'id_proyecto', 'producto', 'descripcion', 
  'cantidad', 'valor_unitario', 'valor_total', 'id_solicitante', 
  'id_responsable', 'estado', 'dias_arribo', 'fecha_solicitud', 
  'fecha_presupuesto_solic', 'fecha_presupuesto_recib', 'fecha_oc_emitida', 
  'fecha_comprometida', 'fecha_entregado', 'fecha_arribo_estimada', 
  'fecha_arribo_necesaria', 'notas', 'dependencias', 'links_facturas', 'fecha_creacion'
];

const PURCHASE_WHITELIST = PURCHASE_COLUMNS.filter(c => !['id_compra', 'fecha_creacion'].includes(c));

/**
 * Valida que el payload no contenga campos fuera de la whitelist.
 */
function validateWhitelist(payload, whitelist) {
  const keys = Object.keys(payload);
  if (keys.length === 0) {
    const err = new Error('El cuerpo de la petición no puede estar vacío');
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addDaysToDate(dateStr, days) {
  if (!dateStr || !days) return null;
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + parseInt(days));
  return d.toISOString().split('T')[0];
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Calcula los campos automáticos según el estado de la compra.
 */
function applyStateDates(body, current = {}) {
  const estado = body.estado || current.estado;
  const out = { ...body };

  // Calcular valor_total
  const cant = parseFloat(out.cantidad ?? current.cantidad ?? 1);
  const vu   = parseFloat(out.valor_unitario ?? current.valor_unitario ?? 0);
  if (!isNaN(cant) && !isNaN(vu)) {
    out.valor_total = +(cant * vu).toFixed(2);
  }

  if (!estado) return out;

  // Timestamps automáticos (solo si están vacíos en el body y en la DB)
  if (estado === 'solicitando presupuesto') {
    if (!current.fecha_presupuesto_solic && !out.fecha_presupuesto_solic) out.fecha_presupuesto_solic = todayStr();
    if (!current.fecha_solicitud && !out.fecha_solicitud) out.fecha_solicitud = todayStr();
  }
  if (estado === 'presupuesto recibido' && !current.fecha_presupuesto_recib && !out.fecha_presupuesto_recib) {
    out.fecha_presupuesto_recib = todayStr();
  }
  if (estado === 'OC emitida' && !current.fecha_oc_emitida && !out.fecha_oc_emitida) {
    out.fecha_oc_emitida = todayStr();
  }
  if (estado === 'fecha comprometida' && !current.fecha_comprometida && !out.fecha_comprometida) {
    out.fecha_comprometida = todayStr();
  }
  if (estado === 'entregado' && !current.fecha_entregado && !out.fecha_entregado) {
    out.fecha_entregado = todayStr();
  }

  // Recalcular fecha_arribo_estimada
  const ocDate    = out.fecha_oc_emitida   ?? current.fecha_oc_emitida;
  const diasArrib = out.dias_arribo        ?? current.dias_arribo;
  if (ocDate && diasArrib > 0) {
    out.fecha_arribo_estimada = addDaysToDate(ocDate, diasArrib);
  }

  return out;
}

const SELECT_BLOCK = PURCHASE_COLUMNS.map(c => `c.${c}`).join(', ');
const JOIN_PART = `
  LEFT JOIN responsables rs ON c.id_solicitante = rs.id_resp
  LEFT JOIN responsables rr ON c.id_responsable = rr.id_resp
  LEFT JOIN tareas t ON c.id_tarea = t.id_tarea
`;
const EXTRA_FIELDS = `,
  rs.nombre AS solicitante_nombre, rs.correo AS solicitante_correo,
  rr.nombre AS responsable_nombre, rr.correo AS responsable_correo,
  t.tarea AS tarea_nombre, COALESCE(c.id_proyecto, t.id_proyecto) AS id_proyecto
`;

// ─── ENDPOINTS ───────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const [rows] = await getPool().execute(
      `SELECT ${SELECT_BLOCK} ${EXTRA_FIELDS} FROM compras c ${JOIN_PART} ORDER BY c.fecha_creacion DESC`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/task/:taskId', async (req, res) => {
  try {
    const [rows] = await getPool().execute(
      `SELECT ${SELECT_BLOCK} ${EXTRA_FIELDS} FROM compras c ${JOIN_PART} WHERE c.id_tarea = ? ORDER BY c.fecha_creacion DESC`,
      [req.params.taskId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await getPool().execute(
      `SELECT ${SELECT_BLOCK} ${EXTRA_FIELDS} FROM compras c ${JOIN_PART} WHERE c.id_compra = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Compra no encontrada' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', requirePermission('CREATE'), async (req, res) => {
  try {
    validateWhitelist(req.body, PURCHASE_WHITELIST);
    const data = applyStateDates(req.body, {});
    
    if (!data.producto) return res.status(400).json({ error: 'El campo producto es requerido' });
    if (!data.id_proyecto) return res.status(400).json({ error: 'El campo id_proyecto es requerido para todas las compras' });

    const cols = [];
    const syms = [];
    const vals = [];

    for (const key of Object.keys(data)) {
      if (PURCHASE_WHITELIST.includes(key)) {
        cols.push(key);
        syms.push('?');
        vals.push(data[key]);
      }
    }

    const [result] = await getPool().execute(
      `INSERT INTO compras (${cols.join(', ')}) VALUES (${syms.join(', ')})`,
      vals
    );

    const [newRow] = await getPool().execute(
      `SELECT ${SELECT_BLOCK} ${EXTRA_FIELDS} FROM compras c ${JOIN_PART} WHERE c.id_compra = ?`,
      [result.insertId]
    );
    res.status(201).json(newRow[0]);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.put('/:id', requirePermission('UPDATE'), async (req, res) => {
  try {
    const { id } = req.params;
    validateWhitelist(req.body, PURCHASE_WHITELIST);

    const [cur] = await getPool().execute(`SELECT * FROM compras WHERE id_compra = ?`, [id]);
    if (!cur.length) return res.status(404).json({ error: 'Compra no encontrada' });

    const data = applyStateDates(req.body, cur[0]);
    if (data.id_proyecto === null) {
      return res.status(400).json({ error: 'El campo id_proyecto no puede ser nulo' });
    }
    const updates = [];
    const values = [];

    for (const key of Object.keys(data)) {
      if (PURCHASE_WHITELIST.includes(key)) {
        updates.push(`${key} = ?`);
        values.push(data[key]);
      }
    }

    if (updates.length > 0) {
      await getPool().execute(`UPDATE compras SET ${updates.join(', ')} WHERE id_compra = ?`, [...values, id]);
    }

    const [updated] = await getPool().execute(
      `SELECT ${SELECT_BLOCK} ${EXTRA_FIELDS} FROM compras c ${JOIN_PART} WHERE c.id_compra = ?`, [id]
    );
    res.json(updated[0]);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.delete('/:id', requirePermission('DELETE'), async (req, res) => {
  const { id } = req.params;
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    // 1. Verificación de Integridad Referencial (Dependencias en Tareas)
    // Buscamos si el ID de esta compra (con prefijo pur_) existe en el campo 'dependencias' de cualquier tarea
    const purIdPrefix = `pur_${id}`;
    const [dependents] = await conn.execute(
      'SELECT id_tarea, tarea FROM tareas WHERE FIND_IN_SET(?, dependencias) > 0',
      [purIdPrefix]
    );

    if (dependents.length > 0) {
      const names = dependents.map(d => `"${d.tarea}"`).join(', ');
      return res.status(400).json({ 
        error: `No se puede eliminar: Existen tareas (${names}) que dependen de esta compra. Elimine las dependencias primero.` 
      });
    }

    await conn.beginTransaction();

    // 2. Verificación de existencia
    const [cur] = await conn.execute('SELECT id_compra FROM compras WHERE id_compra = ?', [id]);
    if (!cur.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Compra no encontrada' });
    }

    // 3. Eliminación física
    await conn.execute('DELETE FROM compras WHERE id_compra = ?', [id]);
    
    await conn.commit();
    res.json({ success: true });
  } catch (err) { 
    await conn.rollback(); 
    console.error('[DELETE PURCHASE] Error:', err);
    res.status(500).json({ error: err.message }); 
  } finally { 
    conn.release(); 
  }
});

module.exports = router;
