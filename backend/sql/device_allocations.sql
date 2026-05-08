-- Bảng lưu thông tin cấp phát thiết bị theo từng người nhận
CREATE TABLE IF NOT EXISTS device_allocations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  allocation_code VARCHAR(50) NOT NULL,
  transfer_id INT NULL,
  device_id INT NULL,
  from_department VARCHAR(255) NULL,
  to_department VARCHAR(255) NULL,
  allocation_location VARCHAR(255) NULL,
  allocation_reason TEXT NULL,
  requester_name VARCHAR(255) NULL,
  receiver_user_id INT NULL,
  receiver_name VARCHAR(255) NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_transfer_device_receiver (transfer_id, device_id, receiver_user_id),
  KEY idx_transfer_id (transfer_id),
  KEY idx_device_id (device_id),
  KEY idx_receiver_user_id (receiver_user_id),
  KEY idx_allocation_code (allocation_code),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
