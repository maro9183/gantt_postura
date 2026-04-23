const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const dbName = process.env.DB_NAME || 'ovo2';
  try {
    const conn = await mysql.createConnection({
      host    : process.env.DB_HOST     || 'localhost',
      port    : parseInt(process.env.DB_PORT || '3306'),
      user    : process.env.DB_USER     || 'root',
      password: process.env.DB_PASSWORD || '',
      database: dbName
    });

    console.log('🔗 Conectado a la base de datos:', dbName);
    
    // Add column if not exists
    const [columns] = await conn.query("SHOW COLUMNS FROM tareas LIKE 'costo_tarea'");
    if (columns.length === 0) {
      console.log('🚧 Añadiendo columna costo_tarea...');
      await conn.query("ALTER TABLE tareas ADD COLUMN costo_tarea DECIMAL(10,2) DEFAULT 0.00;");
      console.log('✅ Columna costo_tarea añadida exitosamente.');
    } else {
      console.log('ℹ️ La columna costo_tarea ya existe.');
    }

    await conn.end();
  } catch (error) {
    console.error('❌ Error migrando base de datos:', error);
  }
}

run();
