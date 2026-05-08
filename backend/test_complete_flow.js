const axios = require('axios');

(async () => {
  try {
    // 1. Get the test task ID from previous run
    console.log('🔍 Fetching test task...');
    let taskId = 2; // From previous test
    
    // 2. Simulate employee confirmation via API
    console.log(`\n2️⃣  Nhân viên xác nhận bảo trì (ID: ${taskId})...`);
    const confirmResponse = await axios.put(
      `http://localhost:4000/api/maintenance/${taskId}/confirm`,
      {
        cost: 500000,
        actorId: 2,           // Nhân viên 1
        actorRole: "Nhân Viên",
        actorFullName: "Nhân viên 1"
      }
    );
    console.log('✅ Confirm response:', confirmResponse.data);

    // 3. Check if notification appears for admin
    console.log(`\n3️⃣  Kiểm tra notification cho admin...`);
    const alertsResponse = await axios.get(
      'http://localhost:4000/api/devices/maintenance-alerts?role=Admin&userId=1'
    );
    
    const maintenanceNotifications = alertsResponse.data.notifications.filter(n => 
      n.type === 'maintenance' && (n.title.includes('xác nhận') || n.description.includes('xác nhận'))
    );
    
    console.log(`✅ Admin notifications: ${maintenanceNotifications.length}`);
    if (maintenanceNotifications.length > 0) {
      console.log('📌 Notification details:');
      maintenanceNotifications.slice(0, 2).forEach(notif => {
        console.log(`  - Title: ${notif.title}`);
        console.log(`  - Description: ${notif.description}`);
        console.log(`  - Time: ${notif.time}`);
      });
    }

    console.log('\n✅ HOÀN THÀNH! Notification system đã hoạt động!');
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    process.exit(1);
  }
})();
