const express = require('express');
const router  = express.Router();
const { getPool } = require('../db');
const { requirePermission } = require('../middleware/auth');

// GET /api/projects
router.get('/', async (req, res) => {
  try {
    let sql = 'SELECT * FROM proyectos ORDER BY id_proyecto';
    let params = [];
    
    // Filtro por usuario
    if (req.user && req.user.proyectos !== 'ALL') {
      const allowedIds = req.user.proyectos.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
      if (allowedIds.length === 0) return res.json([]); // Ningun proyecto disponible
      
      sql = `SELECT * FROM proyectos WHERE id_proyecto IN (${allowedIds.join(',')}) ORDER BY id_proyecto`;
    }
    
    const [rows] = await getPool().execute(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/projects/:id/tasks
router.get('/:id/tasks', async (req, res) => {
  try {
    const [rows] = await getPool().execute(
      'SELECT * FROM tareas WHERE id_proyecto = ? ORDER BY fecha_inicio, id_tarea',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/projects
router.post('/', requirePermission('CREATE'), async (req, res) => {
  try {
    const { proyecto, nombre_proyecto, descripcion, color = '#6366f1' } = req.body;
    if (!proyecto || !nombre_proyecto)
      return res.status(400).json({ error: 'proyecto y nombre_proyecto requeridos' });
    const [r] = await getPool().execute(
      'INSERT INTO proyectos (proyecto, nombre_proyecto, descripcion, color) VALUES (?,?,?,?)',
      [proyecto, nombre_proyecto, descripcion || null, color]
    );
    const [np] = await getPool().execute('SELECT * FROM proyectos WHERE id_proyecto = ?', [r.insertId]);
    res.status(201).json(np[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/projects/:id
router.put('/:id', requirePermission('UPDATE'), async (req, res) => {
  try {
    const { proyecto, nombre_proyecto, descripcion, color } = req.body;
    await getPool().execute(
      'UPDATE proyectos SET proyecto=?, nombre_proyecto=?, descripcion=?, color=? WHERE id_proyecto=?',
      [proyecto, nombre_proyecto, descripcion || null, color, req.params.id]
    );
    const [up] = await getPool().execute('SELECT * FROM proyectos WHERE id_proyecto = ?', [req.params.id]);
    res.json(up[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/projects/:id
router.delete('/:id', requirePermission('DELETE'), async (req, res) => {
  try {
    await getPool().execute('DELETE FROM proyectos WHERE id_proyecto = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
