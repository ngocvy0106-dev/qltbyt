const express = require("express")
const { pool } = require("../db")
const { logActivity } = require("../activity")

const router = express.Router()

function extractFloor(value) {
  const text = String(value || "")
  const matched = text.match(/tầng\s*\d+/i)
  return matched ? matched[0].toLowerCase() : null
}

async function queryDepartmentsWithFallback(whereClause, params) {
  const queryVariants = [
    `SELECT
       dep.id,
       dep.name,
       COALESCE(
         NULLIF(
           TRIM(
             (
               SELECT d.location
               FROM devices d
               WHERE (
                 LOWER(TRIM(CAST(d.department_id AS CHAR))) = LOWER(TRIM(dep.name))
                 OR TRIM(CAST(d.department_id AS CHAR)) = TRIM(CAST(dep.id AS CHAR))
               )
                 AND NULLIF(TRIM(d.location), '') IS NOT NULL
               ORDER BY d.updated_at DESC, d.id DESC
               LIMIT 1
             )
           ),
           ''
         ),
         '-'
       ) AS location,
       NULLIF(TRIM(dep.head_name), '') AS head,
       (
         SELECT COUNT(*)
         FROM users u
         WHERE LOWER(TRIM(u.department_name)) = LOWER(TRIM(dep.name))
           AND EXISTS (
             SELECT 1
             FROM role r
             WHERE r.id = u.role_id
               AND LOWER(TRIM(r.role_name)) IN ('nhân viên', 'nhan vien', 'nhanvien', 'staff', 'employee')
           )
       ) AS employees,
       NULLIF(TRIM(dep.phone), '') AS phone,
       NULLIF(TRIM(dep.email), '') AS email,
       (
         SELECT COUNT(*)
         FROM devices d
        WHERE LOWER(TRIM(CAST(d.department_id AS CHAR))) = LOWER(TRIM(dep.name))
          OR TRIM(CAST(d.department_id AS CHAR)) = TRIM(CAST(dep.id AS CHAR))
       ) AS devices
     FROM departments dep
     ${whereClause}
     GROUP BY dep.id, dep.name, dep.head_name, dep.phone, dep.email, dep.created_at
    ORDER BY dep.id ASC`,
    `SELECT
       dep.id,
       dep.name,
       COALESCE(
         NULLIF(
           TRIM(
             (
               SELECT d.location
               FROM devices d
               WHERE (
                 LOWER(TRIM(CAST(d.department_id AS CHAR))) = LOWER(TRIM(dep.name))
                 OR TRIM(CAST(d.department_id AS CHAR)) = TRIM(CAST(dep.id AS CHAR))
               )
                 AND NULLIF(TRIM(d.location), '') IS NOT NULL
               ORDER BY d.updated_at DESC, d.id DESC
               LIMIT 1
             )
           ),
           ''
         ),
         '-'
       ) AS location,
       NULLIF(TRIM(dep.head_name), '') AS head,
       (
         SELECT COUNT(*)
         FROM users u
         WHERE LOWER(TRIM(u.department)) = LOWER(TRIM(dep.name))
           AND EXISTS (
             SELECT 1
             FROM role r
             WHERE r.id = u.role_id
               AND LOWER(TRIM(r.role_name)) IN ('nhân viên', 'nhan vien', 'nhanvien', 'staff', 'employee')
           )
       ) AS employees,
       NULLIF(TRIM(dep.phone), '') AS phone,
       NULLIF(TRIM(dep.email), '') AS email,
       (
         SELECT COUNT(*)
         FROM devices d
        WHERE LOWER(TRIM(CAST(d.department_id AS CHAR))) = LOWER(TRIM(dep.name))
          OR TRIM(CAST(d.department_id AS CHAR)) = TRIM(CAST(dep.id AS CHAR))
       ) AS devices
     FROM departments dep
     ${whereClause}
     GROUP BY dep.id, dep.name, dep.head_name, dep.phone, dep.email, dep.created_at
    ORDER BY dep.id ASC`,
    `SELECT
       dep.id,
       dep.name,
       COALESCE(
         NULLIF(
           TRIM(
             (
               SELECT d.location
               FROM devices d
               WHERE (
                 LOWER(TRIM(CAST(d.department_id AS CHAR))) = LOWER(TRIM(dep.name))
                 OR TRIM(CAST(d.department_id AS CHAR)) = TRIM(CAST(dep.id AS CHAR))
               )
                 AND NULLIF(TRIM(d.location), '') IS NOT NULL
               ORDER BY d.updated_at DESC, d.id DESC
               LIMIT 1
             )
           ),
           ''
         ),
         '-'
       ) AS location,
       NULLIF(TRIM(dep.head_name), '') AS head,
       (
         SELECT COUNT(*)
         FROM users u
         WHERE LOWER(TRIM(CAST(u.department_id AS CHAR))) = LOWER(TRIM(dep.name))
           AND EXISTS (
             SELECT 1
             FROM role r
             WHERE r.id = u.role_id
               AND LOWER(TRIM(r.role_name)) IN ('nhân viên', 'nhan vien', 'nhanvien', 'staff', 'employee')
           )
       ) AS employees,
       NULLIF(TRIM(dep.phone), '') AS phone,
       NULLIF(TRIM(dep.email), '') AS email,
       (
         SELECT COUNT(*)
         FROM devices d
        WHERE LOWER(TRIM(CAST(d.department_id AS CHAR))) = LOWER(TRIM(dep.name))
          OR TRIM(CAST(d.department_id AS CHAR)) = TRIM(CAST(dep.id AS CHAR))
       ) AS devices
     FROM departments dep
     ${whereClause}
     GROUP BY dep.id, dep.name, dep.head_name, dep.phone, dep.email, dep.created_at
    ORDER BY dep.id ASC`,
    `SELECT
       dep.id,
       dep.name,
       COALESCE(
         NULLIF(
           TRIM(
             (
               SELECT d.location
               FROM devices d
               WHERE (
                 LOWER(TRIM(CAST(d.department_id AS CHAR))) = LOWER(TRIM(dep.name))
                 OR TRIM(CAST(d.department_id AS CHAR)) = TRIM(CAST(dep.id AS CHAR))
               )
                 AND NULLIF(TRIM(d.location), '') IS NOT NULL
               ORDER BY d.updated_at DESC, d.id DESC
               LIMIT 1
             )
           ),
           ''
         ),
         '-'
       ) AS location,
       NULLIF(TRIM(dep.head_name), '') AS head,
       NULLIF(TRIM(dep.phone), '') AS phone,
       NULLIF(TRIM(dep.email), '') AS email,
       NULL AS employees,
       (
         SELECT COUNT(*)
         FROM devices d
        WHERE LOWER(TRIM(CAST(d.department_id AS CHAR))) = LOWER(TRIM(dep.name))
          OR TRIM(CAST(d.department_id AS CHAR)) = TRIM(CAST(dep.id AS CHAR))
       ) AS devices
     FROM departments dep
     ${whereClause}
     GROUP BY dep.id, dep.name, dep.head_name, dep.phone, dep.email, dep.created_at
    ORDER BY dep.id ASC`,
  ]

  let lastError = null

  for (const query of queryVariants) {
    try {
      const [rows] = await pool.query(query, params)
      return rows
    } catch (error) {
      if (error.code === "ER_BAD_FIELD_ERROR") {
        lastError = error
        continue
      }

      throw error
    }
  }

  if (lastError) {
    throw lastError
  }

  return []
}

