/**
 * Lógica de cálculo de fechas.
 * Modificado para usar ESTRICTAMENTE días naturales corridos (calendario).
 */

function parseDate(d) {
  if (!d) return null;
  let y, m, day;
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return null;
    y = d.getFullYear();
    m = d.getMonth() + 1;
    day = d.getDate();
  } else {
    const parts = d.toString().split('T')[0].split('-').map(Number);
    y = parts[0]; m = parts[1]; day = parts[2];
  }
  return new Date(Date.UTC(y, m - 1, day));
}

function formatDate(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : parseDate(d);
  if (!dt || isNaN(dt.getTime())) return null;
  return dt.toISOString().split('T')[0];
}

/**
 * Calcula la fecha de fin sumando la duración (días naturales) a la fecha de inicio.
 * Se resta 1 porque el día de inicio cuenta como el día 1 de ejecución.
 */
function calcFechaFin(startDate, duration) {
  const d = parseDate(startDate);
  if (!d || !duration) return null;

  const days = parseInt(duration, 10);
  
  // Calendario puro: fecha_fin = inicio + (duracion - 1) días
  d.setUTCDate(d.getUTCDate() + days - 1);

  return d;
}

/**
 * Calcula el estado de la tarea de forma automática y jerárquica.
 * Prioridad: Finalizada > Bloqueada > Atraso (Iniciada/Pendiente) > En Progreso.
 * 
 * @param {Object} task - Objeto con fechas y progreso
 * @param {Boolean} isBlocked - Si la red de dependencias está insatisfecha
 * @returns {String} - Nombre del estado
 */
function calcEstado(task, isBlocked = false) {
  const { 
    fecha_completada, 
    fecha_real_iniciada, 
    fecha_inicio_proyectada, 
    fecha_fin_proyectada 
  } = task;

  // 1. FINALIZADA (Solo si tiene fecha real de fin)
  if (fecha_completada) return 'Finalizada';

  // 2. BLOQUEADA (Si hay predecesores sin terminar)
  if (isBlocked) return 'Bloqueada';

  // Preparamos fecha de Hoy para comparación (UTC Midnight)
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  // 3. CASO: YA INICIADA
  if (fecha_real_iniciada) {
    const fFinProy = parseDate(fecha_fin_proyectada);
    // Si hoy sobrepasó el fin proyectado sin haber finalizado -> Iniciada Atrasada
    if (fFinProy && today > fFinProy) return 'Iniciada Atrasada';
    return 'En progreso';
  }

  // 4. CASO: PENDIENTE
  const fIniProy = parseDate(fecha_inicio_proyectada);
  // Si hoy sobrepasó el inicio proyectado y no ha iniciado -> Atrasada
  if (fIniProy && today > fIniProy) return 'Atrasada';

  return 'No comenzada';
}

module.exports = { parseDate, formatDate, calcFechaFin, calcEstado };