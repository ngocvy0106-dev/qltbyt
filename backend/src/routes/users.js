const express = require("express")
const { pool } = require("../db")
const { logActivity } = require("../activity")

const router = express.Router()

function normalizeStatus(value) {
  const text = String(value || "").trim().toLowerCase()

  if (!text) {
    return "Hoạt động"
  }

  if (text === "inactive" || text === "locked" || text === "khoa" || text === "khóa") {
    return "Khóa"
  }

  return "Hoạt động"
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
}

function isAdminRoleName(value) {
  const role = normalizeText(value)
  return role.includes("admin") || role.includes("quan tri vien") || role.includes("administrator")
}

function normalizeUserRow(row) {
  return {
    id: row.id,
    name: row.full_name || row.username || "-",
    username: row.username || "-",
    role: row.role_name || "-",
    roleId: row.role_id || null,
    department: row.department_name || row.department || (row.department_id ? String(row.department_id) : null),
    status: normalizeStatus(row.status),
    lastLogin: row.last_login || row.updated_at || row.created_at || null,
  }
}

function resolveActorUserId(req) {
  const candidate = Number(req?.body?.actorUserId || req?.query?.actorUserId || 0)
  return Number.isInteger(candidate) && candidate > 0 ? candidate : null
}

async function queryUsersWithRole() {
  const queries = [
    `SELECT
       u.id,
       u.username,
       u.full_name,
       u.created_at,
       u.updated_at,
       u.last_login,
       u.status,
       u.department_name,
       u.role_id,
       r.role_name
     FROM users u
     LEFT JOIN role r ON u.role_id = r.id
    ORDER BY u.id ASC`,
    `SELECT
       u.id,
       u.username,
       u.full_name,
       u.created_at,
       u.updated_at,
       u.last_login,
       u.status,
       u.department,
       u.role_id,
       r.role_name
     FROM users u
     LEFT JOIN role r ON u.role_id = r.id
    ORDER BY u.id ASC`,
    `SELECT
       u.id,
       u.username,
       u.full_name,
       u.created_at,
       u.updated_at,
       u.status,
       u.department_name,
       u.role_id,
       r.role_name
     FROM users u
     LEFT JOIN role r ON u.role_id = r.id
    ORDER BY u.id ASC`,
    `SELECT
       u.id,
       u.username,
       u.full_name,
       u.created_at,
       u.updated_at,
       u.department,
       u.role_id,
       r.role_name
     FROM users u
     LEFT JOIN role r ON u.role_id = r.id
    ORDER BY u.id ASC`,
    `SELECT
       u.id,
       u.username,
       u.full_name,
       u.created_at,
       u.updated_at,
       u.role_id,
       r.role_name
     FROM users u
     LEFT JOIN role r ON u.role_id = r.id
    ORDER BY u.id ASC`,
  ]

  let lastError = null

  for (const query of queries) {
    try {
      const [rows] = await pool.query(query)
      return rows
    } catch (error) {
      if (error.code === "ER_BAD_FIELD_ERROR") {
        lastError = error
        continue
      }

      throw error
    }
  }

  throw lastError
}

