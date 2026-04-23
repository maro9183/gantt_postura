const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_ovo2_key_fallback';

// Intercepta las solicitudes y valida el token JWT
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado. Faltan credenciales.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // Injectar la data del usuario en el request
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

// Verifica si el usuario tiene permiso para modificar (CREATE, UPDATE, DELETE)
// o si el permiso requerido está en su lista
function requirePermission(action) {
  return (req, res, next) => {
    const p = req.user.permisos || '';
    if (p === 'ALL') return next();
    
    const permList = p.split(',').map(x => x.trim().toUpperCase());
    if (permList.includes(action.toUpperCase())) {
      return next();
    }
    
    return res.status(403).json({ error: 'Permisos insuficientes para esta acción.' });
  };
}

// Verifica si el id_proyecto que se está tocando está en la lista de proyectos permitidos
function requireProjectAccess(req, res, next) {
  const p = req.user.proyectos || '';
  if (p === 'ALL') return next();

  // El ID del proyecto puede venir en body, params o query
  let projectId = req.body.id_proyecto || req.params.projectId || req.query.id_proyecto;
  if (!projectId) return next(); // Si no hay proyecto mapeado directo, dejamos pasar (o podría fallar si es estricto)

  const projList = p.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
  if (projList.includes(parseInt(projectId))) {
    return next();
  }

  return res.status(403).json({ error: 'No tienes acceso a este proyecto.' });
}

module.exports = {
  requireAuth,
  requirePermission,
  requireProjectAccess,
  JWT_SECRET
};
