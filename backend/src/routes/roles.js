const express = require("express")
const { pool } = require("../db")

const router = express.Router()

function parsePermissions(rawValue) {
  const text = String(rawValue || "").trim()
  if (!text) {
    return []
  }

  try {
    const parsed = JSON.parse(text)
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || "").trim()).filter(Boolean)
    }
  } catch {
    // ignore parse error and fallback to comma-separated parsing
  }

  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeRoleName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
}

function isAdminRoleName(value) {
  const normalized = normalizeRoleName(value)
  return ["admin", "administrator", "super admin", "quản trị viên", "quan tri vien"].includes(normalized)
}

// Cache to avoid running ALTER TABLE on every request after the first success
let _permissionsColumnEnsured = false

async function ensurePermissionsStorage() {
  if (_permissionsColumnEnsured) {
    return
  }

  try {
    // Check if column exists via INFORMATION_SCHEMA
    const [rows] = await pool.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'role'
         AND COLUMN_NAME IN ('permissions', 'permission')`
    )

    if ((rows || []).length > 0) {
      _permissionsColumnEnsured = true
      return
    }

    // Column doesn't exist - try to add it
    await pool.query(`ALTER TABLE \`role\` ADD COLUMN \`permissions\` LONGTEXT NULL`)
    _permissionsColumnEnsured = true
  } catch (error) {
    // If column already exists (duplicate column error), mark as ensured
    const msg = String(error.message || "")
    if (
      error.code === "ER_DUP_FIELDNAME" ||
      msg.includes("Duplicate column") ||
      msg.includes("already exists")
    ) {
      _permissionsColumnEnsured = true
      return
    }
    // Log other errors but don't crash - the query fallback variants will handle missing column
    console.error("[roles] ensurePermissionsStorage error:", error.message || error)
  }
}

