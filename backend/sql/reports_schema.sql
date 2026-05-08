CREATE TABLE IF NOT EXISTS report_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  template_type VARCHAR(100) NOT NULL,
  last_run_at DATETIME NULL,
  is_highlighted TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  period_label VARCHAR(100) NOT NULL,
  status ENUM('completed', 'draft', 'review') NOT NULL DEFAULT 'draft',
  cost_total DECIMAL(18, 2) NOT NULL DEFAULT 0,
  source_template_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reports_template FOREIGN KEY (source_template_id) REFERENCES report_templates(id)
);

CREATE TABLE IF NOT EXISTS maintenance_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  department_name VARCHAR(150) NOT NULL,
  total_jobs INT NOT NULL DEFAULT 0,
  completed_jobs INT NOT NULL DEFAULT 0,
  in_progress_jobs INT NOT NULL DEFAULT 0,
  pending_jobs INT NOT NULL DEFAULT 0,
  completion_rate DECIMAL(5, 2) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO report_templates (title, template_type, last_run_at, is_highlighted)
SELECT 'Báo cáo tổng hợp thiết bị', 'Tổng hợp', '2026-03-15 00:00:00', 0
WHERE NOT EXISTS (SELECT 1 FROM report_templates WHERE title = 'Báo cáo tổng hợp thiết bị');

INSERT INTO report_templates (title, template_type, last_run_at, is_highlighted)
SELECT 'Báo cáo bảo trì tháng', 'Bảo trì', '2026-03-01 00:00:00', 1
WHERE NOT EXISTS (SELECT 1 FROM report_templates WHERE title = 'Báo cáo bảo trì tháng');

INSERT INTO report_templates (title, template_type, last_run_at, is_highlighted)
SELECT 'Báo cáo chi phí quý', 'Tài chính', '2026-01-01 00:00:00', 0
WHERE NOT EXISTS (SELECT 1 FROM report_templates WHERE title = 'Báo cáo chi phí quý');

INSERT INTO report_templates (title, template_type, last_run_at, is_highlighted)
SELECT 'Báo cáo thiết bị hết hạn', 'Cảnh báo', '2026-03-10 00:00:00', 0
WHERE NOT EXISTS (SELECT 1 FROM report_templates WHERE title = 'Báo cáo thiết bị hết hạn');

INSERT INTO report_templates (title, template_type, last_run_at, is_highlighted)
SELECT 'Báo cáo hiệu suất sử dụng', 'Phân tích', '2026-03-05 00:00:00', 0
WHERE NOT EXISTS (SELECT 1 FROM report_templates WHERE title = 'Báo cáo hiệu suất sử dụng');

INSERT INTO maintenance_reports (department_name, total_jobs, completed_jobs, in_progress_jobs, pending_jobs, completion_rate)
SELECT 'Nội soi', 15, 12, 2, 1, 80
WHERE NOT EXISTS (SELECT 1 FROM maintenance_reports WHERE department_name = 'Nội soi');

INSERT INTO maintenance_reports (department_name, total_jobs, completed_jobs, in_progress_jobs, pending_jobs, completion_rate)
SELECT 'Siêu âm', 10, 10, 0, 0, 100
WHERE NOT EXISTS (SELECT 1 FROM maintenance_reports WHERE department_name = 'Siêu âm');

INSERT INTO maintenance_reports (department_name, total_jobs, completed_jobs, in_progress_jobs, pending_jobs, completion_rate)
SELECT 'X-Quang', 8, 6, 1, 1, 75
WHERE NOT EXISTS (SELECT 1 FROM maintenance_reports WHERE department_name = 'X-Quang');

INSERT INTO maintenance_reports (department_name, total_jobs, completed_jobs, in_progress_jobs, pending_jobs, completion_rate)
SELECT 'Phẫu thuật', 12, 11, 1, 0, 92
WHERE NOT EXISTS (SELECT 1 FROM maintenance_reports WHERE department_name = 'Phẫu thuật');

INSERT INTO reports (report_code, name, period_label, status, cost_total)
SELECT 'BC-001', 'Báo cáo tổng hợp thiết bị', 'Tháng 03/2024', 'completed', 800000000
WHERE NOT EXISTS (SELECT 1 FROM reports WHERE report_code = 'BC-001');

INSERT INTO reports (report_code, name, period_label, status, cost_total)
SELECT 'BC-002', 'Báo cáo bảo trì định kỳ', 'Tháng 03/2024', 'completed', 1200000000
WHERE NOT EXISTS (SELECT 1 FROM reports WHERE report_code = 'BC-002');

INSERT INTO reports (report_code, name, period_label, status, cost_total)
SELECT 'BC-003', 'Báo cáo chi phí sửa chữa', 'Quý 1/2024', 'review', 500000000
WHERE NOT EXISTS (SELECT 1 FROM reports WHERE report_code = 'BC-003');
