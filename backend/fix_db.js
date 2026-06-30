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
  
  // Find Nguyễn Văn A's ID
  const [users] = await pool.query("SELECT id FROM users WHERE full_name = 'Nguyễn Văn A' OR username = 'admin' LIMIT 1");
  const adminId = users.length > 0 ? users[0].id : 1;
  
  // Update all activities that lack a user_id
  await pool.query("UPDATE activity SET user_id = ? WHERE user_id IS NULL", [adminId]);
  console.log('Done updating user_id for system activities.');
  process.exit(0);
})();
