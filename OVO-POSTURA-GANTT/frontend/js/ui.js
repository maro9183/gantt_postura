/* ============================================================
   UI — Modals, toasts, sidebar, app state
   ============================================================ */

/**
 * Utility: Parsea una fecha de forma segura soportando strings ISO y objetos Date.
 * Retorna un objeto Date (en UTC para evitar desfases de zona horaria en inputs).
 */
window.parseSafeDate = function(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val !== 'string') return null;
  const isoMatch = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(isoMatch[1] + '-' + isoMatch[2] + '-' + isoMatch[3] + 'T00:00:00Z');
  }
  return gantt.date.parseDate(val, "xml_date");
};

window.UI = (() => {
  let projects       = [];
  let responsables   = [];
  let subresponsables = [];
  let recursos       = [];
  let allTasks       = []; // tareas del proyecto activo
  let editingTaskId  = null;
  let editingProjectId = null;
  let editingResponsableId = null;
  let editingSubrespId = null;
  let editingRecursoId = null;
  let notesTaskId    = null;
  let localDepsIds   = []; // Estado local para dependencias antes de guardar

  /* ── Toast ─────────────────────────────────────────────── */
  function toast(msg, type = 'info') {
    const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => {
      el.classList.add('removing');
      el.addEventListener('animationend', () => el.remove());
    }, 3500);
  }

  /* ── Sidebar & Projects ─────────────────────────────────── */
  async function loadProjects() {
    try {
      projects = await API.getProjects();
      GanttApp.setProjectsMap(projects);
      renderProjectList();
      if (projects.length > 0) {
        await selectAllProjects();
      }
    } catch (e) { toast('Error al cargar proyectos', 'error'); }
  }

  function renderProjectList() {
    const list = document.getElementById('project-list');
    if (!projects.length) {
      list.innerHTML = `<div style="padding:12px 10px;color:var(--text-dim);font-size:11px">Sin proyectos. Creá uno ↓</div>`;
      return;
    }
    const active = GanttApp.getCurrentProjectId();
    const isAll = active === '__all__';

    // "Todos los proyectos" item
    let html = `
      <div class="all-projects-item ${isAll ? 'active' : ''}" id="btn-all-projects">
        <span class="all-projects-dot"></span>
        <span class="project-name">MENÚ</span>
      </div>`;

    html += projects.map(p => `
      <div class="project-item ${!isAll && p.id_proyecto == active ? 'active' : ''}"
           data-id="${p.id_proyecto}" data-color="${p.color}"
           style="--active-color:${p.color}">
        <span class="project-dot" style="background:${p.color}"></span>
        <span class="project-name" title="${p.nombre_proyecto}">${p.nombre_proyecto}</span>
        <div class="project-actions">
          <button class="btn-project-action btn-edit-proj" title="Editar proyecto">✏️</button>
          <button class="btn-project-action delete btn-delete-proj" title="Eliminar proyecto">🗑</button>
        </div>
      </div>
    `).join('');

    list.innerHTML = html;

    list.querySelectorAll('.project-item').forEach(el => {
      // Click en el item (seleccionar)
      el.addEventListener('click', (e) => {
        // Evitar que el click en los botones dispare el selectProject
        if (e.target.closest('.project-actions')) return;
        selectProject(+el.dataset.id, el.dataset.color);
      });

      // Click en Editar
      const btnEdit = el.querySelector('.btn-edit-proj');
      if (btnEdit) btnEdit.addEventListener('click', (e) => {
        e.stopPropagation();
        openProjectModal(+el.dataset.id);
      });

      // Click en Borrar
      const btnDel = el.querySelector('.btn-delete-proj');
      if (btnDel) btnDel.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDeleteProject(+el.dataset.id);
      });
    });
    const btnAll = document.getElementById('btn-all-projects');
    if (btnAll) btnAll.addEventListener('click', selectAllProjects);
  }

  async function selectAllProjects() {
    document.getElementById('project-title').textContent = 'Cargando...';
    try {
      allTasks = await GanttApp.loadAllProjects();
      updateActiveViewBtn(document.getElementById('btn-view-tasks'));
      document.getElementById('project-title').textContent = 'MENÚ';
      document.getElementById('project-badge').textContent = '';
      document.getElementById('project-badge').style.display = 'none';
      renderProjectList();
      showMainUI();
    } catch (e) { toast('Error al cargar proyectos', 'error'); console.error(e); }
  }

  async function selectProject(id, color) {
    document.getElementById('project-title').textContent = 'Cargando...';
    try {
      await GanttApp.loadProject(id, color);
      updateActiveViewBtn(document.getElementById('btn-view-tasks'));
      const p = projects.find(x => x.id_proyecto == id);
      document.getElementById('project-title').textContent = p ? p.nombre_proyecto : 'Proyecto';
      document.getElementById('project-badge').textContent = p ? p.proyecto : '';
      document.getElementById('project-badge').style.display = '';
      document.getElementById('project-badge').style.color = color;
      document.getElementById('project-badge').style.background = color + '22';

      // Tarea: ya No recargamos allTasks para el modal; la memoria global persiste.
      renderProjectList();
      showMainUI();
    } catch (e) { toast('Error al cargar tareas', 'error'); console.error('[selectProject] Error:', e); }
  }

  /* ── View Switching ─────────────────────────────────────── */
  function updateActiveViewBtn(activeBtn) {
    const btnTasks = document.getElementById('btn-view-tasks');
    const btnPurchases = document.getElementById('btn-view-purchases');
    [btnTasks, btnPurchases].forEach(b => {
      if(b) {
        b.classList.remove('btn-primary', 'active');
        b.classList.add('btn-ghost');
      }
    });
    if(activeBtn) {
      activeBtn.classList.remove('btn-ghost');
      activeBtn.classList.add('btn-primary', 'active');
    }
  }

  // Event Listeners para cambios de vista
  document.addEventListener('click', async (e) => {
    if (e.target.id === 'btn-view-tasks') {
      updateActiveViewBtn(e.target);
      const pv = document.getElementById('purchases-view');
      if (pv) pv.style.display = 'none';
      window.GanttApp.restoreTasksView();
    }
    if (e.target.id === 'btn-view-purchases') {
      updateActiveViewBtn(e.target);
      const pv = document.getElementById('purchases-view');
      if (pv) pv.style.display = 'flex';
      const [purchases, tasks] = await Promise.all([API.getPurchases(), API.getTasks()]);
      window.GanttApp.loadPurchasesView(purchases, tasks);
    }
    if (e.target.id === 'btn-new-purchase-dropdown') {
      document.getElementById('new-dropdown-menu').style.display = 'none';
      // window.PurchaseModule se evalúa en tiempo de ejecución (click), no de definición
      // Para entonces ya está asignado (el IIFE corrió al cargar el script)
      if (window.PurchaseModule) window.PurchaseModule.openNewPurchaseModal();
    }
    if (e.target.id === 'btn-open-charts') {
      openChartsModal();
    }
  });

  /* ── Purchase Module ──────────────────────────────────────── */
  const PurchaseModule = (() => {

    // ── Helpers ─────────────────────────────────────────────────
    const fmt = d => d ? String(d).split('T')[0] : '';

    // Calcula el estado automáticamente según las reglas de negocio
    function calcEstado(fOc, fEntregado) {
      if (fEntregado) return { estado: 'entregado',   icon: '🟢', label: 'Entregado' };
      if (fOc)       return { estado: 'OC emitida',   icon: '🟠', label: 'OC Emitida' };
      return              { estado: 'solicitada',    icon: '🟡', label: 'Solicitada' };
    }

    // Actualiza el badge de estado — y el input hidden para que savePurchase lo lea
    function updateEstadoDisplay() {
      const fOc  = document.getElementById('field-pur-f-oc').value;
      const fEnt = document.getElementById('field-pur-f-entregado').value;
      const { estado, icon, label } = calcEstado(fOc, fEnt);

      document.getElementById('field-pur-estado').value       = estado;
      document.getElementById('field-pur-estado-icon').textContent  = icon;
      document.getElementById('field-pur-estado-label').textContent = label;

      // Comprometida obligatoria solo si hay OC
      const reqSpan = document.getElementById('lbl-comprometida-req');
      if (reqSpan) reqSpan.style.display = fOc ? 'inline' : 'none';
    }

    // Construye las opciones de selector de personas (responsables + subresponsables)
    function buildPersonOptions(selectedId) {
      let html = '<option value="">Seleccionar...</option>';
      if (responsables.length) {
        html += '<optgroup label="Responsables">' +
          responsables.map(r => `<option value="R-${r.id_resp}" ${r.id_resp == selectedId ? 'selected' : ''}>${r.nombre}</option>`).join('') +
          '</optgroup>';
      }
      if (subresponsables.length) {
        html += '<optgroup label="Subresponsables">' +
          subresponsables.map(s => `<option value="S-${s.id_subresp}" ${s.id_subresp == selectedId ? 'selected' : ''}>${s.nombre}</option>`).join('') +
          '</optgroup>';
      }
      return html;
    }

    // Nuevo helper: Solo responsables (sin equipos/sub) para el campo Responsable de Compra
    function buildResponsableOnlyOptions(selectedId) {
      let html = '<option value="">Seleccionar responsable...</option>';
      if (responsables.length) {
        html += responsables.map(r => `<option value="${r.id_resp}" ${r.id_resp == selectedId ? 'selected' : ''}>${r.nombre}</option>`).join('');
      }
      return html;
    }

    // Conectar listeners de auto-estado a los campos de fecha
    function bindEstadoListeners() {
      ['field-pur-f-oc', 'field-pur-f-entregado'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', updateEstadoDisplay);
      });
    }

    // ── Abrir modal: EDITAR compra existente ──────────────────────────
    async function openPurchaseModal(id) {
      try {
        const cleanId = String(id).replace('pur_', '');
        const p = await API.getPurchase(cleanId);
        if (!p) return;

        // Título e ID
        document.getElementById('modal-purchase-title').textContent = `Editar Compra #${p.id_compra}`;
        document.getElementById('field-pur-id').value = p.id_compra;
        document.getElementById('btn-delete-purchase').style.display = '';

        // Campos principales
        document.getElementById('field-pur-producto').value = p.producto || '';
        document.getElementById('field-pur-notas').value    = p.notas    || '';

        // Proyecto
        const projSel = document.getElementById('field-pur-proyecto');
        projSel.innerHTML = '<option value="">Seleccionar proyecto...</option>' +
          projects.map(pr => `<option value="${pr.id_proyecto}" ${pr.id_proyecto == p.id_proyecto ? 'selected' : ''}>${pr.nombre_proyecto}</option>`).join('');

        // Solicitante (responsables + subresponsables)
        document.getElementById('field-pur-solicitante').innerHTML = buildPersonOptions(p.id_solicitante);

        // Responsable de Compra (solo responsables principales)
        document.getElementById('field-pur-responsable').innerHTML = buildResponsableOnlyOptions(p.id_responsable);

        // Cantidades
        document.getElementById('field-pur-cantidad').value = p.cantidad      || 1;
        document.getElementById('field-pur-valor').value    = p.valor_unitario || 0;

        // Fechas
        document.getElementById('field-pur-f-solicitud').value    = fmt(p.fecha_solicitud);
        document.getElementById('field-pur-f-arribo-nec').value   = fmt(p.fecha_arribo_necesaria);
        document.getElementById('field-pur-f-oc').value           = fmt(p.fecha_oc_emitida);
        document.getElementById('field-pur-f-comprometida').value = fmt(p.fecha_comprometida);
        document.getElementById('field-pur-f-entregado').value    = fmt(p.fecha_entregado);

        // Estado automático
        updateEstadoDisplay();
        bindEstadoListeners();

        document.getElementById('modal-purchase').classList.remove('hidden');
      } catch (e) {
        console.error(e);
        toast('Error al cargar datos de la compra', 'error');
      }
    }

    // ── Abrir modal: NUEVA compra ──────────────────────────────────
    function openNewPurchaseModal() {
      document.getElementById('modal-purchase-title').textContent = 'Nueva Compra';
      document.getElementById('field-pur-id').value   = '';
      document.getElementById('btn-delete-purchase').style.display = 'none';

      // Limpiar campos
      document.getElementById('field-pur-producto').value          = '';
      document.getElementById('field-pur-notas').value             = '';
      document.getElementById('field-pur-cantidad').value          = '1';
      document.getElementById('field-pur-valor').value             = '0';
      document.getElementById('field-pur-f-arribo-nec').value      = '';
      document.getElementById('field-pur-f-oc').value              = '';
      document.getElementById('field-pur-f-comprometida').value    = '';
      document.getElementById('field-pur-f-entregado').value       = '';
      document.getElementById('field-pur-f-solicitud').value       = new Date().toISOString().split('T')[0];

      // Proyecto pre-seleccionado
      const activeProjectId = window.GanttApp ? window.GanttApp.getCurrentProjectId() : '';
      const projSel = document.getElementById('field-pur-proyecto');
      projSel.innerHTML = '<option value="">Seleccionar proyecto...</option>' +
        projects.map(pr => `<option value="${pr.id_proyecto}" ${pr.id_proyecto == activeProjectId ? 'selected' : ''}>${pr.nombre_proyecto}</option>`).join('');

      // Solicitante
      document.getElementById('field-pur-solicitante').innerHTML = buildPersonOptions(null);

      // Responsable
      document.getElementById('field-pur-responsable').innerHTML = buildResponsableOnlyOptions(null);

      // Estado inicial
      updateEstadoDisplay();
      bindEstadoListeners();

      document.getElementById('modal-purchase').classList.remove('hidden');
    }

    // ── Guardar (crear o actualizar) ────────────────────────────────
    async function savePurchase() {
      const rawId = document.getElementById('field-pur-id').value;
      const isNew = !rawId;
      const btn   = document.getElementById('btn-save-purchase');
      if (btn) btn.disabled = true;

      // Validaciones
      const producto   = document.getElementById('field-pur-producto').value.trim();
      const projId     = parseInt(document.getElementById('field-pur-proyecto').value)   || null;
      const arriboVal  = document.getElementById('field-pur-f-arribo-nec').value;
      const fOc        = document.getElementById('field-pur-f-oc').value;
      const fComp      = document.getElementById('field-pur-f-comprometida').value;

      if (!producto) {
        toast('El nombre de la compra es obligatorio', 'error');
        if (btn) btn.disabled = false; return;
      }
      if (!projId) {
        toast('Debes seleccionar un Proyecto', 'error');
        if (btn) btn.disabled = false; return;
      }
      const solicitanteVal = document.getElementById('field-pur-solicitante').value;
      if (!solicitanteVal) {
        toast('Debes seleccionar un Solicitante', 'error');
        if (btn) btn.disabled = false; return;
      }
      if (!arriboVal) {
        toast('La Fecha de Arribo Necesario es obligatoria', 'error');
        if (btn) btn.disabled = false; return;
      }
      if (fOc && !fComp) {
        toast('Si hay Fecha OC, la Fecha Comprometida es obligatoria', 'error');
        if (btn) btn.disabled = false; return;
      }

      // Resolver id_solicitante desde el prefijo R-/S-
      let idSolicitante = null;
      if (solicitanteVal.startsWith('R-')) idSolicitante = parseInt(solicitanteVal.replace('R-', ''));
      else if (solicitanteVal.startsWith('S-')) idSolicitante = parseInt(solicitanteVal.replace('S-', ''));
      else idSolicitante = parseInt(solicitanteVal) || null;

      const payload = {
        producto,
        fecha_solicitud:        document.getElementById('field-pur-f-solicitud').value    || null,
        fecha_arribo_necesaria: arriboVal,
        id_proyecto:            projId,
        id_solicitante:         idSolicitante,
        id_responsable:         parseInt(document.getElementById('field-pur-responsable').value) || null,
        cantidad:               parseFloat(document.getElementById('field-pur-cantidad').value) || 1,
        valor_unitario:         parseFloat(document.getElementById('field-pur-valor').value)    || 0,
        estado:                 document.getElementById('field-pur-estado').value || 'solicitada',
        fecha_oc_emitida:       fOc   || null,
        fecha_comprometida:     fComp || null,
        fecha_entregado:        document.getElementById('field-pur-f-entregado').value || null,
        notas:                  document.getElementById('field-pur-notas').value.trim() || null
      };

      // Eliminar solo undefined (null se envía para limpiar campos en la DB)
      Object.keys(payload).forEach(k => { if (payload[k] === undefined) delete payload[k]; });

      document.getElementById('modal-purchase').classList.add('hidden');

      try {
        if (isNew) {
          await API.createPurchase(payload);
          toast('Compra creada ✅', 'success');
          const [pur, tks] = await Promise.all([API.getPurchases(), API.getTasks()]);
          window.GanttApp.loadPurchasesView(pur, tks);
          
          // REORDENAMIENTO POST-CREACIÓN (Asíncrono para asegurar renderizado)
          setTimeout(() => {
            if (window.gantt) {
              gantt.sort("start_date", false);
              gantt.render();
            }
          }, 10);

          updateActiveViewBtn(document.getElementById('btn-view-purchases'));
          const pv = document.getElementById('purchases-view');
          if (pv) pv.style.display = 'flex';
          
        } else {
          const cleanId = String(rawId).replace('pur_', '');
          await API.updatePurchase(cleanId, payload);
          toast('Compra guardada ✅', 'success');
          window.GanttApp.refreshPurchaseSilently(cleanId, payload);
        }
      } catch (e) {
        console.error('[savePurchase]', e);
        toast('Error al guardar la compra', 'error');
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    // ── Eliminar ────────────────────────────────────────────────
    async function deletePurchase() {
      const id = document.getElementById('field-pur-id').value;
      if (!id) { toast('ID de compra no encontrado', 'error'); return; }

      // Asegurar que pasamos el ID con prefijo para el Universal Purger
      const gId = String(id).startsWith('pur_') ? id : `pur_${id}`;
      
      // Cerramos el modal de compra primero para no solapar con el confirm
      document.getElementById('modal-purchase').classList.add('hidden');
      
      // Llamamos al purgador universal que maneja confirmación, API y limpieza local
      await deleteTask(gId);
    }

    function getResponsableName(id) {
      if (!id) return '-';
      const strId = String(id);
      if (strId.startsWith('R-')) {
        const rid = parseInt(strId.replace('R-', ''));
        const r = responsables.find(x => x.id_resp == rid);
        return r ? r.nombre : strId;
      }
      if (strId.startsWith('S-')) {
        const sid = parseInt(strId.replace('S-', ''));
        const s = subresponsables.find(x => x.id_subresp == sid);
        return s ? s.nombre : strId;
      }
      const r = responsables.find(x => x.id_resp == id);
      return r ? r.nombre : id;
    }

    return { openPurchaseModal, openNewPurchaseModal, savePurchase, deletePurchase, getResponsableName };
  })();
  window.PurchaseModule = PurchaseModule; // exponer globalmente para gantt-init.js

  /* ── Charts Logic ────────────────────────────────────────── */
  let expenseChart = null;
  let countChart = null;

  async function openChartsModal() {
    const modal = document.getElementById('modal-charts');
    if (!modal) return;
    
    // Remover clase hidden primero
    modal.classList.remove('hidden');
    
    // Forzar un pequeño reflow y esperar a que el navegador procese el cambio de visibilidad
    // Esto es CRÍTICO para que los <canvas> tengan dimensiones válidas.
    requestAnimationFrame(() => {
      setTimeout(() => {
        renderPurchaseCharts();
      }, 50);
    });
  }

  function renderPurchaseCharts() {
    if (!window.GanttApp) return;
    // Obtener tareas usando la nueva función exportada
    const allTasks = window.GanttApp.getAllTasks() || [];
    
    // Filtrado robusto (es_compra, _es_compra o tipo compra)
    const purchases = allTasks.filter(t => t.es_compra || t._es_compra || t.type === 'purchase');

    const summaryContainer = document.getElementById('chart-kpi-summary');
    if (purchases.length === 0) {
      if (summaryContainer) summaryContainer.innerHTML = '<div style="color:var(--text-muted); padding:20px; text-align:center; width:100%">No hay datos de compra cargados en este momento.</div>';
      return;
    }

    // Agrupar datos por estado
    const stats = {};
    const counts = {};
    purchases.forEach(p => {
      // Normalizar el estado
      let state = p._estado || p.estado || 'Pendiente';
      // Mapeo amigable para el gráfico
      if (state === 'No comenzada') state = 'Pendiente';
      
      const costValue = p._raw?.costo_tarea || p._costo || p._compra?.valor_unitario || 0;
      const cost = parseFloat(costValue) || 0;
      
      stats[state] = (stats[state] || 0) + cost;
      counts[state] = (counts[state] || 0) + 1;
    });

    const labels = Object.keys(stats);
    const dataExpense = Object.values(stats);
    const dataCount = Object.values(counts);

    // Paleta de colores consistente
    const colorMap = {
      'Finalizada': '#10b981',
      'entregado': '#10b981',
      'Entregado': '#10b981',
      'En progreso': '#3b82f6',
      'OC emitida': '#f59e0b',
      'Pendiente': '#6366f1',
      'Bloqueada': '#6b7280',
      'Retrasada': '#ef4444',
      'Iniciada Atrasada': '#c30010'
    };
    const colors = labels.map(l => colorMap[l] || '#94a3b8');

    // Destruir instancias previas obligatoriamente
    if (expenseChart) { expenseChart.destroy(); expenseChart = null; }
    if (countChart) { countChart.destroy(); countChart = null; }

    try {
      const canvasExp = document.getElementById('chart-expense-by-state');
      const canvasCount = document.getElementById('chart-count-by-state');
      
      if (!canvasExp || !canvasCount) return;

      const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { 
            position: 'bottom', 
            labels: { color: '#e2e5f0', padding: 15, font: { size: 10, weight: '600' } } 
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                let value = context.raw;
                if (context.datasetIndex === 0 && context.chart.canvas.id === 'chart-expense-by-state') {
                  return ' Gasto: $' + value.toLocaleString();
                }
                return ' Cantidad: ' + value;
              }
            }
          }
        }
      };

      expenseChart = new Chart(canvasExp.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: dataExpense,
            backgroundColor: colors,
            borderWidth: 2,
            borderColor: '#1e1e2f',
            hoverOffset: 15
          }]
        },
        options: commonOptions
      });

      countChart = new Chart(canvasCount.getContext('2d'), {
        type: 'pie',
        data: {
          labels: labels,
          datasets: [{
            data: dataCount,
            backgroundColor: colors,
            borderWidth: 2,
            borderColor: '#1e1e2f',
            hoverOffset: 15
          }]
        },
        options: commonOptions
      });

      // KPI Summary (Alertas de Atraso)
      const today = new Date(); today.setHours(0,0,0,0);
      
      const delayedCount = purchases.filter(p => {
         const s = p._estado || '';
         if (s === 'Finalizada' || s === 'Entregado' || s === 'entregado') return false;
         
         const fNecStr = p._compra?.f_arribo_nec || p._raw?.f_arribo_nec;
         if (!fNecStr) return false;
         
         const fNec = new Date(fNecStr + 'T00:00:00');
         return fNec < today;
      }).length;

      const noOCCount = purchases.filter(p => {
        const s = p._status || p._estado || '';
        if (s === 'Finalizada' || s === 'Entregado') return false;
        return !p._compra?.f_oc && !p._raw?.f_oc;
      }).length;

      if (summaryContainer) {
        summaryContainer.innerHTML = `
          <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.2); padding:16px; border-radius:12px; flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
            <div style="font-size:10px; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:4px">Atrasos Críticos</div>
            <div style="font-size:32px; font-weight:900; color:#ef4444; text-shadow:0 0 10px rgba(239,68,68,0.3)">${delayedCount}</div>
            <div style="font-size:10px; color:#ef444499">Vencidos o fuera de plazo</div>
          </div>
          <div style="background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.2); padding:16px; border-radius:12px; flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
            <div style="font-size:10px; color:var(--text-muted); font-weight:700; text-transform:uppercase; margin-bottom:4px">Compras sin OC</div>
            <div style="font-size:32px; font-weight:900; color:#f59e0b; text-shadow:0 0 10px rgba(245,158,11,0.3)">${noOCCount}</div>
            <div style="font-size:10px; color:#f59e0b99">Pendientes de gestión</div>
          </div>
        `;
      }
    } catch (err) {
      console.error("[renderPurchaseCharts] Error:", err);
    }
  }

  function showMainUI() {
    document.getElementById('toolbar-actions').style.display = 'flex';
    const fb = document.getElementById('filter-bar');
    if (fb) fb.style.display = 'flex';
    const sb = document.getElementById('status-bar');
    if (sb) sb.style.display = 'flex';
    populateFilterDropdowns();
  }

  function populateFilterDropdowns() {
    // Responsable
    const fResp = document.getElementById('filter-responsable');
    if (fResp) {
      const current = fResp.value;
      fResp.innerHTML = '<option value="">Responsable \u25bc</option>';
      responsables.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.correo;
        opt.textContent = r.nombre;
        fResp.appendChild(opt);
      });
      fResp.value = current;
    }
    // Proyecto
    const fProj = document.getElementById('filter-proyecto');
    if (fProj) {
      const current = fProj.value;
      fProj.innerHTML = '<option value="">Proyecto \u25bc</option>';
      projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.nombre_proyecto;
        opt.textContent = p.nombre_proyecto;
        fProj.appendChild(opt);
      });
      fProj.value = current;
    }
  }

  /* ── Task Modal ─────────────────────────────────────────── */
  async function openTaskModal(param) {
    // param puede ser id (number) o ganttTask (object del dhtmlx)
    let task_id = null;
    let ganttTask = null;
    if (param && typeof param === 'object') {
       ganttTask = param;
       task_id = ganttTask.id;
    } else {
       task_id = param;
    }

    editingTaskId = task_id;
    const raw = editingTaskId ? allTasks.find(t => t.id == editingTaskId) : null;
    
    document.getElementById('modal-task-title').textContent = editingTaskId ? 'Editar Tarea' : 'Nueva Tarea';
    document.getElementById('btn-delete-task').style.display = editingTaskId ? 'block' : 'none';

    const f = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };

    // Mapeo Estricto según Extracción de DOM
    f('field-descripcion', raw?.descripcion || ganttTask?.descripcion || ganttTask?.text || '');
    f('field-costo',       parseFloat(raw?.costo_tarea || ganttTask?.costo_tarea || 0));
    f('field-costo-real',  parseFloat(raw?.costo_real || ganttTask?._costo_real || 0));

    // Fecha inicio (Baseline - Plan Original)
    // EXCLUSIVO de DB o alias persistente. NUNCA del start_date visual.
    let baselineVal = raw?.fecha_inicio || ganttTask?._f_inicio_base || today();
    f('field-fecha-inicio', baselineVal);
    
    // Fecha inicio Proyectada (Visual)
    // Refleja exactamente dónde está la barra en el Gantt
    let visualStart = baselineVal;
    if (ganttTask && ganttTask.start_date) {
      visualStart = gantt.date.date_to_str('%Y-%m-%d')(ganttTask.start_date);
    }
    f('field-fecha-inicio-proyectada', raw?.fecha_inicio_proyectada || ganttTask?._f_inicio_proy || visualStart);
    f('field-fecha-fin-proyectada',    raw?.fecha_fin_proyectada || ganttTask?._f_fin_proy || '');
    f('field-fecha-real-iniciada',     raw?.fecha_real_iniciada || ganttTask?._f_real_ini || '');
    f('field-fecha-completada',        raw?.fecha_completada || ganttTask?._f_real_fin || '');

    // Permisos Baseline (Solo Admin edita)
    const isAdmin = window.Auth && window.Auth.getUser()?.es_admin;
    const isEditing = !!editingTaskId;
    document.getElementById('field-fecha-inicio').disabled = (!isAdmin && isEditing);
    // document.getElementById('field-duracion').disabled = (!isAdmin && isEditing); // La duración permitimos editarla para desplazar la proyección

    // Duración: protegida mediante alias duracion_estricta para evitar hijacking de DHTMLX
    // Soporta raw (duracion_dias) y mapped (duration)
    const durVal = raw?.duracion_dias || raw?.duration || ganttTask?.duracion_estricta || 1;
    f('field-duracion', durVal);

    // Avance
    const pAvance = ganttTask?.progress != null ? ganttTask.progress * 100 : 0;
    const avance  = parseFloat(raw?.avance || raw?.progress || pAvance || 0);
    f('field-avance', avance);
    document.getElementById('label-avance').textContent = `${Math.round(avance)}%`;
    document.getElementById('label-avance-r').textContent = `${Math.round(avance)}%`;

    // Proyecto
    const projSel = document.getElementById('field-proyecto');
    const safeProjId = raw?.id_proyecto || ganttTask?.id_proyecto || GanttApp.getCurrentProjectId() || projects[0]?.id_proyecto || '';
    projSel.innerHTML = projects.map(p =>
      `<option value="${p.id_proyecto}" ${safeProjId == p.id_proyecto ? 'selected' : ''}>${p.nombre_proyecto}</option>`
    ).join('');
    projSel.value = safeProjId;

    // Tarea Padre (Filtrada por proyecto)
    function updateParentSelect(projectId, selectedParentId = null) {
      const parentSel = document.getElementById('field-parent');
      parentSel.innerHTML = '<option value="">-- Tarea principal (sin padre) --</option>';
      
      // Usar el iterador oficial de DHTMLX para asegurar compatibilidad y evitar TypeErrors
      gantt.eachTask(t => {
        // Ignorar la propia tarea para evitar autoreferencia
        if (editingTaskId && t.id == editingTaskId) return;
        // Ignorar compras (prefixed with pur_) ya que no deben ser padres de obra
        if (String(t.id).startsWith('pur_')) return;
        
        // FILTRO POR PROYECTO: Solo mostrar tareas del mismo proyecto
        const tProjId = t.id_proyecto || (t._raw ? t._raw.id_proyecto : null);
        if (projectId && tProjId && tProjId != projectId) return;

        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.text || t.tarea || "(Sin nombre)";
        parentSel.appendChild(opt);
      });
      parentSel.value = selectedParentId || '';
    }

    const currentProjId = raw?.id_proyecto || projSel.value;
    // Soporta tanto raw.id_parent como ganttTask.parent (DHTMLX name)
    const currentParentId = raw?.id_parent || ganttTask?.parent || 0;
    updateParentSelect(currentProjId, currentParentId);

    const parentSel = document.getElementById('field-parent');
    parentSel.onchange = async () => {
      const pId = parentSel.value;
      await renderDependenciasSelect('');
      
      // Herencia de responsable y equipo desde el padre
      if (pId) {
        const parentTask = allTasks.find(t => t.id_tarea == pId);
        if (parentTask && parentTask.responsable) {
          const respSel = document.getElementById('field-responsable');
          respSel.value = parentTask.responsable;
          const selectedOpt = respSel.options[respSel.selectedIndex];
          const leadId = selectedOpt ? selectedOpt.dataset.id : null;
          updateSubrespSelect(leadId, parentTask.id_subresp);
        }
      }
    };

    // Responsable y Equipo
    const respSel = document.getElementById('field-responsable');
    respSel.innerHTML = '<option value="">Seleccionar responsable...</option>';
    responsables.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.correo;
      opt.dataset.id = r.id_resp;
      opt.textContent = `${r.nombre} (${r.correo})`;
      respSel.appendChild(opt);
    });
    respSel.value = raw?.responsable || '';

    respSel.onchange = () => {
      const selectedOpt = respSel.options[respSel.selectedIndex];
      const leadId = selectedOpt ? selectedOpt.dataset.id : null;
      updateSubrespSelect(leadId);
    };
    
    // Poblar subresponsable
    const lead = responsables.find(r => r.correo === raw?.responsable);
    updateSubrespSelect(lead ? lead.id_resp : null, raw?.id_subresp);

    // Tipo días
    const tipo = raw?.tipo_dias || 'calendario';
    document.querySelectorAll('input[name="tipo_dias"]').forEach(r => { r.checked = r.value === tipo; });

    renderRecursosSelect(raw?.recursos || '');
    
    // Inicializar estado local de dependencias
    localDepsIds = (raw?.dependencias || '').split(',').map(d => d.trim()).filter(Boolean);
    renderDependenciasList();
    
    document.getElementById('modal-task').classList.remove('hidden');
    document.getElementById('field-descripcion').focus();

    // Mostrar/ocultar la sección de compras y cargarlas si hay tarea existente
    const purGroup = document.getElementById('group-task-purchases');
    if (purGroup) {
      purGroup.style.display = editingTaskId ? 'block' : 'none';
      if (editingTaskId) {
        // La gestión de compras ahora se maneja de forma independiente
        // PurchaseModule.renderTaskPurchases(editingTaskId); // ELIMINADO: Evita TypeError
      }
    }
    
    // Forzar sincronización de proyecciones inicial
    syncModalProjections();
  }

  /**
   * RECALCULO EN VIVO (Frontend UX Refactor)
   * Replica la lógica del backend: Fin = InicioEfectivo + Duración - 1
   */
  function syncModalProjections() {
    const fieldIniProy = document.getElementById('field-fecha-inicio-proyectada');
    const fieldIniBase = document.getElementById('field-fecha-inicio');
    const fieldRealIni = document.getElementById('field-fecha-real-iniciada');
    const fieldDur     = document.getElementById('field-duracion');
    const fieldFinProy = document.getElementById('field-fecha-fin-proyectada');

    if (!fieldFinProy) return;

    // 1. Determinar Inicio Efectivo (Prioridad: Real > Proyectada > Baseline)
    let startStr = fieldRealIni?.value || fieldIniProy?.value || fieldIniBase?.value;
    if (!startStr) return;

    // 2. Obtener Duración
    const duration = parseInt(fieldDur?.value) || 1;

    // 3. Calcular Fin
    // Usamos T00:00:00Z para evitar desfases de zona horaria local
    const startDate = new Date(startStr + 'T00:00:00Z');
    if (isNaN(startDate.getTime())) return;

    // Matemática: d + duration - 1
    const endDate = new Date(startDate.getTime());
    endDate.setUTCDate(endDate.getUTCDate() + duration - 1);

    // 4. Inyectar en el campo interactivo
    fieldFinProy.value = endDate.toISOString().split('T')[0];
  }

  function updateSubrespSelect(leadId, selectedId = null) {
    const sel = document.getElementById('field-subresp');
    const team = subresponsables.filter(s => s.id_lead == leadId);
    sel.innerHTML = '<option value="">-- Sin subresponsable --</option>' +
      team.map(s => `<option value="${s.id_subresp}" ${s.id_subresp == selectedId ? 'selected' : ''}>${s.nombre}</option>`).join('');
  }

  function renderRecursosSelect(selected) {
    const wrap = document.getElementById('recursos-wrap');
    if (!wrap) return;
    const selIds = (selected || '').split(',').map(d => d.trim()).filter(Boolean);
    if (!recursos.length) {
      wrap.innerHTML = '<span style="color:var(--text-dim);font-size:11px">No hay recursos cargados</span>';
      return;
    }
    const options = recursos.map(r => `
      <option value="${r.id_recurso}" ${selIds.includes(String(r.id_recurso)) ? 'selected' : ''}>${escHtml(r.nombre)}</option>
    `).join('');
    wrap.innerHTML = `<select class="form-control" style="height:110px; padding:4px" multiple>${options}</select>`;
  }

  function renderDependenciasList() {
    const wrap = document.getElementById('deps-wrap');
    if (!localDepsIds.length) {
      wrap.innerHTML = '<div style="color:var(--text-dim);font-size:11px;text-align:center;padding:10px;">Sin dependencias.</div>';
      return;
    }

    let html = '';
    localDepsIds.forEach(id => {
      // Intentamos buscar la tarea en allTasks o directamente en el motor del Gantt si existe
      let t = allTasks.find(x => x.id == id);
      if (!t && window.gantt && gantt.isTaskExists(id)) {
        t = gantt.getTask(id);
      }

      if (t) {
        const proj = projects.find(p => p.id_proyecto == t.id_proyecto);
        const dotColor = proj ? proj.color : '#94a3b8';
        html += `
          <div class="dep-row" data-id="${id}">
            <div class="dep-row-info">
              <div class="dep-row-name">
                <span class="dep-dot" style="background:${dotColor}"></span>
                ${t.text || t.tarea || 'Tarea'}
              </div>
              <div class="dep-row-proj">${proj ? proj.nombre_proyecto : 'Proyecto Externo'}</div>
            </div>
            <button type="button" class="btn-remove-dep" title="Quitar dependencia">×</button>
          </div>
        `;
      }
    });
    wrap.innerHTML = html;

    // Listeners de borrado
    wrap.querySelectorAll('.btn-remove-dep').forEach(btn => {
      btn.onclick = (e) => {
        const id = e.target.closest('.dep-row').dataset.id;
        localDepsIds = localDepsIds.filter(x => x != id);
        renderDependenciasList();
      };
    });
  }

  function openAddDepModal() {
    const modal = document.getElementById('modal-add-dependency');
    const projSel = document.getElementById('add-dep-project');
    const taskSel = document.getElementById('add-dep-task');

    // Poblar proyectos únicos desde la memoria global de tareas
    // O mejor, desde la lista de proyectos global que ya tenemos
    projSel.innerHTML = '<option value="">-- Seleccionar Proyecto --</option>';
    projects.forEach(p => {
      projSel.innerHTML += `<option value="${p.id_proyecto}">${p.nombre_proyecto}</option>`;
    });

    taskSel.innerHTML = '<option value="">-- Elige un proyecto primero --</option>';
    taskSel.disabled = true;

    projSel.onchange = () => {
      const pId = projSel.value;
      if (!pId) {
        taskSel.innerHTML = '<option value="">-- Elige un proyecto primero --</option>';
        taskSel.disabled = true;
        return;
      }

      // Filtrar tareas por proyecto desde el catálogo GLOBAL en memoria (allTasks)
      const filtered = allTasks.filter(t => 
        (t.id_proyecto || t._raw?.id_proyecto) == pId && 
        (t.id || t.id_tarea) != editingTaskId &&
        !localDepsIds.includes(String(t.id || t.id_tarea))
      );

      taskSel.innerHTML = filtered.length 
        ? '<option value="">-- Seleccionar Tarea --</option>' + filtered.map(t => `<option value="${t.id || t.id_tarea}">${t.text || t.tarea}</option>`).join('')
        : '<option value="">No hay tareas disponibles</option>';
      taskSel.disabled = false;
    };

    modal.classList.remove('hidden');
  }

  function confirmAddDep() {
    const taskSel = document.getElementById('add-dep-task');
    const val = taskSel.value;
    if (!val) { toast('Selecciona una tarea', 'error'); return; }

    if (!localDepsIds.includes(String(val))) {
      localDepsIds.push(String(val));
      renderDependenciasList();
    }
    document.getElementById('modal-add-dependency').classList.add('hidden');
  }

  function toIsoDate(val) {
    if (!val) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    // Manejo de DD/MM/YYYY si el input no es nativo date o devuelve otro formato
    const parts = val.split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      if (year.length === 4) return `${year}-${month}-${day}`;
    }
    return val;
  }

  function getFormData() {
    const tipoDias = document.querySelector('input[name="tipo_dias"]:checked')?.value || 'calendario';
    
    // Captura específica por contenedor para evitar errores si cambia el orden del DOM
    const recSelect = document.querySelector('#recursos-wrap select');
    const recIds = recSelect ? Array.from(recSelect.selectedOptions).map(o => o.value) : [];
    
    return {
      id_proyecto:         +document.getElementById('field-proyecto').value,
      id_parent:           document.getElementById('field-parent').value ? +document.getElementById('field-parent').value : 0,
      id_subresp:          document.getElementById('field-subresp').value ? +document.getElementById('field-subresp').value : null,
      tarea:               document.getElementById('field-descripcion').value.trim().substring(0, 50),
      descripcion:         document.getElementById('field-descripcion').value.trim() || null,
      fecha_inicio:        toIsoDate(document.getElementById('field-fecha-inicio').value),
      duration:            +document.getElementById('field-duracion').value || 1,
      fecha_real_iniciada: toIsoDate(document.getElementById('field-fecha-real-iniciada')?.value) || null,
      fecha_completada:    toIsoDate(document.getElementById('field-fecha-completada')?.value) || null,
      fecha_inicio_proyectada: toIsoDate(document.getElementById('field-fecha-inicio-proyectada')?.value) || null,
      fecha_fin_proyectada:    toIsoDate(document.getElementById('field-fecha-fin-proyectada')?.value) || null,
      costo_tarea:         parseFloat(document.getElementById('field-costo').value) || 0,
      costo_real:          parseFloat(document.getElementById('field-costo-real').value) || 0,
      responsable:         document.getElementById('field-responsable').value.trim() || null,
      recursos:            recIds.join(',') || null,
      tipo_dias:           tipoDias,
      avance:              +document.getElementById('field-avance').value,
      dependencias:        localDepsIds.join(',') || null,
      es_compra:           0,
      compraData:          null
    };
  }

  async function saveTask() {
    const data = getFormData();
    if (!data.descripcion) { toast('El nombre de la tarea es requerido', 'error'); return; }

    const btn = document.getElementById('btn-save-task');
    btn.disabled = true;
    try {
      if (editingTaskId) {
        // ACTUALIZACIÓN: Mapear datos a la memoria del Gantt y disparar el DataProcessor
        if (!gantt.isTaskExists(editingTaskId)) {
           toast('Tarea no encontrada en memoria', 'error');
           return;
        }
        
        const gt = gantt.getTask(editingTaskId);
        gt.text = data.descripcion || data.tarea;
        gt.start_date = gantt.date.parseDate(data.fecha_inicio, "xml_date");
        
        // Sincronización de duración (Protocol Translator: el frontend solo habla 'duration')
        gt.duration = data.duration;
        delete gt.end_date; // Forzar recalculo visual

        gt.progress = (data.avance || 0) / 100;
        
        // Sincronización de campos custom
        // Sincronización de jerarquía (Dual-Key Sync)
        gt.id_parent = data.id_parent;
        gt.parent    = data.id_parent || 0;
        gt.fecha_inicio = data.fecha_inicio;
        gt._f_inicio_base = data.fecha_inicio;
        // Preservar estado actual si no viene en el form del modal (el modal de tareas no tiene selector de estado aún)
        gt.estado = data.estado || gt.estado || 'sin iniciar';
        gt.tipo_dias = data.tipo_dias;
        gt.dependencias = data.dependencias;
        gt.es_compra = 0;
        // --- MAPEO FALTANTE QUE NO VIAJABA ---
        gt.costo_tarea = data.costo_tarea;
        gt.responsable = data.responsable;
        gt.id_subresp = data.id_subresp;
        gt.recursos = data.recursos;
        gt.fecha_real_iniciada = data.fecha_real_iniciada;
        gt.fecha_completada = data.fecha_completada;
        gt.fecha_inicio_proyectada = data.fecha_inicio_proyectada;
        gt.fecha_fin_proyectada = data.fecha_fin_proyectada;
        gt._costo_real = data.costo_real;

        // DISPARAR DATA PROCESSOR (action: "update")
        gantt.updateTask(editingTaskId);
        setTimeout(() => {
          gantt.sort("start_date", false);
          gantt.render();
        }, 10);
        toast('Sincronizando cambios...', 'info');
      } else {
        // CREACIÓN: Usar gantt.addTask para que el DataProcessor intercepte (action: "create")
        const newTask = {
          text: data.descripcion || data.tarea,
          start_date: gantt.date.parseDate(data.fecha_inicio, "xml_date"),
          duration: data.duration,
          progress: (data.avance || 0) / 100,
          id_proyecto: data.id_proyecto,
          id_parent: data.id_parent,
          fecha_inicio: data.fecha_inicio,
          estado: data.es_compra ? 'solicitada' : (data.estado || 'sin iniciar'),
          tipo_dias: data.tipo_dias,
          dependencias: data.dependencias,
          es_compra: 0,
          costo_tarea: data.costo_tarea,
          costo_real: data.costo_real,
          responsable: data.responsable,
          recursos: data.recursos,
          id_subresp: data.id_subresp,
          fecha_real_iniciada: data.fecha_real_iniciada,
          fecha_completada: data.fecha_completada
        };

        // DISPARAR DATA PROCESSOR (action: "create")
        gantt.addTask(newTask, data.id_parent || 0);
        setTimeout(() => {
          gantt.sort("start_date", false);
          gantt.render();
        }, 10);
        toast('Creando tarea...', 'info');
      }
      closeTaskModal();
    } catch (e) {
      console.error(e);
      toast('Error al procesar la tarea', 'error');
    } finally { btn.disabled = false; }
  }

  function closeTaskModal() {
    document.getElementById('modal-task').classList.add('hidden');
    editingTaskId = null;
  }

  /* ── Confirm Modal ─────────────────────────────────────── */
  function showConfirm(title, msg, btnText) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('modal-confirm');
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-msg').textContent = msg;
      
      const btnYes = document.getElementById('btn-confirm-yes');
      const btnNo  = document.getElementById('btn-confirm-no');
      
      btnYes.textContent = btnText;
      
      // Cleanup de listeners previos usando onclick (fuente única de verdad)
      btnYes.onclick = () => {
        console.log("[Confirm] Respuesta: SÍ");
        overlay.classList.add('hidden');
        resolve(true);
      };
      
      btnNo.onclick = () => {
        console.log("[Confirm] Respuesta: NO");
        overlay.classList.add('hidden');
        resolve(false);
      };
      
      overlay.classList.remove('hidden');
    });
  }

  /* ── Delete confirmation ────────────────────────────────── */
  async function confirmDelete(taskId) {
    console.log("[UI] Iniciando flujo de eliminación para ID:", taskId);
    const agreed = await showConfirm(
      'Eliminar Tarea', 
      '¿Eliminar esta tarea? Esta acción no se puede deshacer.', 
      'Sí, eliminar'
    );
    
    if (agreed) {
      console.log("[UI] Confirmación recibida: Procesando eliminación...");
      deleteTask(taskId);
    } else {
      console.log("[UI] Eliminación cancelada por el usuario.");
    }
  }

  async function deleteTask(taskId) {
    // Normalización de ID (DHTMLX suele usar strings, el backend números)
    console.log("[UI] Ejecutando flujo de deleteTask Universal para ID:", taskId, typeof taskId);
    
    // 1. Detección de Tipo (Tarea vs Compra)
    const isPurchase = String(taskId).startsWith('pur_');
    const cleanId   = isPurchase ? String(taskId).replace('pur_', '') : taskId;
    const entityName = isPurchase ? 'Compra' : 'Tarea';
    const apiPath    = isPurchase ? '/api/purchases/' : '/api/tasks/';

    if (!window.gantt || !gantt.isTaskExists(taskId)) {
       console.error(`[UI] Abortado: La ${entityName} no existe en el Gantt.`);
       toast(`Error: ${entityName} no encontrada`, 'error');
       return;
    }
    
    // 2. Confirmación (Centralizada)
    const agreed = await showConfirm(
      `Eliminar ${entityName}`, 
      `¿Estás seguro de eliminar esta ${entityName.toLowerCase()}? Esta acción no se puede deshacer.`, 
      'Sí, eliminar'
    );
    if (!agreed) {
      console.log(`[UI] Eliminación de ${entityName} cancelada por el usuario.`);
      return;
    }

    try {
      toast(`Eliminando ${entityName.toLowerCase()}...`, 'info');
      console.log(`[UI] Enviando petición DELETE manual a ${apiPath}${cleanId}...`);
      
      const res = await fetch(apiPath + cleanId, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (window.Auth ? window.Auth.getToken() : '')
        }
      });

      const data = await res.json();

      if (!res.ok) {
        console.error("[UI] El servidor rechazó la eliminación:", data.error || 'Error desconocido');
        toast(data.error || `No se pudo eliminar la ${entityName.toLowerCase()}`, 'error');
        return; 
      }

      console.log(`[UI] DELETE de ${entityName} exitoso. Sincronizando Gantt localmente...`);
      
      // 3. Limpieza Visual en Gantt (Directo y Silencioso)
      if (window.GanttApp && window.GanttApp.deleteTaskDirect) {
        window.GanttApp.deleteTaskDirect(taskId);
      } else {
        gantt.deleteTask(taskId);
      }
      
      // 4. Limpieza en Memoria (allTasks) - CRÍTICO para no revivir items en scroll/filtros
      allTasks = allTasks.filter(t => String(t.id || t.id_tarea) !== String(taskId));
      
      console.log("[UI] Flujo completado. Cerrando modales.");
      closeTaskModal(); // Cierra modal de tarea
      document.getElementById('modal-purchase')?.classList.add('hidden'); // Cierra modal de compra (si estaba abierto)
      
      toast(`${entityName} eliminada correctamente`, 'success');
      if (isPurchase && window.GanttApp) window.GanttApp.updateSummary(); // Actualizar KPIs si era compra
      
    } catch (e) {
      console.error("[UI] Error fatal en flujo de eliminación:", e);
      toast('Error de red al intentar eliminar', 'error');
    }
  }

  /* ── Notes Modal ────────────────────────────────────────── */
  async function openNotesModal(taskId) {
    editingNotesTaskId = taskId;
    const t = allTasks.find(x => x.id_tarea == taskId);
    document.getElementById('notes-task-name').textContent = t ? (t.descripcion || t.tarea) : 'Tarea';
    
    // Auto-completar autor con usuario logueado
    const user = Auth.getUser();
    if (user) {
      document.getElementById('field-nota-autor').value = user.nombre || '';
      document.getElementById('field-nota-autor').readOnly = true;
    }

    document.getElementById('modal-notes').classList.remove('hidden');
    await refreshNotes();
  }

  async function refreshNotes() {
    const list = document.getElementById('notes-list');
    list.innerHTML = '<div style="color:var(--text-dim);font-size:11px">Cargando...</div>';
    try {
      const notes = await API.getNotes(editingNotesTaskId);
      if (!notes.length) {
        list.innerHTML = '<div style="color:var(--text-dim);padding:20px;text-align:center;">Sin notas todavía.</div>';
        return;
      }
      list.innerHTML = notes.map(n => `
        <div class="note-item" data-id="${n.id_nota}">
          <div class="note-meta">
            <span class="note-author">${escHtml(n.autor || 'Anónimo')}</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <span>${fmtDate(n.fecha_hora)}</span>
              <button class="note-delete" onclick="UI.deleteNote(${n.id_nota})" title="Eliminar nota">×</button>
            </div>
          </div>
          <div class="note-text">${escHtml(n.nota || '')}</div>
          ${n.link ? `<div style="margin-top:8px"><a href="${n.link}" target="_blank" style="font-size:11px;color:var(--cyan);text-decoration:none;display:flex;align-items:center;gap:4px;"><span>🔗</span> ${n.link}</a></div>` : ''}
        </div>`).join('');
    } catch (e) { list.innerHTML = '<div style="color:var(--red)">Error al cargar notas</div>'; }
  }

  async function saveNote() {
    const nota   = document.getElementById('field-nota').value.trim();
    const autor  = document.getElementById('field-nota-autor').value.trim();
    const link   = document.getElementById('field-nota-link').value.trim();
    if (!nota) { toast('Escribí una nota primero', 'error'); return; }
    try {
      await API.createNote({ tarea: editingNotesTaskId, nota, autor: autor || null, link: link || null });
      document.getElementById('field-nota').value = '';
      document.getElementById('field-nota-link').value = '';
      
      const tid = editingNotesTaskId;
      document.getElementById('modal-notes').classList.add('hidden');
      openTaskModal(tid);
      
      toast('Nota guardada', 'success');
    } catch (e) { toast(e.error || 'Error al guardar nota', 'error'); }
  }

  async function deleteNote(noteId) {
    try {
      await API.deleteNote(noteId);
      await refreshNotes();
    } catch (e) { toast('Error al eliminar nota', 'error'); }
  }

  /* ── Project Modal ──────────────────────────────────────── */
  function openProjectModal(id = null) {
    editingProjectId = id;
    const raw = editingProjectId ? projects.find(p => p.id_proyecto == editingProjectId) : null;

    document.getElementById('modal-project-title').textContent = editingProjectId ? 'Editar Proyecto' : 'Nuevo Proyecto';
    document.getElementById('btn-delete-project').style.display = editingProjectId ? 'block' : 'none';

    document.getElementById('field-proj-codigo').value = raw?.proyecto || '';
    document.getElementById('field-proj-nombre').value = raw?.nombre_proyecto || '';
    document.getElementById('field-proj-desc').value   = raw?.descripcion || '';
    document.getElementById('field-proj-color').value  = raw?.color || '#6366f1';
    
    document.getElementById('modal-project').classList.remove('hidden');
    document.getElementById('field-proj-codigo').focus();
  }

  async function saveProject() {
    const data = {
      proyecto:        document.getElementById('field-proj-codigo').value.trim().toUpperCase(),
      nombre_proyecto: document.getElementById('field-proj-nombre').value.trim(),
      descripcion:     document.getElementById('field-proj-desc').value.trim() || null,
      color:           document.getElementById('field-proj-color').value
    };
    if (!data.proyecto || !data.nombre_proyecto) { toast('Código y nombre requeridos', 'error'); return; }
    const btn = document.getElementById('btn-save-project');
    btn.disabled = true;
    try {
      if (editingProjectId) {
        const p = await API.updateProject(editingProjectId, data);
        projects = projects.map(x => x.id_proyecto == editingProjectId ? p : x);
        toast(`Proyecto "${p.nombre_proyecto}" actualizado`, 'success');
        // Si es el proyecto activo, refrescar título y badge
        if (GanttApp.getCurrentProjectId() == editingProjectId) {
          document.getElementById('project-title').textContent = p.nombre_proyecto;
          document.getElementById('project-badge').textContent = p.proyecto;
          document.getElementById('project-badge').style.color = p.color;
          document.getElementById('project-badge').style.background = p.color + '22';
        }
      } else {
        const p = await API.createProject(data);
        projects.push(p);
        toast(`Proyecto "${p.nombre_proyecto}" creado`, 'success');
        await selectProject(p.id_proyecto, p.color);
      }
      renderProjectList();
      document.getElementById('modal-project').classList.add('hidden');
    } catch (e) { toast(e.error || 'Error al guardar proyecto', 'error'); }
    finally { btn.disabled = false; editingProjectId = null; }
  }

  /* ── Project Delete ─────────────────────────────────────── */
  async function confirmDeleteProject(id) {
    const p = projects.find(x => x.id_proyecto == id);
    if (!p) return;
    
    const agreed = await showConfirm(
      'Eliminar Proyecto', 
      `¿Eliminar el proyecto "${p.nombre_proyecto}"? Esta acción borrará todas sus tareas asociadas y no se puede deshacer.`, 
      'Sí, eliminar todo'
    );
    if (!agreed) return;
    
    try {
      await API.deleteProject(id);
      projects = projects.filter(x => x.id_proyecto != id);
      renderProjectList();
      toast('Proyecto eliminado', 'warning');
      
      // Si el proyecto borrado era el activo, volver al menú
      if (GanttApp.getCurrentProjectId() == id) {
        selectAllProjects();
      }
    } catch (e) { toast(e.error || 'Error al eliminar proyecto', 'error'); }
  }

  /* ── Modals Responsable & Recurso ───────────────────────── */
  function openResponsableModal() {
    editingResponsableId = null;
    document.getElementById('field-resp-nombre').value = '';
    document.getElementById('field-resp-correo').value = '';
    document.getElementById('field-resp-rol').value = '';
    document.getElementById('field-resp-equipo').value = '';
    document.getElementById('modal-responsable').classList.remove('hidden');
    document.getElementById('field-resp-nombre').focus();
  }

  async function saveResponsable() {
    const nombre = document.getElementById('field-resp-nombre').value.trim();
    const correo = document.getElementById('field-resp-correo').value.trim();
    const rol = document.getElementById('field-resp-rol').value.trim() || null;
    const equipo = document.getElementById('field-resp-equipo').value.trim() || null;
    if (!nombre || !correo) { toast('Nombre y correo requeridos', 'error'); return; }
    
    try {
      let r;
      if (editingResponsableId) {
        r = await API.updateResponsable(parseInt(editingResponsableId), { nombre, correo, rol, equipo });
        responsables = responsables.map(x => x.id_resp == editingResponsableId ? r : x);
        toast('Responsable actualizado', 'success');
      } else {
        r = await API.createResponsable({ nombre, correo, rol, equipo });
        responsables.push(r);
        toast('Responsable creado', 'success');
      }
      document.getElementById('modal-responsable').classList.add('hidden');
      // Volver al panel de ajustes actualizado
      renderConfigLists();
      document.getElementById('modal-config').classList.remove('hidden');

      if (editingTaskId !== null || !document.getElementById('modal-task').classList.contains('hidden')) {
        const respSel = document.getElementById('field-responsable');
        if (!editingResponsableId) {
          const opt = document.createElement('option');
          opt.value = r.correo;
          opt.textContent = `${r.nombre} (${r.correo})`;
          respSel.appendChild(opt);
        } else {
          for(let opt of respSel.options) {
            if(opt.value === r.correo) opt.textContent = `${r.nombre} (${r.correo})`;
          }
        }
        respSel.value = r.correo;
      }
    } catch (e) { toast(e.error || 'Error al guardar', 'error'); }
  }

  function openRecursoModal() {
    editingRecursoId = null;
    document.getElementById('field-rec-nombre').value = '';
    document.getElementById('field-rec-area').value = '';
    document.getElementById('field-rec-rol').value = '';
    document.getElementById('field-rec-valor').value = '';
    document.getElementById('modal-recurso').classList.remove('hidden');
    document.getElementById('field-rec-nombre').focus();
  }

  async function saveRecurso() {
    const nombre = document.getElementById('field-rec-nombre').value.trim();
    const area = document.getElementById('field-rec-area').value.trim() || null;
    const rol = document.getElementById('field-rec-rol').value.trim() || null;
    const valor_hora = document.getElementById('field-rec-valor').value ? parseFloat(document.getElementById('field-rec-valor').value) : 0;
    if (!nombre) { toast('Nombre requerido', 'error'); return; }
    
    try {
      let r;
      if(editingRecursoId) {
        r = await API.updateRecurso(parseInt(editingRecursoId), { nombre, area, rol, valor_hora });
        recursos = recursos.map(x => x.id_recurso == editingRecursoId ? r : x);
        toast('Recurso actualizado', 'success');
      } else {
        r = await API.createRecurso({ nombre, area, rol, valor_hora });
        recursos.push(r);
        toast('Recurso creado', 'success');
      }
      document.getElementById('modal-recurso').classList.remove('hidden');
      // Volver al panel de ajustes actualizado
      renderConfigLists();
      document.getElementById('modal-config').classList.remove('hidden');

      if (editingTaskId !== null || !document.getElementById('modal-task').classList.contains('hidden')) {
        const selIds = [...document.querySelectorAll('input[name="rec_check"]:checked')].map(c => c.value);
        if(!editingRecursoId && !selIds.includes(String(r.id_recurso))) {
          selIds.push(String(r.id_recurso));
        }
        renderRecursosSelect(selIds.join(','));
      }
    } catch (e) { toast(e.error || 'Error al guardar', 'error'); }
  }

  /* ── Config Modal ────────────────────────────────────────── */
  function openConfigModal() {
    document.getElementById('modal-config').classList.remove('hidden');
    renderConfigLists();
  }

  function renderConfigLists() {
    const listResp = document.getElementById('config-responsables-list');
    listResp.innerHTML = responsables.length === 0 
      ? '<div style="color:var(--text-dim);font-size:11px">Sin responsables</div>'
      : responsables.map(r => {
        const team = subresponsables.filter(s => s.id_lead == r.id_resp);
        return `
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--bg-header);border-bottom:1px solid var(--border)">
            <div style="flex:1">
              <div style="font-weight:700;font-size:13px;color:var(--primary-light)">${escHtml(r.nombre)} (Líder)</div>
              <div style="font-size:10px;color:var(--text-muted)">${escHtml(r.correo)}</div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="UI.openSubrespModal(${r.id_resp})" title="Agregar miembro al equipo">＋ Equipo</button>
            <button class="btn btn-ghost btn-sm" onclick="UI.editResponsable(${r.id_resp})">✏️</button>
            <button class="btn btn-ghost btn-danger btn-sm" onclick="UI.deleteResponsable(${r.id_resp})">🗑</button>
          </div>
          <div style="padding:8px 12px;background:var(--bg)">
            ${team.length === 0 
              ? '<div style="font-size:10px;color:var(--text-dim);font-style:italic">Equipo sin miembros</div>' 
              : team.map(m => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-light)">
                  <div style="font-size:11px">• ${escHtml(m.nombre)} <span style="color:var(--text-dim)">(${escHtml(m.correo)})</span></div>
                  <div>
                    <button class="btn btn-ghost btn-sm" style="padding:0 4px" onclick="UI.editSubresp(${m.id_subresp})">✏️</button>
                    <button class="btn btn-ghost btn-danger btn-sm" style="padding:0 4px" onclick="UI.deleteSubresp(${m.id_subresp})">🗑</button>
                  </div>
                </div>
              `).join('')}
          </div>
        </div>`;
      }).join('');

    const listRec = document.getElementById('config-recursos-list');
    listRec.innerHTML = recursos.length === 0 
      ? '<div style="color:var(--text-dim);font-size:11px">Sin recursos</div>'
      : recursos.map(r => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius)">
          <div style="flex:1">
            <div style="font-weight:600;font-size:12px">${escHtml(r.nombre)}</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); UI.editRecurso(${r.id_recurso})">✏️</button>
          <button class="btn btn-ghost btn-danger btn-sm" onclick="event.stopPropagation(); UI.deleteRecurso(${r.id_recurso})">🗑</button>
        </div>`).join('');
  }

  function editResponsable(id) {
    const r = responsables.find(x => x.id_resp == id);
    if (!r) return;
    editingResponsableId = id;
    document.getElementById('field-resp-nombre').value = r.nombre || '';
    document.getElementById('field-resp-correo').value = r.correo || '';
    document.getElementById('field-resp-rol').value = r.rol || '';
    document.getElementById('field-resp-equipo').value = r.equipo || '';
    // Ocultar config para que no tape el formulario
    document.getElementById('modal-config').classList.add('hidden');
    document.getElementById('modal-responsable').classList.remove('hidden');
    document.getElementById('field-resp-nombre').focus();
  }

  async function reqDeleteResponsable(id) {
    const agreed = await showConfirm('Eliminar Responsable', '¿Eliminar este responsable?', 'Eliminar');
    if(!agreed) return;
    try {
      await API.deleteResponsable(id);
      responsables = responsables.filter(x => x.id_resp !== id);
      renderConfigLists();
      toast('Responsable eliminado', 'warning');
    } catch(e) { toast('Error al eliminar', 'error'); }
  }

  function editRecurso(id) {
    const r = recursos.find(x => x.id_recurso == id);
    if (!r) return;
    editingRecursoId = id;
    document.getElementById('field-rec-nombre').value = r.nombre || '';
    document.getElementById('field-rec-area').value = r.area || '';
    document.getElementById('field-rec-rol').value = r.rol || '';
    document.getElementById('field-rec-valor').value = r.valor_hora || '';
    // Ocultar config para que no tape el formulario
    document.getElementById('modal-config').classList.add('hidden');
    document.getElementById('modal-recurso').classList.remove('hidden');
    document.getElementById('field-rec-nombre').focus();
  }

  async function reqDeleteRecurso(id) {
    const agreed = await showConfirm('Eliminar Recurso', '¿Eliminar este recurso?', 'Eliminar');
    if(!agreed) return;
    try {
      await API.deleteRecurso(id);
      recursos = recursos.filter(x => x.id_recurso !== id);
      renderConfigLists();
      toast('Recurso eliminado', 'warning');
    } catch(e) { toast('Error al eliminar', 'error'); }
  }

  function openSubrespModal(leadId, subId = null) {
    editingSubrespId = subId;
    document.getElementById('field-sub-lead-id').value = leadId;
    
    if (subId) {
      const s = subresponsables.find(x => x.id_subresp == subId);
      document.getElementById('field-sub-nombre').value = s.nombre;
      document.getElementById('field-sub-correo').value = s.correo;
    } else {
      document.getElementById('field-sub-nombre').value = '';
      document.getElementById('field-sub-correo').value = '';
    }
    document.getElementById('modal-config').classList.add('hidden');
    document.getElementById('modal-subresp').classList.remove('hidden');
  }

  async function saveSubresp() {
    const leadId = document.getElementById('field-sub-lead-id').value;
    const data = {
      id_lead: parseInt(leadId),
      nombre: document.getElementById('field-sub-nombre').value.trim(),
      correo: document.getElementById('field-sub-correo').value.trim()
    };
    
    if (!data.nombre || !data.correo) { toast('Campos requeridos', 'error'); return; }

    try {
      if (editingSubrespId) {
        const r = await API.updateSubresp(editingSubrespId, data);
        subresponsables = subresponsables.map(x => x.id_subresp == editingSubrespId ? r : x);
      } else {
        const r = await API.createSubresp(data);
        subresponsables.push(r);
      }
      document.getElementById('modal-subresp').classList.add('hidden');
      renderConfigLists();
      document.getElementById('modal-config').classList.remove('hidden');
      toast('Miembro guardado', 'success');
    } catch (e) { toast('Error al guardar', 'error'); }
  }

  async function reqDeleteSubresp(id) {
    const agreed = await showConfirm('Eliminar Miembro', '¿Eliminar este miembro?', 'Eliminar');
    if (!agreed) return;
    try {
      await API.deleteSubresp(id);
      subresponsables = subresponsables.filter(x => x.id_subresp != id);
      renderConfigLists();
    } catch (e) { toast('Error al eliminar', 'error'); }
  }

  function updateSubrespSelect(leadId, selectedSubId = null) {
    const wrap = document.getElementById('group-subresponsable');
    const sel = document.getElementById('field-subresp');
    
    if (!leadId) {
      wrap.style.display = 'none';
      sel.innerHTML = '<option value="">Seleccionar miembro...</option>';
      return;
    }

    const members = subresponsables.filter(s => s.id_lead == leadId);
    if (members.length === 0) {
      wrap.style.display = 'none';
    } else {
      wrap.style.display = 'block';
      sel.innerHTML = '<option value="">-- Responsable Líder únicamente --</option>';
      members.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id_subresp;
        opt.textContent = m.nombre;
        sel.appendChild(opt);
      });
      if (selectedSubId) sel.value = selectedSubId;
    }
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function today() {
    return new Date().toISOString().split('T')[0];
  }
  function fmtDate(str) {
    if (!str) return '';
    const d = new Date(str);
    return isNaN(d) ? str : d.toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' });
  }
  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ── Init ───────────────────────────────────────────────── */
  async function init() {
    // Cargar responsables, subresponsables y recursos
    try { 
      responsables = await API.getResponsables();
      subresponsables = await API.getSubresponsables(); // Nueva llamada API
      recursos = await API.getResources();
    } catch(_) {}

    // Wiring modal cerrar
    document.querySelectorAll('.modal-close, [data-close-modal]').forEach(el =>
      el.addEventListener('click', () => {
        const modal = el.closest('.modal-overlay');
        if (modal) {
          modal.classList.add('hidden');
          if (modal.id === 'modal-task') editingTaskId = null;
          // Si se cancela subresp, volver a config
          if (modal.id === 'modal-subresp') {
            document.getElementById('modal-config').classList.remove('hidden');
          }
        }
      })
    );

    document.getElementById('btn-save-subresp').addEventListener('click', saveSubresp);

    // Progress slider
    document.getElementById('field-avance').addEventListener('input', e => {
      document.getElementById('label-avance').textContent = `${Math.round(+e.target.value)}%`;
    });

    // Botones toolbar y dropdown "Nuevo"
    const btnNewDropdown = document.getElementById('btn-new-dropdown');
    const newDropdownMenu = document.getElementById('new-dropdown-menu');
    if (btnNewDropdown && newDropdownMenu) {
      btnNewDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        newDropdownMenu.style.display = newDropdownMenu.style.display === 'none' ? 'flex' : 'none';
      });
      document.addEventListener('click', () => {
        newDropdownMenu.style.display = 'none';
      });
    }

    const btnNewTaskDropdown = document.getElementById('btn-new-task-dropdown');
    if (btnNewTaskDropdown) {
      btnNewTaskDropdown.addEventListener('click', () => {
        if(newDropdownMenu) newDropdownMenu.style.display = 'none';
        openTaskModal(null);
      });
    }

    const btnNewTaskTb = document.getElementById('btn-new-task');
    if (btnNewTaskTb) btnNewTaskTb.addEventListener('click', () => openTaskModal(null));

    // u25bau25ba Nueva Compra desde el dropdown sidebar
    const btnNewPurchaseDropdown = document.getElementById('btn-new-purchase-dropdown');
    if (btnNewPurchaseDropdown) {
      btnNewPurchaseDropdown.addEventListener('click', (e) => {
        e.stopPropagation();
        if (newDropdownMenu) newDropdownMenu.style.display = 'none';
        if (window.PurchaseModule) window.PurchaseModule.openNewPurchaseModal();
      });
    }

    const btnNewProject = document.getElementById('btn-new-project');
    if (btnNewProject) {
      btnNewProject.addEventListener('click', () => {
        if(newDropdownMenu) newDropdownMenu.style.display = 'none';
        openProjectModal();
      });
    }

    const btnToggleGrid = document.getElementById('btn-toggle-grid');
    if (btnToggleGrid) {
      btnToggleGrid.addEventListener('click', () => {
        const cs = gantt.config.show_grid;
        gantt.config.show_grid = !cs;
        btnToggleGrid.textContent = !cs ? 'Ocultar Tareas' : '≡ Tareas';
        
        if (!cs) {
          btnToggleGrid.classList.add('btn-primary', 'active');
          btnToggleGrid.classList.remove('btn-ghost');
        } else {
          btnToggleGrid.classList.remove('btn-primary', 'active');
          btnToggleGrid.classList.add('btn-ghost');
        }
        gantt.render();
      });
    }

    const btnToggleKpi = document.getElementById('btn-toggle-kpi');
    if (btnToggleKpi) {
      btnToggleKpi.addEventListener('click', () => {
        const strip = document.querySelector('.summary-strip');
        const sbar  = document.getElementById('status-bar');
        const isHidden = strip.classList.toggle('hidden-summary');
        if (sbar) sbar.classList.toggle('hidden-summary', isHidden);
        btnToggleKpi.classList.toggle('active', !isHidden);
        // Ajustar altura gantt (CSS detectará el cambio de espacio si usamos calc adecuadamente, pero renderizamos para seguridad)
        setTimeout(() => { if (window.gantt) gantt.render(); }, 100);
      });
    }

    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (btnToggleSidebar) {
      btnToggleSidebar.addEventListener('click', () => {
        const collapsed = sidebar.classList.toggle('collapsed');
        if (window.innerWidth < 768 && overlay) {
          if (!collapsed) {
            overlay.classList.add('active');
          } else {
            overlay.classList.remove('active');
          }
        }
        setTimeout(() => { if (window.gantt) gantt.render(); }, 250);
      });
    }

    if (overlay) {
      overlay.addEventListener('click', () => {
        sidebar.classList.add('collapsed');
        overlay.classList.remove('active');
        setTimeout(() => { if (window.gantt) gantt.render(); }, 250);
      });
    }

    // Auto-colapsar sidebar en móviles al inicio
    if (window.innerWidth < 768) {
      sidebar.classList.add('collapsed');
    }

    // Cerrar sidebar al hacer clic en el contenido principal si estamos en móvil
    document.querySelector('.main-content').addEventListener('click', (e) => {
      // Si el clic viene del botón de menú, no hacer nada aquí (ya se maneja en su listener)
      if (e.target.closest('#btn-toggle-sidebar')) return;
      
      if (window.innerWidth < 768 && !sidebar.classList.contains('collapsed')) {
        sidebar.classList.add('collapsed');
        if(overlay) overlay.classList.remove('active');
      }
    });

    // Guardar tarea
    document.getElementById('btn-save-task').addEventListener('click', saveTask);

    // u25bau25ba Gestión de Dependencias (Dos Modales)
    document.getElementById('btn-open-add-dep').addEventListener('click', openAddDepModal);
    document.getElementById('btn-confirm-add-dep').addEventListener('click', confirmAddDep);
    document.getElementById('btn-close-add-dep').addEventListener('click', () => {
      document.getElementById('modal-add-dependency').classList.add('hidden');
    });
    document.getElementById('btn-cancel-add-dep').addEventListener('click', () => {
      document.getElementById('modal-add-dependency').classList.add('hidden');
    });
    
    
    // u25bau25ba Recálculo en Vivo en el Modal (UX Refactor)
    const modalProjectionTriggers = [
      'field-duracion', 
      'field-fecha-inicio', 
      'field-fecha-real-iniciada', 
      'field-fecha-inicio-proyectada'
    ];
    modalProjectionTriggers.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', syncModalProjections);
    });

    // Abrir notas rápidamente desde el modal de tarea
    document.getElementById('btn-open-notes-quick').addEventListener('click', (e) => {
      e.preventDefault();
      if (!editingTaskId) {
        toast('Guardá la tarea primero para añadir notas detalladas', 'warning');
        return;
      }
      const tid = editingTaskId;
      closeTaskModal();
      openNotesModal(tid);
    });

    // Eliminar tarea (desde modal) - Uso de onclick para evitar duplicación de eventos
    const btnDelTask = document.getElementById('btn-delete-task');
    if (btnDelTask) {
      btnDelTask.onclick = () => {
        console.log("[UI] Botón eliminar presionado en modal tarea.");
        if (editingTaskId) deleteTask(editingTaskId);
        else console.warn("[UI] Intento de borrado sin editingTaskId.");
      };
    }

    // Eliminar proyecto (desde modal)
    const btnDelProj = document.getElementById('btn-delete-project');
    if (btnDelProj) btnDelProj.addEventListener('click', () => {
      if (editingProjectId) confirmDeleteProject(editingProjectId);
    });

    // Export buttons
    const btnExport = document.getElementById('btn-export');
    if (btnExport) btnExport.addEventListener('click', e => { e.stopPropagation(); Exports.toggleMenu(); });
    const btnExportPdf = document.getElementById('btn-export-pdf');
    if (btnExportPdf) btnExportPdf.addEventListener('click', () => { Exports.exportPDF(); document.getElementById('export-menu')?.classList.remove('open'); });
    const btnExportExcel = document.getElementById('btn-export-excel');
    if (btnExportExcel) btnExportExcel.addEventListener('click', () => { Exports.exportExcel(); document.getElementById('export-menu')?.classList.remove('open'); });
    const btnExportCsv = document.getElementById('btn-export-csv');
    if (btnExportCsv) btnExportCsv.addEventListener('click', () => { Exports.exportCSV(); document.getElementById('export-menu')?.classList.remove('open'); });

    // Filter bar
    const applyFilters = () => { if (window.gantt) gantt.render(); };
    const fSearch = document.getElementById('filter-search');
    const fEstado = document.getElementById('filter-estado'); // this is now a hidden input
    const fResp   = document.getElementById('filter-responsable');
    const fProj   = document.getElementById('filter-proyecto');
    
    // Custom dropdown for Estado
    const btnFilterEstado = document.getElementById('btn-filter-estado');
    const menuFilterEstado = document.getElementById('menu-filter-estado');
    if (btnFilterEstado && menuFilterEstado && fEstado) {
      btnFilterEstado.addEventListener('click', (e) => {
        e.stopPropagation();
        menuFilterEstado.style.display = menuFilterEstado.style.display === 'none' ? 'flex' : 'none';
      });
      document.addEventListener('click', () => {
        menuFilterEstado.style.display = 'none';
      });
      menuFilterEstado.querySelectorAll('.fd-item').forEach(el => {
         el.addEventListener('click', (e) => {
            const val = e.currentTarget.getAttribute('data-value');
            fEstado.value = val;
            btnFilterEstado.innerHTML = val ? e.currentTarget.innerHTML : 'Estado';
            applyFilters();
         });
      });
    }

    if (fSearch) fSearch.addEventListener('input', applyFilters);
    if (fResp)   fResp.addEventListener('change', applyFilters);
    if (fProj)   fProj.addEventListener('change', applyFilters);
    
    const btnClears = document.querySelectorAll('.btn-filter-clear');
    btnClears.forEach(btnClear => {
      btnClear.addEventListener('click', () => {
        if (fSearch) fSearch.value = '';
        if (fEstado) fEstado.value = '';
        if (btnFilterEstado) btnFilterEstado.innerHTML = 'Estado';
        if (fResp) fResp.value = '';
        if (fProj) fProj.value = '';
        applyFilters();
      });
    });

    const setEstado = (val, html) => {
      if (fEstado) fEstado.value = val;
      if (btnFilterEstado) btnFilterEstado.innerHTML = html || val;
      applyFilters();
      window.scrollTo({top:0, behavior:'smooth'});
    };

    const statusRisk = document.getElementById('status-click-risk');
    if (statusRisk) statusRisk.addEventListener('click', () => {
      setEstado('Atrasada', '<span class="badge badge-retrasada" style="transform:scale(0.85); transform-origin:left; pointer-events:none;">Atrasada</span>');
    });
    
    const statusBlocked = document.getElementById('status-click-blocked');
    if (statusBlocked) statusBlocked.addEventListener('click', () => {
      setEstado('Bloqueada', '<span class="badge badge-bloqueada" style="transform:scale(0.85); transform-origin:left; pointer-events:none;">Bloqueada</span>');
    });

    // Gantt filter hook
    if (window.gantt) {
      gantt.attachEvent('onBeforeTaskDisplay', (id, task) => {
        const search = (document.getElementById('filter-search')?.value || '').toLowerCase();
        const estado = document.getElementById('filter-estado')?.value || '';
        const resp   = document.getElementById('filter-responsable')?.value || '';
        const proj   = document.getElementById('filter-proyecto')?.value || '';

        if (search && !(task.text || '').toLowerCase().includes(search)) return false;

        // Filtro por Estado (Autoritativo desde Backend)
        if (estado && task._estado !== estado) {
           return false;
        }

        if (resp && task.responsable !== resp) return false;
        if (proj && (task._projectName || '') !== proj) return false;

        return true;
      });
    }

    // Guardar proyecto
    const btnSaveProj = document.getElementById('btn-save-project');
    if (btnSaveProj) btnSaveProj.addEventListener('click', saveProject);

    // Guardar compra
    const btnSavePur = document.getElementById('btn-save-purchase');
    if (btnSavePur) btnSavePur.addEventListener('click', PurchaseModule.savePurchase);
    const btnDelPur = document.getElementById('btn-delete-purchase');
    if (btnDelPur) btnDelPur.addEventListener('click', PurchaseModule.deletePurchase);

    // Guardar nota
    const btnSaveNote = document.getElementById('btn-save-note');
    if (btnSaveNote) btnSaveNote.addEventListener('click', saveNote);

    // Cerrar modal al click fuera
    document.querySelectorAll('.modal-overlay').forEach(overlay =>
      overlay.addEventListener('click', e => {
        if (e.target === overlay) {
          overlay.classList.add('hidden');
          if (overlay.id === 'modal-task') editingTaskId = null;
          // Si se cierra haciendo click fuera de un sub-modal de edición desde Ajustes
          if ((overlay.id === 'modal-responsable' && editingResponsableId) ||
              (overlay.id === 'modal-recurso'     && editingRecursoId)) {
            document.getElementById('modal-config').classList.remove('hidden');
          }
          if (overlay.id === 'modal-responsable') editingResponsableId = null;
          if (overlay.id === 'modal-recurso')     editingRecursoId = null;
        }
      })
    );

    // Guardar Responsable / Recurso
    const btnAddResp = document.getElementById('btn-add-responsable');
    if (btnAddResp) btnAddResp.addEventListener('click', (e) => { e.preventDefault(); openResponsableModal(); });
    const btnSaveResp = document.getElementById('btn-save-responsable');
    if (btnSaveResp) btnSaveResp.addEventListener('click', saveResponsable);

    const btnAddRec = document.getElementById('btn-add-recurso');
    if (btnAddRec) btnAddRec.addEventListener('click', (e) => { e.preventDefault(); openRecursoModal(); });
    const btnSaveRec = document.getElementById('btn-save-recurso');
    if (btnSaveRec) btnSaveRec.addEventListener('click', saveRecurso);

    const btnConfig = document.getElementById('btn-config');
    if (btnConfig) btnConfig.addEventListener('click', openConfigModal);

    // Bootstrap config add buttons
    const btnAddRespConf = document.getElementById('btn-add-responsable-config');
    if (btnAddRespConf) btnAddRespConf.addEventListener('click', () => {
      openResponsableModal();
    });

    const btnAddRecConf = document.getElementById('btn-add-recurso-config');
    if (btnAddRecConf) btnAddRecConf.addEventListener('click', () => {
      openRecursoModal();
    });

    // Toggle color mode
    const btnToggleColor = document.getElementById('btn-toggle-color');
    if (btnToggleColor) {
      btnToggleColor.addEventListener('click', () => {
        GanttApp.toggleColorMode();
      });
    }

    // Config Tabs
    document.querySelectorAll('.config-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.config-tab').forEach(t => {
          t.classList.remove('active');
          t.style.borderBottomColor = 'transparent';
        });
        document.querySelectorAll('.config-tab-content').forEach(c => c.classList.add('hidden'));
        
        tab.classList.add('active');
        tab.style.borderBottomColor = 'var(--indigo)';
        document.getElementById(tab.dataset.tab).classList.remove('hidden');
      });
    });

    await loadProjects();
    setupPermissions();
    setupUsersAdmin();
  }

  function setupPermissions() {
    const user = Auth.getUser();
    if (!user) return;

    // Poblar información de usuario en la barra lateral
    const elName = document.getElementById('sidebar-user-name');
    if (elName) elName.textContent = user.nombre || 'Usuario';

    console.log("[Auth] Session User:", user.nombre, "| Admin:", user.es_admin);
    
    // Usar clase en body para control de visibilidad robusto vía CSS
    if (user.es_admin) {
      document.body.classList.add('is-admin');
    } else {
      document.body.classList.remove('is-admin');
      
      if (!Auth.hasPerm('CREATE')) {
        const btnNewProj = document.getElementById('btn-new-project');
        const btnNewTask = document.getElementById('btn-new-task');
        if (btnNewProj) btnNewProj.style.display = 'none';
        if (btnNewTask) btnNewTask.style.display = 'none';
        // También ocultar el botón general de "Nuevo" en el sidebar si no tiene permisos
        const btnNewGroup = document.getElementById('btn-new-dropdown');
        if (btnNewGroup) btnNewGroup.style.display = 'none';
      }
    }
  }

  function setupUsersAdmin() {
    document.getElementById('btn-logout').addEventListener('click', async () => {
      const agreed = await showConfirm('Cerrar Sesión', '¿Estás seguro que deseas desconectarte?', 'Cerrar sesión');
      if (agreed) Auth.logout();
    });

    const btnAdminUsers = document.getElementById('btn-admin-users');
    const modalUsers = document.getElementById('modal-users');
    const modalUserForm = document.getElementById('modal-user-form');
    const formUser = document.getElementById('form-user');

    if (!btnAdminUsers) return;

    btnAdminUsers.addEventListener('click', async () => {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('hidden'));
      modalUsers.classList.remove('hidden');
      await loadUsersTable();
    });

    document.getElementById('btn-close-users').addEventListener('click', () => modalUsers.classList.add('hidden'));
    document.getElementById('btn-close-user-form').addEventListener('click', () => modalUserForm.classList.add('hidden'));
    document.getElementById('btn-cancel-user').addEventListener('click', () => modalUserForm.classList.add('hidden'));

    document.getElementById('btn-new-user').addEventListener('click', () => {
      formUser.reset();
      document.getElementById('user-id').value = '';
      document.getElementById('user-is-admin').checked = false;
      document.getElementById('user-form-title').textContent = 'Nuevo Usuario';
      document.querySelectorAll('.user-perm').forEach(c => c.checked = false);
      renderUserProjectsChecks('');
      modalUserForm.classList.remove('hidden');
    });

    formUser.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('user-id').value;
      const data = {
        nombre: document.getElementById('user-nombre').value,
        email: document.getElementById('user-email').value,
        password: document.getElementById('user-password').value,
        es_admin: document.getElementById('user-is-admin').checked,
        permisos: Array.from(document.querySelectorAll('.user-perm:checked')).map(c => c.value).join(','),
        proyectos: document.getElementById('user-proj-all').checked ? 'ALL' : Array.from(document.querySelectorAll('.user-proj-chk:checked')).map(c => c.value).join(','),
        activo: true
      };
      
      try {
        if (id) await API.updateUser(id, data);
        else await API.createUser(data);
        
        toast('Usuario guardado', 'success');
        modalUserForm.classList.add('hidden');
        await loadUsersTable();
      } catch (err) {
        toast(err.error || 'Error al guardar usuario', 'error');
      }
    });
  }

  async function loadUsersTable() {
    try {
      const users = await API.getUsers();
      const tbody = document.getElementById('users-tbody');
      tbody.innerHTML = users.map(u => `
        <tr style="border-bottom:1px solid var(--border)">
          <td>${u.nombre} ${u.es_admin ? '👑' : ''}</td>
          <td>${u.email}</td>
          <td><span style="font-size:10px; padding:2px 6px; background:var(--bg-dark); border-radius:4px">${u.permisos}</span></td>
          <td style="text-align:right">
            <button class="btn btn-ghost btn-sm" onclick="UI.editUser(${u.id_usuario})" style="padding:2px 6px">✏️</button>
            <button class="btn btn-ghost btn-sm" onclick="UI.deleteUser(${u.id_usuario})" style="padding:2px 6px;color:var(--danger)">🗑️</button>
          </td>
        </tr>
      `).join('');
      
      // Adjuntamos globalmente para poder llamarlos desde el inline onclick
      window.loadedUsers = users;
    } catch (e) {
      toast('Error al cargar usuarios', 'error');
    }
  }

  function editUser(id) {
    const u = window.loadedUsers.find(x => x.id_usuario == id);
    if (!u) return;
    
    document.getElementById('form-user').reset();
    document.getElementById('user-id').value = u.id_usuario;
    document.getElementById('user-nombre').value = u.nombre;
    document.getElementById('user-email').value = u.email;
    document.getElementById('user-password').value = '';
    document.getElementById('user-is-admin').checked = !!u.es_admin;
    document.getElementById('user-form-title').textContent = 'Editar Usuario';
    
    const pUser = (u.permisos || '').split(',');
    document.querySelectorAll('.user-perm').forEach(c => c.checked = pUser.includes(c.value));
    
    renderUserProjectsChecks(u.proyectos || '');
    
    document.getElementById('modal-user-form').classList.remove('hidden');
  }

  async function deleteUser(id) {
    const agreed = await showConfirm('Eliminar Usuario', '¿Estás seguro de eliminar este usuario?', 'Eliminar cuenta');
    if (!agreed) return;
    try {
      await API.deleteUser(id);
      toast('Usuario eliminado', 'success');
      await loadUsersTable();
    } catch (e) {
      toast(e.error || 'Error al eliminar usuario', 'error');
    }
  }

  function renderUserProjectsChecks(selected) {
    const list = document.getElementById('user-proj-checks');
    const chkAll = document.getElementById('user-proj-all');
    
    if (selected === 'ALL') {
      chkAll.checked = true;
    } else {
      chkAll.checked = false;
    }
    
    const selIds = (selected || '').split(',').map(Number);
    list.innerHTML = projects.map(p => `
      <label style="display:block; margin-left:15px; font-size:12px;">
        <input type="checkbox" class="user-proj-chk" value="${p.id_proyecto}" ${selIds.includes(p.id_proyecto) ? 'checked' : ''} ${selected === 'ALL' ? 'disabled' : ''}>
        ${p.nombre_proyecto}
      </label>
    `).join('');
    
    chkAll.onchange = (e) => {
      document.querySelectorAll('.user-proj-chk').forEach(c => {
        c.disabled = e.target.checked;
        if(e.target.checked) c.checked = false;
      });
    };
  }

  return {
    init, toast, openTaskModal, confirmDelete, deleteTask,
    openNotesModal, deleteNote, selectProject, renderProjectList,
    editResponsable, deleteResponsable: reqDeleteResponsable,
    editRecurso, deleteRecurso: reqDeleteRecurso,
    openSubrespModal,
    saveSubresp,
    editSubresp: (id) => {
      const s = subresponsables.find(x => x.id_subresp == id);
      if (s) openSubrespModal(s.id_lead, id);
    },
    deleteSubresp: reqDeleteSubresp,
    editUser, deleteUser,
    getResponsables: () => responsables,
    getSubresponsables: () => subresponsables,
    getProjects: () => projects,
    getAllTasks: () => allTasks,
    getResponsableName: PurchaseModule.getResponsableName,
    openPurchaseModal: PurchaseModule.openPurchaseModal
  };
})();

// ── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const loggedIn = await Auth.init();
  if (!loggedIn) return;

  GanttApp.init();
  await UI.init();
});
