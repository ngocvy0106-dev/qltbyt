-- Migration: add created_by_user_id to repair_requests
USE quanlytbyt;

ALTER TABLE repair_requests
  ADD COLUMN created_by_user_id INT NULL,
  ADD INDEX idx_repairs_created_by_user_id (created_by_user_id);

-- Note: After applying this migration, backend will start storing the actor user id
-- when a repair request is created. Run this file against the DB to apply.
