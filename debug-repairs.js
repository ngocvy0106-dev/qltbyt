const mysql = require('mysql2/promise');

async function debugRepairs() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'quanlytbyt',
  });

  try {
    const [rows] = await connection.query(
      'SELECT id, request_code, device_id, issue_description, status, created_at FROM repair_requests ORDER BY id DESC LIMIT 20'
    );
    console.log('=== Recent Repair Requests ===');
    console.log(rows);
    
    const [groupedByDevice] = await connection.query(`
      SELECT device_id, COUNT(*) as count, GROUP_CONCAT(status) as statuses
      FROM repair_requests
      GROUP BY device_id
      ORDER BY count DESC
    `);
    console.log('\n=== Repairs by Device ===');
    console.log(groupedByDevice);
    
    const [pendingByDevice] = await connection.query(`
      SELECT device_id, COUNT(*) as pending_count
      FROM repair_requests
      WHERE COALESCE(status, 'pending') NOT IN ('completed', 'hoan thanh')
      GROUP BY device_id
      ORDER BY pending_count DESC
    `);
    console.log('\n=== PENDING Repairs by Device ===');
    console.log(pendingByDevice);
  } finally {
    await connection.end();
  }
}

debugRepairs().catch(console.error);