router.get("/summary", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim().toLowerCase()
    const roleFilter = String(req.query.role || "").trim().toLowerCase()
    const statusFilter = String(req.query.status || "").trim().toLowerCase()

    const rows = await queryUsersWithRole()
    const normalizedRows = rows.map(normalizeUserRow)

    const [roleRows] = await pool.query("SELECT id, role_name FROM role ORDER BY id ASC")

    const filteredUsers = normalizedRows.filter((item) => {
      const matchedSearch =
        !search ||
        String(item.name).toLowerCase().includes(search) ||
        String(item.username).toLowerCase().includes(search) ||
        String(item.role).toLowerCase().includes(search)

      const matchedRole = !roleFilter || roleFilter === "all" || String(item.role).toLowerCase() === roleFilter
      const matchedStatus =
        !statusFilter || statusFilter === "all" || String(item.status).toLowerCase() === statusFilter

      return matchedSearch && matchedRole && matchedStatus
    })

    const totalUsers = normalizedRows.length
    const activeUsers = normalizedRows.filter((item) => item.status === "Hoạt động").length
    const roleCounts = normalizedRows.reduce((acc, item) => {
      const key = String(item.role || "").trim().toLowerCase() || "unknown"
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})

    const adminCount = roleCounts["admin"] || roleCounts["quản trị viên"] || roleCounts["quan tri vien"] || 0
    const employeeCount = roleCounts["nhân viên"] || roleCounts["nhan vien"] || roleCounts["nhan-vien"] || 0

    return res.json({
      summary: {
        totalUsers,
        activeUsers,
        adminUsers: adminCount,
        employeeUsers: employeeCount,
      },
      users: filteredUsers,
      roles: roleRows.map((row) => ({ id: row.id, name: row.role_name })),
    })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.get("/activity-logs", async (req, res) => {
  try {
    const requesterRole = String(req.query.requesterRole || "").trim()
    if (!isAdminRoleName(requesterRole)) {
      return res.status(403).json({ message: "Bạn không có quyền xem nhật kí người dùng" })
    }

    const queryVariants = [
      `SELECT
         a.id,
         a.action,
         a.description,
         a.entity_id,
         a.created_at,
         u.username,
         u.full_name,
         COALESCE(r.role_name, '-') AS role_name
       FROM activity a
       INNER JOIN users u ON a.user_id = u.id
       LEFT JOIN role r ON u.role_id = r.id
       WHERE COALESCE(LOWER(TRIM(r.role_name)), '') NOT IN ('admin', 'quản trị viên', 'quan tri vien', 'administrator')
       ORDER BY a.id DESC
       LIMIT 80`,
      `SELECT
         a.id,
         a.action,
         a.description,
        a.entity_id,
         u.username,
         u.full_name,
         COALESCE(r.role_name, '-') AS role_name
       FROM activity a
       INNER JOIN users u ON a.user_id = u.id
       LEFT JOIN role r ON u.role_id = r.id
       WHERE COALESCE(LOWER(TRIM(r.role_name)), '') NOT IN ('admin', 'quản trị viên', 'quan tri vien', 'administrator')
       ORDER BY a.id DESC
       LIMIT 80`,
      `SELECT
         a.id,
         a.action,
         a.description,
        a.entity_id,
         a.created_at,
         u.username,
         u.full_name,
         '-' AS role_name
       FROM activity a
       INNER JOIN users u ON a.user_id = u.id
       ORDER BY a.id DESC
       LIMIT 80`,
    ]

    let rows = []
    let lastError = null

    for (const query of queryVariants) {
      try {
        const [result] = await pool.query(query)
        rows = result
        lastError = null
        break
      } catch (error) {
        if (["ER_BAD_FIELD_ERROR", "ER_NO_SUCH_TABLE"].includes(error.code)) {
          lastError = error
          continue
        }

        throw error
      }
    }

    if (lastError && rows.length === 0) {
      return res.json({ logs: [] })
    }

    const transferIds = rows
      .filter((row) => String(row.action || "").trim().startsWith("transfer."))
      .map((row) => Number(row.entity_id || 0))
      .filter((id) => Number.isInteger(id) && id > 0)

    const transferMetaMap = new Map()
    if (transferIds.length) {
      const placeholders = transferIds.map(() => "?").join(", ")
      const transferQueries = [
        `SELECT id, device_name, transfer_reason
         FROM device_transfers
         WHERE id IN (${placeholders})`,
        `SELECT id, device_name
         FROM device_transfers
         WHERE id IN (${placeholders})`,
      ]

      for (const query of transferQueries) {
        try {
          const [transferRows] = await pool.query(query, transferIds)
          transferRows.forEach((item) => {
            const transferId = Number(item.id || 0)
            if (!Number.isInteger(transferId) || transferId <= 0) {
              return
            }

            transferMetaMap.set(transferId, {
              deviceName: String(item.device_name || "").trim() || "Thiết bị",
              reason: String(item.transfer_reason || "").trim() || null,
            })
          })
          break
        } catch (error) {
          if (error.code === "ER_BAD_FIELD_ERROR") {
            continue
          }

          if (error.code === "ER_NO_SUCH_TABLE") {
            break
          }

          throw error
        }
      }
    }

    const logs = rows
      .filter((row) => !isAdminRoleName(row.role_name))
      .map((row) => {
        const action = row.action || "-"
        let description = row.description || "-"

        if (String(action || "").trim().startsWith("transfer.")) {
          const transferId = Number(row.entity_id || 0)
          const transferMeta = transferMetaMap.get(transferId)
          if (transferMeta) {
            const reasonText = String(transferMeta.reason || "")
              .trim()
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/đ/g, "d")
            const isAllocation = reasonText.includes("cap phat") || reasonText.includes("yeu cau cap phat")
            description = isAllocation
              ? `Yêu cầu cấp phát thiết bị ${transferMeta.deviceName}`
              : `Yêu cầu điều chuyển thiết bị ${transferMeta.deviceName}`
          }
        }

        return {
          id: row.id,
          username: row.username || "-",
          fullName: row.full_name || "-",
          role: row.role_name || "-",
          action,
          description,
          createdAt: row.created_at || null,
        }
      })

    return res.json({ logs })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.post("/", async (req, res) => {
  try {
    const { name, username, roleId, password, status, departmentName } = req.body || {}
    const actorUserId = resolveActorUserId(req)

    const normalizedName = String(name || "").trim()
    const normalizedUsername = String(username || "").trim()
    const normalizedPassword = String(password || "123456").trim() || "123456"
    const normalizedRoleId = roleId === null || roleId === undefined || roleId === "" ? null : Number(roleId)
    const normalizedStatus = String(status || "Hoạt động").trim() || "Hoạt động"
    const normalizedDepartmentName = String(departmentName || "").trim() || null

    if (!normalizedName) {
      return res.status(400).json({ message: "Họ tên không được để trống" })
    }

    if (!normalizedUsername) {
      return res.status(400).json({ message: "Tài khoản không được để trống" })
    }

    const queryVariants = [
      `INSERT INTO users (full_name, username, password_hash, role_id, department_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      `INSERT INTO users (full_name, username, password_hash, role_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      `INSERT INTO users (full_name, username, password_hash, role_id, department_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      `INSERT INTO users (full_name, username, password_hash, role_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
    ]

    const queryParams = [
      [normalizedName, normalizedUsername, normalizedPassword, normalizedRoleId, normalizedDepartmentName, normalizedStatus],
      [normalizedName, normalizedUsername, normalizedPassword, normalizedRoleId, normalizedStatus],
      [normalizedName, normalizedUsername, normalizedPassword, normalizedRoleId, normalizedDepartmentName],
      [normalizedName, normalizedUsername, normalizedPassword, normalizedRoleId],
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
        if (error.code === "ER_BAD_FIELD_ERROR") {
          lastError = error
          continue
        }

        if (error.code === "ER_DUP_ENTRY") {
          return res.status(409).json({ message: "Tài khoản đã tồn tại" })
        }

        throw error
      }
    }

    if (lastError) {
      throw lastError
    }

    await logActivity({
      userId: actorUserId,
      action: "user.create",
      description: `Tài khoản ${normalizedUsername}`,
      entityType: "user",
      entityId: insertId,
    })

    return res.json({ ok: true, id: insertId })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id)

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID người dùng không hợp lệ" })
    }

    const queries = [
      `SELECT
         u.id,
         u.username,
         u.full_name,
         u.created_at,
         u.updated_at,
         u.last_login,
         u.status,
         u.department_name,
         u.role_id,
         r.role_name
       FROM users u
       LEFT JOIN role r ON u.role_id = r.id
       WHERE u.id = ?
       LIMIT 1`,
      `SELECT
         u.id,
         u.username,
         u.full_name,
         u.created_at,
         u.updated_at,
         u.department,
         u.role_id,
         r.role_name
       FROM users u
       LEFT JOIN role r ON u.role_id = r.id
       WHERE u.id = ?
       LIMIT 1`,
      `SELECT
         u.id,
         u.username,
         u.full_name,
         u.created_at,
         u.updated_at,
         u.role_id,
         r.role_name
       FROM users u
       LEFT JOIN role r ON u.role_id = r.id
       WHERE u.id = ?
       LIMIT 1`,
    ]

    let rows = []
    let lastError = null

    for (const query of queries) {
      try {
        const [result] = await pool.query(query, [id])
        rows = result
        lastError = null
        break
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

    if (!rows.length) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" })
    }

    const userRow = rows[0]

    if (!userRow.department_name && !userRow.department) {
      const departmentQueries = [
        "SELECT department_name, department FROM users WHERE id = ? LIMIT 1",
        "SELECT department_name FROM users WHERE id = ? LIMIT 1",
        "SELECT department FROM users WHERE id = ? LIMIT 1",
      ]

      for (const query of departmentQueries) {
        try {
          const [deptRows] = await pool.query(query, [id])
          if (Array.isArray(deptRows) && deptRows.length) {
            Object.assign(userRow, deptRows[0])
          }
          break
        } catch (error) {
          if (error.code === "ER_BAD_FIELD_ERROR") {
            continue
          }

          throw error
        }
      }
    }

    return res.json({ user: normalizeUserRow(userRow) })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id)
    const actorUserId = resolveActorUserId(req)

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID người dùng không hợp lệ" })
    }

    const { name, username, roleId, departmentName, skipActivityLog } = req.body || {}

    const normalizedDepartmentName = String(departmentName || "").trim() || null

    const queryVariants = [
      `UPDATE users
       SET full_name = ?,
           username = ?,
           role_id = ?,
           department_name = ?,
           updated_at = NOW()
       WHERE id = ?`,
      `UPDATE users
       SET full_name = ?,
           username = ?,
           role_id = ?,
           department = ?,
           updated_at = NOW()
       WHERE id = ?`,
      `UPDATE users
       SET full_name = ?,
           username = ?,
           role_id = ?,
           updated_at = NOW()
       WHERE id = ?`,
    ]

    const queryParams = [
      [name ?? null, username ?? null, roleId ?? null, normalizedDepartmentName, id],
      [name ?? null, username ?? null, roleId ?? null, normalizedDepartmentName, id],
      [name ?? null, username ?? null, roleId ?? null, id],
    ]

    let result = null
    let lastError = null

    for (let index = 0; index < queryVariants.length; index += 1) {
      try {
        const [queryResult] = await pool.query(queryVariants[index], queryParams[index])
        result = queryResult
        lastError = null
        break
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

    if (!result || !result.affectedRows) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" })
    }

    if (!skipActivityLog && (!actorUserId || actorUserId !== id)) {
      await logActivity({
        userId: actorUserId,
        action: "user.update",
        description: `Tài khoản ${String(username || "-").trim() || "-"}`,
        entityType: "user",
        entityId: id,
      })
    }

    return res.json({ ok: true })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.post("/:id/reset-password", async (req, res) => {
  try {
    const id = Number(req.params.id)
    const actorUserId = resolveActorUserId(req)

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID người dùng không hợp lệ" })
    }

    const newPassword = String(req.body?.newPassword || "123456").trim() || "123456"

    const [[user]] = await pool.query("SELECT username FROM users WHERE id = ?", [id])

    const [result] = await pool.query(
      `UPDATE users
       SET password_hash = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [newPassword, id]
    )

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" })
    }

    await logActivity({
      userId: actorUserId,
      action: "user.reset_password",
      description: `Tài khoản ${String(user?.username || "-").trim() || "-"}`,
      entityType: "user",
      entityId: id,
    })

    return res.json({ ok: true })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.patch("/:id/lock", async (req, res) => {
  try {
    const id = Number(req.params.id)
    const actorUserId = resolveActorUserId(req)

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID người dùng không hợp lệ" })
    }

    const isLocked = req.body?.locked !== false
    const statusValue = isLocked ? "Khóa" : "Hoạt động"

    try {
      const [[user]] = await pool.query("SELECT username FROM users WHERE id = ?", [id])

      const [result] = await pool.query(
        `UPDATE users
         SET status = ?,
             updated_at = NOW()
         WHERE id = ?`,
        [statusValue, id]
      )

      if (!result.affectedRows) {
        return res.status(404).json({ message: "Không tìm thấy người dùng" })
      }

      await logActivity({
        userId: actorUserId,
        action: isLocked ? "user.lock" : "user.unlock",
        description: `Tài khoản ${String(user?.username || "-").trim() || "-"}`,
        entityType: "user",
        entityId: id,
      })

      return res.json({ ok: true })
    } catch (error) {
      if (error.code === "ER_BAD_FIELD_ERROR") {
        return res.status(400).json({ message: "Bảng users chưa có cột status để tạm khóa" })
      }

      throw error
    }
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id)
    const actorUserId = resolveActorUserId(req)

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID người dùng không hợp lệ" })
    }

    const [[user]] = await pool.query("SELECT username FROM users WHERE id = ?", [id])

    const [result] = await pool.query("DELETE FROM users WHERE id = ?", [id])

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" })
    }

    await logActivity({
      userId: actorUserId,
      action: "user.delete",
      description: `Tài khoản ${String(user?.username || "-").trim() || "-"}`,
      entityType: "user",
      entityId: id,
    })

    return res.json({ ok: true })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

module.exports = router
