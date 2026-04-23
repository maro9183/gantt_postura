const express = require('express');
const router  = express.Router();
const { getPool } = require('../db');

router.get('/', async (req, res) => {
  try {
    const [rows] = await getPool().execute('SELECT * FROM recursos ORDER BY nombre');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { nombre, area, rol, valor_hora = 0 } = req.body;
    const [r] = await getPool().execute(
      'INSERT INTO recursos (nombre, area, rol, valor_hora) VALUES (?,?,?,?)',
      [nombre, area || null, rol || null, valor_hora]
    );
    const [nr] = await getPool().execute('SELECT * FROM recursos WHERE id_recurso = ?', [r.insertId]);
    res.status(201).json(nr[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { nombre, area, rol, valor_hora } = req.body;
    await getPool().execute(
      'UPDATE recursos SET nombre=?, area=?, rol=?, valor_hora=? WHERE id_recurso=?',
      [nombre, area || null, rol || null, valor_hora || 0, req.params.id]
    );
    const [up] = await getPool().execute('SELECT * FROM recursos WHERE id_recurso = ?', [req.params.id]);
    res.json(up[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await getPool().execute('DELETE FROM recursos WHERE id_recurso = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
