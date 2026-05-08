-- Add image_url column for device image links (safe to run multiple times)
SET @column_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'devices'
    AND COLUMN_NAME = 'image_url'
);

SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE devices ADD COLUMN image_url VARCHAR(1024) NULL AFTER model',
  'SELECT "devices.image_url already exists"'
);

PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
