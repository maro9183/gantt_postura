const { calcFechaFin, formatDate, parseDate } = require('./dates');

/**
 * Calcula el rango de fechas de una tarea padre basándose en sus hijas.
 * Si no tiene hijas, no hace nada (mantiene fechas fijas).
 * Si tiene hijas, ajusta fecha_inicio y fecha_fin del padre.
 * Luego sube recursivamente al abuelo.
 */
async function recalcParentBounds(conn, parentId) {
  if (!parentId) return [];

  // 1. Obtener todas las hijas directas de este padre
  const [children] = await conn.execute(
    'SELECT fecha_inicio, fecha_inicio_proyectada, fecha_fin, duracion_dias FROM tareas WHERE id_parent = ?',
    [parentId]
  );

  if (children.length === 0) return []; // No tiene hijas, no recalculamos (fechas fijas)

  // 2. Determinar MIN(inicio) y MAX(fin)
  let minStart = null;
  let maxEnd   = null;

  for (const child of children) {
    const startStr = child.fecha_inicio_proyectada || child.fecha_inicio;
    const s = parseDate(startStr);
    const e = parseDate(child.fecha_fin);

    if (s && (!minStart || s < minStart)) minStart = s;
    if (e && (!maxEnd   || e > maxEnd))   maxEnd   = e;
  }

  if (!minStart || !maxEnd) return [];

  const newStartStr = formatDate(minStart);
  const newEndStr   = formatDate(maxEnd);

  // 3. Obtener datos actuales del padre para ver si cambió
  const [pRows] = await conn.execute(
    'SELECT fecha_inicio, fecha_fin, id_parent, tipo_dias FROM tareas WHERE id_tarea = ?',
    [parentId]
  );
  if (pRows.length === 0) return [];
  const p = pRows[0];

  // Si no cambiaron las fechas, paramos la recursión
  if (p.fecha_inicio === newStartStr && p.fecha_fin === newEndStr) return [];

  // Calcular nueva duración del padre (diferencia de días)
  // Nota: Simplificamos a diferencia calendario para el padre resumen
  const diffTime = Math.abs(maxEnd - minStart);
  const newDuration = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  // 4. Actualizar padre
  await conn.execute(
    `UPDATE tareas 
     SET fecha_inicio = ?, fecha_fin = ?, duracion_dias = ?, fecha_inicio_proyectada = NULL 
     WHERE id_tarea = ?`,
    [newStartStr, newEndStr, newDuration, parentId]
  );

  const affected = [{ id_tarea: parentId, fecha_inicio: newStartStr, fecha_fin: newEndStr }];

  // 5. Recursión hacia arriba (abuelo)
  const upperAffected = await recalcParentBounds(conn, p.id_parent);
  return [...affected, ...upperAffected];
}

module.exports = { recalcParentBounds };
