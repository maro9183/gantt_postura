/* ============================================================
   EXPORTS — PDF (Gantt image) & CSV / Excel data export
   ============================================================ */
window.Exports = (() => {

  /* ── helpers ─────────────────────────────────────────────── */
  function projectName() {
    return (document.getElementById('project-title')?.textContent || 'Gantt').trim();
  }

  function fileDate() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  }

  function sanitize(name) {
    return name.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ _-]/g, '').substring(0, 60);
  }

  /* ── Collect task rows from gantt ───────────────────────── */
  function collectRows() {
    const ids = gantt.getTaskByTime().map(t => t.id);
    const fmt = d => d ? `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}` : '';
    return ids.map(id => {
      const t = gantt.getTask(id);
      const raw = t._raw || {};
      const avance = Math.round((t.progress || 0) * 100);
      return {
        'Proyecto':     raw._projectName || t._projectName || projectName(),
        'Código':       raw._projectCode || t._projectCode || '',
        'Tarea':        t.text || '',
        'Responsable':  raw.responsable || t.responsable || '',
        'Inicio':       fmt(t.start_date),
        'Fin':          t.end_date ? fmt(new Date(t.end_date.getTime() - 86400000)) : '',
        'Días':         parseInt(t.duration) || 1,
        'Tipo Días':    raw.tipo_dias || t._tipo_dias || 'calendario',
        'Avance %':     avance,
        'Estado':       raw.estado || t._estado || '',
        'Costo':        parseFloat(raw.costo_tarea || t._costo || 0),
        'Descripción':  raw.descripcion || ''
      };
    });
  }

  /* ═════════════════════════════════════════════════════════
     CSV Export
     ═════════════════════════════════════════════════════════ */
  function exportCSV() {
    const rows = collectRows();
    if (!rows.length) { UI.toast('No hay datos para exportar', 'warning'); return; }

    const headers = Object.keys(rows[0]);
    const csvLines = [
      headers.join(';'),
      ...rows.map(r => headers.map(h => {
        let v = r[h];
        if (typeof v === 'string') v = `"${v.replace(/"/g, '""')}"`;
        return v;
      }).join(';'))
    ];

    const BOM = '\uFEFF'; // para que Excel interprete UTF-8
    const blob = new Blob([BOM + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    download(blob, `${sanitize(projectName())}_${fileDate()}.csv`);
    UI.toast('CSV exportado ✅', 'success');
  }

  /* ═════════════════════════════════════════════════════════
     Excel (XLSX) Export — uses SheetJS (CDN loaded)
     ═════════════════════════════════════════════════════════ */
  async function exportExcel() {
    const rows = collectRows();
    if (!rows.length) { UI.toast('No hay datos para exportar', 'warning'); return; }

    // Garantizar que SheetJS esté cargado
    if (typeof XLSX === 'undefined') {
      UI.toast('Cargando librería Excel…', 'info');
      await loadScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');
    }

    const ws = XLSX.utils.json_to_sheet(rows);

    /* ── Column widths ─────────────────────────────────── */
    ws['!cols'] = [
      { wch: 25 },  // Proyecto
      { wch: 10 },  // Código
      { wch: 35 },  // Tarea
      { wch: 22 },  // Responsable
      { wch: 12 },  // Inicio
      { wch: 12 },  // Fin
      { wch: 7 },   // Días
      { wch: 12 },  // Tipo Días
      { wch: 10 },  // Avance %
      { wch: 14 },  // Estado
      { wch: 12 },  // Costo
      { wch: 30 },  // Descripción
    ];

    const wb = XLSX.utils.book_new();
    const sheetName = sanitize(projectName()).substring(0, 31) || 'Datos';
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `${sanitize(projectName())}_${fileDate()}.xlsx`);
    UI.toast('Excel exportado ✅', 'success');
  }

  /* ── Trim whitespace from right + bottom of a canvas ────── */
  function trimCanvas(srcCanvas) {
    const ctx = srcCanvas.getContext('2d');
    const w = srcCanvas.width;
    const h = srcCanvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const px = imgData.data;

    const isWhite = (idx) => px[idx] >= 248 && px[idx+1] >= 248 && px[idx+2] >= 248;

    // Scan from right to find last column with content
    let rightBound = w;
    for (let x = w - 1; x >= 0; x--) {
      for (let y = 0; y < h; y += 3) {
        if (!isWhite((y * w + x) * 4)) { rightBound = Math.min(x + 15, w); x = -1; break; }
      }
    }

    // Scan from bottom to find last row with content
    let bottomBound = h;
    for (let y = h - 1; y >= 0; y--) {
      for (let x = 0; x < w; x += 3) {
        if (!isWhite((y * w + x) * 4)) { bottomBound = Math.min(y + 15, h); y = -1; break; }
      }
    }

    if (rightBound < w - 10 || bottomBound < h - 10) {
      const tw = Math.min(rightBound, w);
      const th = Math.min(bottomBound, h);
      const trimmed = document.createElement('canvas');
      trimmed.width = tw;
      trimmed.height = th;
      trimmed.getContext('2d').drawImage(srcCanvas, 0, 0, tw, th, 0, 0, tw, th);
      return trimmed;
    }
    return srcCanvas;
  }

  /* ═════════════════════════════════════════════════════════
     PDF Export — Gantt image (light theme) + Task list table
     Uses html2canvas + jsPDF + jspdf-autotable
     ═════════════════════════════════════════════════════════ */

  /* Light-theme CSS injected temporarily for PDF capture */
  const PRINT_CSS = `
    .gantt_container, .gantt_grid, .gantt_task,
    .gantt_grid_scale, .gantt_task_scale,
    .gantt_grid_data, .gantt_task_bg {
      background: #ffffff !important;
      color: #1f2937 !important;
      border-color: #d1d5db !important;
    }
    .gantt_scale_cell, .gantt_grid_head_cell, .gantt_scale_line {
      background: #f3f4f6 !important;
      color: #374151 !important;
      border-color: #d1d5db !important;
    }
    .gantt_row, .gantt_row.gantt_row_task {
      background: #ffffff !important;
      border-color: #e5e7eb !important;
      color: #1f2937 !important;
    }
    .gantt_row.odd { background: #f9fafb !important; }
    .gantt_task_cell { background: #ffffff !important; border-color: #f3f4f6 !important; }
    .gantt_cell { color: #1f2937 !important; border-color: #e5e7eb !important; }
    .gantt_task_line .gantt_task_content { color: #fff !important; }
    .gantt_line_wrapper div { background: #9ca3af !important; }
    .gantt_link_arrow { border-color: #9ca3af !important; }
    .gantt_task_row { border-color: #e5e7eb !important; }
    .gantt_task_row.odd { background: #f9fafb !important; }
    .gantt_marker.today-marker { background: #6366f1 !important; opacity: 0.8; }
    .gantt_marker_content { background: #6366f1 !important; color: #fff !important; }
    .badge { font-size: 9px !important; }
    .badge-no-comenzada { background: #e5e7eb !important; color: #6b7280 !important; }
    .badge-en-progreso  { background: #fef3c7 !important; color: #d97706 !important; }
    .badge-finalizada   { background: #d1fae5 !important; color: #059669 !important; }
    .gantt_ver_scroll, .gantt_hor_scroll { display: none !important; }
  `;

  async function exportPDF() {
    const rows = collectRows();
    if (!rows.length) { UI.toast('No hay datos para exportar', 'warning'); return; }

    const ganttEl = document.getElementById('gantt_here');
    if (!ganttEl) { UI.toast('No se encontró el Gantt', 'error'); return; }

    UI.toast('Generando PDF… Esto puede tardar unos segundos.', 'info');

    // Asegurar librerías
    try {
      if (typeof html2canvas === 'undefined') {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      }
      if (!window.jspdf && !window.jsPDF) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      }
      if (!window.jspdf?.jsPDF?.API?.autoTable && !window.jsPDF?.API?.autoTable) {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
      }
    } catch (loadErr) {
      console.error('Error loading PDF libs:', loadErr);
      UI.toast('No se pudieron cargar las librerías para PDF. Verificá tu conexión.', 'error');
      return;
    }

    try {
      // ── 1) CAPTURE GANTT IMAGE ────────────────────────────
      const container = ganttEl.querySelector('.gantt_container') || ganttEl;

      // Inject light theme
      const styleEl = document.createElement('style');
      styleEl.id = 'gantt-print-theme';
      styleEl.textContent = PRINT_CSS;
      document.head.appendChild(styleEl);

      // Save originals
      const origAutosize   = gantt.config.autosize;
      const origFitTasks   = gantt.config.fit_tasks;
      const origStartDate  = gantt.config.start_date;
      const origEndDate    = gantt.config.end_date;
      const origScales     = gantt.config.scales;
      const origShowGrid   = gantt.config.show_grid;
      const origColumns    = gantt.config.columns;
      const origHeight     = ganttEl.style.height;
      const origWidth      = ganttEl.style.width;
      const origMinWidth   = ganttEl.style.minWidth;
      const origOverflow   = ganttEl.style.overflow;
      const origContH      = container.style.height;
      const origContW      = container.style.width;
      const origContMinW   = container.style.minWidth;
      const origContOvf    = container.style.overflow;
      const origContPos    = container.style.position;

      // Compute tight date range from actual tasks (small padding)
      const allTasks = gantt.getTaskByTime();
      if (allTasks.length) {
        let minDate = allTasks[0].start_date;
        let maxDate = allTasks[0].end_date;
        allTasks.forEach(t => {
          if (t.start_date < minDate) minDate = t.start_date;
          if (t.end_date > maxDate)   maxDate = t.end_date;
        });
        const padStart = new Date(minDate);
        padStart.setDate(padStart.getDate() - 3);
        const padEnd = new Date(maxDate);
        padEnd.setDate(padEnd.getDate() + 7);
        gantt.config.start_date = padStart;
        gantt.config.end_date   = padEnd;
      }

      // Expand gantt to show ALL rows (no scrollbar)
      const taskCount = allTasks.length;
      const rowH = gantt.config.row_height || 42;
      const scaleH = gantt.config.scale_height || 50;
      const neededH = scaleH + (taskCount * rowH) + 20;

      // Switch to month scale for compact PDF view
      gantt.config.scales = [
        { unit: 'year',  step: 1, format: '%Y' },
        { unit: 'month', step: 1, format: '%F' }
      ];
      gantt.config.autosize = 'xy';
      gantt.config.fit_tasks = false; // we use explicit dates
      gantt.config.show_grid = true; // ensure grid with task names is visible
      if (origColumns && origColumns.length > 0) {
        gantt.config.columns = [origColumns[0]]; // Only show Task Name
      }

      // Set a generous initial width
      const bigWidth = 2000;
      ganttEl.style.width = bigWidth + 'px';
      ganttEl.style.minWidth = bigWidth + 'px';
      ganttEl.style.height = neededH + 'px';
      ganttEl.style.overflow = 'visible';
      container.style.width = bigWidth + 'px';
      container.style.minWidth = bigWidth + 'px';
      container.style.height = neededH + 'px';
      container.style.overflow = 'visible';
      container.style.position = 'relative';
      gantt.render();

      // Wait for repaint
      await new Promise(r => setTimeout(r, 500));

      // Measure actual rendered content
      const fullW = Math.max(container.scrollWidth, container.offsetWidth, bigWidth);
      const fullH = Math.max(container.scrollHeight, container.offsetHeight, neededH);
      ganttEl.style.width = fullW + 'px';
      ganttEl.style.minWidth = fullW + 'px';
      container.style.width = fullW + 'px';
      container.style.minWidth = fullW + 'px';

      // Brief repaint after resize
      await new Promise(r => setTimeout(r, 200));

      let canvas = await html2canvas(container, {
        scale: 1.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: fullW,
        height: fullH
      });

      // Trim whitespace so the image fills the PDF page
      canvas = trimCanvas(canvas);

      // Restore everything
      styleEl.remove();
      ganttEl.style.height   = origHeight;
      ganttEl.style.width    = origWidth || '';
      ganttEl.style.minWidth = origMinWidth || '';
      ganttEl.style.overflow = origOverflow;
      container.style.height   = origContH;
      container.style.width    = origContW || '';
      container.style.minWidth = origContMinW || '';
      container.style.overflow = origContOvf;
      container.style.position = origContPos || '';
      gantt.config.autosize    = origAutosize;
      gantt.config.fit_tasks   = origFitTasks;
      gantt.config.start_date  = origStartDate;
      gantt.config.end_date    = origEndDate;
      gantt.config.scales      = origScales;
      gantt.config.show_grid   = origShowGrid;
      gantt.config.columns     = origColumns;
      gantt.render();

      // ── 2) BUILD PDF ──────────────────────────────────────
      const JsPDFClass = window.jspdf ? window.jspdf.jsPDF : window.jsPDF;
      const pdf = new JsPDFClass({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 10;

      // ── Colors ──
      const primaryColor = [99, 102, 241];
      const headerBg     = [55, 65, 81];
      const headerText   = [255, 255, 255];
      const bodyText     = [31, 41, 55];
      const altRowBg     = [243, 244, 246];
      const borderColor  = [209, 213, 219];

      // ── HEADER REPLICATION ──
      // Capture the Gantt header slice (grid titles + scale) from the top of the canvas
      const pxPerMm = canvas.width / (pageW - margin * 2);
      const headerPxH = (scaleH + 2) * 1.5; // +2 for border, *1.5 for scale
      const headerMmH = headerPxH / pxPerMm;

      const headerCanvas = document.createElement('canvas');
      headerCanvas.width  = canvas.width;
      headerCanvas.height = headerPxH;
      headerCanvas.getContext('2d').drawImage(canvas, 0, 0, canvas.width, headerPxH, 0, 0, canvas.width, headerPxH);
      const headerImg = headerCanvas.toDataURL('image/png');

      // ── THE REPORT HEADER (Page 1 only) ──
      pdf.setFillColor(...primaryColor);
      pdf.rect(0, 0, pageW, 20, 'F');
      pdf.setFontSize(14);
      pdf.setTextColor(255, 255, 255);
      pdf.setFont(undefined, 'bold');
      pdf.text(projectName(), margin, 10);
      pdf.setFontSize(8);
      pdf.setTextColor(220, 220, 255);
      pdf.setFont(undefined, 'normal');
      pdf.text(`Exportado: ${new Date().toLocaleString('es-AR')}  •  ${rows.length} tarea${rows.length > 1 ? 's' : ''}`, margin, 16);

      // ── GANTT IMAGE PAGINATION ──
      const imgData = canvas.toDataURL('image/png');
      const imgW = canvas.width;
      const imgH = canvas.height;
      const usableW = pageW - margin * 2;
      const usableH = pageH - margin * 2;
      const ganttStartY = 24;
      const scaledH = imgH / pxPerMm;

      if (scaledH <= (pageH - ganttStartY - margin)) {
        // Fits fully on first page
        pdf.addImage(imgData, 'PNG', margin, ganttStartY, usableW, scaledH);
      } else {
        // Multi-page logic
        let yPx = 0;
        let pageNum = 0;

        while (yPx < imgH) {
          if (pageNum > 0) pdf.addPage();
          
          const isFirst    = (pageNum === 0);
          const currentY   = isFirst ? ganttStartY : margin + 8;
          const maxAvailMm = isFirst ? (pageH - ganttStartY - margin) : (pageH - margin * 2 - 10);

          if (!isFirst) {
            // Repeat small title
            pdf.setFontSize(7);
            pdf.setTextColor(160, 160, 170);
            pdf.text(`${projectName()} — Diagrama de Gantt (cont.)`, margin, margin + 4);
            
            // PREPEND Header image
            pdf.addImage(headerImg, 'PNG', margin, currentY, usableW, headerMmH);
          }

          // Slice task rows
          // If NOT first page, we skip the header part of the slice in the canvas by adding headerPxH
          const taskSliceYOffset = isFirst ? 0 : headerPxH; // visual offset for placement
          const slicePxYStart = isFirst ? 0 : Math.max(headerPxH, yPx);
          const sliceMmHAvailable = isFirst ? maxAvailMm : (maxAvailMm - headerMmH);
          const slicePxHAvailable = sliceMmHAvailable * pxPerMm;
          const slicePxHToDraw    = Math.min(slicePxHAvailable, imgH - slicePxYStart);
          const sliceMmHToDraw    = slicePxHToDraw / pxPerMm;

          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width  = imgW;
          sliceCanvas.height = slicePxHToDraw;
          const ctx = sliceCanvas.getContext('2d');
          ctx.drawImage(canvas, 0, slicePxYStart, imgW, slicePxHToDraw, 0, 0, imgW, slicePxHToDraw);

          const sliceImg = sliceCanvas.toDataURL('image/png');
          const placementY = isFirst ? currentY : (currentY + headerMmH);
          
          pdf.addImage(sliceImg, 'PNG', margin, placementY, usableW, sliceMmHToDraw);
          
          // Advance yPx
          if (isFirst) {
            yPx = slicePxHToDraw;
          } else {
            yPx += slicePxHToDraw;
          }
          pageNum++;
        }
      }

      // ── 3) TASK LIST TABLE (new page) ─────────────────────
      pdf.addPage();

      // Table header bar
      pdf.setFillColor(...primaryColor);
      pdf.rect(0, 0, pageW, 18, 'F');
      pdf.setFontSize(13);
      pdf.setTextColor(255, 255, 255);
      pdf.setFont(undefined, 'bold');
      pdf.text(`${projectName()} — Listado de Tareas`, margin, 10);
      pdf.setFontSize(8);
      pdf.setTextColor(220, 220, 255);
      pdf.setFont(undefined, 'normal');
      pdf.text(`${rows.length} tarea${rows.length > 1 ? 's' : ''}  •  ${new Date().toLocaleDateString('es-AR')}`, margin, 15);

      // Table columns
      const columns = [
        { header: 'Proyecto',     dataKey: 'proyecto' },
        { header: 'Tarea',        dataKey: 'tarea' },
        { header: 'Responsable',  dataKey: 'responsable' },
        { header: 'Inicio',       dataKey: 'inicio' },
        { header: 'Fin',          dataKey: 'fin' },
        { header: 'Días',         dataKey: 'dias' },
        { header: 'Avance',       dataKey: 'avance' },
        { header: 'Estado',       dataKey: 'estado' },
        { header: 'Costo',        dataKey: 'costo' }
      ];

      const tableData = rows.map(r => ({
        proyecto:    r['Proyecto'],
        tarea:       r['Tarea'],
        responsable: r['Responsable'] || '—',
        inicio:      r['Inicio'],
        fin:         r['Fin'],
        dias:        `${r['Días']} (${(r['Tipo Días'] || 'cal').substring(0, 3)})`,
        avance:      `${r['Avance %']}%`,
        estado:      r['Estado'],
        costo:       r['Costo'] > 0 ? '$' + r['Costo'].toLocaleString('es-AR', { maximumFractionDigits: 0 }) : '—'
      }));

      pdf.autoTable({
        columns,
        body: tableData,
        startY: 22,
        margin: { left: margin, right: margin },
        styles: {
          fontSize: 8,
          cellPadding: 3,
          lineColor: borderColor,
          lineWidth: 0.2,
          textColor: bodyText,
          font: 'helvetica',
          overflow: 'linebreak'
        },
        headStyles: {
          fillColor: headerBg,
          textColor: headerText,
          fontSize: 8,
          fontStyle: 'bold',
          halign: 'center',
          cellPadding: 4
        },
        columnStyles: {
          proyecto:    { cellWidth: 35 },
          tarea:       { cellWidth: 55 },
          responsable: { cellWidth: 30 },
          inicio:      { cellWidth: 22, halign: 'center' },
          fin:         { cellWidth: 22, halign: 'center' },
          dias:        { cellWidth: 22, halign: 'center' },
          avance:      { cellWidth: 16, halign: 'center' },
          estado:      { cellWidth: 26, halign: 'center' },
          costo:       { cellWidth: 22, halign: 'right' }
        },
        alternateRowStyles: {
          fillColor: altRowBg
        },
        didParseCell: (data) => {
          if (data.column.dataKey === 'estado' && data.section === 'body') {
            const val = data.cell.raw || '';
            if (val === 'Finalizada') {
              data.cell.styles.textColor = [16, 185, 129];
              data.cell.styles.fontStyle = 'bold';
            } else if (val === 'En progreso') {
              data.cell.styles.textColor = [245, 158, 11];
              data.cell.styles.fontStyle = 'bold';
            } else if (val === 'No comenzada') {
              data.cell.styles.textColor = [107, 114, 128];
            }
          }
          if (data.column.dataKey === 'avance' && data.section === 'body') {
            const pct = parseInt(data.cell.raw) || 0;
            if (pct >= 100)     data.cell.styles.textColor = [16, 185, 129];
            else if (pct > 0)   data.cell.styles.textColor = [245, 158, 11];
            else                data.cell.styles.textColor = [107, 114, 128];
          }
        }
      });

      // ── 4) PAGE NUMBERS (all pages) ───────────────────────
      const totalPages = pdf.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(7);
        pdf.setTextColor(160, 160, 170);
        pdf.text(
          `${projectName()} — Página ${i} de ${totalPages}`,
          pageW / 2, pageH - 5,
          { align: 'center' }
        );
      }

      pdf.save(`${sanitize(projectName())}_${fileDate()}.pdf`);
      UI.toast('PDF exportado ✅', 'success');
    } catch (e) {
      console.error('PDF export error:', e);
      UI.toast('Error al generar el PDF: ' + (e.message || e), 'error');
    }
  }

  /* ── Dynamic script loader ─────────────────────────────── */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      document.head.appendChild(s);
    });
  }

  /* ── Download helper ───────────────────────────────────── */
  function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }

  /* ── Export Menu toggle ────────────────────────────────── */
  function toggleMenu() {
    const menu = document.getElementById('export-menu');
    if (!menu) return;
    menu.classList.toggle('open');

    // Close on outside click
    if (menu.classList.contains('open')) {
      const handler = e => {
        if (!menu.contains(e.target) && e.target.id !== 'btn-export') {
          menu.classList.remove('open');
          document.removeEventListener('click', handler);
        }
      };
      setTimeout(() => document.addEventListener('click', handler), 0);
    }
  }

  return { exportPDF, exportCSV, exportExcel, toggleMenu };
})();