router.get("/summary", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim().toLowerCase()

    const whereClause = search ? "WHERE LOWER(dep.name) LIKE ?" : ""
    const params = search ? [`%${search}%`] : []

    const departmentRows = await queryDepartmentsWithFallback(whereClause, params)

    const floorSet = new Set()
    for (const row of departmentRows) {
      const floor = extractFloor(row.location)
      if (floor) {
        floorSet.add(floor)
      }
    }

    const departments = departmentRows.map((row) => ({
      id: row.id,
      name: row.name,
      location: row.location || "-",
      head: row.head || null,
      devices: Number(row.devices || 0),
      employees: row.employees !== undefined && row.employees !== null ? Number(row.employees) : null,
      phone: row.phone || null,
      email: row.email || null,
    }))

    const totalDevices = departments.reduce((total, item) => total + item.devices, 0)
    const totalEmployees = departments.reduce((total, item) => total + (item.employees || 0), 0)
    const hasEmployees = departments.some((item) => item.employees !== null)

    return res.json({
      summary: {
        totalDepartments: departments.length,
        totalDevices,
        totalEmployees: hasEmployees ? totalEmployees : null,
        totalFloors: floorSet.size,
      },
      departments,
    })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.post("/", async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim()
    const headName = String(req.body?.head_name || "").trim() || null
    const phone = String(req.body?.phone || "").trim() || null
    const email = String(req.body?.email || "").trim() || null

    if (!name) {
      return res.status(400).json({ message: "Tên khoa/phòng không được để trống" })
    }

    const [result] = await pool.query(
      `INSERT INTO departments (name, head_name, phone, email, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [name, headName, phone, email]
    )

    await logActivity({
      action: "department.create",
      description: `${name}`,
      entityType: "department",
      entityId: result.insertId,
    })

    return res.json({ ok: true, id: result.insertId })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID khoa/phòng không hợp lệ" })
    }

    const name = String(req.body?.name || "").trim()
    const headName = String(req.body?.head_name || "").trim() || null
    const phone = String(req.body?.phone || "").trim() || null
    const email = String(req.body?.email || "").trim() || null

    if (!name) {
      return res.status(400).json({ message: "Tên khoa/phòng không được để trống" })
    }

    const [result] = await pool.query(
      `UPDATE departments
       SET name = ?,
           head_name = ?,
           phone = ?,
           email = ?
       WHERE id = ?`,
      [name, headName, phone, email, id]
    )

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Không tìm thấy khoa/phòng" })
    }

    await logActivity({
      action: "department.update",
      description: `${name}`,
      entityType: "department",
      entityId: id,
    })

    return res.json({ ok: true })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID khoa/phòng không hợp lệ" })
    }

    const [[department]] = await pool.query("SELECT name FROM departments WHERE id = ?", [id])

    const [result] = await pool.query("DELETE FROM departments WHERE id = ?", [id])

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Không tìm thấy khoa/phòng" })
    }

    await logActivity({
      action: "department.delete",
      description: `${department?.name || "Unknown"}`,
      entityType: "department",
      entityId: id,
    })

    return res.json({ ok: true })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

module.exports = router
