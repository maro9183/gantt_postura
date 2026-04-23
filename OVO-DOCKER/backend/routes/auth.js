const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getPool } = require('../db');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

// POST /api/auth/login -> Devuelve un Token si las credenciales son válidas
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Faltan credenciales' });

  try {
    const db = getPool();
    const [rows] = await db.query('SELECT * FROM usuarios WHERE email = ? AND activo = 1', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas o usuario inactivo' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Payload de sesión para el token
    const tokenPayload = {
      id: user.id_usuario,
      email: user.email,
      nombre: user.nombre,
      permisos: user.permisos, // ej: "ALL" o "READ,CREATE"
      proyectos: user.proyectos, // ej: "ALL" o "1,2"
      es_admin: user.es_admin === 1
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });

    res.json({ token, user: tokenPayload });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// GET /api/auth/me -> Valida el token y devuelve el current user
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
