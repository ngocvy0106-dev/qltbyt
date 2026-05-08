const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '123456',
    database: 'quanlytbyt'
  });

  try {
    // 1. Create a maintenance task
    console.log('1️⃣  Tạo bảo trì mới...');
    const [insertResult] = await conn.execute(`
      INSERT INTO maintenance_tasks (task_code, device_id, device_name, note, maintenance_type, scheduled_date, technician_name, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `, ['BT-TEST-' + Date.now(), 3, 'Bơm tiêm điện', 'Test bảo trì', 'Định kỳ', new Date(), 'Nhân viên 1', 'pending']);
    
    const taskId = insertResult.insertId;
    console.log(`✅ Tạo task thành công: ID = ${taskId}`);

    // 2. Check if task exists
    console.log('\n2️⃣  Kiểm tra task...');
    const [tasks] = await conn.execute('SELECT id, task_code, status FROM maintenance_tasks WHERE id = ?', [taskId]);
    console.log(`✅ Task: ${JSON.stringify(tasks[0])}`);

    // 3. Check activity table for task confirmation
    console.log('\n3️⃣  Kiểm tra activity table trước khi confirm...');
    const [activitiesBefore] = await conn.execute(`
      SELECT id, action, description, user_id, created_at FROM activity 
      WHERE action = 'maintenance.employee_confirmed' 
      ORDER BY created_at DESC LIMIT 3
    `);
    console.log(`✅ Confirmations trước: ${activitiesBefore.length} records`);

    console.log('\n📌 Ghi chú: Sau khi nhân viên bấm checkmark trong UI, sẽ tạo activity với action="maintenance.employee_confirmed"');
    console.log('📌 Lúc đó, tất cả admins sẽ thấy notification trong chuông bell!');

    await conn.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