router.get("/counts", async (_, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT COALESCE(r.role_name, 'User') AS roleName, COUNT(u.id) AS userCount FROM users u LEFT JOIN `role` r ON u.role_id = r.id GROUP BY roleName"
    )

    return res.json({
      roles: rows.map((row) => ({
        roleName: row.roleName,
        userCount: Number(row.userCount || 0),
      })),
    })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.get("/", async (_, res) => {
  try {
    await ensurePermissionsStorage()

    // Query variants ordered from most complete to least, with backticks on reserved keyword `role`
    // Also includes variants WITHOUT description column for databases that may be missing it
    const queryVariants = [
      "SELECT id, role_name, description, permissions FROM `role` ORDER BY id ASC",
      "SELECT id, role_name, permissions FROM `role` ORDER BY id ASC",
      "SELECT id, role_name, description, permission AS permissions FROM `role` ORDER BY id ASC",
      "SELECT id, role_name, permission AS permissions FROM `role` ORDER BY id ASC",
      "SELECT id, role_name, description FROM `role` ORDER BY id ASC",
      "SELECT id, role_name FROM `role` ORDER BY id ASC",
    ]

    let rows = []
    let lastError = null
    let usedQuery = ""

    for (const query of queryVariants) {
      try {
        const [result] = await pool.query(query)
        rows = result
        lastError = null
        usedQuery = query
        break
      } catch (error) {
        if (error.code === "ER_BAD_FIELD_ERROR" || String(error.message || "").includes("Unknown column")) {
          lastError = error
          continue
        }

        throw error
      }
    }

    if (lastError) {
      throw lastError
    }

    console.log(`[roles GET] succeeded with query: ${usedQuery.slice(0, 60)}...`)

    return res.json({
      roles: rows.map((row) => ({
        id: row.id,
        name: row.role_name,
        description: row.description || "",
        permissions: parsePermissions(row.permissions),
      })),
    })
  } catch (error) {
    console.error("[roles GET] error:", error.message || error)
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.post("/", async (req, res) => {
  try {
    await ensurePermissionsStorage()

    const name = String(req.body?.name || "").trim()
    const description = String(req.body?.description || "").trim()
    const selectedPermissions = Array.isArray(req.body?.permissions)
      ? req.body.permissions.map((item) => String(item || "").trim()).filter(Boolean)
      : []
    const permissions = isAdminRoleName(name) ? ["Toàn quyền"] : selectedPermissions

    if (!name) {
      return res.status(400).json({ message: "Tên vai trò không được để trống" })
    }

    const permissionsJson = JSON.stringify(permissions)

    const queryVariants = [
      "INSERT INTO `role` (role_name, description, permissions) VALUES (?, ?, ?)",
      "INSERT INTO `role` (role_name, permissions) VALUES (?, ?)",
      "INSERT INTO `role` (role_name, description, permission) VALUES (?, ?, ?)",
      "INSERT INTO `role` (role_name, permission) VALUES (?, ?)",
      "INSERT INTO `role` (role_name, description) VALUES (?, ?)",
      "INSERT INTO `role` (role_name) VALUES (?)",
    ]

    const queryParams = [
      [name, description || null, permissionsJson],
      [name, permissionsJson],
      [name, description || null, permissionsJson],
      [name, permissionsJson],
      [name, description || null],
      [name],
    ]

    let insertId = null
    let lastError = null

    for (let index = 0; index < queryVariants.length; index += 1) {
      try {
        const [result] = await pool.query(queryVariants[index], queryParams[index])
        insertId = result.insertId
        lastError = null
        break
      } catch (error) {
        if (error.code === "ER_BAD_FIELD_ERROR" || String(error.message || "").includes("Unknown column")) {
          lastError = error
          continue
        }

        if (error.code === "ER_DUP_ENTRY") {
          return res.status(409).json({ message: "Vai trò đã tồn tại" })
        }

        throw error
      }
    }

    if (lastError) {
      throw lastError
    }

    return res.json({ ok: true, id: insertId })
  } catch (error) {
    console.error("[roles POST] error:", error.message || error)
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.put("/:id", async (req, res) => {
  try {
    await ensurePermissionsStorage()

    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID vai trò không hợp lệ" })
    }

    const name = String(req.body?.name || "").trim()
    const description = String(req.body?.description || "").trim()
    const selectedPermissions = Array.isArray(req.body?.permissions)
      ? req.body.permissions.map((item) => String(item || "").trim()).filter(Boolean)
      : []
    const permissions = isAdminRoleName(name) ? ["Toàn quyền"] : selectedPermissions

    if (!name) {
      return res.status(400).json({ message: "Tên vai trò không được để trống" })
    }

    const permissionsJson = JSON.stringify(permissions)

    const queryVariants = [
      "UPDATE `role` SET role_name = ?, description = ?, permissions = ? WHERE id = ?",
      "UPDATE `role` SET role_name = ?, permissions = ? WHERE id = ?",
      "UPDATE `role` SET role_name = ?, description = ?, permission = ? WHERE id = ?",
      "UPDATE `role` SET role_name = ?, permission = ? WHERE id = ?",
      "UPDATE `role` SET role_name = ?, description = ? WHERE id = ?",
      "UPDATE `role` SET role_name = ? WHERE id = ?",
    ]

    const queryParams = [
      [name, description || null, permissionsJson, id],
      [name, permissionsJson, id],
      [name, description || null, permissionsJson, id],
      [name, permissionsJson, id],
      [name, description || null, id],
      [name, id],
    ]

    let result = null
    let lastError = null
    let usedPutQuery = ""

    for (let index = 0; index < queryVariants.length; index += 1) {
      try {
        const [queryResult] = await pool.query(queryVariants[index], queryParams[index])
        result = queryResult
        lastError = null
        usedPutQuery = queryVariants[index]
        break
      } catch (error) {
        if (error.code === "ER_BAD_FIELD_ERROR" || String(error.message || "").includes("Unknown column")) {
          lastError = error
          continue
        }

        if (error.code === "ER_DUP_ENTRY") {
          return res.status(409).json({ message: "Vai trò đã tồn tại" })
        }

        throw error
      }
    }

    if (lastError) {
      throw lastError
    }

    if (!result || !result.affectedRows) {
      return res.status(404).json({ message: "Không tìm thấy vai trò" })
    }

    console.log(`[roles PUT] id=${id} succeeded with: ${usedPutQuery.slice(0, 60)}... permissions=${permissionsJson.slice(0, 50)}`)
    return res.json({ ok: true })
  } catch (error) {
    console.error("[roles PUT] error:", error.message || error)
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID vai trò không hợp lệ" })
    }

    try {
      const [result] = await pool.query("DELETE FROM `role` WHERE id = ?", [id])

      if (!result.affectedRows) {
        return res.status(404).json({ message: "Không tìm thấy vai trò" })
      }

      return res.json({ ok: true })
    } catch (error) {
      if (error.code === "ER_ROW_IS_REFERENCED_2") {
        return res.status(409).json({ message: "Vai trò đang được gán cho người dùng, không thể xóa" })
      }

      throw error
    }
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

module.exports = router
