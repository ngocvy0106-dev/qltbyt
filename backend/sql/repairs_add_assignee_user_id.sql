-- Migration: add assignee_user_id for repair_requests and backfill from existing names
SET @schema_name = DATABASE();

SELECT COUNT(*)
INTO @has_assignee_user_id
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name
  AND TABLE_NAME = 'repair_requests'
  AND COLUMN_NAME = 'assignee_user_id';

SET @add_assignee_user_id = IF(
  @has_assignee_user_id = 0,
  'ALTER TABLE repair_requests ADD COLUMN assignee_user_id INT NULL AFTER status',
  'SELECT 1'
);

PREPARE stmt_add_assignee FROM @add_assignee_user_id;
EXECUTE stmt_add_assignee;
DEALLOCATE PREPARE stmt_add_assignee;

-- Backfill assignee_user_id from existing technician_name if present
SELECT COUNT(*)
INTO @has_technician_name
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema_name
  AND TABLE_NAME = 'repair_requests'
  AND COLUMN_NAME = 'technician_name';

SET @backfill_assignee = IF(
  @has_technician_name = 1,
  'UPDATE repair_requests r
   LEFT JOIN users u
     ON u.full_name = r.technician_name
     OR u.username = r.technician_name
   SET r.assignee_user_id = u.id
   WHERE r.assignee_user_id IS NULL
     AND u.id IS NOT NULL',
  'SELECT 1'
);

PREPARE stmt_backfill_assignee FROM @backfill_assignee;
EXECUTE stmt_backfill_assignee;
DEALLOCATE PREPARE stmt_backfill_assignee;

-- Add index for faster filtering
SELECT COUNT(*)
INTO @has_assignee_index
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = @schema_name
  AND TABLE_NAME = 'repair_requests'
  AND INDEX_NAME = 'idx_repairs_assignee_user_id';

SET @add_assignee_index = IF(
  @has_assignee_index = 0,
  'ALTER TABLE repair_requests ADD INDEX idx_repairs_assignee_user_id (assignee_user_id)',
  'SELECT 1'
);

PREPARE stmt_add_assignee_index FROM @add_assignee_index;
EXECUTE stmt_add_assignee_index;
DEALLOCATE PREPARE stmt_add_assignee_index;
