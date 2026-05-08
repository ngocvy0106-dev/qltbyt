require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'quanlytbyt',
    });

    // Check if batch_code column exists
    const [cols] = await conn.query(
      'SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = "devices" AND COLUMN_NAME = "batch_code"'
    );

    console.log('✓ batch_code column exists:', cols.length > 0);

    if (cols.length > 0) {
      // Get a sample device with batch_code
      const [devices] = await conn.query(
        'SELECT device_code, batch_code FROM devices LIMIT 1'
      );
      if (devices[0]) {
        console.log(`Device: ${devices[0].device_code}, batch_code: ${devices[0].batch_code || 'NULL'}`);
      }

      // Check SELECT query result
      const [selected] = await conn.query(
        'SELECT device_code, NULL as batch_code FROM devices LIMIT 1'
      );
      console.log('Selected columns:', Object.keys(selected[0]));
    }

    conn.end();
  } catch (error) {
    console.error('Error:', error.message);
  }
})();
