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

    // Check if batch_code column exists
    const [columns] = await connection.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'devices'
         AND COLUMN_NAME = 'batch_code'`
    );

    if (columns.length > 0) {
      console.log('✓ batch_code column already exists');
    } else {
      console.log('→ Adding batch_code column...');
      await connection.query(
        `ALTER TABLE devices ADD COLUMN batch_code VARCHAR(100) NULL AFTER device_code`
      );
      console.log('✓ batch_code column added successfully');
    }

    // Verify
    const [verify] = await connection.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'devices'
         AND COLUMN_NAME = 'batch_code'`
    );

    if (verify.length > 0) {
      console.log('✓ Migration verified - batch_code column is ready');
    }
  } catch (error) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
    process.exit(0);
  }
})();
