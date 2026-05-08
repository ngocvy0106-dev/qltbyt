const mysql = require('mysql2/promise');

async function runMigration() {
  let connection;

  try {
    connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: process.env.DB_PASSWORD || '',
      database: 'quanlytbyt',
    });

    console.log('Connected to database...');

    // Drop old UNIQUE constraint on allocation_code alone
    try {
      await connection.execute('ALTER TABLE device_allocations DROP KEY uk_allocation_code');
      console.log('✓ Dropped old uk_allocation_code constraint');
    } catch (err) {
      if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
        console.log('ℹ uk_allocation_code constraint not found (already updated or doesn\'t exist)');
      } else {
        throw err;
      }
    }

    // Add new composite UNIQUE constraint
    try {
      await connection.execute(
        'ALTER TABLE device_allocations ADD UNIQUE KEY uk_transfer_device_receiver (transfer_id, device_id, receiver_user_id)'
      );
      console.log('✓ Added new uk_transfer_device_receiver constraint');
    } catch (err) {
      if (err.code === 'ER_DUP_KEYNAME') {
        console.log('ℹ uk_transfer_device_receiver constraint already exists');
      } else {
        throw err;
      }
    }

    // Add regular index on allocation_code
    try {
      await connection.execute(
        'ALTER TABLE device_allocations ADD KEY idx_allocation_code (allocation_code)'
      );
      console.log('✓ Added idx_allocation_code index');
    } catch (err) {
      if (err.code === 'ER_DUP_KEYNAME') {
        console.log('ℹ idx_allocation_code index already exists');
      } else {
        throw err;
      }
    }

    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

runMigration();
