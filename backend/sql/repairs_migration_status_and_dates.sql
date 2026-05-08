-- Migration: Chuẩn hóa schema repair_requests cho flow nhận việc / chờ phụ tùng / hoàn thành
-- Chạy file này trên DB quanlytbyt

USE quanlytbyt;

ALTER TABLE repair_requests
  MODIFY COLUMN status VARCHAR(30) NOT NULL DEFAULT 'pending';

SET @schema_name = DATABASE();

SET @has_estimated_end_date = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'repair_requests' AND COLUMN_NAME = 'estimated_end_date'
);
SET @sql = IF(
  @has_estimated_end_date = 0,
  'ALTER TABLE repair_requests ADD COLUMN estimated_end_date DATE NULL AFTER start_date',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_part_name = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'repair_requests' AND COLUMN_NAME = 'part_name'
);
SET @sql = IF(
  @has_part_name = 0,
  'ALTER TABLE repair_requests ADD COLUMN part_name VARCHAR(255) NULL AFTER progress_note',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_ordered_date = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'repair_requests' AND COLUMN_NAME = 'ordered_date'
);
SET @sql = IF(
  @has_ordered_date = 0,
  'ALTER TABLE repair_requests ADD COLUMN ordered_date DATE NULL AFTER vendor_name',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_expected_arrival = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'repair_requests' AND COLUMN_NAME = 'expected_arrival'
);
SET @sql = IF(
  @has_expected_arrival = 0,
  'ALTER TABLE repair_requests ADD COLUMN expected_arrival DATE NULL AFTER ordered_date',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_completed_date = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'repair_requests' AND COLUMN_NAME = 'completed_date'
);
SET @sql = IF(
  @has_completed_date = 0,
  'ALTER TABLE repair_requests ADD COLUMN completed_date DATE NULL AFTER cost',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_resolution_result = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'repair_requests' AND COLUMN_NAME = 'resolution_result'
);
SET @sql = IF(
  @has_resolution_result = 0,
  'ALTER TABLE repair_requests ADD COLUMN resolution_result VARCHAR(255) NULL AFTER completed_date',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_updated_at = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'repair_requests' AND COLUMN_NAME = 'updated_at'
);
SET @sql = IF(
  @has_updated_at = 0,
  'ALTER TABLE repair_requests ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_idx_repairs_status = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'repair_requests' AND INDEX_NAME = 'idx_repairs_status'
);
SET @sql = IF(
  @has_idx_repairs_status = 0,
  'ALTER TABLE repair_requests ADD INDEX idx_repairs_status (status)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_idx_repairs_created_at = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema_name AND TABLE_NAME = 'repair_requests' AND INDEX_NAME = 'idx_repairs_created_at'
);
SET @sql = IF(
  @has_idx_repairs_created_at = 0,
  'ALTER TABLE repair_requests ADD INDEX idx_repairs_created_at (created_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Chuẩn hóa dữ liệu trạng thái cũ về status chuẩn
UPDATE repair_requests
SET status = 'pending'
WHERE id > 0
  AND LOWER(TRIM(status)) IN ('cho xu ly', 'chờ xử lý', 'pending');

UPDATE repair_requests
SET status = 'assigned'
WHERE id > 0
  AND LOWER(TRIM(status)) IN ('da phan cong', 'đã phân công', 'assigned');

UPDATE repair_requests
SET status = 'in_progress'
WHERE id > 0
  AND LOWER(TRIM(status)) IN ('dang sua', 'đang sửa', 'in-progress', 'in_progress');

UPDATE repair_requests
SET status = 'waiting_parts'
WHERE id > 0
  AND LOWER(TRIM(status)) IN ('cho phu tung', 'chờ phụ tùng', 'waiting-parts', 'waiting_parts');

UPDATE repair_requests
SET status = 'completed'
WHERE id > 0
  AND LOWER(TRIM(status)) IN ('hoan thanh', 'hoàn thành', 'completed');
