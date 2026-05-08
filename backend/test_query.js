require('dotenv').config();
const { pool } = require('./src/db');

(async () => {
  let connection;
  try {
    connection = await pool.getConnection();

    console.log('Testing column detection...');
    const [rows] = await connection.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'devices'
         AND COLUMN_NAME IN ('maintenance_interval', 'created_by', 'img_url', 'image_url', 'manufacturer', 'batch_code')`
    );

    const columnSet = new Set((rows || []).map((row) => String(row.COLUMN_NAME || "").trim()));
    console.log('Detected columns:', Array.from(columnSet));

    // Test SELECT with batch_code
    console.log('\nTesting SELECT query...');
    const batchCodeColumnName = columnSet.has("batch_code") ? "batch_code" : null;
    const batchCodeSelect = batchCodeColumnName
      ? `d.${batchCodeColumnName} AS batch_code,`
      : `NULL AS batch_code,`;

    const query = `SELECT
       d.id,
       d.device_code,
       d.device_name,
       ${batchCodeSelect}
       d.updated_at
     FROM devices d
     LIMIT 1`;

    console.log('Query:', query);
    const [devices] = await connection.query(query);
    if (devices[0]) {
      console.log('Device fields:', Object.keys(devices[0]));
      console.log('Device batch_code:', devices[0].batch_code);
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    if (connection) connection.release();
    process.exit(0);
  }
})();
