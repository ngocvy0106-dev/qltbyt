-- Import file này bằng MySQL Workbench để tạo bảng sửa chữa.
-- Database mặc định: quanlytbyt

USE quanlytbyt;

CREATE TABLE IF NOT EXISTS repair_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  request_code VARCHAR(50) NULL,
  device_id INT NULL,
  device_name VARCHAR(255) NULL,
  issue_description TEXT NOT NULL,
  reporter_name VARCHAR(150) NULL,
  department_name VARCHAR(150) NULL,
  priority VARCHAR(30) NOT NULL DEFAULT 'medium',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  assignee_user_id INT NULL,
  start_date DATETIME NULL,
  estimated_end_date DATE NULL,
  progress_note TEXT NULL,
  part_name VARCHAR(255) NULL,
  vendor_name VARCHAR(255) NULL,
  ordered_date DATE NULL,
  expected_arrival DATE NULL,
  cost DECIMAL(15, 2) NOT NULL DEFAULT 0,
  completed_date DATE NULL,
  resolution_result VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_repairs_status (status),
  INDEX idx_repairs_priority (priority),
  INDEX idx_repairs_created_at (created_at),
  INDEX idx_repairs_device_id (device_id),
  INDEX idx_repairs_assignee_user_id (assignee_user_id),
  CONSTRAINT fk_repair_device
    FOREIGN KEY (device_id)
    REFERENCES devices(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

-- Dữ liệu mẫu tùy chọn (bỏ comment để insert nhanh)
-- INSERT INTO repair_requests
-- (request_code, device_name, issue_description, reporter_name, department_name, priority, status, cost, created_at)
-- VALUES
-- ('RP001', 'Máy siêu âm GE Voluson', 'Màn hình hiển thị bị nhiễu', 'BS. Nguyễn Thị Hoa', 'Khoa Sản', 'high', 'pending', NULL, 0, NOW()),
-- ('RP002', 'Monitor Philips MX800', 'Không đo được SpO2', 'DD. Trần Văn Nam', 'Khoa ICU', 'critical', 'pending', NULL, 0, NOW());
