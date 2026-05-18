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

    const [rows] = await pool.query(
      `SELECT device_name, browser, location, last_active_at, login_at, is_current
       FROM user_login_sessions
       WHERE user_id = ?
       ORDER BY last_active_at DESC
       LIMIT 12`,
      [userId]
    )

    const sessions = rows.map((row) => {
      const lastActive = row.last_active_at || row.login_at || null
      let lastActiveIso = null
      if (lastActive) {
        const parsed = new Date(lastActive)
        if (!Number.isNaN(parsed.getTime())) {
          lastActiveIso = parsed.toISOString()
        }
      }

      return {
        deviceName: row.device_name || "Unknown Device",
        browser: row.browser || "Unknown",
        location: row.location || null,
        lastActive: lastActiveIso,
        isCurrent: Boolean(row.is_current),
      }
    })

    return res.json({ sessions })
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      return res.json({ sessions: [] })
    }

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
