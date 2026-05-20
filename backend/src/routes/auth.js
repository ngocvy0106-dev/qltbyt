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

async function findUserForPasswordChange({ userId, username }) {
  const hasUserId = Number.isInteger(Number(userId)) && Number(userId) > 0
  const normalizedUsername = String(username || "").trim()

  const byIdQueries = [
    `SELECT id, username, full_name, password_hash FROM users WHERE id = ? LIMIT 1`,
    `SELECT id, username, full_name, password FROM users WHERE id = ? LIMIT 1`,
  ]

  const byUsernameQueries = [
    `SELECT id, username, full_name, password_hash FROM users WHERE username = ? LIMIT 1`,
    `SELECT id, username, full_name, password FROM users WHERE username = ? LIMIT 1`,
  ]

  let lastError = null
  let rows = []

  if (hasUserId) {
    for (const query of byIdQueries) {
      try {
        const [result] = await pool.query(query, [Number(userId)])
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
  }

  if (!rows.length && normalizedUsername) {
    for (const query of byUsernameQueries) {
      try {
        const [result] = await pool.query(query, [normalizedUsername])
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

function parseDeviceName(userAgent) {
  const ua = String(userAgent || "").toLowerCase()
  if (!ua) return "Unknown Device"
  if (ua.includes("android")) return "Android Phone"
  if (ua.includes("iphone")) return "iPhone"
  if (ua.includes("ipad")) return "iPad"
  if (ua.includes("windows")) return "Windows PC"
  if (ua.includes("mac os") || ua.includes("macintosh")) return "Mac"
  if (ua.includes("linux")) return "Linux PC"
  return "Unknown Device"
}

async function recordLoginSession({ userId, req, deviceName, browser }) {
  if (!Number.isInteger(Number(userId)) || Number(userId) <= 0) {
    return
  }

  const normalizedDeviceName = String(deviceName || "").trim()
  const normalizedBrowser = String(browser || "").trim()
  const userAgent = String(req.headers["user-agent"] || "").trim()
  const ipAddress = getClientIp(req)

  const resolvedDeviceName = normalizedDeviceName || parseDeviceName(userAgent)
  const resolvedBrowser = normalizedBrowser || parseBrowser(userAgent)
  const location = await resolveLocation(ipAddress)

  try {
    await pool.query("UPDATE user_login_sessions SET is_current = 0 WHERE user_id = ?", [userId])
  } catch (error) {
    if (["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR"].includes(error.code)) {
      return
    }
    throw error
  }

  try {
    const [existingRows] = await pool.query(
      `SELECT id
       FROM user_login_sessions
       WHERE user_id = ? AND device_name = ? AND browser = ?
       ORDER BY last_active_at DESC
       LIMIT 1`,
      [userId, resolvedDeviceName, resolvedBrowser]
    )

    if (existingRows.length) {
      const sessionId = existingRows[0].id
      await pool.query(
        `UPDATE user_login_sessions
         SET location = ?, ip_address = ?, last_active_at = NOW(), login_at = NOW(), is_current = 1
         WHERE id = ? AND user_id = ?`,
        [location, ipAddress, sessionId, userId]
      )
      return
    }

    await pool.query(
      `INSERT INTO user_login_sessions
       (user_id, device_name, browser, location, ip_address, login_at, last_active_at, is_current)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW(), 1)`,
      [userId, resolvedDeviceName, resolvedBrowser, location, ipAddress]
    )
  } catch (error) {
    if (["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR"].includes(error.code)) {
      return
    }
    throw error
  }
}

async function fetchLoginSessions(userId) {
  const queries = [
    {
      sql: `SELECT id, device_name, browser, location, last_active_at, login_at, is_current
            FROM user_login_sessions
            WHERE user_id = ?
            ORDER BY last_active_at DESC
            LIMIT 12`,
      sessionKey: "id",
    },
    {
      sql: `SELECT session_id, device_name, browser, location, last_active_at, login_at, is_current
            FROM user_login_sessions
            WHERE user_id = ?
            ORDER BY last_active_at DESC
            LIMIT 12`,
      sessionKey: "session_id",
    },
    {
      sql: `SELECT device_name, browser, location, last_active_at, login_at, is_current
            FROM user_login_sessions
            WHERE user_id = ?
            ORDER BY last_active_at DESC
            LIMIT 12`,
      sessionKey: null,
    },
  ]

  let lastError = null

  for (const query of queries) {
    try {
      const [rows] = await pool.query(query.sql, [userId])
      return rows.map((row) => {
        const lastActive = row.last_active_at || row.login_at || null
        let lastActiveIso = null
        if (lastActive) {
          const parsed = new Date(lastActive)
          if (!Number.isNaN(parsed.getTime())) {
            lastActiveIso = parsed.toISOString()
          }
        }

        const sessionRaw = query.sessionKey ? row[query.sessionKey] : null
        const sessionId = Number.isInteger(Number(sessionRaw)) ? Number(sessionRaw) : null

        return {
          sessionId,
          deviceName: row.device_name || "Unknown Device",
          browser: row.browser || "Unknown",
          location: row.location || null,
          lastActive: lastActiveIso,
          isCurrent: Boolean(row.is_current),
        }
      })
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

    try {
      await recordLoginSession({
        userId: user.id,
        req,
        deviceName: req.body?.deviceName,
        browser: req.body?.browser,
      })
    } catch (error) {
      console.warn("Cannot record login session:", error.message || error)
    }

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

router.get("/sessions", async (req, res) => {
  try {
    const userId = Number(req.query?.userId || req.headers["x-user-id"] || 0)
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.json({ sessions: [] })
    }

    const sessions = await fetchLoginSessions(userId)
    return res.json({ sessions })
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      return res.json({ sessions: [] })
    }

    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.post("/sessions/logout", async (req, res) => {
  try {
    const userId = Number(req.body?.userId || req.headers["x-user-id"] || 0)
    const sessionId = Number(req.body?.sessionId || req.body?.id || 0)

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ message: "Chua dang nhap" })
    }

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      return res.status(400).json({ message: "Thieu sessionId" })
    }

    const deleteQueries = [
      {
        sql: "DELETE FROM user_login_sessions WHERE user_id = ? AND id = ?",
        params: [userId, sessionId],
      },
      {
        sql: "DELETE FROM user_login_sessions WHERE user_id = ? AND session_id = ?",
        params: [userId, sessionId],
      },
    ]

    let lastError = null
    let deletedCount = 0

    for (const query of deleteQueries) {
      try {
        const [result] = await pool.query(query.sql, query.params)
        deletedCount = result?.affectedRows || 0
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

    if (!deletedCount) {
      return res.status(404).json({ message: "Khong tim thay phien dang nhap" })
    }

    await logActivity({
      userId,
      action: "user.logout_session",
      description: `Dang xuat session ${sessionId}`,
      entityType: "user",
      entityId: userId,
    })

    return res.json({ ok: true })
  } catch (error) {
    return res.status(500).json({ message: "Loi server", detail: String(error.message || error) })
  }
})

router.post("/sessions/clear", async (req, res) => {
  try {
    const userId = Number(req.body?.userId || req.headers["x-user-id"] || 0)

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({ message: "Chua dang nhap" })
    }

    let deletedCount = 0
    try {
      const [result] = await pool.query(
        "DELETE FROM user_login_sessions WHERE user_id = ?",
        [userId]
      )
      deletedCount = result?.affectedRows || 0
    } catch (error) {
      if (error.code === "ER_NO_SUCH_TABLE") {
        return res.json({ ok: true, deleted: 0 })
      }

      throw error
    }

    await logActivity({
      userId,
      action: "user.logout_all_sessions",
      description: `Dang xoa toan bo session (${deletedCount})`,
      entityType: "user",
      entityId: userId,
    })

    return res.json({ ok: true, deleted: deletedCount })
  } catch (error) {
    return res.status(500).json({ message: "Loi server", detail: String(error.message || error) })
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
