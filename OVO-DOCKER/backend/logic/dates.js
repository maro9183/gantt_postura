/**
 * Lógica de cálculo de fechas.
 * tipo_dias:
 *   'calendario' → cuenta todos los días (incluye domingos)
 *   'laboral'    → cuenta Lun-Sáb (salta domingos)
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

function calcFechaFin(startDate, duracionDias, tipoDias) {
  const d = parseDate(startDate);
  if (!d || !duracionDias) return null;

  const days = parseInt(duracionDias, 10);

  if (tipoDias === 'laboral') {
    // El primer día (inicio) cuenta como día 1 si no es domingo.
    // Si el inicio fuera domingo lo salteamos antes de empezar.
    while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);

    // Ahora avanzamos (days - 1) días laborales más (Lun–Sáb).
    let remaining = days - 1;
    while (remaining > 0) {
      d.setUTCDate(d.getUTCDate() + 1);
      if (d.getUTCDay() !== 0) remaining--;  // no cuenta domingos
    }
  } else {
    // Calendario: fecha_fin = inicio + (duracion - 1) días
    d.setUTCDate(d.getUTCDate() + days - 1);
  }

  return d;
}

function calcEstado(avance) {
  const a = parseFloat(avance) || 0;
  if (a <= 0)   return 'No comenzada';
  if (a >= 100) return 'Finalizada';
  return 'En progreso';
}

module.exports = { parseDate, formatDate, calcFechaFin, calcEstado };
