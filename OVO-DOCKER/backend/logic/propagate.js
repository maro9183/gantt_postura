const { calcFechaFin, calcEstado, formatDate, parseDate } = require('./dates');

/**
 * Detecta si agregar newDepId como dependencia de sourceId crearía un ciclo.
 * Hace BFS desde newDepId siguiendo sus propias dependencias.
 * Si llega a sourceId → ciclo detectado.
 */
async function detectCycle(conn, sourceId, newDepId) {
  const visited = new Set();
  const queue   = [parseInt(newDepId)];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === parseInt(sourceId)) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const [rows] = await conn.execute(
      'SELECT dependencias FROM tareas WHERE id_tarea = ?', [current]
    );
    if (rows.length > 0 && rows[0].dependencias) {
      const deps = rows[0].dependencias
        .split(',')
        .map(id => parseInt(id.trim()))
        .filter(id => !isNaN(id));
      queue.push(...deps);
    }
  }
  return false;
}

/**
 * Propaga cambios en cascada a todas las tareas que dependen de taskId.
 * Usa BFS/DFS con un Set de visitados para evitar loops.
 * Devuelve array con todas las tareas actualizadas.
 */
async function propagateTasks(conn, taskId, visited = new Set()) {
  if (visited.has(taskId)) return [];
  visited.add(taskId);

  // Tareas que tienen taskId en su campo dependencias
  const [dependents] = await conn.execute(
    `SELECT * FROM tareas WHERE FIND_IN_SET(?, IFNULL(dependencias,'')) > 0`,
    [taskId.toString()]
  );

  const affected = [];

  for (const dep of dependents) {
    const depIds = (dep.dependencias || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);

    if (depIds.length === 0) continue;

    const placeholders = depIds.map(() => '?').join(',');
    const [depTasks] = await conn.execute(
      `SELECT id_tarea, fecha_fin FROM tareas WHERE id_tarea IN (${placeholders})`,
      depIds
    );

    if (depTasks.length === 0) continue;

    // La tarea dependiente inicia AL DÍA SIGUIENTE de la última dependencia
    const maxFin = depTasks.reduce((max, t) => {
      const d = parseDate(t.fecha_fin);
      return d && d > max ? d : max;
    }, new Date(0));

    maxFin.setUTCDate(maxFin.getUTCDate() + 1);
    
    // Si tipo_dias es laboral y cae en domingo, saltear al lunes
    if (dep.tipo_dias === 'laboral' && maxFin.getUTCDay() === 0) {
      maxFin.setUTCDate(maxFin.getUTCDate() + 1);
    }

    const newProyectada = formatDate(maxFin);
    const newFin        = formatDate(calcFechaFin(maxFin, dep.duracion_dias, dep.tipo_dias));
    const nuevoEstado   = calcEstado(dep.avance);

    await conn.execute(
      `UPDATE tareas
       SET fecha_inicio_proyectada = ?, fecha_fin = ?, estado = ?
       WHERE id_tarea = ?`,
      [newProyectada, newFin, nuevoEstado, dep.id_tarea]
    );

    const updated = { ...dep, fecha_inicio_proyectada: newProyectada, fecha_fin: newFin, estado: nuevoEstado };
    affected.push(updated);

    // Recursión para dependientes de este dependiente
    const subAffected = await propagateTasks(conn, dep.id_tarea, visited);
    affected.push(...subAffected);
  }

  return affected;
}

module.exports = { detectCycle, propagateTasks };
