const mysql = require('mysql2/promise');
require('dotenv').config();

async function runUpdate() {
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ovo2'
  };

  const conn = await mysql.createConnection(dbConfig);
  console.log('Conectado a la base de datos...');

  try {
    // 1. Crear tabla subresponsables
    await conn.query(`
      CREATE TABLE IF NOT EXISTS subresponsables (
        id_subresp INT AUTO_INCREMENT PRIMARY KEY,
        id_lead    INT NOT NULL,
        nombre     VARCHAR(255) NOT NULL,
        correo     VARCHAR(255) UNIQUE NOT NULL,
        FOREIGN KEY (id_lead) REFERENCES responsables(id_resp) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Tabla subresponsables lista');

    // 2. Agregar columnas a tareas
    // Usamos un bloque try/catch para cada columna por si ya existen
    try {
      await conn.query('ALTER TABLE tareas ADD COLUMN id_parent INT DEFAULT NULL AFTER id_proyecto');
      console.log('✅ Columna id_parent añadida');
    } catch (e) {
      if (e.code === 'ER_DUP_COLUMN_NAME') console.log('ℹ️ Columna id_parent ya existe');
      else throw e;
    }

    try {
      await conn.query('ALTER TABLE tareas ADD COLUMN id_subresp INT DEFAULT NULL AFTER id_parent');
      console.log('✅ Columna id_subresp añadida');
    } catch (e) {
      if (e.code === 'ER_DUP_COLUMN_NAME') console.log('ℹ️ Columna id_subresp ya existe');
      else throw e;
    }

    // 3. Agregar Foreign Keys
    try {
      await conn.query('ALTER TABLE tareas ADD CONSTRAINT fk_tareas_parent FOREIGN KEY (id_parent) REFERENCES tareas(id_tarea) ON DELETE CASCADE');
      console.log('✅ FK id_parent añadida');
    } catch (e) { console.log('ℹ️ FK id_parent ya existe o no se pudo crear'); }

    try {
      await conn.query('ALTER TABLE tareas ADD CONSTRAINT fk_tareas_subresp FOREIGN KEY (id_subresp) REFERENCES subresponsables(id_subresp) ON DELETE SET NULL');
      console.log('✅ FK id_subresp añadida');
    } catch (e) { console.log('ℹ️ FK id_subresp ya existe o no se pudo crear'); }

    console.log('🚀 Actualización de base de datos completada');
  } catch (err) {
    console.error('❌ Error actualizando BD:', err);
  } finally {
    await conn.end();
  }
}

runUpdate();
