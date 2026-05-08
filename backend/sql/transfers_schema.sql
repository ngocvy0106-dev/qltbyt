-- Import file này bằng MySQL Workbench để tạo bảng điều chuyển thiết bị.
-- Database mặc định: quanlytbyt

USE quanlytbyt;

CREATE TABLE IF NOT EXISTS device_transfers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_code VARCHAR(50) NULL,
  device_id INT NULL,
  device_name VARCHAR(255) NULL,
  serial_number VARCHAR(100) NULL,
  from_department VARCHAR(150) NULL,
  to_department VARCHAR(150) NULL,
  request_date DATE NULL,
  requester_name VARCHAR(150) NULL,
  transfer_reason TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_transfer_status (status),
  INDEX idx_transfer_date (request_date),
  INDEX idx_transfer_device (device_id),
  CONSTRAINT fk_transfer_device
    FOREIGN KEY (device_id)
    REFERENCES devices(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

-- Dữ liệu mẫu tùy chọn (bỏ comment để insert nhanh)
-- INSERT INTO device_transfers
-- (request_code, device_name, serial_number, from_department, to_department, request_date, requester_name, status)
-- VALUES
-- ('DC-001', 'Máy xét nghiệm sinh hóa tự động', 'TS-003', 'Khoa Xét nghiệm', 'Khoa Nội', '2026-03-25', 'Nguyễn Văn A', 'pending'),
-- ('DC-002', 'Máy đo huyết áp tự động', 'TS-008', 'Khoa Cấp cứu', 'Khoa Tim mạch', '2026-03-24', 'Trần Thị B', 'approved');
