const express = require("express")
const https = require("https")
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
      const queryVariants = [
      `SELECT
        u.id,
        u.username,
        u.email,
        u.password_hash,
        u.full_name,
        u.department_id,
        dep.name AS department_name,
        COALESCE(r.role_name, 'User') AS role,
        r.permissions AS role_permissions
       FROM users u
       LEFT JOIN \`role\` r ON u.role_id = r.id
       LEFT JOIN departments dep ON u.department_id = dep.id
       WHERE u.username = ? OR u.email = ?
       LIMIT 1`,
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
       WHERE u.username = ? OR u.email = ?
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
       WHERE u.username = ? OR u.email = ?
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
       WHERE u.username = ? OR u.email = ?
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
       WHERE u.username = ? OR u.email = ?
       LIMIT 1`,
     ]
    for (const query of byUsernameQueries) {
      try {
        const [result] = await pool.query(query, [normalizedUsername])
        rows = result
        lastError = null
        break
      } catch (error) {
        if (error.code === "ER_BAD_FIELD_ERROR" || error.code === "ER_NO_SUCH_TABLE") {
          lastError = error
          continue
        }

        throw error
      }
    }
  }

  if (lastError && rows.length === 0) {
    throw lastError
  }

  return rows[0] || null
}

async function updatePasswordForUser({ userId, newPassword }) {
  const queries = [
    "UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?",
    "UPDATE users SET password_hash = ? WHERE id = ?",
    "UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?",
    "UPDATE users SET password = ? WHERE id = ?",
  ]

  let lastError = null

  for (const query of queries) {
    try {
      await pool.query(query, [newPassword, userId])
      return true
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

  return false
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"]
  const realIp = req.headers["x-real-ip"]
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded || realIp
  let ip = String(raw || req.socket?.remoteAddress || "").trim()

  if (!ip) {
    return null
  }

  if (ip.includes(",")) {
    ip = ip.split(",")[0].trim()
  }

  if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7)
  }

  if (ip === "::1") {
    ip = "127.0.0.1"
  }

  return ip || null
}

function isPrivateIpv4(ip) {
  const parts = String(ip || "").split(".")
  if (parts.length !== 4) {
    return false
  }

  const octets = parts.map((value) => Number(value))
  if (octets.some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return false
  }

  if (octets[0] === 10) return true
  if (octets[0] === 127) return true
  if (octets[0] === 192 && octets[1] === 168) return true
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true
  return false
}

function isPrivateIp(ip) {
  const value = String(ip || "").toLowerCase()
  if (!value) return true
  if (value === "::1") return true
  if (value.includes(":")) return true
  return isPrivateIpv4(value)
}

function fetchJson(url, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { "User-Agent": "datn-backend" } },
      (res) => {
        let raw = ""
        res.on("data", (chunk) => {
          raw += chunk
        })
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw))
          } catch (error) {
            reject(error)
          }
        })
      }
    )

    req.on("error", reject)
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("timeout"))
    })
  })
}

async function resolveLocation(ip) {
  if (!ip || isPrivateIp(ip)) {
    return null
  }

  try {
    const data = await fetchJson(`https://ipapi.co/${ip}/json/`)
    if (!data || data.error) {
      return null
    }

    const parts = [data.city, data.region, data.country_name]
      .map((value) => String(value || "").trim())
      .filter(Boolean)

    return parts.length ? parts.join(", ") : null
  } catch (_) {
    return null
  }
}

function parseBrowser(userAgent) {
  const ua = String(userAgent || "").toLowerCase()
  if (!ua) return "Unknown"
  if (ua.includes("edg/")) return "Edge"
  if (ua.includes("opr/") || ua.includes("opera")) return "Opera"
  if (ua.includes("chrome/")) return "Chrome"
  if (ua.includes("firefox/")) return "Firefox"
  if (ua.includes("safari/")) return "Safari"
  return "Unknown"
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
       WHERE u.username = ? OR u.email = ?
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
       WHERE u.username = ? OR u.email = ?
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
       WHERE u.username = ? OR u.email = ?
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
       WHERE u.username = ? OR u.email = ?
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
       WHERE u.username = ? OR u.email = ?
       LIMIT 1`,
      `SELECT
         u.id,
         u.username,
         u.password_hash,
         u.full_name,
         COALESCE(r.role_name, 'User') AS role
       FROM users u
       LEFT JOIN \`role\` r ON u.role_id = r.id
       WHERE u.username = ? OR u.email = ?
       LIMIT 1`,
    ]

    let rows = []
    let lastError = null

    for (const query of queryVariants) {
      try {
        const [result] = await pool.query(query, [username, username])
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
        departmentId: user.department_id ?? null,
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

router.post("/change-password", async (req, res) => {
  try {
    const userId = Number(req.body?.userId || req.headers["x-user-id"] || 0)
    const username = String(req.body?.username || req.headers["x-user-name"] || "").trim()
    const currentPassword = String(req.body?.currentPassword || "").trim()
    const newPassword = String(req.body?.newPassword || "").trim()

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Thiếu mật khẩu hiện tại hoặc mật khẩu mới" })
    }

    if (newPassword.length < 4) {
      return res.status(400).json({ message: "Mật khẩu mới quá ngắn" })
    }

    const user = await findUserForPasswordChange({ userId, username })
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy tài khoản" })
    }

    const storedPassword = user.password_hash ?? user.password
    if (String(storedPassword || "") !== currentPassword) {
      return res.status(401).json({ message: "Mật khẩu hiện tại không đúng" })
    }

    await updatePasswordForUser({ userId: user.id, newPassword })

    await logActivity({
      userId: user.id,
      action: "user.change_password",
      description: `Đổi mật khẩu: ${String(user.username || user.full_name || "-").trim() || "-"}`,
      entityType: "user",
      entityId: user.id,
    })

    return res.json({ ok: true })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

module.exports = router
