require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'quanlytbyt',
    });
    console.log('✓ Connected to database');

    // Check batch_code data
    const [rows] = await connection.query(`
      SELECT device_code, batch_code 
      FROM devices 
      WHERE batch_code IS NOT NULL 
      LIMIT 5
    `);

    console.log('Devices with batch_code:', rows.length);
    if (rows.length > 0) {
      rows.forEach((row) => {
        console.log(`  ${row.device_code}: ${row.batch_code}`);
      });
    } else {
      console.log('  (no devices with batch_code yet)');
    }

    // Count total devices
    const [total] = await connection.query(`SELECT COUNT(*) as count FROM devices`);
    console.log(`Total devices: ${total[0].count}`);
  } catch (error) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
    process.exit(0);
  }
})();
