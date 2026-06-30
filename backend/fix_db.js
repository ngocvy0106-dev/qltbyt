const mysql = require('mysql2/promise');
require('dotenv').config({ path: 'D:/HOCKY8/DOANTN/DATN_PROJECT/backend/.env' });
(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: true }
  });
  
  const [rows] = await pool.query("SELECT id, description FROM activity WHERE action = 'device.liquidation'");
  for (let row of rows) {
    let newDesc = row.description.replace(/#\d+\s*-\s*/g, '');
    console.log("Updating:", row.id, "to", newDesc);
    await pool.query('UPDATE activity SET description = ? WHERE id = ?', [newDesc, row.id]);
  }
  console.log('Done cleaning DB.');
  process.exit(0);
})();
