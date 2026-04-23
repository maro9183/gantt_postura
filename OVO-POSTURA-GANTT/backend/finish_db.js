const mysql = require('mysql2/promise');
require('dotenv').config();

async function runUpdate() {
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ovo2'
  };

  const conn = await mysql.createConnection(dbConfig);
  
  try {
    console.log('Creando Foreign Keys...');
    try {
      await conn.query('ALTER TABLE tareas ADD CONSTRAINT fk_tareas_parent FOREIGN KEY (id_parent) REFERENCES tareas(id_tarea) ON DELETE CASCADE');
      console.log('✅ FK id_parent ok');
    } catch(e) { console.log('ℹ️ FK id_parent ommitida (ya existe o error)'); }

    try {
      await conn.query('ALTER TABLE tareas ADD CONSTRAINT fk_tareas_subresp FOREIGN KEY (id_subresp) REFERENCES subresponsables(id_subresp) ON DELETE SET NULL');
      console.log('✅ FK id_subresp ok');
    } catch(e) { console.log('ℹ️ FK id_subresp ommitida (ya existe o error)'); }
    
  } catch(err) {
    console.error(err);
  } finally {
    await conn.end();
  }
}
runUpdate();
