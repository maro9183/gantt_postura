const express = require('express');
const router  = express.Router();
const { getPool } = require('../db');

router.get('/', async (req, res) => {
  try {
    const [rows] = await getPool().execute('SELECT * FROM responsables ORDER BY nombre');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { nombre, correo, rol, equipo, foto } = req.body;
    const [r] = await getPool().execute(
      'INSERT INTO responsables (nombre, correo, rol, equipo, foto) VALUES (?,?,?,?,?)',
      [nombre, correo, rol || null, equipo || null, foto || null]
    );
    const [nr] = await getPool().execute('SELECT * FROM responsables WHERE id_resp = ?', [r.insertId]);
    res.status(201).json(nr[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { nombre, correo, rol, equipo, foto } = req.body;
    await getPool().execute(
      'UPDATE responsables SET nombre=?, correo=?, rol=?, equipo=?, foto=? WHERE id_resp=?',
      [nombre, correo, rol || null, equipo || null, foto || null, req.params.id]
    );
    const [up] = await getPool().execute('SELECT * FROM responsables WHERE id_resp = ?', [req.params.id]);
    res.json(up[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await getPool().execute('DELETE FROM responsables WHERE id_resp = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
