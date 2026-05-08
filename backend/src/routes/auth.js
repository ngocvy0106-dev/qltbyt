const express = require("express")
const { pool } = require("../db")
const { logActivity } = require("../activity")

const router = express.Router()

async function updateLastLogin(userId) {
  const updateQueries = [
    "UPDATE users SET last_login = NOW(), updated_at = NOW() WHERE id = ?",
    "UPDATE users SET last_login = NOW() WHERE id = ?",
    "UPDATE users SET updated_at = NOW() WHERE id = ?",
  ]

  let lastSchemaError = null

  for (const query of updateQueries) {
    try {
      await pool.query(query, [userId])
      return
    } catch (error) {
      if (error.code === "ER_BAD_FIELD_ERROR") {
        lastSchemaError = error
        continue
      }

      throw error
    }
  }

  if (lastSchemaError) {
    console.warn("Cannot update login timestamp due to schema mismatch:", lastSchemaError.message)
  }
}

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

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ message: "Thiếu tài khoản hoặc mật khẩu" })
    }

    const queryVariants = [
      `SELECT
         u.id,
         u.username,
        u.email,
         u.password_hash,
         u.full_name,
         u.department_name,
         u.department,
        COALESCE(r.role_name, 'User') AS role,
        r.permissions AS role_permissions
       FROM users u
       LEFT JOIN \`role\` r ON u.role_id = r.id
       WHERE u.username = ?
       LIMIT 1`,
      `SELECT
         u.id,
         u.username,
        u.email,
         u.password_hash,
         u.full_name,
         u.department_name,
         COALESCE(r.role_name, 'User') AS role,
         r.permission AS role_permissions
       FROM users u
       LEFT JOIN \`role\` r ON u.role_id = r.id
       WHERE u.username = ?
       LIMIT 1`,
      `SELECT
         u.id,
         u.username,
        u.email,
         u.password_hash,
         u.full_name,
         u.department,
         COALESCE(r.role_name, 'User') AS role,
         r.permission AS role_permissions
       FROM users u
       LEFT JOIN \`role\` r ON u.role_id = r.id
       WHERE u.username = ?
       LIMIT 1`,
      `SELECT
         u.id,
         u.username,
        u.email,
         u.password_hash,
         u.full_name,
         COALESCE(r.role_name, 'User') AS role,
         r.permission AS role_permissions
       FROM users u
       LEFT JOIN \`role\` r ON u.role_id = r.id
       WHERE u.username = ?
       LIMIT 1`,
      `SELECT
         u.id,
         u.username,
         u.email,
         u.password_hash,
         u.full_name,
         COALESCE(r.role_name, 'User') AS role
       FROM users u
       LEFT JOIN \`role\` r ON u.role_id = r.id
       WHERE u.username = ?
       LIMIT 1`,
      `SELECT
         u.id,
         u.username,
         u.password_hash,
         u.full_name,
         COALESCE(r.role_name, 'User') AS role
       FROM users u
       LEFT JOIN \`role\` r ON u.role_id = r.id
       WHERE u.username = ?
       LIMIT 1`,
    ]

    let rows = []
    let lastError = null

    for (const query of queryVariants) {
      try {
        const [result] = await pool.query(query, [username])
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
      return res.status(401).json({ message: "Sai tài khoản hoặc mật khẩu" })
    }

    const user = rows[0]
    const isValidPassword = user.password_hash === password

    if (!isValidPassword) {
      return res.status(401).json({ message: "Sai tài khoản hoặc mật khẩu" })
    }

    await updateLastLogin(user.id)

    await logActivity({
      userId: user.id,
      action: "user.login",
      description: `Đăng nhập: ${String(user.username || user.full_name || "-").trim() || "-"}`,
      entityType: "user",
      entityId: user.id,
    })

    return res.json({
      token: "logged",
      user: {
        id: user.id,
        username: user.username,
        email: user.email || null,
        role: user.role,
        fullName: user.full_name,
        departmentName: user.department_name || user.department || null,
        permissions: parsePermissions(user.role_permissions),
      },
    })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.post("/logout", async (req, res) => {
  try {
    const userId = Number(req.body?.userId || 0)
    const username = String(req.body?.username || req.body?.fullName || "-").trim() || "-"

    await logActivity({
      userId: Number.isInteger(userId) && userId > 0 ? userId : null,
      action: "user.logout",
      description: `Đăng xuất: ${username}`,
      entityType: "user",
      entityId: Number.isInteger(userId) && userId > 0 ? userId : null,
    })

    return res.json({ ok: true })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

module.exports = router
