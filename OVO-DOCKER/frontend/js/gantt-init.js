/* ============================================================
   GANTT INIT — dhtmlx-gantt configuration & events
   ============================================================ */

window.GanttApp = (() => {
  let currentProjectId = null;
  let currentProjectColor = '#6366f1';
  let _ignoreUpdate = false; // evita loop en actualizaciones programáticas
  let _allProjectsMode = false;
  let _projectsMap = {}; // id_proyecto -> { nombre, codigo, color }

  /* ── Scales ─────────────────────────────────────────────── */
  const SCALES = {
    day: [
      { unit: 'month', step: 1, format: '%F %Y' },  // Enero 2026
      { unit: 'day',   step: 1,
        format: (d) => {
          const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
          // DHTMLX recorta si usamos <br> sin ajustar scale_height, mejor "Lun 13"
          return `${dias[d.getDay()]} ${d.getDate()}`;
        },
        css: d => d.getDay() === 0 ? 'weekend' : (d.getDay() === 6 ? 'saturday' : '')
      }
    ],
    week: [
      { unit: 'month', step: 1, format: '%F %Y' },  // Enero 2026
      { unit: 'week',  step: 1,
        format: (d) => {
          const end = new Date(d); end.setDate(d.getDate() + 6);
          const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
          return `${d.getDate()} ${meses[d.getMonth()]} – ${end.getDate()} ${meses[end.getMonth()]}`;
        }
      }
    ],
    month: [
      { unit: 'year',  step: 1, format: '%Y' },
      { unit: 'month', step: 1, format: '%F' }       // Enero, Febrero...
    ]
  };
  let currentScale = 'month';

  /* ── Configure gantt ─────────────────────────────────────── */
  function configure() {
    gantt.config.show_grid = false;
    gantt.config.open_tree_initially = false;
    gantt.plugins({ tooltip: true, marker: true });

    gantt.config.date_format  = '%Y-%m-%d';
    gantt.config.xml_date     = '%Y-%m-%d';
    gantt.config.duration_unit = 'day';
    gantt.config.duration_step = 1;
    gantt.config.scale_height  = 50; // Más espacio para mes y días
    gantt.config.row_height    = 42;
    gantt.config.task_height   = 26;
    gantt.config.bar_height    = 20;
    gantt.config.link_radius   = 6;
    gantt.config.grid_width    = 800;
    gantt.config.min_duration  = 86400000; // 1 day in ms
    gantt.config.drag_links    = true;
    gantt.config.drag_progress = true;
    gantt.config.drag_resize   = true;
    gantt.config.drag_move     = true;
    gantt.config.show_errors   = false;
    gantt.config.autosize      = false;
    gantt.config.fit_tasks     = false;
    gantt.config.open_tree_initially = true;
    gantt.config.show_markers  = true;
    gantt.config.order_branch = true;
    gantt.config.order_branch_free = true;

    // Idioma español simplificado
    gantt.locale.labels.section_description = 'Descripción';
    gantt.locale.date = {
      month_full: ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
      month_short: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],
      day_full: ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'],
      day_short: ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
    };

    applyScale(currentScale);

    const isMobile = window.innerWidth < 768;
    
    /* ── Columns ──────────────────────────────────────────── */
    gantt.config.columns = [
      {
        name: 'text', label: 'Tarea', tree: true, width: isMobile ? 180 : 250,
        template: t => {
          const today = new Date(); today.setHours(0,0,0,0);
          const tStart = new Date(t.start_date); tStart.setHours(0,0,0,0);
          const isDelayed = (tStart <= today && (t.progress || 0) === 0 && t._estado !== 'Finalizada');
          const color = isDelayed ? 'var(--red)' : 'inherit';
          return `<span style="font-weight:600; color:${color}">${t.text || ''}</span>`;
        }
      },
      {
        name: 'sub_col', label: 'Subs', width: 45, align: 'center', hide: isMobile,
        template: t => {
          const count = gantt.getChildren(t.id).length;
          return count > 0 ? `<span class="badge" style="background:var(--bg-header);color:var(--text-dim);font-size:10px;padding:2px 6px">${count}</span>` : '';
        }
      },
      {
        name: 'project_col', label: 'Proyecto', width: 100, align: 'left', hide: isMobile,
        template: t => `<span style="font-size:10px;font-weight:600;color:var(--text-dim)">${t._projectName || ''}</span>`
      },
      {
        name: 'responsable', label: 'Resp.', width: 80, align: 'left', hide: isMobile,
        template: t => {
          const r = t.responsable || '';
          return `<span style="font-size:11px;color:var(--text-muted)">${r.split('@')[0] || '—'}</span>`;
        }
      },
      {
        name: 'start_date', label: 'Inicio', width: 80, align: 'center', hide: isMobile,
        template: t => t.start_date ? gantt.templates.date_grid(t.start_date) : '—'
      },
      {
        name: 'estado_col', label: 'Estado', width: 90, align: 'center',
        template: t => estadoBadge(t)
      },
      {
        name: 'notes_col', label: 'Notas', width: 45, align: 'center',
        template: t => {
          if (t.note_count > 0) {
            return `
            <div style="display:flex; align-items:center; justify-content:center; height:100%;">
              <div class="note-col-trigger" data-id="${t.id}" style="display:flex; justify-content:center; align-items:center; width:28px; height:28px; background:var(--indigo); color:#fff; border-radius:8px; cursor:pointer;" title="Notas">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
              </div>
            </div>
            `;
          }
          return '';
        }
      }
    ];

    /* ── Templates ────────────────────────────────────────── */
    gantt.templates.date_grid = d =>
      d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : '';

    gantt.templates.task_class = (s, e, t) => {
      const pct = Math.round((t.progress || 0) * 100);
      if (pct >= 100) return 'task-done';
      if (pct > 0)    return 'task-progress';
      return 'task-pending';
    };

    gantt.templates.task_text = (s, e, t) => {
      const initials = (t.responsable || '')
        .split('@')[0].substring(0, 2).toUpperCase() || '??';
      return `<span class="task-bar-label">${t.text || ''}</span>
              <span class="task-bar-resp" title="${t.responsable || ''}">${initials}</span>`;
    };

    gantt.templates.tooltip_text = (s, e, t) => {
      const costo = parseFloat(t._raw?.costo_tarea || t._costo || 0);
      return `
      <div style="min-width:180px">
        <strong style="font-size:13px">${t.text || ''}</strong><br>
        <div style="margin-top:6px;line-height:2">
          <span style="color:var(--text-muted)">Proyecto:</span> ${t._projectName || '—'}<br>
          <span style="color:var(--text-muted)">Inicio:</span> ${gantt.templates.date_grid(s)}<br>
          <span style="color:var(--text-muted)">Fin:</span> ${gantt.templates.date_grid(e)}<br>
          <span style="color:var(--text-muted)">Estado:</span> ${estadoBadge(t)}<br>
          <span style="color:var(--text-muted)">Progreso:</span> <span style="color:var(--indigo);font-weight:600">${Math.round((t.progress||0)*100)}%</span><br>
          <span style="color:var(--text-muted)">Días:</span> ${t.duration} (${t._tipo_dias || 'calendario'})<br>
          <span style="color:var(--text-muted)">Avance:</span> ${Math.round((t.progress||0)*100)}%<br>
          <span style="color:var(--text-muted)">Responsable:</span> ${t.responsable || '—'}
        </div>
      </div>`;
    };

    gantt.templates.link_class = () => 'gantt-link';

    // Disable default lightbox → usamos modal propio
    gantt.showLightbox = id => UI.openTaskModal(gantt.getTask(id));

    gantt.attachEvent('onTaskCreated', (task) => {
      UI.openTaskModal(null);
      return false; // bloquea la creación nativa de dhtmlx
    });

    /* ── Events ───────────────────────────────────────────── */
    gantt.attachEvent('onAfterTaskDrag', (id, mode, e) => {
      if (_ignoreUpdate) return;
      const t = gantt.getTask(id);
      const fmt = gantt.date.date_to_str('%Y-%m-%d');
      const newStart = fmt(t.start_date);
      
      // Convertir la duración visual (calendar days) a días lógicos según tipo_dias
      let realDur = 0;
      let curr = new Date(t.start_date);
      const end = new Date(t.end_date);
      while (curr < end) {
        if (t._tipo_dias !== 'laboral' || curr.getDay() !== 0) realDur++;
        curr.setDate(curr.getDate() + 1);
      }
      const newDur = Math.max(1, realDur);

      API.updateTask(id, {
        fecha_inicio:  newStart,
        duracion_dias: newDur
      }).then(r => {
        // Actualizar el _raw para que la edición desde modal muestre l os datos correctos
        if (gantt.isTaskExists(id)) {
          const gt = gantt.getTask(id);
          gt._raw = r.task;
          // NO tocar start_date/duration del task draggeado (ya está bien en pantalla)
        }
        // Propagar cambios a dependientes
        const dependientes = r.updatedTasks.filter(t2 => t2.id_tarea != id);
        if (dependientes.length) applyUpdatedTasks(dependientes, null);
        updateSummary();
      }).catch(e => UI.toast(e.error || 'Error al actualizar', 'error'));
    });

    gantt.attachEvent('onAfterProgressDrag', id => {
      if (_ignoreUpdate) return;
      const t = gantt.getTask(id);
      const avance = Math.round(t.progress * 100);
      API.updateTask(id, { avance })
        .then(r => applyUpdatedTasks(r.updatedTasks, id))
        .catch(e => UI.toast(e.error || 'Error al actualizar', 'error'));
    });

    // Link creado → agregar dependencia
    gantt.attachEvent('onAfterLinkAdd', (id, link) => {
      if (_ignoreUpdate) return;
      const targetTask = gantt.getTask(link.target);
      const existing = (targetTask._dependencias || '').split(',').map(d => d.trim()).filter(Boolean);
      if (!existing.includes(String(link.source))) {
        existing.push(String(link.source));
      }
      const newDeps = existing.join(',');
      API.updateTask(link.target, { dependencias: newDeps })
        .then(r => {
          targetTask._dependencias = newDeps;
          applyUpdatedTasks(r.updatedTasks, link.target);
          UI.toast('Dependencia creada', 'success');
        })
        .catch(e => {
          UI.toast(e.error || 'Error al crear dependencia', 'error');
          _ignoreUpdate = true;
          gantt.deleteLink(id);
          _ignoreUpdate = false;
        });
    });

    // Link eliminado → quitar dependencia
    gantt.attachEvent('onAfterLinkDelete', (id, link) => {
      if (_ignoreUpdate) return;
      const targetTask = gantt.getTask(link.target);
      const existing = (targetTask._dependencias || '').split(',').map(d => d.trim()).filter(d => d && d !== String(link.source));
      const newDeps = existing.join(',') || null;
      API.updateTask(link.target, { dependencias: newDeps })
        .then(r => {
          targetTask._dependencias = newDeps || '';
          applyUpdatedTasks(r.updatedTasks, link.target);
          UI.toast('Dependencia eliminada', 'warning');
        })
        .catch(e => UI.toast(e.error || 'Error al eliminar dependencia', 'error'));
    });

    // Task eliminada (botón del gantt)
    gantt.attachEvent('onBeforeTaskDelete', id => {
      UI.confirmDelete(id);
      return false; // bloqueamos el borrado nativo, lo hacemos vía API
    });
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function estadoBadge(t) {
    let estado = t._estado || 'No comenzada';
    const p = Math.round((t.progress || 0) * 100);

    if (estado !== 'Finalizada') {
      const today = new Date(); today.setHours(0,0,0,0);
      const tStart = new Date(t.start_date); tStart.setHours(0,0,0,0);
      
      if (tStart <= today && p === 0) {
        estado = 'Retrasada';
      } else if (p < 100) {
        if (t.$target && t.$target.length > 0) {
          for (let linkId of t.$target) {
            if (window.gantt && gantt.isLinkExists && gantt.isLinkExists(linkId)) {
              const link = gantt.getLink(linkId);
              if (gantt.isTaskExists(link.source)) {
                const pred = gantt.getTask(link.source);
                const predP = Math.round((pred.progress || 0) * 100);
                if (predP < 100 && pred._estado !== 'Finalizada') {
                  estado = 'Bloqueada';
                  break;
                }
              }
            }
          }
        }
      }
    }

    const map = {
      'No comenzada': 'badge-no-comenzada',
      'En progreso':  'badge-en-progreso',
      'Finalizada':   'badge-finalizada',
      'Retrasada':    'badge-retrasada',
      'Bloqueada':    'badge-bloqueada'
    };
    
    const cls = map[estado] || 'badge-no-comenzada';
    return `<span class="badge ${cls}">${estado}</span>`;
  }

  function dbTaskToGantt(t, color) {
    const startStr = t.dependencias && t.fecha_inicio_proyectada
      ? t.fecha_inicio_proyectada
      : t.fecha_inicio;
      
    let endStr = undefined;
    if (t.fecha_fin) {
      // Para que el Gantt dibuje visualmente hasta el día correcto,
      // end_date debe ser el día posterior a fecha_fin (es exclusivo).
      const end = new Date(t.fecha_fin + 'T00:00:00');
      if (!isNaN(end.getTime())) {
        end.setDate(end.getDate() + 1);
        endStr = gantt.date.date_to_str('%Y-%m-%d')(end);
      }
    }

    // Resolve project info
    const projInfo = _projectsMap[t.id_proyecto] || {};

    return {
      id:           t.id_tarea,
      parent:       t.id_parent || 0,
      text:         t.descripcion || "Tarea sin nombre", // Ocultar códigos T00x del Gantt
      start_date:   startStr || t.fecha_inicio,
      end_date:     endStr,
      duration:     endStr ? undefined : (parseInt(t.duracion_dias) || 1),
      progress:     parseFloat(t.avance || 0) / 100,
      color:        color || '#6366f1',
      // extra campos
      _tarea_cod:   t.tarea,
      _estado:      t.estado,
      _tipo_dias:   t.tipo_dias,
      _dependencias: t.dependencias || '',
      _costo:       parseFloat(t.costo_tarea) || 0,
      responsable:  (t.id_parent && t.subresponsable_nombre) ? t.subresponsable_nombre : (t.responsable || ''),
      note_count:   t.note_count || 0,
      // project info for exports
      _projectName: projInfo.nombre || '',
      _projectCode: projInfo.codigo || '',
      // DB raw
      _raw: t
    };
  }

  function buildLinks(tasks) {
    const links = [];
    const seen  = new Set();
    tasks.forEach(t => {
      if (!t.dependencias) return;
      t.dependencias.split(',').map(d => d.trim()).filter(Boolean).forEach(src => {
        const key = `${src}_${t.id_tarea}`;
        if (!seen.has(key)) {
          seen.add(key);
          links.push({ id: key, source: parseInt(src), target: t.id_tarea, type: '0' });
        }
      });
    });
    return links;
  }

  function applyUpdatedTasks(updatedTasks, skipId) {
    if (!updatedTasks) return;
    _ignoreUpdate = true;
    updatedTasks.forEach(t => {
      if (!gantt.isTaskExists(t.id_tarea)) return;
      // Si el usuario acabó de arrastrar esta tarea, no pisar su posición
      // (sólo actualizamos las tareas dependientes propagadas)
      if (skipId !== null && skipId !== undefined && t.id_tarea == skipId) {
        // Sólo actualizamos metadatos, la posición ya la tiene el gantt correcta
        const gt = gantt.getTask(t.id_tarea);
        gt._estado      = t.estado;
        gt._tipo_dias   = t.tipo_dias;
        gt._dependencias = t.dependencias || '';
        gt._raw         = t;
        gantt.updateTask(t.id_tarea);
        return;
      }
      const gt = gantt.getTask(t.id_tarea);
      const start = t.dependencias && t.fecha_inicio_proyectada
        ? t.fecha_inicio_proyectada
        : t.fecha_inicio;
      gt.start_date   = gantt.date.parseDate(start, 'xml_date');
      gt.duration     = parseInt(t.duracion_dias) || 1;
      gt.progress     = parseFloat(t.avance || 0) / 100;
      gt._estado      = t.estado;
      gt._tipo_dias   = t.tipo_dias;
      gt._dependencias = t.dependencias || '';
      gt._raw         = t;
      gantt.updateTask(t.id_tarea);
    });
    _ignoreUpdate = false;
    updateSummary();
  }
    
    gantt.attachEvent("onTaskClick", function(id, e) {
      if (e.target.closest('.note-col-trigger')) {
        const trueId = e.target.closest('.note-col-trigger').dataset.id;
        if (window.UI && window.UI.openNotesModal) {
          window.UI.openNotesModal(trueId);
        }
        return false;
      }
      return true;
    });

    function updateSummary() {
    try {
      const tasks = gantt.getTaskByTime();
      const ids = tasks.map(t => t.id);
      let totT = 0, doneT = 0, progT = 0, pendT = 0;
      let totS = 0, doneS = 0, progS = 0, pendS = 0;
      let totalProgressT = 0, totalProgressS = 0;
      let totalCosto = 0, aplicado = 0;
      let minDate = null, maxDate = null;
      let delayed = 0, blocked = 0;
      const today = new Date(); today.setHours(0,0,0,0);
      const upcomingMilestones = [];

      ids.forEach(id => {
        const t = gantt.getTask(id);
        const p = Math.round((t.progress || 0) * 100);
        // Is subtask if it has a parent id != 0 that actually exists
        const isSub = t.parent && String(t.parent) !== "0" && gantt.isTaskExists(t.parent);

        if (isSub) {
          totS++;
          totalProgressS += p;
          if (p >= 100) doneS++;
          else if (p > 0) progS++;
          else pendS++;
        } else {
          totT++;
          totalProgressT += p;
          if (p >= 100) doneT++;
          else if (p > 0) progT++;
          else pendT++;
        }

        const costo = parseFloat(t._raw?.costo_tarea || t._costo || 0);
        totalCosto += costo;
        if (t._estado === 'Finalizada' || p >= 100) {
          aplicado += costo;
        }

        // Delayed: start <= today and 0% progress
        const tStart = new Date(t.start_date); tStart.setHours(0,0,0,0);
        if (tStart <= today && p === 0 && t._estado !== 'Finalizada') {
          delayed++;
        }

        // Blocked: Not completed, and at least one predecessor is not completed
        if (p < 100 && t._estado !== 'Finalizada') {
          if (t.$target && t.$target.length > 0) {
            let isBlocked = false;
            for (let linkId of t.$target) {
              if (window.gantt && gantt.isLinkExists && gantt.isLinkExists(linkId)) {
                const link = gantt.getLink(linkId);
                if (gantt.isTaskExists(link.source)) {
                  const pred = gantt.getTask(link.source);
                  const predP = Math.round((pred.progress || 0) * 100);
                  if (predP < 100 && pred._estado !== 'Finalizada') {
                    isBlocked = true;
                    break;
                  }
                }
              }
            }
            if (isBlocked) blocked++;
          }
        }
        
        // Milestones and max/min dates logic untouched
        const daysUntil = Math.ceil((tStart - today) / 86400000);
        if (daysUntil > 0 && daysUntil <= 60 && p === 0) {
          upcomingMilestones.push({ name: t.text, date: tStart });
        }
        if (t.start_date) {
          const sd = new Date(t.start_date);
          if (!minDate || sd < minDate) minDate = sd;
        }
        if (t.end_date) {
          const ed = new Date(t.end_date);
          if (!maxDate || ed > maxDate) maxDate = ed;
        }
      });
      
      const total = totT + totS;
      const totalProgress = totalProgressT + totalProgressS;
      const avgProgress = total > 0 ? Math.round(totalProgress / total) : 0;
      const pctAplicado = totalCosto > 0 ? Math.round(aplicado / totalCosto * 100) : 0;

      const fmtCur = n => '$' + n.toLocaleString('es-AR', {maximumFractionDigits:0});
      const fmtDateShort = d => {
        if (!d) return '--';
        const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
      };
      
      const el = id => document.getElementById(id);
      const setDom = (id, val) => { if (el(id)) el(id).textContent = val; };
      
      // Totals
      setDom('stat-total-t', totT);
      setDom('stat-total-t-done', totT);
      setDom('stat-total-t-prog', totT);
      setDom('stat-total-t-pend', totT);
      
      setDom('stat-sub-total', totS);
      setDom('stat-sub-total-done', totS);
      setDom('stat-sub-total-prog', totS);
      setDom('stat-sub-total-pend', totS);

      // Main tasks
      setDom('stat-done', doneT);
      setDom('stat-progress', progT);
      setDom('stat-pending', pendT);
      setDom('stat-done-pct', totT ? Math.round(doneT/totT*100)+'%' : '0%');
      setDom('stat-progress-pct', totT ? Math.round(progT/totT*100)+'%' : '0%');
      setDom('stat-pending-pct', totT ? Math.round(pendT/totT*100)+'%' : '0%');

      // Subtasks
      setDom('stat-sub-done', doneS);
      setDom('stat-sub-prog', progS);
      setDom('stat-sub-pend', pendS);
      setDom('stat-sub-done-pct', totS ? Math.round(doneS/totS*100)+'%' : '0%');
      setDom('stat-sub-progress-pct', totS ? Math.round(progS/totS*100)+'%' : '0%');
      setDom('stat-sub-pending-pct', totS ? Math.round(pendS/totS*100)+'%' : '0%');
      
      // Cost and applied
      setDom('stat-costo-total', fmtCur(totalCosto));
      setDom('stat-total-aplicado', fmtCur(aplicado));
      setDom('stat-aplicado-pct', pctAplicado + '%');

      // Project dates
      if(el('stat-fecha-inicio')) el('stat-fecha-inicio').textContent = fmtDateShort(minDate);
      if(el('stat-fecha-fin')) {
        if (maxDate) {
          const adjustedEnd = new Date(maxDate);
          adjustedEnd.setDate(adjustedEnd.getDate() - 1);
          el('stat-fecha-fin').textContent = fmtDateShort(adjustedEnd);
        } else {
          el('stat-fecha-fin').textContent = '--';
        }
      }

      // Status bar
      if(el('status-risk-count'))    el('status-risk-count').textContent    = delayed;
      if(el('status-blocked-count')) el('status-blocked-count').textContent = blocked;
      if(el('status-avance'))        el('status-avance').textContent        = avgProgress + '%';
      if(el('status-avance-bar'))    el('status-avance-bar').style.width    = avgProgress + '%';

      // Milestones
      const mList = el('status-milestones');
      if (mList) {
        upcomingMilestones.sort((a,b) => a.date - b.date);
        const top = upcomingMilestones.slice(0, 3);
        if (top.length === 0) {
          mList.innerHTML = '<div class="status-milestone-empty">Sin hitos próximos</div>';
        } else {
          const months = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
          mList.innerHTML = top.map(m => `
            <div class="status-milestone-item">
              <div class="status-milestone-date">
                <span class="m-day">${m.date.getDate()}</span>
                <span>${months[m.date.getMonth()]}</span>
              </div>
              <span class="status-milestone-name">${m.name}</span>
            </div>
          `).join('');
        }
      }
    } catch(_) {}
  }

  function applyScale(scale) {
    currentScale = scale;
    gantt.config.scales = SCALES[scale];
    gantt.render();
    const scaleEl = document.getElementById('scale-label');
    if (scaleEl) scaleEl.textContent = { day:'Días', week:'Semanas', month:'Meses' }[scale];
    
    // Update zoom buttons visual state
    ['day', 'week', 'month'].forEach(s => {
      const btn = document.getElementById('btn-zoom-' + s);
      if (btn) {
        if (s === scale) {
          btn.classList.add('btn-primary', 'active');
          btn.classList.remove('btn-ghost');
        } else {
          btn.classList.remove('btn-primary', 'active');
          btn.classList.add('btn-ghost');
        }
      }
    });
  }

  /* ── Public API ──────────────────────────────────────────── */
  function init() {
    configure();
    gantt.init('gantt_here');

    // Marker de hoy
    addTodayMarker();

      // Toolbar: zoom
    document.getElementById('btn-zoom-day').addEventListener('click',   () => applyScale('day'));
    document.getElementById('btn-zoom-week').addEventListener('click',  () => applyScale('week'));
    document.getElementById('btn-zoom-month').addEventListener('click', () => applyScale('month'));
    document.getElementById('btn-today').addEventListener('click', () => gantt.showDate(new Date()));
  }

  /* ── Today marker helper (clearAll removes markers) ───── */
  function addTodayMarker() {
    gantt.addMarker({
      start_date: new Date(),
      css: 'today-marker',
      text: 'Hoy',
      title: new Date().toLocaleDateString('es')
    });
  }

  function addProjectMarkers(tasks) {
    if (!tasks || tasks.length === 0) return;
    
    let minDate = null, maxDate = null;
    
    tasks.forEach(t => {
      const start = t.fecha_inicio ? new Date(t.fecha_inicio) : null;
      const end = t.fecha_fin ? new Date(t.fecha_fin) : null;
      
      if (start) {
        if (!minDate || start < minDate) minDate = start;
      }
      if (end) {
        if (!maxDate || end > maxDate) maxDate = end;
      }
    });
    
    // Agregar marker de inicio del proyecto
    if (minDate) {
      gantt.addMarker({
        start_date: minDate,
        css: 'project-start-marker',
        text: '🚀 Inicio',
        title: 'Inicio del proyecto: ' + minDate.toLocaleDateString('es')
      });
    }
    
    // Agregar marker de fin del proyecto
    if (maxDate) {
      gantt.addMarker({
        start_date: maxDate,
        css: 'project-end-marker',
        text: '🏁 Fin',
        title: 'Fin del proyecto: ' + maxDate.toLocaleDateString('es')
      });
    }
  }

  function setProjectsMap(projects) {
    _projectsMap = {};
    projects.forEach(p => {
      _projectsMap[p.id_proyecto] = {
        nombre: p.nombre_proyecto,
        codigo: p.proyecto,
        color:  p.color
      };
    });
  }

  function loadProject(projectId, color) {
    currentProjectId    = projectId;
    currentProjectColor = color || '#6366f1';
    _allProjectsMode    = false;
    return API.getProjectTasks(projectId).then(tasks => {
      const gtasks = tasks.map(t => dbTaskToGantt(t, currentProjectColor));
      const links  = buildLinks(tasks);
      gantt.clearAll();
      gantt.parse({ data: gtasks, links });
      addTodayMarker();
      addProjectMarkers(tasks);
      
      // Ampliar la linea de tiempo para poder navegar hacia fechas vacías
      const state = gantt.getState();
      const today = new Date();
      if (state.min_date && state.max_date) {
        const expandStart = new Date(Math.min(state.min_date.getTime(), today.getTime()));
        expandStart.setMonth(expandStart.getMonth() - 2);
        const expandEnd = new Date(Math.max(state.max_date.getTime(), today.getTime()));
        expandEnd.setMonth(expandEnd.getMonth() + 4);
        gantt.config.start_date = expandStart;
        gantt.config.end_date   = expandEnd;
      }

      gantt.render();
      if (typeof gantt.renderMarkers === 'function') gantt.renderMarkers();
      gantt.showDate(new Date());
      updateSummary();
    });
  }

  async function loadAllProjects() {
    currentProjectId    = '__all__';
    _allProjectsMode    = true;

    const allTasks = await API.getTasks();
    const allGtasks = [];
    const allRawTasks = [];

    allTasks.forEach(t => {
      const projInfo = _projectsMap[t.id_proyecto];
      const color = projInfo ? projInfo.color : '#6366f1';
      allGtasks.push(dbTaskToGantt(t, color));
      allRawTasks.push(t);
    });

    const links = buildLinks(allTasks);
    gantt.clearAll();
    gantt.parse({ data: allGtasks, links });
    addTodayMarker();
    addProjectMarkers(allRawTasks);

    const state = gantt.getState();
    const today = new Date();
    if (state.min_date && state.max_date) {
      const expandStart = new Date(Math.min(state.min_date.getTime(), today.getTime()));
      expandStart.setMonth(expandStart.getMonth() - 2);
      const expandEnd = new Date(Math.max(state.max_date.getTime(), today.getTime()));
      expandEnd.setMonth(expandEnd.getMonth() + 4);
      gantt.config.start_date = expandStart;
      gantt.config.end_date   = expandEnd;
    }

    gantt.render();
    if (typeof gantt.renderMarkers === 'function') gantt.renderMarkers();
    gantt.showDate(new Date());
    updateSummary();
    return allRawTasks;
  }

  async function loadCompras() {
    currentProjectId    = '__compras__';
    _allProjectsMode    = false;

    const comprasTasks = await API.getCompras();
    const allGtasks = [];
    const allRawTasks = [];

    comprasTasks.forEach(t => {
      const projInfo = _projectsMap[t.id_proyecto];
      const color = projInfo ? projInfo.color : '#6366f1';
      allGtasks.push(dbTaskToGantt(t, color));
      allRawTasks.push(t);
    });

    const links = buildLinks(comprasTasks);
    gantt.clearAll();
    gantt.parse({ data: allGtasks, links });
    addTodayMarker();
    addProjectMarkers(allRawTasks);

    const state = gantt.getState();
    const today = new Date();
    if (state.min_date && state.max_date) {
      const expandStart = new Date(Math.min(state.min_date.getTime(), today.getTime()));
      expandStart.setMonth(expandStart.getMonth() - 2);
      const expandEnd = new Date(Math.max(state.max_date.getTime(), today.getTime()));
      expandEnd.setMonth(expandEnd.getMonth() + 4);
      gantt.config.start_date = expandStart;
      gantt.config.end_date   = expandEnd;
    }

    gantt.render();
    if (typeof gantt.renderMarkers === 'function') gantt.renderMarkers();
    gantt.showDate(new Date());
    updateSummary();
    return allRawTasks;
  }

  function addTask(dbTask) {
    _ignoreUpdate = true;
    gantt.addTask(dbTaskToGantt(dbTask, currentProjectColor));
    _ignoreUpdate = false;
    updateSummary();
  }

  function refreshTask(dbTask) {
    applyUpdatedTasks([dbTask], null);
  }

  function applyAllUpdated(updatedTasks) {
    applyUpdatedTasks(updatedTasks, null);
  }

  function removeTask(id) {
    _ignoreUpdate = true;
    if (gantt.isTaskExists(id)) gantt.deleteTask(id);
    _ignoreUpdate = false;
    updateSummary();
  }

  function getCurrentProjectId() { return currentProjectId; }
  function isAllProjects() { return _allProjectsMode; }

  return { init, loadProject, loadAllProjects, loadCompras, setProjectsMap, addTask, refreshTask, applyAllUpdated, removeTask, getCurrentProjectId, isAllProjects, updateSummary };
})();
