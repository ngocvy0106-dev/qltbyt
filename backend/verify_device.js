const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'quanlytbyt'
  });

  console.log('=== DEVBTD-00001 Device State ===');
  const [rows] = await conn.execute('SELECT device_code, department_id FROM devices WHERE device_code = ?', ['DEVBTD-00001']);
  console.log(JSON.stringify(rows[0], null, 2));

  console.log('\n=== Active Allocations ===');
  const [allocs] = await conn.execute(`
    SELECT id, from_department, to_department, status
    FROM device_allocations
    WHERE device_id = (SELECT id FROM devices WHERE device_code = ?)
  `, ['DEVBTD-00001']);
  console.log(JSON.stringify(allocs, null, 2));

  console.log('\n=== Transfer History ===');
  const [transfers] = await conn.execute(`
    SELECT id, to_department, status, created_at
    FROM device_transfers 
    WHERE device_id = (SELECT id FROM devices WHERE device_code = ?)
    ORDER BY created_at DESC
  `, ['DEVBTD-00001']);
  console.log(JSON.stringify(transfers, null, 2));

  conn.end();
})();
