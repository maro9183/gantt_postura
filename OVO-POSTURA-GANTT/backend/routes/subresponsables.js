const express = require('express');
const router  = express.Router();
const { getPool } = require('../db');

// Listar todos los subresponsables (opcionalmente filtrados por líder)
router.get('/', async (req, res) => {
  try {
    const { leadId } = req.query;
    let sql = 'SELECT * FROM subresponsables';
    let params = [];
    if (leadId) {
      sql += ' WHERE id_lead = ?';
      params.push(leadId);
    }
    sql += ' ORDER BY nombre';
    const [rows] = await getPool().execute(sql, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { id_lead, nombre, correo } = req.body;
    if (!id_lead || !nombre || !correo) return res.status(400).json({ error: 'Faltan campos' });

    const [r] = await getPool().execute(
      'INSERT INTO subresponsables (id_lead, nombre, correo) VALUES (?,?,?)',
      [id_lead, nombre, correo]
    );
    const [nr] = await getPool().execute('SELECT * FROM subresponsables WHERE id_subresp = ?', [r.insertId]);
    res.status(201).json(nr[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { nombre, correo } = req.body;
    await getPool().execute(
      'UPDATE subresponsables SET nombre=?, correo=? WHERE id_subresp=?',
      [nombre, correo, req.params.id]
    );
    const [up] = await getPool().execute('SELECT * FROM subresponsables WHERE id_subresp = ?', [req.params.id]);
    res.json(up[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await getPool().execute('DELETE FROM subresponsables WHERE id_subresp = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
