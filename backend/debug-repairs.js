const { pool } = require('./src/db');

async function debugRepairs() {
  try {
    const [rows] = await pool.query(
      'SELECT id, request_code, device_id, issue_description, status, created_at FROM repair_requests ORDER BY id DESC LIMIT 20'
    );
    console.log('\n=== Recent Repair Requests ===');
    console.table(rows);
    
    const [groupedByDevice] = await pool.query(`
      SELECT device_id, COUNT(*) as count, GROUP_CONCAT(status) as statuses
      FROM repair_requests
      GROUP BY device_id
      ORDER BY count DESC
      LIMIT 15
    `);
    console.log('\n=== Repairs by Device ===');
    console.table(groupedByDevice);
    
    const [pendingByDevice] = await pool.query(`
      SELECT device_id, COUNT(*) as pending_count
      FROM repair_requests
      WHERE COALESCE(status, 'pending') NOT IN ('completed', 'hoan thanh')
      GROUP BY device_id
      ORDER BY pending_count DESC
    `);
    console.log('\n=== PENDING Repairs by Device (Blocking NEW Submissions) ===');
    console.table(pendingByDevice);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

debugRepairs();
