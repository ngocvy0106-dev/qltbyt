-- Add batch_code column for device import lot codes (safe to run multiple times)
SET @column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'devices'
    AND COLUMN_NAME = 'batch_code'
);

SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE devices ADD COLUMN batch_code VARCHAR(100) NULL AFTER device_code',
  'SELECT "devices.batch_code already exists"'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
