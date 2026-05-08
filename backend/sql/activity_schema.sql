-- User activity log table for MedEquip Pro
-- Run this script in MySQL Workbench on the target database.

CREATE TABLE IF NOT EXISTS activity (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NULL,
  `action` VARCHAR(100) NOT NULL,
  description TEXT NULL,
  entity_type VARCHAR(50) NULL,
  entity_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_activity_created_at (created_at),
  KEY idx_activity_user_id (user_id),
  KEY idx_activity_action (action),
  KEY idx_activity_entity (entity_type, entity_id),
  CONSTRAINT fk_activity_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional: keep only the latest 200,000 records (manual maintenance command)
-- DELETE FROM activity
-- WHERE id NOT IN (
--   SELECT id FROM (
--     SELECT id FROM activity ORDER BY id DESC LIMIT 200000
--   ) t
-- );
