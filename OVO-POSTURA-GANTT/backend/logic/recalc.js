const { calcFechaFin, calcEstado, formatDate, parseDate } = require('./dates');

/**
 * Calcula el rango de fechas de una tarea padre basándose en sus hijas.
 * Recalcula tanto la capa de Baseline como la capa de Proyectada.
 */
async function recalcParentBounds(conn, parentId) {
  if (!parentId) return [];

  // 1. Obtener todas las hijas directas de este padre
  const [children] = await conn.execute(
    `SELECT id_tarea, fecha_inicio, fecha_fin, fecha_inicio_proyectada, fecha_fin_proyectada, duracion_dias 
     FROM tareas WHERE id_parent = ?`,
    [parentId]
  );

  if (children.length === 0) return []; 

  // 2. Determinar Extremas
  let minBaseStart = null;
  let maxBaseEnd   = null;
  let minProyStart = null;
  let maxProyEnd   = null;

  for (const child of children) {
    // Capa Baseline
    const csBase = parseDate(child.fecha_inicio);
    const ceBase = parseDate(child.fecha_fin);
    if (csBase && (!minBaseStart || csBase < minBaseStart)) minBaseStart = csBase;
    if (ceBase && (!maxBaseEnd   || ceBase > maxBaseEnd))   maxBaseEnd   = ceBase;

    // Capa Proyectada (Usamos la efectiva: Proyectada || Baseline)
    const csProy = parseDate(child.fecha_inicio_proyectada || child.fecha_inicio);
    const ceProy = parseDate(child.fecha_fin_proyectada || child.fecha_fin);
    if (csProy && (!minProyStart || csProy < minProyStart)) minProyStart = csProy;
    if (ceProy && (!maxProyEnd   || ceProy > maxProyEnd))   maxProyEnd   = ceProy;
  }

  if (!minBaseStart || !maxBaseEnd || !minProyStart || !maxProyEnd) return [];

  const nbStart = formatDate(minBaseStart);
  const nbEnd   = formatDate(maxBaseEnd);
  const npStart = formatDate(minProyStart);
  const npEnd   = formatDate(maxProyEnd);

  // 3. Obtener datos actuales del padre
  const [pRows] = await conn.execute(
    'SELECT * FROM tareas WHERE id_tarea = ?',
    [parentId]
  );
  if (pRows.length === 0) return [];
  const p = pRows[0];

  // Calcular nueva duración del padre (diferencia calendario entre extremos baseline)
  const diffTime = Math.abs(maxBaseEnd - minBaseStart);
  const newDuration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  // Calcular nuevo estado del padre basándose en sus nuevas proyecciones
  const newStatus = calcEstado({
    ...p,
    fecha_inicio: nbStart,
    fecha_fin: nbEnd,
    fecha_inicio_proyectada: npStart,
    fecha_fin_proyectada: npEnd,
    duracion_dias: newDuration
  }, false); // Los padres raramente se consideran "bloqueados" individualmente

  // ¿Hubo cambios reales?
  if (p.fecha_inicio === nbStart && 
      p.fecha_fin === nbEnd && 
      p.fecha_inicio_proyectada === npStart && 
      p.fecha_fin_proyectada === npEnd &&
      p.estado === newStatus) {
    return [];
  }

  // 4. Actualizar padre
  await conn.execute(
    `UPDATE tareas 
     SET fecha_inicio = ?, fecha_fin = ?, duracion_dias = ?, 
         fecha_inicio_proyectada = ?, fecha_fin_proyectada = ?, estado = ? 
     WHERE id_tarea = ?`,
    [nbStart, nbEnd, newDuration, npStart, npEnd, newStatus, parentId]
  );

  const affected = [{ 
    id_tarea: parentId, 
    fecha_inicio: nbStart, 
    fecha_fin: nbEnd,
    duracion_dias: newDuration,
    fecha_inicio_proyectada: npStart,
    fecha_fin_proyectada: npEnd,
    estado: newStatus
  }];

  // 5. Recursión hacia arriba (abuelo)
  const upperAffected = await recalcParentBounds(conn, p.id_parent);
  return [...affected, ...upperAffected];
}

module.exports = { recalcParentBounds };
