require('dotenv').config();
const mysql = require('mysql2/promise');

mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || ''
}).then(c => {
  console.log('✅ Conexión MySQL OK');
  c.end();
}).catch(e => {
  console.error('❌ Error de conexión:', e.message);
  console.error('   Código:', e.code);
});
