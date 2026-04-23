const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getPool } = require('../db');
const { requireAuth, requirePermission } = require('../middleware/auth');

// Solo Administradores del Sistema pueden gestionar usuarios
const requireAdmin = (req, res, next) => {
  if (req.user.es_admin === true || req.user.es_admin === 1) return next();
  return res.status(403).json({ error: 'Permisos insuficientes. Se requiere rol de Administrador.' });
};

router.use(requireAuth);
router.use(requireAdmin);

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const db = getPool();
    const [rows] = await db.query('SELECT id_usuario, email, nombre, permisos, proyectos, es_admin, activo, fecha_creacion FROM usuarios ORDER BY nombre ASC');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// POST /api/users
router.post('/', async (req, res) => {
  const { email, password, nombre, permisos, proyectos, es_admin } = req.body;
  if (!email || !password || !nombre) return res.status(400).json({ error: 'Mail, password y nombre son requeridos' });

  try {
    const db = getPool();
    const [existing] = await db.query('SELECT id_usuario FROM usuarios WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(400).json({ error: 'El email ya existe' });

    const hash = await bcrypt.hash(password, 10);
    const pms = permisos || 'READ';
    const proys = proyectos || '';
    const isAdmin = es_admin ? 1 : 0;

    const [result] = await db.query(
      'INSERT INTO usuarios (email, password_hash, nombre, permisos, proyectos, es_admin) VALUES (?, ?, ?, ?, ?, ?)',
      [email, hash, nombre, pms, proys, isAdmin]
    );
    res.json({ id: result.insertId, email, nombre, permisos: pms, proyectos: proys, es_admin: isAdmin });
  } catch (e) {
    res.status(500).json({ error: 'Error al crear usuario' });
  }
});

// PUT /api/users/:id
router.put('/:id', async (req, res) => {
  const userId = req.params.id;
  const { nombre, permisos, proyectos, activo, password, es_admin } = req.body;
  
  try {
    const db = getPool();
    
    // Updates basico sin contraseña
    const isAdmin = es_admin ? 1 : 0;
    let sql = 'UPDATE usuarios SET nombre=?, permisos=?, proyectos=?, activo=?, es_admin=? WHERE id_usuario=?';
    let params = [nombre, permisos, proyectos, activo ? 1 : 0, isAdmin, userId];

    if (password && password.trim() !== '') {
      const hash = await bcrypt.hash(password, 10);
      sql = 'UPDATE usuarios SET nombre=?, permisos=?, proyectos=?, activo=?, es_admin=?, password_hash=? WHERE id_usuario=?';
      params = [nombre, permisos, proyectos, activo ? 1 : 0, isAdmin, hash, userId];
    }

    await db.query(sql, params);
    
    // Devolvemos el usuario modificado
    const [updated] = await db.query('SELECT id_usuario, email, nombre, permisos, proyectos, es_admin, activo FROM usuarios WHERE id_usuario=?', [userId]);
    res.json(updated[0]);
  } catch (e) {
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  const userId = req.params.id;
  // Prevenir borrarse a sí mismo
  if (req.user.id == userId) {
    return res.status(400).json({ error: 'No puedes borrar tu propio usuario' });
  }
  try {
    const db = getPool();
    await db.query('DELETE FROM usuarios WHERE id_usuario = ?', [userId]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

module.exports = router;
