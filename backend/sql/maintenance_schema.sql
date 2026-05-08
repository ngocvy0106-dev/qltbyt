-- Import file này bằng MySQL Workbench để tạo bảng bảo trì.
-- Database mặc định: quanlytbyt

USE quanlytbyt;

CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_code VARCHAR(50) NULL,
  device_id INT NULL,
  device_name VARCHAR(255) NULL,
  note TEXT NULL,
  maintenance_type VARCHAR(50) NOT NULL DEFAULT 'Định kỳ',
  scheduled_date DATE NULL,
  technician_name VARCHAR(150) NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  cost DECIMAL(15, 2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_maintenance_status (status),
  INDEX idx_maintenance_type (maintenance_type),
  INDEX idx_maintenance_date (scheduled_date),
  INDEX idx_maintenance_device (device_id),
  CONSTRAINT fk_maintenance_device
    FOREIGN KEY (device_id)
    REFERENCES devices(id)
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

-- Dữ liệu mẫu nhẹ (tùy chọn): bỏ comment để insert nhanh dữ liệu ban đầu
-- INSERT INTO maintenance_tasks
-- (task_code, device_id, device_name, note, maintenance_type, scheduled_date, technician_name, status, cost)
-- VALUES
-- ('BT-001', NULL, 'Máy chụp CT Scanner', 'Bảo dưỡng định kỳ hàng quý', 'Định kỳ', '2026-04-15', 'Nguyen Van A', 'pending', 15000000),
-- ('BT-002', NULL, 'Máy X-Quang Di Động', 'Khắc phục lỗi hiển thị', 'Khẩn cấp', '2026-03-20', 'Tran Van B', 'in_progress', 8500000);
