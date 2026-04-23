const express = require('express');
const router  = express.Router();
const { getPool } = require('../db');

// POST /api/notes
router.post('/', async (req, res) => {
  try {
    const { tarea, nota, adjunto, link, autor } = req.body;
    if (!tarea) return res.status(400).json({ error: 'tarea requerida' });
    const [r] = await getPool().execute(
      'INSERT INTO notas (tarea, nota, adjunto, link, autor) VALUES (?,?,?,?,?)',
      [tarea, nota || null, adjunto || null, link || null, autor || null]
    );
    const [nr] = await getPool().execute('SELECT * FROM notas WHERE id_nota = ?', [r.insertId]);
    res.status(201).json(nr[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/notes/:id
router.delete('/:id', async (req, res) => {
  try {
    await getPool().execute('DELETE FROM notas WHERE id_nota = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
