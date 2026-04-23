/* ============================================================
   GANTT INIT — dhtmlx-gantt configuration & events
   ============================================================ */

window.GanttApp = (() => {
  let currentProjectId = null;
  let currentProjectColor = '#6366f1';
  let _ignoreUpdate = false; // evita loop en actualizaciones programáticas
  let _allProjectsMode = false;
  let _projectsMap = {}; // id_proyecto -> { nombre, codigo, color }
  let _initialized = false; // Guard para adjuntar eventos solo una vez

  // Pre-autorización de deletes programáticos (establece persistencia fuera de configure)
  const _directDeleteIds = new Set();
  window.__ganttDirectDelete = _directDeleteIds;

  let _colorMode = 'project';
  const _responsableColors = {};
  const _palette = ['#e11d48', '#d946ef', '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#14b8a6', '#10b981', '#22c55e', '#f59e0b', '#f97316'];
  let _paletteIdx = 0;
  let _activeMarkers = []; // Track marker IDs for cleanup

  function getColorMode() { return _colorMode; }
  function setColorMode(mode) { _colorMode = mode; }
  
  function getResponsableColor(resp) {
    if (!resp) return '#94a3b8'; // gris
    const key = String(resp).split('@')[0];
    if (!_responsableColors[key]) {
      _responsableColors[key] = _palette[_paletteIdx % _palette.length];
      _paletteIdx++;
    }
    return _responsableColors[key];
  }

  function toggleColorMode() {
    _colorMode = (_colorMode === 'project') ? 'responsable' : 'project';
    
    // Actualizar visual del botón
    const btn = document.getElementById('btn-toggle-color');
    if (btn) {
      if (_colorMode === 'responsable') {
        btn.innerHTML = '🎨 Responsables';
        btn.style.backgroundColor = 'var(--indigo)';
        btn.style.color = '#ffffff';
        btn.style.borderColor = 'var(--indigo)';
      } else {
        btn.innerHTML = '🎨 Proyecto';
        btn.style.backgroundColor = '#ffffff';
        btn.style.color = '#000000';
        btn.style.borderColor = '#d1d5db';
      }
    }

    // Refrescar colores de todas las tareas en el gantt en MODO SILENCIOSO 
    _ignoreUpdate = true;
    
    gantt.batchUpdate(() => {
      gantt.eachTask(task => {
        let finalColor;
        if (_colorMode === 'responsable') {
          finalColor = getResponsableColor(task.responsable);
        } else {
          if (task._es_compra) {
            const isCombined = document.getElementById('btn-view-combined')?.classList.contains('active');
            finalColor = isCombined ? '#ffffff' : (_projectsMap[task._raw?.id_proyecto]?.color || '#4f8ef7');
          } else {
            finalColor = _projectsMap[task._raw?.id_proyecto]?.color || currentProjectColor;
          }
        }
        task.color = finalColor;
        task.textColor = (finalColor === '#ffffff' || finalColor === '#fff') ? '#0f172a' : undefined;
        // USAR refreshTask para cambios puramente VISUALES (evita disparar el DataProcessor)
        gantt.refreshTask(task.id);
      });
    });
    
    gantt.render();
    
    // Extender el bloqueo para capturar cualquier disparo remanente
    setTimeout(() => { _ignoreUpdate = false; }, 1000);
  }

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
    gantt.config.xml_date     = '%Y-%m-%d %H:%i';
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
    gantt.config.drag_resize   = false; // Protegemos duración inmutable, editar solo en modal
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

    let   isMobile          = window.innerWidth < 768;
    
    /* ── Columns ──────────────────────────────────────────── */
    gantt.config.columns = [
      {
        name: 'text', label: 'Tarea', tree: true, width: '*',
        template: t => {
          const isDelayed = (t._estado === 'Atrasada' || t._estado === 'Iniciada Atrasada');
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
          let html = '';
          // Indicador de Compra
          if (t._es_compra) {
            html += `<div style="display:inline-flex; justify-content:center; align-items:center; width:22px; height:22px; background:var(--cyan, #06b6d4); color:#000; font-weight:900; font-size:12px; border-radius:4px; margin-right:4px;" title="Es una Compra">C</div>`;
          }
          // Ícono de Notas (si tiene)
          if (t.note_count > 0) {
            html += `<div class="note-col-trigger" data-id="${t.id}" style="display:inline-flex; justify-content:center; align-items:center; width:22px; height:22px; background:var(--indigo, #6366f1); color:#fff; border-radius:4px; cursor:pointer;" title="Ver Notas">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                      </svg>
                    </div>`;
          }
          return `<div style="display:flex; align-items:center; justify-content:center; height:100%;">${html}</div>`;
        }
      }
    ];

  /* ── Templates ────────────────────────────────────────── */
    gantt.templates.date_grid = d =>
      d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : '';

    gantt.templates.task_class = (s, e, t) => {
      let baseClass = t._es_compra ? 'purchase-task' : '';
      if (!t._es_compra) {
        const pct = Math.round((t.progress || 0) * 100);
        if (pct >= 100) baseClass = 'task-done';
        else if (pct > 0) baseClass = 'task-progress';
        else baseClass = 'task-pending';
      }
      if (t._auto_retrasada) baseClass += ' auto-delayed-task';
      return baseClass;
    };

    gantt.templates.task_text = (start, end, task) => {
      const respName = (window.PurchaseModule && window.PurchaseModule.getResponsableName) 
        ? window.PurchaseModule.getResponsableName(task.responsable) : task.responsable;
      const initials = (respName || '').split('@')[0].substring(0, 2).toUpperCase() || '??';
      const tc = task.textColor ? `color:${task.textColor} !important;` : '';
      
      // 1. Labels (Layer Superior)
      let labelsHtml = `<span class="task-bar-label" style="${tc}">${task.text || ''}</span>
                        <span class="task-bar-resp" title="${respName || ''}" style="${tc}">${initials}</span>`;
                  
      // Helper universal para segmentos absolutos (Píxeles)
      const drawAbsoluteSegment = (sDateStr, eDateStr, className, topOffset, height, isPoint = false) => {
        if (!sDateStr) return '';
        const sDate = gantt.date.parseDate(sDateStr, "xml_date");
        if (!sDate) return '';
        let width = isPoint ? 10 : 0;
        let left = gantt.posFromDate(sDate) - gantt.posFromDate(task.start_date);
        if (!isPoint && eDateStr) {
          const eDate = gantt.date.parseDate(eDateStr, "xml_date");
          if (eDate) {
            eDate.setDate(eDate.getDate() + 1);
            width = gantt.posFromDate(eDate) - gantt.posFromDate(sDate);
          }
        }
        if (width <= 0 && !isPoint) return '';
        if (isPoint) left -= 5; 
        return `<div class="${className}" style="position:absolute; left:${left}px; top:${topOffset}px; width:${width}px; height:${height}px;"></div>`;
      };

      // ── CASO COMPRAS: Segmentos Absolutos (Original) ───────────────
      if (task._es_compra && task._compra) {
        const c = task._compra;
        let segmentsHtml = '';
        segmentsHtml += drawAbsoluteSegment(c.f_solicitud, c.f_arribo_nec, 'purchase-segment purchase-req-arr', 0, 20);
        segmentsHtml += drawAbsoluteSegment(c.f_oc, c.f_comp, 'purchase-segment purchase-oc-comp', 0, 20);
        if (c.f_ent) {
          segmentsHtml += drawAbsoluteSegment(c.f_ent, null, 'purchase-milestone-marker purchase-delivered', 6, 8, true);
        }
        
        return `<div class="gantt_task_content">${labelsHtml}${segmentsHtml}</div>`;
      }

      // ── REVERTIDO: Vista estándar con Líneas Divisorias y Capas ──
      if (!task._es_compra) {
        // Helper para dibujo de capas absolutas (Baseline/Real)
        const drawAbsoluteSegment = (sDateStr, eDateStr, className, topOffset, height, isPoint = false) => {
          if (!sDateStr) return '';
          const sDate = gantt.date.parseDate(sDateStr, "xml_date");
          if (!sDate) return '';
          let width = isPoint ? 10 : 0;
          let left = gantt.posFromDate(sDate) - gantt.posFromDate(task.start_date);
          if (!isPoint && eDateStr) {
            const eDate = gantt.date.parseDate(eDateStr, "xml_date");
            if (eDate) {
              eDate.setDate(eDate.getDate() + 1);
              width = gantt.posFromDate(eDate) - gantt.posFromDate(sDate);
            }
          }
          if (width <= 0 && !isPoint) return '';
          if (isPoint) left -= 5; 
          return `<div class="${className}" style="position:absolute; left:${left}px; top:${topOffset}px; width:${width}px; height:${height}px;"></div>`;
        };

        // 1. Marca Baseline (Línea punteada)
        if (task._f_inicio_base) {
          const dBase = gantt.date.parseDate(task._f_inicio_base, "xml_date");
          if (dBase) {
            const leftBase = gantt.posFromDate(dBase) - gantt.posFromDate(task.start_date);
            labelsHtml += `<div class="baseline-mark-dashed" style="left:${leftBase}px;"></div>`;
            
            // 2. Alerta de Retraso (Segmento naranja) si inicio real/proyectado > baseline
            const currentStart = task.start_date;
            if (currentStart > dBase) {
              const widthDelay = gantt.posFromDate(currentStart) - gantt.posFromDate(dBase);
              labelsHtml += `<div class="delay-alert-orange" style="position:absolute; left:${leftBase}px; width:${widthDelay}px; height:20px; top:0;"></div>`;
            }
          }
        }

        // 3. Capa Baseline Original (Bloque sutil - Mantener lógica previa)
        if (task._f_inicio_base && task._f_fin_base) {
          labelsHtml += drawAbsoluteSegment(task._f_inicio_base, task._f_fin_base, 'layer-baseline', -2, 24);
        }
        // 4. Capa Real
        if (task._f_real_ini) {
          const endRealStr = task._f_real_fin || gantt.date.date_to_str("%Y-%m-%d")(new Date());
          labelsHtml += drawAbsoluteSegment(task._f_real_ini, endRealStr, 'layer-real', 18, 6);
        }

        return labelsHtml;
      }

      return labelsHtml;
    };

    gantt.templates.tooltip_text = (s, e, t) => {
      const getFormattedDate = (dStr) => {
        if (!dStr) return '-';
        const d = gantt.date.parseDate(dStr, "xml_date");
        return d ? gantt.templates.date_grid(d) : '-';
      };

      const resolveName = (id) => {
        if (!id) return '-';
        return (window.PurchaseModule && window.PurchaseModule.getResponsableName) 
          ? window.PurchaseModule.getResponsableName(id) : id;
      };

      if (t._es_compra && t._compra) {
        const c = t._compra;
        return `
        <div style="min-width:220px; padding:4px;">
          <strong style="font-size:14px; color:var(--cyan); border-bottom:1px solid #444; display:block; padding-bottom:4px; margin-bottom:8px;">🛒 ${t.text || 'Compra'}</strong>
          <div style="line-height:1.6; display:flex; flex-direction:column; gap:3px;">
            <div><span style="color:var(--text-muted); width:110px; display:inline-block">Proyecto:</span> ${t._projectName || '-'}</div>
            <div><span style="color:var(--text-muted); width:110px; display:inline-block">Solicitante:</span> ${resolveName(c.id_solicitante)}</div>
            <div style="margin:4px 0; border-top:1px dashed #333"></div>
            <div><span style="color:var(--text-muted); width:110px; display:inline-block">F. Solicitud:</span> <span style="font-size:11px">${getFormattedDate(c.f_solicitud)}</span></div>
            <div><span style="color:var(--text-muted); width:110px; display:inline-block">Arribo Nec.:</span> <span style="font-size:11px">${getFormattedDate(c.f_arribo_nec)}</span></div>
            <div><span style="color:var(--text-muted); width:110px; display:inline-block">OC Emitida:</span> <span style="font-size:11px">${getFormattedDate(c.f_oc)}</span></div>
            <div><span style="color:var(--text-muted); width:110px; display:inline-block">F. Comprometida:</span> <span style="font-size:11px">${getFormattedDate(c.f_comp)}</span></div>
            <div><span style="color:var(--text-muted); width:110px; display:inline-block">F. Entregado:</span> <span style="font-size:11px">${getFormattedDate(c.f_ent)}</span></div>
            <div style="margin:4px 0; border-top:1px dashed #333"></div>
            <div><span style="color:var(--text-muted); width:110px; display:inline-block">Estado:</span> ${estadoBadge(t)}</div>
            <div><span style="color:var(--text-muted); width:110px; display:inline-block">Valor Total:</span> <span style="color:var(--green)">$${((c.cantidad || 1) * (c.valor_unitario || 0)).toLocaleString()}</span></div>
            <div><span style="color:var(--text-muted); width:110px; display:inline-block">Responsable:</span> ${resolveName(t.responsable)}</div>
          </div>
        </div>`;
      }

      // Tooltip estándar para Tareas
      const criticalDepInfo = (() => {
        const deps = (t._dependencias || "").split(",").map(id => id.trim()).filter(Boolean);
        if (!deps.length) return '-';
        let maxEnd = null;
        let maxName = '-';
        deps.forEach(dId => {
          if (gantt.isTaskExists(dId)) {
            const pred = gantt.getTask(dId);
            const pEnd = pred.end_date;
            if (pEnd) {
              if (!maxEnd || pEnd > maxEnd) {
                maxEnd = pEnd;
                maxName = pred.text;
              }
            }
          }
        });
        return maxName;
      })();

      return `
      <div style="min-width:240px; padding:4px;">
        <strong style="font-size:14px; color:var(--indigo); border-bottom:1px solid #444; display:block; padding-bottom:4px; margin-bottom:8px;">📝 ${t.text || ''}</strong>
        <div style="line-height:1.6; display:flex; flex-direction:column; gap:3px;">
          <div><span style="color:var(--text-muted); width:125px; display:inline-block">Proyecto:</span> ${t._projectName || '-'}</div>
          <div><span style="color:var(--text-muted); width:125px; display:inline-block">Controla (Dep.):</span> <span style="color:var(--amber)">${criticalDepInfo}</span></div>
          <div style="margin:4px 0; border-top:1px dashed #333"></div>
          <div><span style="color:var(--text-muted); width:125px; display:inline-block">Inicio Baseline:</span> <span style="font-size:11px">${getFormattedDate(t._f_inicio_base)}</span></div>
          <div><span style="color:var(--text-muted); width:125px; display:inline-block">Inicio Proyectado:</span> <span style="font-size:11px">${getFormattedDate(t._f_inicio_proy)}</span></div>
          
          <div><span style="color:var(--text-muted); width:125px; display:inline-block">Duración:</span> ${t.duracion_estricta} días</div>
          <div style="margin:4px 0; border-top:1px dashed #333"></div>
          
          <div><span style="color:var(--text-muted); width:125px; display:inline-block">Iniciada Real:</span> <span style="font-size:11px">${getFormattedDate(t._f_real_ini)}</span></div>
          <div><span style="color:var(--text-muted); width:125px; display:inline-block">Fin Proyectado:</span> <span style="font-size:11px">${getFormattedDate(t._f_fin_proy)}</span></div>
          <div><span style="color:var(--text-muted); width:125px; display:inline-block">Completada Real:</span> <span style="font-size:11px">${getFormattedDate(t._f_real_fin)}</span></div>
          <div style="margin:4px 0; border-top:1px dashed #333"></div>
          <div><span style="color:var(--text-muted); width:125px; display:inline-block">Progreso:</span> <span style="color:var(--indigo); font-weight:700">${Math.round((t.progress||0)*100)}%</span></div>
          <div><span style="color:var(--text-muted); width:125px; display:inline-block">Estado:</span> ${estadoBadge(t)}</div>
          <div><span style="color:var(--text-muted); width:125px; display:inline-block">Responsable:</span> ${resolveName(t.responsable)}</div>
          <div style="margin:4px 0; border-top:1px dashed #333"></div>
          <div><span style="color:var(--text-muted); width:125px; display:inline-block">Costo Estimado:</span> <span style="color:var(--indigo)">$${(t._costo || 0).toLocaleString()}</span></div>
          <div><span style="color:var(--text-muted); width:125px; display:inline-block">Costo Real:</span> <span style="color:var(--btn-green-bg); font-weight:700">$${(t._costo_real || 0).toLocaleString()}</span></div>
        </div>
      </div>`;
    };

    /* ── Registro Único de Eventos y DataProcessor (Pattern: Run-Once) ───── */
    if (!_initialized) {
      console.log("[GanttApp] Registrando eventos y DataProcessor por única vez...");

      const _savingIds = new Map();
      const SAVE_TIMEOUT_MS = 8000;

      gantt.createDataProcessor((entity, action, data, id) => {
      // ── Semáforo anti-multi-fire ─────────────────────────────────
      const lockKey = `${entity}_${id}`;
      const now = Date.now();
      const existingTs = _savingIds.get(lockKey);
      if (existingTs && (now - existingTs) < SAVE_TIMEOUT_MS) {
        console.warn('[DataProcessor] Multi-fire bloqueado:', lockKey, action);
        return Promise.resolve({ tid: id });
      }
      _savingIds.set(lockKey, now);
      const releaseLock = () => _savingIds.delete(lockKey);

      const taskObj = (entity === 'task' && gantt.isTaskExists(id)) ? gantt.getTask(id) : data;
      console.log('[DP]', action, entity, 'id:', id);

      const isPurchase = String(id).startsWith('pur_');
      const cleanId = isPurchase ? String(id).replace('pur_', '') : String(id);
      const fmt = gantt.date.date_to_str('%Y-%m-%d');

      // Sanitizar id_proyecto
      let finalProjectId = taskObj.id_proyecto || currentProjectId;
      if (!finalProjectId || finalProjectId === '__all__') {
        finalProjectId = taskObj._raw?.id_proyecto || (Object.keys(_projectsMap)[0]);
      }
      if (finalProjectId) finalProjectId = parseInt(finalProjectId) || finalProjectId;

      // ── 1. Links (Dependencias) ───────────────────────────────────
      if (entity === 'link') {
        if (action === 'create') {
          return API.createLink(data)
            .then(r => { releaseLock(); UI.toast('Dependencia creada', 'success'); return { tid: id }; })
            .catch(e => { releaseLock(); throw e; });
        }
        if (action === 'delete') {
          return API.deleteLink(data)
            .then(() => { releaseLock(); UI.toast('Dependencia eliminada', 'warning'); return { tid: id }; })
            .catch(e => { releaseLock(); throw e; });
        }
        releaseLock();
        return;
      }

      // ── 2. Compras ─────────────────────────────────────────────
      if (isPurchase) {
        const p = taskObj._compra || {};
        const VALID_STATES = ['solicitada','solicitando presupuesto','presupuesto recibido','OC emitida','fecha comprometida','entregado'];
        let finalEstado = taskObj._estado || p.estado || 'solicitada';
        if (!VALID_STATES.includes(finalEstado)) finalEstado = 'solicitada';

        // FUENTE AUTORITATIVA: leer desde _compra cuando está disponible
        // Solo derivar del end_date como fallback
        const fSol = p.f_solicitud || fmt(taskObj.start_date);
        const fArr = p.f_arribo_nec ||
          (taskObj.end_date ? fmt(new Date(taskObj.end_date.getTime() - 86400000)) : null);

        const purchasePayload = {
          producto:              taskObj.text || taskObj.tarea || 'Compra',
          fecha_solicitud:       fSol,
          fecha_arribo_necesaria: fArr,
          id_proyecto:           finalProjectId,
          id_tarea:              p.id_tarea         || null,
          id_solicitante:        p.id_solicitante   || null,
          id_responsable:        p.id_responsable   || null,
          cantidad:              p.cantidad         || 1,
          valor_unitario:        p.valor_unitario   || 0,
          estado:                finalEstado,
          fecha_oc_emitida:      p.fecha_oc_emitida || p.f_oc   || null,
          fecha_comprometida:    p.fecha_comprometida || p.f_comp || null,
          fecha_entregado:       p.fecha_entregado  || p.f_ent  || null,
          notas:                 p.notas            || null,
          dependencias:          data.dependencias || taskObj.dependencias || p.dependencias || null
        };

        // Eliminar campos null (MySQL strict mode)
        Object.keys(purchasePayload).forEach(k => {
          if (purchasePayload[k] === null || purchasePayload[k] === undefined) delete purchasePayload[k];
        });

        if (action === 'update') {
          return API.updatePurchase(cleanId, purchasePayload)
            .then(r => {
              releaseLock();
              if (taskObj._compra) {
                Object.assign(taskObj._compra, { f_solicitud: fSol, f_arribo_nec: fArr });
              }
              UI.toast('Compra guardada ✅', 'success');
              updateSummary();
              return { tid: id };
            })
            .catch(e => { releaseLock(); console.error('[DP] updatePurchase err:', e); throw e; });
        }
        if (action === 'delete') {
          return API.deletePurchase(cleanId)
            .then(() => { releaseLock(); return {}; })
            .catch(e => { releaseLock(); throw e; });
        }
        if (action === 'create') {
          // El modal crea compras directamente via API.createPurchase()
          // Si el DP llega aquí es un disparo fantasma de DHTMLX — bloquearlo
          console.warn('[DP] Purchase create bloqueado — el modal usa API directa');
          releaseLock();
          return Promise.resolve({ tid: id });
        }

      } else {
        // ── 3. Tareas de Obra ────────────────────────────────────
        if (action === 'update') {
          const taskPayload = {
            tarea:         taskObj.text,
            // PROTECCIÓN DE BASELINE: El movimiento en Gantt impacta en la proyección
            fecha_inicio_proyectada: fmt(taskObj.start_date),
            fecha_inicio:  taskObj._f_inicio_base, // Preservar el plan original
            duration:      parseInt(taskObj.duration) || 1,
            avance:        Math.round((taskObj.progress || 0) * 100),
            id_proyecto:   finalProjectId,
            id_parent:     (taskObj.parent === 0 || taskObj.parent === "0" || taskObj.parent === "") ? null : taskObj.parent
          };
          
          // Preservar llaves personalizadas del objeto taskObj
          // pero NUNCA las que empiecen con _ (las borramos) ni las nativas de DHTMLX
          const dhtmlxKeys = new Set(['text', 'start_date', 'duration', 'progress', 'parent', 'end_date', 'id', '$no_start', '$no_end']);
          Object.keys(data).forEach(k => {
            if (!dhtmlxKeys.has(k) && !k.startsWith('$') && !k.startsWith('_') && !taskPayload.hasOwnProperty(k)) {
              taskPayload[k] = data[k];
            }
          });

          // Mapear campos _estado/_tipo_dias/_costo_real del objeto gantt a columnas reales de la DB
          if (taskObj._estado  !== undefined) taskPayload.estado    = taskObj._estado;
          if (taskObj._tipo_dias !== undefined) taskPayload.tipo_dias = taskObj._tipo_dias;
          if (taskObj._costo_real !== undefined) taskPayload.costo_real = taskObj._costo_real;

          // Guardia final: solo enviar campos que el backend acepta (espejo del UPDATE_WHITELIST)
          const BACKEND_WHITELIST = new Set([
            'id_proyecto','id_parent','id_subresp','id_resp','tarea','descripcion',
            'fecha_inicio','fecha_fin','fecha_inicio_proyectada','fecha_fin_proyectada',
            'fecha_real_iniciada','duration','fecha_completada','estado','responsable',
            'avance','dependencias','costo_tarea','costo_real','notificado','recursos','tipo_dias',
            'auto_retrasada','es_compra','compraData'
          ]);
          Object.keys(taskPayload).forEach(k => { if (!BACKEND_WHITELIST.has(k)) delete taskPayload[k]; });

          return API.updateTask(cleanId, taskPayload)
            .then(r => {
              releaseLock();
              _ignoreUpdate = true;
              applyUpdatedTasks(r.updatedTasks, id); // Pasamos 'id' como el skipId para evitar el bucle
              _ignoreUpdate = false;
              updateSummary();
              return { tid: id };
            })
            .catch(e => { releaseLock(); throw e; });
        }
        if (action === 'delete') {
          return API.deleteTask(cleanId)
            .then(() => { releaseLock(); return {}; })
            .catch(e => { releaseLock(); throw e; });
        }
        if (action === 'create') {
          const taskPayload = {
            tarea:         taskObj.text,
            fecha_inicio:  fmt(taskObj.start_date),
            fecha_inicio_proyectada: fmt(taskObj.start_date),
            duration:      taskObj.duration || 1,
            avance:        Math.round((taskObj.progress || 0) * 100),
            id_proyecto:   finalProjectId,
            id_parent:     (taskObj.parent === 0 || taskObj.parent === "0" || taskObj.parent === "") ? null : taskObj.parent
          };

          // Preservar llaves personalizadas del objeto taskObj (como estado, tipo_dias)
          // pero NUNCA las que empiecen con _ (las borramos) ni las nativas de DHTMLX
          const dhtmlxKeys = new Set(['text', 'start_date', 'duration', 'progress', 'parent', 'end_date', 'id', '$no_start', '$no_end']);
          const extraFromObj = {};
          Object.keys(taskObj).forEach(k => {
            if (!dhtmlxKeys.has(k) && !k.startsWith('$') && !k.startsWith('_') && !taskPayload.hasOwnProperty(k)) {
              extraFromObj[k] = taskObj[k];
            }
          });
          // Mapear campos _estado/_tipo_dias del objeto gantt a columnas reales de la DB
          if (taskObj._estado  !== undefined) extraFromObj.estado    = taskObj._estado;
          if (taskObj._tipo_dias !== undefined) extraFromObj.tipo_dias = taskObj._tipo_dias;
          if (taskObj._costo_real !== undefined) extraFromObj.costo_real = taskObj._costo_real;

          Object.assign(taskPayload, extraFromObj);

          // Guardia final: solo enviar campos que el backend acepta (espejo del UPDATE_WHITELIST)
          const BACKEND_WHITELIST = new Set([
            'id_proyecto','id_parent','id_subresp','id_resp','tarea','descripcion',
            'fecha_inicio','fecha_fin','fecha_inicio_proyectada','fecha_fin_proyectada',
            'fecha_real_iniciada','duration','fecha_completada','estado','responsable',
            'avance','dependencias','costo_tarea','costo_real','notificado','recursos','tipo_dias',
            'auto_retrasada','es_compra','compraData'
          ]);
          Object.keys(taskPayload).forEach(k => { if (!BACKEND_WHITELIST.has(k)) delete taskPayload[k]; });

          return API.createTask(taskPayload)
            .then(r => {
              releaseLock();
              UI.toast('Tarea creada', 'success');
              return { tid: r.task.id_tarea || r.task.id };
            })
            .catch(e => { releaseLock(); UI.toast('Error al crear tarea: ' + (e.message || ''), 'error'); throw e; });
        }
      }

      releaseLock(); // Fallback
    });

    // UX Inteligente: Invertir Link automáticamente si arrastran Tarea -> Compra
    gantt.attachEvent("onBeforeLinkAdd", (id, link) => {
      if (String(link.target).startsWith('pur_')) {
        // En Gantt, el Target es el que "espera" (Successor). Una Compra no espera a una tarea.
        // Si el usuario intentó Target = Compra, asumimos que quería hacerlo al revés.
        setTimeout(() => {
          gantt.addLink({
            source: link.target,
            target: link.source,
            type: gantt.config.links.finish_to_start
          });
        }, 10);
        if (window.UI && window.UI.toast) {
          window.UI.toast('🪄 Enlace invertido auto: La tarea ahora depende de la compra.', 'info');
        }
        return false; // Bloquear link original
      }
      return true;
    });

    // Identidad proactiva para nuevas tareas (Creación)
    gantt.attachEvent("onTaskCreated", (item) => {
      const isPurchasesView = document.getElementById('btn-view-purchases')?.classList.contains('active');
      if (isPurchasesView) {
        item.es_compra  = 1;
        item._es_compra = 1;
        // Si ya tiene _estado o _compra (viene de gantt.addTask con datos) los respetamos
        item._estado = item._estado || 'solicitada';
        item.text    = item.text   || 'Nueva Compra';
        item.parent  = 0;
        item.color   = 'transparent';
        // MERGE: preservar datos que vengan de newTask._compra (f_arribo_nec, id_solicitante, etc.)
        item._compra = { cantidad: 1, valor_unitario: 0, ...(item._compra || {}) };
      }
      return true;
    });

    // Disable default lightbox → usamos modal propio o modal de compras si es compra
    gantt.showLightbox = id => {
      const task = gantt.isTaskExists(id) ? gantt.getTask(id) : null;
      if (!task) return;
      
      const isPurchase = String(id).startsWith('pur_') || task._es_compra == 1 || task.es_compra == 1;

      if (isPurchase) {
        // Enrutamiento a Modal de Compras
        const purId = String(id).startsWith('pur_') ? parseInt(String(id).replace('pur_', '')) : task._compra?.id_compra;
        
        if (task.$new) {
           // Si es una compra nueva recién "pinchada" en el gantt, la borramos y abrimos el modal vacío
           _ignoreUpdate = true;
           gantt.deleteTask(id);
           _ignoreUpdate = false;
           if (window.UI) UI.openNewPurchaseModal();
        } else if (purId && window.PurchaseModule) {
           window.PurchaseModule.openPurchaseModal(purId);
        } else if (task._es_compra == 1 && task.id_tarea) {
           // Es una tarea-compra (id numérico), abrimos modal de compras con su id_compra si está disponible
           if (window.PurchaseModule && task._compra?.id_compra) {
              window.PurchaseModule.openPurchaseModal(task._compra.id_compra);
           } else {
              // Fallback: si no tenemos ID de compra, tratamos de cargarla o abrimos modal de tarea
              if (window.UI) UI.openTaskModal(task);
           }
        }
      } else {
        // Tarea de obra normal
        if (window.UI) UI.openTaskModal(task);
      }
    };

    /* ── Events ───────────────────────────────────────────── */
    /* ── Events (Manejo de UI local) ─────────────────────── */
    gantt.attachEvent('onAfterTaskDrag', () => {
       // El DataProcessor se encarga de la persistencia
       // Solo forzamos render de markers si cambiaron fechas críticas
       updateSummary();
    });

    gantt.attachEvent('onAfterProgressDrag', () => updateSummary());

    // --- REORDENAMIENTO AUTOMÁTICO POR INTERACCIONES (Hardened) ---
    const triggerReorder = (origin) => {
      if (window._isSorting) return;
      console.log(`[GanttApp] Trigger reorder from: ${origin}`);
      setTimeout(() => {
        window._isSorting = true;
        gantt.batchUpdate(() => {
          gantt.sort("start_date", false);
        });
        gantt.render();
        window._isSorting = false;
      }, 50);
    };

    gantt.attachEvent('onAfterTaskUpdate', (id, item) => {
      // 1. Propagación de Fechas de Compras (Herencia)
      if (item._es_compra) {
        console.log(`[GanttApp] Propagando fechas de compra ${id} a dependientes...`);
        propagatePurchaseProjections(id);
      }
      
      // 2. Reordenamiento automático
      triggerReorder(`Update[${id}]`);
    });
    gantt.attachEvent('onAfterLinkAdd',    () => triggerReorder('LinkAdd'));
    gantt.attachEvent('onAfterLinkDelete', () => triggerReorder('LinkDelete'));
    gantt.attachEvent('onAfterTaskDelete', () => triggerReorder('TaskDelete'));

    gantt.attachEvent('onBeforeTaskDelete', id => {
      // Global Bypass: si está activado, autorizamos sin preguntas (usado por deleteTaskDirect)
      if (window.__ganttBypassConfirm) return true;

      // Usamos el Set persistente definido al inicio del módulo
      if (_directDeleteIds.has(String(id))) {
        _directDeleteIds.delete(String(id));
        return true; 
      }
      // Botón delete del Gantt nativo → pedir confirmación via UI
      if (window.UI && window.UI.deleteTask) {
        window.UI.deleteTask(id);
      }
      return false;
    });

    _initialized = true;
    } // Fin del bloque Run-Once
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function estadoBadge(t) {
    let estado = t._estado || 'No comenzada';

    if (t._es_compra && t._compra) {
      // Para compras, el estado puede venir como 'entregado', 'solicitada', etc.
      // Mantenemos el badge visual descriptivo
      if (t._estado === 'entregado') return `<span class="badge badge-finalizada">Entregado</span>`;
      if (t._estado === 'retrasada' || t._estado === 'Retrasada') return `<span class="badge badge-retrasada">Retrasada</span>`;
      return `<span class="badge badge-en-progreso">${t._estado}</span>`;
    }

    const map = {
      'No comenzada':      'badge-no-comenzada',
      'En progreso':       'badge-en-progreso',
      'Finalizada':        'badge-finalizada',
      'Atrasada':          'badge-retrasada',
      'Iniciada Atrasada': 'badge-iniciada-atrasada',
      'Bloqueada':         'badge-bloqueada'
    };
    
    const cls = map[estado] || 'badge-no-comenzada';
    return `<span class="badge ${cls}">${estado}</span>`;
  }

  function parseSafeDate(val) {
    if (val instanceof Date) return val;
    if (!val) return null;
    const str = String(val);
    // Si es formato YYYY-MM-DD (10 caracteres exactos), forzamos hora local a medianoche
    if (str.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return new Date(str + 'T00:00:00');
    }
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  function dbTaskToGantt(t, color) {
    let finalColor = color || '#6366f1';
    if (typeof _colorMode !== 'undefined' && _colorMode === 'responsable') {
      finalColor = getResponsableColor(t.responsable);
    }
    
    // El Gantt visual principal se basa en la fecha proyectada (si existe) 
    // o en la fecha de inicio baseline. Preferimos lo que ya venga mapeado.
    // ── ARQUITECTURA: Mapeo Estándar (Sin Bounding Box) ──
    const startStr = t.fecha_real_iniciada || t.fecha_inicio_proyectada || t.fecha_inicio;
    const endStr   = t.fecha_completada || t.fecha_fin_proyectada;

    // Para evitar recortes en la caja nativa si la fecha de fin es igual al inicio (duration 1)
    // DHTMLX necesita que end_date sea el día siguiente (+1)
    let safeEndDate = parseSafeDate(endStr);
    if (safeEndDate) safeEndDate.setDate(safeEndDate.getDate() + 1);

    const projInfo = _projectsMap[t.id_proyecto] || {};
    const isPurchase = t.es_compra === 1;
    
    // Si es compra, usamos la lógica visual de burbujas (color transparente y objeto _compra)
    const gColor = isPurchase ? 'transparent' : (t.es_compra ? 'rgba(34, 211, 238, 0.1)' : finalColor);
    const gTextColor = isPurchase ? '#ffffff' : (t.es_compra ? 'var(--cyan)' : (finalColor === '#ffffff' ? '#0f172a' : undefined));

    return {
      id:           t.id || t.id_tarea,
      id_proyecto:  t.id_proyecto,
      parent:       t.id_parent || t.parent || 0,
      text:         t.descripcion || t.tarea || "Tarea",
      start_date:   parseSafeDate(startStr) || new Date(),
      end_date:     safeEndDate || undefined,
      duration:     parseInt(t.duration) || 1, // FUERZA LA DURACIÓN DE DB PARA EL POPUP
      duracion_estricta: parseInt(t.duration) || 1, // ALIAS PROTEGIDO
      progress:     t.progress !== undefined ? parseFloat(t.progress) : (parseFloat(t.avance || 0) / 100),
      color:        gColor,
      textColor:    gTextColor,
      _tarea_cod:   t.tarea,
      _estado:      t.estado,
      _tipo_dias:   t.tipo_dias,
      _dependencias: t.dependencias || '',
      _costo:       parseFloat(t.costo_tarea) || 0,
      responsable:  (t.id_parent && t.subresponsable_nombre) ? t.subresponsable_nombre : (t.responsable || ''),
      note_count:   t.note_count || 0,
      _projectName: projInfo.nombre || '',
      _projectCode: projInfo.codigo || '',
      _es_compra:   isPurchase ? 1 : (t.es_compra || 0),
      // Fechas para Multi-Capa
      _f_inicio_base: t.fecha_inicio,
      _f_fin_base:    t.fecha_fin,
      _f_inicio_proy: t.fecha_inicio_proyectada,
      _f_fin_proy:    t.fecha_fin_proyectada,
      _f_real_ini:    t.fecha_real_iniciada,
      _f_real_fin:    t.fecha_completada,
      _costo:         parseFloat(t.costo_tarea) || 0,
      _costo_real:    parseFloat(t.costo_real) || 0,
      _auto_retrasada: t.auto_retrasada || 0,
      // Datos extra de compra
      _compra: isPurchase ? {
        id_compra: t.id_compra || (t._compra ? t._compra.id_compra : null),
        cantidad: t.cantidad,
        valor_unitario: t.valor_unitario,
        f_solicitud: t.fecha_solicitud,
        f_arribo_nec: t.fecha_arribo_necesaria,
        f_oc: t.fecha_oc_emitida,
        f_comp: t.fecha_comprometida,
        f_ent: t.fecha_entregado
      } : null,
      _raw: t
    };
}

  function buildLinks(tasks) {
    const links = [];
    const seen  = new Set();
    tasks.forEach(t => {
      // Usar t.id si existe (mapeado), si no t.id_tarea (crudo)
      const targetId = t.id || t.id_tarea;
      if (!t.dependencias || !targetId) return;

      t.dependencias.split(',').map(d => d.trim()).filter(Boolean).forEach(src => {
        const srcId = String(src).startsWith('pur_') ? src : parseInt(src);
        const key = `${srcId}_${targetId}`;
        if (!seen.has(key)) {
          seen.add(key);
          links.push({ id: key, source: srcId, target: targetId, type: '0' });
        }
      });
    });
    return links;
  }

  function applyUpdatedTasks(updatedTasks, skipId = null) {
    if (!updatedTasks || updatedTasks.length === 0) return;
    _ignoreUpdate = true;
    
    // Usar batchUpdate para atomicidad y evitar múltiples renders
    gantt.batchUpdate(() => {
      updatedTasks.forEach(t => {
        // Robusted de detección de ID: SOPORTA TANTO OBJETOS RAW COMO MAPEO DHTMLX
        let targetId = t.id_tarea || t.id;
        if (!targetId) return;

        if (!gantt.isTaskExists(targetId) && gantt.isTaskExists(`pur_${targetId}`)) {
          targetId = `pur_${targetId}`;
        }
  
        if (!gantt.isTaskExists(targetId)) return;
        const gt = gantt.getTask(targetId);
        
        // ── ACTUALIZACIÓN AUTORITATIVA ──
        // Pisamos las fechas del cliente con lo que calculó el backend
        // Soportamos campos raw (fecha_inicio_proyectada) y campos mapeados (start_date) del server
        const startStr = t.fecha_real_iniciada || t.fecha_inicio_proyectada || t.fecha_inicio || t.start_date;
        const endStr   = t.fecha_completada || t.fecha_fin_proyectada || t.fecha_fin || t.end_date;

        gt.start_date = parseSafeDate(startStr);
        if (endStr) {
          const safeEndDate = parseSafeDate(endStr);
          // Si el endStr viene de DHTMLX ya es inclusivo, pero si viene de DB (YYYY-MM-DD) necesita el +1
          // parseSafeDate maneja strings ISO y los convierte a objetos Date locales
          if (typeof endStr === 'string' && endStr.length <= 10) {
             safeEndDate.setDate(safeEndDate.getDate() + 1);
          }
          gt.end_date = safeEndDate;
        }
        
        // Sincronizar duración interna de DHTMLX para evitar desvíos visuales
        const newDur = parseInt(t.duration) || 1;
        gt.duration = newDur;
        gt.duracion_estricta = newDur;
  
        gt.progress     = parseFloat(t.avance || (t.progress != null ? t.progress * 100 : 0) || 0) / 100;
        gt._estado      = t.estado || t._estado;
        gt._tipo_dias   = t.tipo_dias || t._tipo_dias;
        gt._dependencias = t.dependencias || t._dependencias || '';
        gt._es_compra   = t.es_compra || t._es_compra || 0;
        
        // Actualizar meta-fechas para capas, modal y tooltips
        gt._f_inicio_base = t.fecha_inicio || t._f_inicio_base;
        gt._f_fin_base    = t.fecha_fin || t._f_fin_base;
        gt._f_inicio_proy = t.fecha_inicio_proyectada || t._f_inicio_proy;
        gt._f_fin_proy    = t.fecha_fin_proyectada || t._f_fin_proy;
        gt._f_real_ini    = t.fecha_real_iniciada || t._f_real_ini;
        gt._f_real_fin    = t.fecha_completada || t._f_real_fin;
        gt._auto_retrasada = t.auto_retrasada || t._auto_retrasada || 0;
        
        // Si es una compra, actualizar también el objeto interno _compra
        if (gt._es_compra && t.compraData) {
          gt._compra = {
            ...gt._compra,
            ...t.compraData,
            f_solicitud: t.fecha_solicitud || t.compraData.fecha_solicitud,
            f_arribo_nec: t.fecha_arribo_necesaria || t.compraData.fecha_arribo_necesaria
          };
        }
  
        gt._raw = t;
  
        // ── REFRESH VISUAL SIN LOOP ──
        // Importante: Usamos refreshTask y NO updateTask.
        // refreshTask redibuja la barra y actualiza tooltips sin disparar el DataProcessor.
        gantt.refreshTask(targetId);
      });
    });

    _ignoreUpdate = false;
    updateSummary();
  }

  /* ── purchase to gantt (va tabla purchases) ────────────────── */
  function dbPurchaseToGantt(p, overrideColor, projectName = '') {
    const startStr = p.fecha_solicitud || p.fecha_creacion?.split('T')[0] || new Date().toISOString().split('T')[0];
    
    // Capturamos explícitamente la fecha de arribo necesaria y otros hitos
    const fNec = p.fecha_arribo_necesaria ? p.fecha_arribo_necesaria.split('T')[0] : null;
    const fOc = p.fecha_oc_emitida ? p.fecha_oc_emitida.split('T')[0] : null;
    const fComp = p.fecha_comprometida ? p.fecha_comprometida.split('T')[0] : null;
    const fEnt = p.fecha_entregado ? p.fecha_entregado.split('T')[0] : null;

    const endDates = [fNec, fOc, fComp, fEnt].filter(Boolean);
    let endStr = startStr; 
    if (endDates.length > 0) {
      const maxDate = new Date(Math.max(...endDates.map(d => new Date(d + 'T00:00:00Z'))));
      maxDate.setUTCDate(maxDate.getUTCDate() + 1); // Exclusivo DHTMLX
      endStr = maxDate.toISOString().split('T')[0];
    }

    return {
      id: `pur_${p.id_compra}`, // Identificador único con prefijo
      parent: 0, // Siempre a la raíz en visualización
      text: p.producto,
      start_date: parseSafeDate(startStr) || new Date(),
      end_date: parseSafeDate(endStr) || new Date(),
      color: 'transparent', // Fundamental para ver los segmentos internos
      textColor: '#ffffff',
      _estado: p.estado,
      _es_compra: 1, // Flag para template task_text
      _compra: {
        id_compra: p.id_compra,
        f_solicitud: p.fecha_solicitud,
        f_arribo_nec: fNec, // Campo crítico para persistencia
        f_oc: fOc,
        f_comp: fComp,
        f_ent: fEnt,
        id_solicitante: p.id_solicitante,
        cantidad: p.cantidad,
        valor_unitario: p.valor_unitario,
        id_responsable: p.id_responsable // Añadir ID para trazabilidad
      },
      responsable: p.responsable_nombre || '', 
      _projectName: projectName || p.proyecto_nombre || '',
      _dependencias: p.dependencias || '',
      type: 'task'
    };
  }
  /* ── Herencia de Proyecciones de Compras ────────────────────── */
  function getPurchaseRefDate(purchase) {
    if (!purchase || !purchase._compra) return null;
    const c = purchase._compra;
    // Jerarquía: Entregado > Comprometido > Necesario
    const refStr = c.f_ent || c.f_comp || c.f_arribo_nec;
    if (!refStr) return null;
    return parseSafeDate(refStr);
  }

  function propagatePurchaseProjections(purchaseId) {
    const purchase = gantt.getTask(purchaseId);
    if (!purchase) return;
    const refDate = getPurchaseRefDate(purchase);
    if (!refDate) return;

    // Calcular nueva fecha proyectada (+1 día lead time)
    const newProjStart = new Date(refDate);
    newProjStart.setDate(newProjStart.getDate() + 1);

    _ignoreUpdate = true; // Evitar disparos recursivos del DataProcessor
    gantt.eachTask(task => {
      if (task.id === purchaseId) return;
      if (task._dependencias) {
        const deps = task._dependencias.split(',').map(d => d.trim());
        if (deps.includes(String(purchaseId))) {
          // 1. Actualizar campo meta
          task._f_inicio_proy = gantt.date.date_to_str('%Y-%m-%d')(newProjStart);
          
          // 2. Mover la barra visual si es necesario
          // Solo movemos si la nueva proyección es posterior a la actual
          // (permitimos que el usuario la mueva más tarde, pero no antes de que llegue el material)
          if (task.start_date < newProjStart) {
            task.start_date = new Date(newProjStart);
            gantt.updateTask(task.id);
          }
        }
      }
    });
    _ignoreUpdate = false;
    gantt.render();
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
        if (!tasks || tasks.length === 0) return null;

        let totT = 0, doneT = 0, progT = 0, pendT = 0;
        let totS = 0, doneS = 0, progS = 0, pendS = 0;
        let totalCosto = 0, totalCostoReal = 0, aplicado = 0;
        let minDate = null, maxDate = null;
        let compraAtrasoProc = 0, compraAtrasoEnt = 0;

        // Status Bar & EVM Variables
        let totalProgress = 0, delayed = 0, blocked = 0;
        const upcomingMilestones = [];
        let totalPlannedWeighted = 0;
        let totalRealWeighted = 0;
        let maxBaseDateMs = 0;
        let maxProyDateMs = 0;

        const today = new Date();
        today.setHours(0,0,0,0);

        tasks.forEach(t => {
          const p = Math.round((t.progress || 0) * 100);
          const isSub = t.parent && String(t.parent) !== "0" && gantt.isTaskExists(t.parent);
          const isCompra = t._es_compra;
          const isDone = (p >= 100 || t._estado === 'Finalizada' || t._estado === 'entregado');
          const isProg = (p > 0 || t._estado === 'En progreso');

          // Progress & Task Counts
          totalProgress += p;
          if (isSub) {
            totS++;
            if (isDone) doneS++;
            else if (isProg) progS++;
            else pendS++;
          } else {
            totT++;
            if (isDone) doneT++;
            else if (isProg) progT++;
            else pendT++;
          }

          // Costos
          const costo = parseFloat(t._raw?.costo_tarea || t._costo || t._compra?.valor_unitario || 0);
          const costoReal = parseFloat(t._costo_real || 0);
          totalCosto += costo;
          totalCostoReal += costoReal;
          if (isDone) aplicado += costo;

          const tStart = t.start_date ? new Date(t.start_date) : null;
          if (tStart) tStart.setHours(0,0,0,0);

          // Fechas del proyecto y EVM (Solo tareas de obra)
          if (!isCompra) {
            if (tStart) { if (!minDate || tStart < minDate) minDate = tStart; }
            if (t.end_date) {
              const ed = new Date(t.end_date);
              if (!maxDate || ed > maxDate) maxDate = ed;
            }

            // Lógica EVM
            let bStart = t._f_inicio_base ? new Date(t._f_inicio_base + 'T00:00:00').getTime() : 0;
            let bEnd   = t._f_fin_base    ? new Date(t._f_fin_base + 'T00:00:00').getTime() : 0;
            let pEnd   = t._f_fin_proy    ? new Date(t._f_fin_proy + 'T00:00:00').getTime() : 0;

            if (bEnd > maxBaseDateMs) maxBaseDateMs = bEnd;
            if (pEnd > maxProyDateMs) maxProyDateMs = pEnd;

            if (bStart && bEnd && bEnd > bStart) {
              let durationMs = bEnd - bStart;
              let todayMs = today.getTime();
              let plannedPct = todayMs >= bEnd ? 1 : (todayMs > bStart ? (todayMs - bStart) / durationMs : 0);
              totalPlannedWeighted += (plannedPct * durationMs);
              totalRealWeighted += ((t.progress || 0) * durationMs);
            }

            // Próximos Hitos
            if (tStart) {
              const daysUntil = Math.ceil((tStart - today) / 86400000);
              if (daysUntil > 0 && daysUntil <= 60 && p === 0) {
                upcomingMilestones.push({ name: t.text, date: tStart });
              }
            }
          }

          // Lógica de Estado / Alertas
          if (!isDone) {
            // Riesgos (Atrasos)
            if (isCompra && t._compra) {
              const fNec = t._compra.f_arribo_nec ? new Date(t._compra.f_arribo_nec + 'T00:00:00') : null;
              if (fNec && fNec < today && !t._compra.f_ent) delayed++;
              
              const c = t._compra;
              const fComp = c.f_comp ? new Date(c.f_comp + 'T00:00:00') : null;
              const hasOC = !!c.f_oc;
              if (!hasOC && fNec && fNec < today) compraAtrasoProc++;
              else if (hasOC && fComp && fComp < today) compraAtrasoEnt++;
            } else {
              if (tStart && tStart < today && p === 0) delayed++;
            }

            // Bloqueos
            if (t.$target && t.$target.length > 0) {
               let isBlocked = false;
               for (let linkId of t.$target) {
                 if (window.gantt && gantt.isLinkExists && gantt.isLinkExists(linkId)) {
                   const link = gantt.getLink(linkId);
                   if (gantt.isTaskExists(link.source)) {
                     const pred = gantt.getTask(link.source);
                     const predP = Math.round((pred.progress || 0) * 100);
                     if (predP < 100 && pred._estado !== 'Finalizada' && pred._estado !== 'entregado') {
                       isBlocked = true;
                       break;
                     }
                   }
                 }
               }
               if (isBlocked) blocked++;
            }
          }
        });

        // Helpers DOM
        const setDom = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        const getPct = (part, total) => total > 0 ? Math.round((part / total) * 100) + '%' : '0%';
        const fmtCur = n => '$' + n.toLocaleString('es-AR', {maximumFractionDigits:0});
        const fmtDateShort = d => {
          if (!d) return '--';
          const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
          return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
        };

        // 1. Panel Superior (KPIs)
        // Totales de tareas (Denominador compartido por las 3 tarjetas de tareas)
        setDom('stat-total-t-done', totT);
        setDom('stat-total-t-prog', totT);
        setDom('stat-total-t-pend', totT);

        // Totales de subtareas (Denominador compartido)
        setDom('stat-sub-total-done', totS);
        setDom('stat-sub-total-prog', totS);
        setDom('stat-sub-total-pend', totS);

        // Valores de tareas
        setDom('stat-done', doneT);
        setDom('stat-done-pct', getPct(doneT, totT));
        setDom('stat-progress', progT);
        setDom('stat-progress-pct', getPct(progT, totT));
        setDom('stat-pending', pendT);
        setDom('stat-pending-pct', getPct(pendT, totT));

        // Valores de subtareas
        setDom('stat-sub-done', doneS);
        setDom('stat-sub-done-pct', getPct(doneS, totS));
        setDom('stat-sub-prog', progS);
        setDom('stat-sub-progress-pct', getPct(progS, totS));
        setDom('stat-sub-pend', pendS);
        setDom('stat-sub-pending-pct', getPct(pendS, totS));

        setDom('stat-costo-total', fmtCur(totalCosto));
        setDom('stat-costo-real',  fmtCur(totalCostoReal));
        setDom('stat-total-aplicado', fmtCur(aplicado));
        setDom('stat-aplicado-pct', getPct(aplicado, totalCosto));



        setDom('stat-fecha-inicio', fmtDateShort(minDate));
        if (maxDate) {
          const adjustedEnd = new Date(maxDate);
          adjustedEnd.setDate(adjustedEnd.getDate() - 1);
          setDom('stat-fecha-fin', fmtDateShort(adjustedEnd));
        }

        // Render Alertas Compras
        const kpiProc = document.getElementById('kpi-compra-atraso');
        const kpiEnt = document.getElementById('kpi-entrega-atraso');
        if (tasks.some(t => t._es_compra)) {
          if (kpiProc) kpiProc.style.display = 'flex'; 
          if (kpiEnt) kpiEnt.style.display = 'flex';
          setDom('stat-compra-atraso-proc', compraAtrasoProc);
          setDom('stat-compra-atraso-ent', compraAtrasoEnt);
        } else {
          if (kpiProc) kpiProc.style.display = 'none';
          if (kpiEnt) kpiEnt.style.display = 'none';
        }

        // 2. Barra Inferior (Status Bar)
        const totalCount = totT + totS;
        const avgProgress = totalCount > 0 ? Math.round(totalProgress / totalCount) : 0;
        setDom('status-risk-count', delayed);
        setDom('status-blocked-count', blocked);
        setDom('status-avance', avgProgress + '%');
        const avanceBar = document.getElementById('status-avance-bar');
        if (avanceBar) avanceBar.style.width = avgProgress + '%';

        const mList = document.getElementById('status-milestones');
        if (mList) {
          upcomingMilestones.sort((a,b) => a.date - b.date);
          const top = upcomingMilestones.slice(0, 3);
          if (top.length === 0) mList.innerHTML = '<div class="status-milestone-empty">Sin hitos próximos</div>';
          else {
             const months = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
             mList.innerHTML = top.map(m => `
               <div class="status-milestone-item">
                 <div class="status-milestone-date">
                   <span class="m-day">${m.date.getDate()}</span>
                   <span>${months[m.date.getMonth()]}</span>
                 </div>
                 <span class="status-milestone-name">${m.name}</span>
               </div>`).join('');
          }
        }

        return { minDate, maxDate };
      } catch(e) {
        console.error("Error en updateSummary:", e);
        return null;
      }
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

    // Markers
    addMarkers();

      // Toolbar: zoom
    document.getElementById('btn-zoom-day').addEventListener('click',   () => applyScale('day'));
    document.getElementById('btn-zoom-week').addEventListener('click',  () => applyScale('week'));
    document.getElementById('btn-zoom-month').addEventListener('click', () => applyScale('month'));
    document.getElementById('btn-today').addEventListener('click', () => gantt.showDate(new Date()));
  }

  /* ── Markers helper ───── */
  function addMarkers(startDate = null, endDate = null) {
    // 1. Limpiar marcadores previos para evitar acumulación (la causa de la línea blanca "gruesa")
    if (_activeMarkers && _activeMarkers.length > 0) {
      _activeMarkers.forEach(id => {
        if (gantt.getMarker && gantt.getMarker(id)) gantt.deleteMarker(id);
      });
      _activeMarkers = [];
    }

    const today = new Date();
    const mToday = gantt.addMarker({
      start_date: today,
      css: 'today-marker',
      text: 'Hoy',
      title: 'Hoy: ' + today.toLocaleDateString('es')
    });
    _activeMarkers.push(mToday);

    if (startDate) {
      const mStart = gantt.addMarker({
        start_date: startDate,
        css: 'project-start-marker',
        text: 'INICIO',
        title: 'Inicia: ' + startDate.toLocaleDateString('es')
      });
      _activeMarkers.push(mStart);
    }

    if (endDate) {
      const d = new Date(endDate);
      d.setDate(d.getDate() - 1);
      const mEnd = gantt.addMarker({
        start_date: d,
        css: 'project-end-marker',
        text: 'FIN',
        title: 'Finaliza: ' + d.toLocaleDateString('es')
      });
      _activeMarkers.push(mEnd);
    }
  }

  function centerToday() {
    const today     = new Date();
    const x         = gantt.posFromDate(today);
    const container = document.getElementById('gantt_here');
    if (!container) return;
    const containerWidth = container.offsetWidth;
    const gridWidth      = gantt.config.grid_width || 0;
    const viewWidth      = containerWidth - gridWidth;
    const scrollX        = Math.max(0, x - (viewWidth / 2));
    
    gantt.scrollTo(scrollX, null);
    container.style.opacity = '1';
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
    const container = document.getElementById('gantt_here');
    if (container) container.style.opacity = '0';

    return Promise.all([
      API.getProjectTasks(projectId),
      API.getPurchases()
    ]).then(([tasks, allPurchases]) => {
      // 1. Mapear tareas de obra
      const gtasks = tasks.map(t => dbTaskToGantt(t, currentProjectColor));
      
      // 2. Inyectar compras al nivel de las tareas para que se mezclen
      const projectPurchases = allPurchases.filter(p => p.id_proyecto == projectId && !p.id_tarea);
      if (projectPurchases.length > 0) {
        projectPurchases.forEach(p => {
          const gp = dbPurchaseToGantt(p, '#ffffff', _projectsMap[projectId]?.nombre || '');
          // Ya no asignamos gp.parent, de modo que caen en la raíz del proyecto
          gtasks.push(gp);
        });
      }

      const allDataForLinks = [...tasks, ...projectPurchases.map(p => ({ 
        id_tarea: `pur_${p.id_compra}`, 
        dependencias: p.dependencias 
      }))];
      const links  = buildLinks(allDataForLinks);
      gantt.clearAll();
      gantt.parse({ data: gtasks, links });
      
      // Ordenamiento cronológico para mezclar obras y compras de forma natural
      gantt.sort("start_date", false);

      // 3. PASO EXTRA: Propagar proyecciones de compras cargadas
      gtasks.forEach(t => {
        if (t._es_compra) propagatePurchaseProjections(t.id);
      });

      addMarkers();
      
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
      
      // Update markers with dates
      const summary = updateSummary();
      if (summary) addMarkers(summary.minDate, summary.maxDate);

      setTimeout(() => {
        centerToday();
      }, 150);
      return tasks;
    });
  }

  async function loadAllProjects() {
    currentProjectId    = '__all__';
    _allProjectsMode    = true;

    const container = document.getElementById('gantt_here');
    if (container) container.style.opacity = '0';

    const [allTasks, allPurchases] = await Promise.all([
      API.getTasks(),
      API.getPurchases()
    ]);
    
    // 1. Mapear tareas de obra
    const allGtasks = allTasks.map(t => {
      const projInfo = _projectsMap[t.id_proyecto];
      return dbTaskToGantt(t, projInfo ? projInfo.color : '#6366f1');
    });

    // 2. Inyectar compras globales al nivel raíz para que se mezclen
    const standalonePurchases = allPurchases.filter(p => !p.id_tarea);
    if (standalonePurchases.length > 0) {
      standalonePurchases.forEach(p => {
        const gp = dbPurchaseToGantt(p, '#ffffff', _projectsMap[p.id_proyecto]?.nombre || '');
        // Ya no agrupamos
        allGtasks.push(gp);
      });
    }

    const allDataForLinks = [...allTasks, ...standalonePurchases.map(p => ({ 
      id_tarea: `pur_${p.id_compra}`, 
      dependencias: p.dependencias 
    }))];
    const links = buildLinks(allDataForLinks);
    gantt.clearAll();
    gantt.parse({ data: allGtasks, links });
    
    // Ordenamiento cronológico global
    console.log("[GanttApp] Aplicando ordenamiento cronológico inicial...");
    gantt.sort("start_date", false);

    // 3. PASO EXTRA: Propagar proyecciones de compras globales cargadas
    allGtasks.forEach(t => {
      if (t._es_compra) propagatePurchaseProjections(t.id);
    });
    
    // Summary also gives us dates
    const summary = updateSummary();
    addMarkers(summary?.minDate, summary?.maxDate);

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
    setTimeout(() => {
        centerToday();
    }, 150);
    updateSummary();
    return allTasks;
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

  /* ── Purchases Gantt View ────────────────────────────────── */
  function loadPurchasesView(purchases, allTasks) {
    const container = document.getElementById('gantt_here');
    if (container) container.style.opacity = '0';
    configure(); 

    gantt.clearAll();
    const items = purchases.map(p => {
      let pName = '';
      if (p.id_proyecto && _projectsMap[p.id_proyecto]) {
        pName = _projectsMap[p.id_proyecto].nombre;
      } else if (p.id_tarea && allTasks) {
        const t = allTasks.find(x => x.id_tarea == p.id_tarea);
        if (t && _projectsMap[t.id_proyecto]) {
          pName = _projectsMap[t.id_proyecto].nombre;
        }
      }
      return dbPurchaseToGantt(p, '#ffffff', pName);
    });

    // CRÍTICO: links vacíos en vista de compras para evitar crashes por tareas no cargadas
    gantt.parse({ data: items, links: [] }); 
    
    addMarkers();
    gantt.sort("start_date", false);
    gantt.render();
    setTimeout(() => centerToday(), 150);
    updateSummary();
  }

  function centerAndShow(container) {
    const today = new Date();
    const state = gantt.getState();
    if (state.min_date && state.max_date) {
      const es = new Date(Math.min(state.min_date.getTime(), today.getTime()));
      es.setMonth(es.getMonth() - 1);
      const ee = new Date(Math.max(state.max_date.getTime(), today.getTime()));
      ee.setMonth(ee.getMonth() + 3);
      gantt.config.start_date = es; 
      gantt.config.end_date   = ee;
    }

    gantt.render();
    if (typeof gantt.renderMarkers === 'function') gantt.renderMarkers();
    
    setTimeout(() => {
      if (container) container.style.opacity = '1';
      centerToday();
    }, 150);
  }

  function restoreTasksView() {
    configure();
    if (_allProjectsMode) {
      loadAllProjects();
    } else if (currentProjectId && currentProjectId !== '__all__') {
      loadProject(currentProjectId, currentProjectColor);
    }
  }

  return { 
    init, loadProject, loadAllProjects, setProjectsMap, addTask, refreshTask, applyAllUpdated, removeTask,
    getCurrentProjectId, isAllProjects, updateSummary,
    dbPurchaseToGantt, loadPurchasesView, restoreTasksView,
    getColorMode, setColorMode, toggleColorMode,
    getAllTasks: () => gantt.getTaskByTime(),
    // Elimina una tarea sin pasar por confirm dialog (ya fue confirmado en el modal)
    deleteTaskDirect: (id) => {
      console.log("[GanttApp] Deleting task direct (no confirm):", id);
      if (gantt.isTaskExists(id)) {
        window.__ganttBypassConfirm = true; // Forzar bypass en todos los listeners
        _ignoreUpdate = true;
        gantt.deleteTask(id);
        _ignoreUpdate = false;
        window.__ganttBypassConfirm = false;
      }
    },
    // Actualiza visualmente una compra en el Gantt (post-save del modal) sin disparar el DP
    refreshPurchaseSilently: (cleanId, payload) => {
      const gId = `pur_${cleanId}`;
      if (!gantt.isTaskExists(gId)) return;
      const task = gantt.getTask(gId);
      if (payload.producto)           task.text       = payload.producto;
      if (payload.id_proyecto)        task.id_proyecto = payload.id_proyecto;
      if (payload.estado)             task._estado    = payload.estado;
      if (payload.fecha_solicitud) {
        task.start_date = gantt.date.parseDate(payload.fecha_solicitud, 'xml_date');
      }
      if (payload.fecha_arribo_necesaria) {
        const d = gantt.date.parseDate(payload.fecha_arribo_necesaria, 'xml_date');
        d.setDate(d.getDate() + 1);
        task.end_date = d;
      }
      // Actualizar sub-objeto _compra para mantener el estado interno
      task._compra = {
        ...(task._compra || {}),
        f_solicitud:   payload.fecha_solicitud,
        f_arribo_nec:  payload.fecha_arribo_necesaria,
        id_solicitante: payload.id_solicitante,
        id_responsable: payload.id_responsable,
        cantidad:        payload.cantidad,
        valor_unitario:  payload.valor_unitario
      };

      if (payload.id_responsable && window.PurchaseModule && window.PurchaseModule.getResponsableName) {
        task.responsable = window.PurchaseModule.getResponsableName(payload.id_responsable);
      }
      _ignoreUpdate = true;  // No disparar el DataProcessor
      gantt.updateTask(gId);
      _ignoreUpdate = false;
    }
  };
})();
