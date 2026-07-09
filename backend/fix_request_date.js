const mysql = require('mysql2/promise');

async function run() {
  const pool = await mysql.createPool({
    host: 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
    port: 4000,
    user: '3PLh78za3WEuSmD.root',
    password: 'ZNlzgEYE6Vd1vcGk',
    database: 'quanlytbyt',
    ssl: { rejectUnauthorized: true }
  });

  try {
    // 1. Đổi kiểu cột từ DATE sang DATETIME
    console.log('Đang đổi kiểu cột request_date từ DATE sang DATETIME...');
    await pool.query('ALTER TABLE device_transfers MODIFY COLUMN request_date DATETIME');
    console.log('Đã đổi kiểu cột thành công!');

    // 2. Cập nhật tất cả bản ghi: gán request_date = created_at để có giờ chính xác
    console.log('Đang cập nhật dữ liệu cũ từ created_at...');
    const [result] = await pool.query('UPDATE device_transfers SET request_date = created_at');
    console.log('Đã cập nhật ' + result.affectedRows + ' bản ghi!');

    // 3. Kiểm tra lại
    const [rows] = await pool.query('SELECT id, request_date, created_at FROM device_transfers ORDER BY id DESC LIMIT 5');
    console.log('Kiểm tra dữ liệu sau cập nhật:');
    rows.forEach(r => console.log(`  ID=${r.id} request_date=${r.request_date} created_at=${r.created_at}`));
  } finally {
    await pool.end();
  }
}

run().catch(console.error);
