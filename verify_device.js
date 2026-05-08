require('dotenv').config();
const mysql = require('mysql2/promise');

(async ()=>{
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST, 
      user: process.env.DB_USER, 
      password: process.env.DB_PASS, 
      database: process.env.DB_NAME
    });
    
    console.log('Checking DEVBTD-00001...');
    const [rows] = await conn.execute('SELECT device_code, department_id, department_name FROM devices WHERE device_code = ?', ['DEVBTD-00001']);
    console.log('Device State:', JSON.stringify(rows[0], null, 2));
    
    console.log('\nChecking device_allocations...');
    const [allocs] = await conn.execute(`
      SELECT da.id, da.department_name, da.status, da.is_active 
      FROM device_allocations da 
      WHERE da.device_id = (SELECT id FROM devices WHERE device_code = ?)
    `, ['DEVBTD-00001']);
    console.log('Active Allocations:', JSON.stringify(allocs, null, 2));
    
    console.log('\nChecking device_transfers...');
    const [transfers] = await conn.execute(`
      SELECT id, to_department, status 
      FROM device_transfers 
      WHERE device_id = (SELECT id FROM devices WHERE device_code = ?)
      ORDER BY created_at DESC
    `, ['DEVBTD-00001']);
    console.log('Transfers:', JSON.stringify(transfers, null, 2));
    
    conn.end();
  } catch(e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})()
