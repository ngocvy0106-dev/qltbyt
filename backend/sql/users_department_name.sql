ALTER TABLE users
ADD COLUMN IF NOT EXISTS department_name VARCHAR(255) NULL AFTER full_name;

UPDATE users
SET department_name = 'Khoa chuẩn đoán hình ảnh'
WHERE (department_name IS NULL OR TRIM(department_name) = '')
  AND id = 1;
