require("dotenv").config()
const { pool } = require("../src/db")

async function run() {
  try {
    await pool.query("ALTER TABLE users ADD COLUMN department_name VARCHAR(255) NULL AFTER full_name")
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") {
      throw error
    }
  }

  await pool.query(
    "UPDATE users SET department_name = 'Khoa chuẩn đoán hình ảnh' WHERE (department_name IS NULL OR TRIM(department_name) = '') AND id = 1"
  )

  const [columns] = await pool.query("SHOW COLUMNS FROM users LIKE 'department_name'")
  console.table(columns)

  await pool.end()
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
