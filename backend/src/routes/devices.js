const express = require("express")
const fs = require("fs")
const path = require("path")
const multer = require("multer")
const { pool } = require("../db")
const { logActivity } = require("../activity")

const router = express.Router()

const devicesUploadDir = path.resolve(__dirname, "..", "..", "uploads", "devices")
fs.mkdirSync(devicesUploadDir, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, devicesUploadDir),
    filename: (_, file, cb) => {
      const safeBaseName = String(file.originalname || "device-image")
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .slice(0, 80) || "device-image"
      const extension = path.extname(String(file.originalname || "")).toLowerCase() || ".jpg"
      cb(null, `${Date.now()}-${safeBaseName}${extension}`)
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (!String(file.mimetype || "").startsWith("image/")) {
      cb(new Error("Chỉ chấp nhận file ảnh"))
      return
    }

    cb(null, true)
  },
})

router.post("/upload-image", (req, res) => {
  upload.single("image")(req, res, (error) => {
    if (error) {
      const message =
        error.code === "LIMIT_FILE_SIZE"
          ? "Kích thước ảnh tối đa 5MB"
          : String(error.message || "Tải ảnh thất bại")
      return res.status(400).json({ message })
    }

    const uploadedFile = req.file
    if (!uploadedFile) {
      return res.status(400).json({ message: "Vui lòng chọn file ảnh" })
    }

    const imageUrl = `${req.protocol}://${req.get("host")}/uploads/devices/${uploadedFile.filename}`
    return res.json({ ok: true, imageUrl })
  })
})

function normalizeStatus(value) {
  const raw = String(value || "").trim().toLowerCase()
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")

  if (["available", "active", "hoat dong", "dang hoat dong"].includes(normalized)) {
    return "active"
  }

  if (["maintenance", "bao tri", "dang bao tri"].includes(normalized)) {
    return "maintenance"
  }

  if (["repairing", "sua chua", "dang sua chua"].includes(normalized)) {
    return "repairing"
  }

  if (["inactive", "ngung hoat dong", "tam dung"].includes(normalized)) {
    return "inactive"
  }

  if (["broken", "hong"].includes(normalized)) {
    return "broken"
  }

  return normalized || "active"
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
}

function isNhanVienRole(value) {
  const role = normalizeText(value)
  return role.includes("nhan vien") || role.includes("nhan-vien")
}

function isAdminRole(value) {
  const role = normalizeText(value)
  return role === "admin" || role.includes("quan tri") || role.includes("administrator")
}

function formatCurrencyVnd(value) {
  const numericValue = Number(value || 0)
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0
  return `${new Intl.NumberFormat("vi-VN").format(Math.max(0, safeValue))} VND`
}

function formatRoleLabel(value) {
  const role = String(value || "").trim()
  if (!role) {
    return "Unknown"
  }

  return role
}

function buildDeviceCreateDescription({
  role,
  fullName,
  department,
  deviceName,
  quantity,
  totalCost,
}) {
  const roleLabel = formatRoleLabel(role)
  const displayName = String(fullName || "Không rõ").trim() || "Không rõ"
  const device = String(deviceName || "Thiết bị").trim() || "Thiết bị"
  const safeQuantity = Number.isFinite(Number(quantity)) ? Number(quantity) : 0
  const totalCostText = formatCurrencyVnd(totalCost)

  if (isAdminRole(role)) {
    return `${roleLabel} - ${displayName} - Đã thêm: ${device} - Số lượng: ${safeQuantity} - Tổng chi: ${totalCostText}`
  }

  const departmentLabel = String(department || "Chưa phân khoa").trim() || "Chưa phân khoa"
  return `${roleLabel} - ${displayName} - ${departmentLabel} - Đã thêm: ${device} - Số lượng: ${safeQuantity} - Tổng chi: ${totalCostText}`
}

function buildDeviceBatchImportDescription({ role, fullName, department, batchCode, totalCost }) {
  const roleLabel = formatRoleLabel(role)
  const displayName = String(fullName || "Không rõ").trim() || "Không rõ"
  const batch = String(batchCode || "-").trim() || "-"
  const totalCostText = formatCurrencyVnd(totalCost)

  if (isAdminRole(role)) {
    return `${roleLabel} - ${displayName} - Nhập lô thiết bị: ${batch}`
  }

  const departmentLabel = String(department || "Chưa phân khoa").trim() || "Chưa phân khoa"
  return `${roleLabel} - ${displayName} - ${departmentLabel} - Nhập lô thiết bị: ${batch}`
}

function buildDeviceDeleteDescription({ role, fullName, deviceName, deviceCode, time }) {
  const roleLabel = formatRoleLabel(role)
  const displayName = String(fullName || "Không rõ").trim() || "Không rõ"
  const name = String(deviceName || "Thiết bị").trim() || "Thiết bị"
  const code = String(deviceCode || "-").trim() || "-"

  let timeText = ""
  if (time) {
    try {
      const d = new Date(time)
      timeText = new Intl.DateTimeFormat("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).format(d)
    } catch {
      timeText = String(time)
    }
  }

  return `${roleLabel} [${displayName}] - Xóa thiết bị ${name} [${code}] - ${timeText}`
}

function formatNotificationDate(value) {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)
}

function normalizeIntervalInput(value) {
  const text = String(value || "").trim()
  if (!text) {
    return null
  }

  const normalizedNumber = Number.parseInt(text, 10)
  if (Number.isFinite(normalizedNumber) && normalizedNumber > 0) {
    return normalizedNumber
  }

  return text
}

function toPositiveInteger(value, defaultValue = 1) {
  const parsed = Number.parseInt(String(value ?? defaultValue), 10)
  if (!Number.isFinite(parsed)) {
    return defaultValue
  }

  return parsed
}

function normalizeSerialText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
}

function resolveSerialPrefixFromDeviceName(deviceName) {
  const rawName = String(deviceName || "").trim()
  const normalizedName = normalizeSerialText(deviceName)
  const words = normalizedName.split(/[^a-z0-9]+/).filter(Boolean)

  if (!words.length) {
    return "GEN"
  }

  // Keep common medical abbreviations stable when they appear in device names.
  const explicitPrefixRules = [
    { prefix: "ECG", keywords: ["ecg", "dien tim"] },
    { prefix: "ICU", keywords: ["icu"] },
    { prefix: "MRI", keywords: ["mri"] },
    { prefix: "CT", keywords: ["ct"] },
    { prefix: "XR", keywords: ["x quang", "x-ray", "xray"] },
  ]

  for (const rule of explicitPrefixRules) {
    if (rule.keywords.some((keyword) => normalizedName.includes(keyword))) {
      return rule.prefix
    }
  }

  // Prefer English/acronym tokens in the device name (e.g. SpO2 -> SPO2).
  const originalTokens = rawName
    .split(/\s+/)
    .map((token) =>
      token
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Za-z0-9]/g, "")
    )
    .filter(Boolean)

  const alphaNumericToken = originalTokens.find((token) => /[A-Za-z]/.test(token) && /\d/.test(token))
  if (alphaNumericToken) {
    return alphaNumericToken.toUpperCase().slice(0, 8)
  }

  const uppercaseAcronym = originalTokens.find((token) => /^[A-Z0-9]{2,8}$/.test(token))
  if (uppercaseAcronym) {
    return uppercaseAcronym.slice(0, 8)
  }

  const stopWords = new Set(["may", "thiet", "bi", "he", "thong", "bo", "cua", "va", "cam", "tay"])
  const keyWords = words.filter((word) => !stopWords.has(word))
  const sourceWords = keyWords.length > 0 ? keyWords : words

  const initials = sourceWords
    .map((word) => word.slice(0, 1))
    .join("")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6)

  if (initials.length >= 2) {
    return initials
  }

  const fallback = sourceWords
    .join("")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4)

  return fallback || "GEN"
}

function normalizeSerialPrefix(prefix) {
  const normalizedPrefix = String(prefix || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8)

  return normalizedPrefix || "GEN"
}

function formatSerialCode(prefix, serialNumber) {
  const normalizedPrefix = normalizeSerialPrefix(prefix)
  return `DEV${normalizedPrefix}-${String(serialNumber).padStart(5, "0")}`
}

async function getMaxDeviceSerialByPrefix(connection, prefix) {
  const normalizedPrefix = normalizeSerialPrefix(prefix)
  const [rows] = await connection.query(
    `SELECT MAX(CAST(SUBSTRING_INDEX(device_code, '-', -1) AS UNSIGNED)) AS max_serial
     FROM devices
     WHERE device_code REGEXP CONCAT('^DEV', ?, '-[0-9]+$')`,
    [normalizedPrefix]
  )

  const maxSerial = Number(rows?.[0]?.max_serial || 0)
  if (!Number.isFinite(maxSerial) || maxSerial < 0) {
    return 0
  }

  return maxSerial
}

async function ensureDeviceSerialCounterTable(connection) {
  await connection.query(
    `CREATE TABLE IF NOT EXISTS device_serial_counters_v2 (
       prefix VARCHAR(8) NOT NULL,
       last_serial INT UNSIGNED NOT NULL DEFAULT 0,
       updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       PRIMARY KEY (prefix)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  )
}

async function reserveNextSerialRange(connection, prefix, quantity) {
  const normalizedPrefix = normalizeSerialPrefix(prefix)
  const safeQuantity = Math.max(1, toPositiveInteger(quantity, 1))
  const [counterRows] = await connection.query(
    `SELECT last_serial
     FROM device_serial_counters_v2
     WHERE prefix = ?
     FOR UPDATE`,
    [normalizedPrefix]
  )

  const currentCounter = Number(counterRows?.[0]?.last_serial || 0)
  const currentMaxFromDevices = await getMaxDeviceSerialByPrefix(connection, normalizedPrefix)

  // Business rule: if current stock has no device for this prefix,
  // serial must start from 00001 even if an old counter value exists.
  const baseSerial = currentMaxFromDevices > 0
    ? Math.max(currentCounter, currentMaxFromDevices)
    : 0

  const startSerial = baseSerial + 1
  const endSerial = baseSerial + safeQuantity

  if (!counterRows.length) {
    await connection.query(
      `INSERT INTO device_serial_counters_v2 (prefix, last_serial, updated_at)
       VALUES (?, ?, NOW())`,
      [normalizedPrefix, endSerial]
    )
  } else {
    await connection.query(
      `UPDATE device_serial_counters_v2
       SET last_serial = ?, updated_at = NOW()
       WHERE prefix = ?`,
      [endSerial, normalizedPrefix]
    )
  }

  return startSerial
}

async function getMaintenanceIntervalColumnName(connection) {
  const columns = await getDeviceColumnCache(connection)
  return columns.maintenanceInterval
}

async function getCreatedByColumnName(connection) {
  const columns = await getDeviceColumnCache(connection)
  return columns.createdBy
}

async function getImageUrlColumnName(connection) {
  const columns = await getDeviceColumnCache(connection)
  return columns.imageUrl
}

async function getManufacturerColumnName(connection) {
  const columns = await getDeviceColumnCache(connection)
  return columns.manufacturer
}

async function getBatchCodeColumnName(connection) {
  const columns = await getDeviceColumnCache(connection)
  return columns.batchCode
}

const deviceColumnCache = {
  loadedAt: 0,
  ttlMs: 10 * 1000,  // 10 seconds for cache validity
  values: {
    maintenanceInterval: null,
    createdBy: null,
    imageUrl: null,
    manufacturer: null,
    batchCode: null,
  },
  inflight: null,
}

async function getDeviceColumnCache(connection) {
  const now = Date.now()
  if (deviceColumnCache.loadedAt && now - deviceColumnCache.loadedAt < deviceColumnCache.ttlMs) {
    return deviceColumnCache.values
  }

  if (deviceColumnCache.inflight) {
    return deviceColumnCache.inflight
  }

  deviceColumnCache.inflight = (async () => {
    const [rows] = await connection.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'devices'
         AND COLUMN_NAME IN ('maintenance_interval', 'created_by', 'img_url', 'image_url', 'manufacturer', 'batch_code')`
    )

    const columnSet = new Set((rows || []).map((row) => String(row.COLUMN_NAME || "").trim()))
    deviceColumnCache.values = {
      maintenanceInterval: columnSet.has("maintenance_interval") ? "maintenance_interval" : null,
      createdBy: columnSet.has("created_by") ? "created_by" : null,
      imageUrl: columnSet.has("img_url") ? "img_url" : columnSet.has("image_url") ? "image_url" : null,
      manufacturer: columnSet.has("manufacturer") ? "manufacturer" : null,
      batchCode: columnSet.has("batch_code") ? "batch_code" : null,
    }
    deviceColumnCache.loadedAt = Date.now()
    return deviceColumnCache.values
  })()

  try {
    return await deviceColumnCache.inflight
  } finally {
    deviceColumnCache.inflight = null
  }
}

router.get("/", async (req, res) => {
  let connection

  try {
    connection = await pool.getConnection()

    const search = String(req.query.search || "").trim().toLowerCase()
    const category = String(req.query.category || "").trim().toLowerCase()
    const status = String(req.query.status || "").trim().toLowerCase()
    const role = String(req.query.role || "").trim()
    const departmentName = String(req.query.departmentName || req.query.department || "").trim()
    const departmentId = String(req.query.departmentId || "").trim()
    const requester = normalizeText(String(req.query.requester || ""))
    const requesterAlt = normalizeText(String(req.query.requesterAlt || ""))
    const userId = Number(req.query.userId || 0)
    const isEmployeeRequest = isNhanVienRole(role)
    
    console.log("[DEBUG] Devices GET request:", {
      search,
      role,
      requester,
      requesterAlt,
      userId,
      isEmployeeRequest,
      departmentName,
    })
    let normalizedDepartmentNames = String(departmentName || "")
      .split(/[;,]/)
      .map((item) => normalizeText(item))
      .filter(Boolean)
    let normalizedDepartmentIds = String(departmentId || "")
      .split(/[;,]/)
      .map((item) => Number(String(item || "").trim()))
      .filter((value) => Number.isInteger(value) && value > 0)

    if (
      isEmployeeRequest &&
      normalizedDepartmentNames.length === 0 &&
      normalizedDepartmentIds.length === 0 &&
      Number.isInteger(userId) &&
      userId > 0
    ) {
      const departmentQueries = [
        `SELECT
           COALESCE(
             NULLIF(TRIM(dep.name), ''),
             NULLIF(TRIM(CAST(u.department_id AS CHAR)), '')
           ) AS department_value
         FROM users u
         LEFT JOIN departments dep
           ON TRIM(CAST(u.department_id AS CHAR)) = TRIM(CAST(dep.id AS CHAR))
         WHERE u.id = ?
         LIMIT 1`,
        "SELECT department_id FROM users WHERE id = ? LIMIT 1",
        "SELECT department_name, department FROM users WHERE id = ? LIMIT 1",
        "SELECT department_name FROM users WHERE id = ? LIMIT 1",
        "SELECT department FROM users WHERE id = ? LIMIT 1",
      ]

      for (const query of departmentQueries) {
        try {
          const [rows] = await connection.query(query, [userId])
          if (!rows || rows.length === 0) {
            continue
          }

          const fallbackDepartment = String(
            rows[0].department_value || rows[0].department_name || rows[0].department || ""
          ).trim()
          if (!fallbackDepartment) {
            continue
          }

          const fallbackId = Number(fallbackDepartment)
          if (Number.isInteger(fallbackId) && fallbackId > 0) {
            normalizedDepartmentIds = [fallbackId]
          } else {
            normalizedDepartmentNames = fallbackDepartment
              .split(/[;,]/)
              .map((item) => normalizeText(item))
              .filter(Boolean)
          }

          if (normalizedDepartmentNames.length > 0 || normalizedDepartmentIds.length > 0) {
            break
          }
        } catch (departmentResolveError) {
          if (
            departmentResolveError.code !== "ER_BAD_FIELD_ERROR" &&
            departmentResolveError.code !== "ER_NO_SUCH_TABLE"
          ) {
            throw departmentResolveError
          }
        }
      }
    }
    const allocatedDeviceIdsForRequester = new Set()
    const latestApprovedTransferByDeviceId = new Map()

    if (isEmployeeRequest && (requester || requesterAlt)) {
      try {
        const [approvedAllocationRows] = await pool.query(
          `SELECT device_id, requester_name, transfer_reason
           FROM device_transfers
           WHERE status IN ('approved', 'da duyet')
             AND device_id IS NOT NULL
           ORDER BY id DESC
           LIMIT 500`
        )

        approvedAllocationRows.forEach((row) => {
          const requesterName = normalizeText(row.requester_name || "")
          const isMatchedRequester =
            (requester && requesterName === requester) ||
            (requesterAlt && requesterName === requesterAlt)
          if (!isMatchedRequester) {
            return
          }

          const reasonText = normalizeText(String(row.transfer_reason || ""))
          const isAllocation = reasonText.includes("cap phat") || reasonText.includes("yeu cau cap phat")
          if (!isAllocation) {
            return
          }

          const deviceId = Number(row.device_id || 0)
          if (Number.isInteger(deviceId) && deviceId > 0) {
            allocatedDeviceIdsForRequester.add(deviceId)
          }
        })
      } catch (allocationLookupError) {
        if (
          allocationLookupError.code !== "ER_NO_SUCH_TABLE" &&
          allocationLookupError.code !== "ER_BAD_FIELD_ERROR"
        ) {
          throw allocationLookupError
        }
      }
    }

    if (isEmployeeRequest && Number.isInteger(userId) && userId > 0) {
      try {
        console.log("[DEBUG] Checking allocations for userId:", userId)

        const [allocatedToUserRows] = await pool.query(
          `SELECT device_id
           FROM device_allocations
           WHERE receiver_user_id = ? 
             AND (status IS NULL OR status IN ('pending', 'approved', 'da duyet'))
           ORDER BY id DESC
           LIMIT 500`,
          [userId]
        )

        console.log("[DEBUG] Allocation rows found:", allocatedToUserRows.length, allocatedToUserRows)

        allocatedToUserRows.forEach((row) => {
          const deviceId = Number(row.device_id || 0)
          if (Number.isInteger(deviceId) && deviceId > 0) {
            allocatedDeviceIdsForRequester.add(deviceId)
          }
        })

        console.log("[DEBUG] Allocated device IDs:", Array.from(allocatedDeviceIdsForRequester))
      } catch (userAllocationError) {
        console.log("[DEBUG] Allocation query error:", userAllocationError.message)
        if (
          userAllocationError.code !== "ER_NO_SUCH_TABLE" &&
          userAllocationError.code !== "ER_BAD_FIELD_ERROR"
        ) {
          throw userAllocationError
        }
      }
    }

    if (isEmployeeRequest && (requester || requesterAlt)) {
      try {
        const [allocatedByNameRows] = await pool.query(
          `SELECT device_id, receiver_name
           FROM device_allocations
           WHERE receiver_name IS NOT NULL
             AND (status IS NULL OR status IN ('pending', 'approved', 'da duyet'))
           ORDER BY id DESC
           LIMIT 500`
        )

        allocatedByNameRows.forEach((row) => {
          const receiverName = normalizeText(row.receiver_name || "")
          const matchedReceiver =
            (requester && receiverName === requester) ||
            (requesterAlt && receiverName === requesterAlt)

          if (!matchedReceiver) {
            return
          }

          const deviceId = Number(row.device_id || 0)
          if (Number.isInteger(deviceId) && deviceId > 0) {
            allocatedDeviceIdsForRequester.add(deviceId)
          }
        })
      } catch (allocationNameError) {
        if (
          allocationNameError.code !== "ER_NO_SUCH_TABLE" &&
          allocationNameError.code !== "ER_BAD_FIELD_ERROR"
        ) {
          throw allocationNameError
        }
      }
    }

    const maintenanceIntervalColumnName = await getMaintenanceIntervalColumnName(connection)
    const createdByColumnName = await getCreatedByColumnName(connection)
    const imageUrlColumnName = await getImageUrlColumnName(connection)
    const manufacturerColumnName = await getManufacturerColumnName(connection)
    const batchCodeColumnName = await getBatchCodeColumnName(connection)
    const maintenanceIntervalSelect = maintenanceIntervalColumnName
      ? `d.${maintenanceIntervalColumnName} AS maintenance_interval,`
      : `NULL AS maintenance_interval,`
    const createdBySelect = createdByColumnName
      ? `d.${createdByColumnName} AS created_by,`
      : `NULL AS created_by,`
    const imageUrlSelect = imageUrlColumnName
      ? `d.${imageUrlColumnName} AS image_url,`
      : `NULL AS image_url,`
    const manufacturerSelect = manufacturerColumnName
      ? `d.${manufacturerColumnName} AS manufacturer,`
      : `NULL AS manufacturer,`
    const batchCodeSelect = batchCodeColumnName
      ? `d.${batchCodeColumnName} AS batch_code,`
      : `NULL AS batch_code,`
    const departmentJoinCondition = `(
        LOWER(TRIM(CAST(d.department_id AS CHAR))) = LOWER(TRIM(CAST(dep.id AS CHAR)))
        OR LOWER(TRIM(CAST(d.department_id AS CHAR))) = LOWER(TRIM(dep.name))
      )`

    const createNormalizedRows = (rows) =>
      rows.map((row) => {
        let imageUrl = row.image_url || null
        if (imageUrl && !imageUrl.startsWith('http')) {
          const protocol = req.protocol || 'http'
          const host = req.get('host') || 'localhost:4000'
          const normalizedPath = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`
          imageUrl = `${protocol}://${host}${normalizedPath}`
        }
        return {
          id: row.id,
          code: row.device_code,
          name: row.device_name,
          manufacturer: row.manufacturer || null,
          model: row.model || null,
          departmentName: row.department_name || null,
          roomName: row.room_name || null,
          category: row.category || "Chưa phân loại",
          status: normalizeStatus(row.status),
          value: row.device_value ?? row.value ?? null,
          location: row.location || "-",
          purchaseDate: row.purchase_date,
          warrantyExpiry: row.warranty_expiry,
          maintenanceInterval: row.maintenance_interval,
          createdBy: row.created_by || null,
          imageUrl: imageUrl,
          batchCode: row.batch_code || null,
          updatedAt: row.updated_at,
        }
      })

    let normalizedRows = []
    const employeeWhereParts = []
    const employeeWhereParams = []

    if (isEmployeeRequest) {
      if (normalizedDepartmentIds.length > 0) {
        const placeholders = normalizedDepartmentIds.map(() => "?").join(", ")
        employeeWhereParts.push(`d.department_id IN (${placeholders})`)
        employeeWhereParams.push(...normalizedDepartmentIds)
      }

      if (normalizedDepartmentNames.length > 0) {
        const placeholders = normalizedDepartmentNames.map(() => "?").join(", ")
        employeeWhereParts.push(
          `LOWER(TRIM(COALESCE(dep.name, ''))) COLLATE utf8mb4_unicode_ci IN (${placeholders})`
        )
        employeeWhereParams.push(...normalizedDepartmentNames)
      }

      if (createdByColumnName && (requester || requesterAlt)) {
        const requesterValues = [requester, requesterAlt].filter(Boolean)
        const placeholders = requesterValues.map(() => "?").join(", ")
        employeeWhereParts.push(
          `LOWER(TRIM(d.${createdByColumnName})) COLLATE utf8mb4_unicode_ci IN (${placeholders})`
        )
        employeeWhereParams.push(...requesterValues)
      }

      const allocatedIds = Array.from(allocatedDeviceIdsForRequester)
      if (allocatedIds.length > 0) {
        const placeholders = allocatedIds.map(() => "?").join(", ")
        employeeWhereParts.push(`d.id IN (${placeholders})`)
        employeeWhereParams.push(...allocatedIds)
      }
    }

    if (isEmployeeRequest && employeeWhereParts.length === 0) {
      return res.json({ devices: [] })
    }

    const employeeWhereClause = employeeWhereParts.length
      ? `WHERE (${employeeWhereParts.join(" OR ")})`
      : ""
    const queryVariants = [
      `SELECT
         d.id,
         d.device_code,
         d.device_name,
         ${manufacturerSelect}
         d.model,
         COALESCE(dep.name, 'Chưa phân khoa') AS department_name,
         d.room_name,
         d.\`value\` AS device_value,
         d.category,
         d.status,
         d.location,
         d.purchase_date,
         d.warranty_expiry,
         ${maintenanceIntervalSelect}
         ${createdBySelect}
         ${imageUrlSelect}
         ${batchCodeSelect}
         d.updated_at
       FROM devices d
         LEFT JOIN departments dep ON ${departmentJoinCondition}
       ${employeeWhereClause}
      ORDER BY d.id ASC`,
      `SELECT
         d.id,
         d.device_code,
         d.device_name,
         ${manufacturerSelect}
         d.model,
         COALESCE(dep.name, 'Chưa phân khoa') AS department_name,
         d.room_name,
         d.category,
         d.status,
         d.location,
         d.purchase_date,
         d.warranty_expiry,
         ${maintenanceIntervalSelect}
         ${createdBySelect}
         ${imageUrlSelect}
         ${batchCodeSelect}
         d.updated_at
       FROM devices d
         LEFT JOIN departments dep ON ${departmentJoinCondition}
       ${employeeWhereClause}
      ORDER BY d.id ASC`,
      `SELECT
         d.id,
         d.device_code,
         d.device_name,
         ${manufacturerSelect}
         d.model,
         COALESCE(dep.name, 'Chưa phân khoa') AS department_name,
         d.\`value\` AS device_value,
         d.category,
         d.status,
         d.location,
         d.purchase_date,
         d.warranty_expiry,
         ${maintenanceIntervalSelect}
         ${createdBySelect}
         ${imageUrlSelect}
         ${batchCodeSelect}
         d.updated_at
       FROM devices d
         LEFT JOIN departments dep ON ${departmentJoinCondition}
       ${employeeWhereClause}
      ORDER BY d.id ASC`,
      `SELECT
         d.id,
         d.device_code,
         d.device_name,
         ${manufacturerSelect}
         d.model,
         COALESCE(dep.name, 'Chưa phân khoa') AS department_name,
         d.category,
         d.status,
         d.location,
         d.purchase_date,
         d.warranty_expiry,
         ${maintenanceIntervalSelect}
         ${createdBySelect}
         ${imageUrlSelect}
         ${batchCodeSelect}
         d.updated_at
       FROM devices d
         LEFT JOIN departments dep ON ${departmentJoinCondition}
       ${employeeWhereClause}
      ORDER BY d.id ASC`,
    ]

    let lastError = null

    for (const query of queryVariants) {
      try {
        const [rows] = await pool.query(query, employeeWhereParams)
        normalizedRows = createNormalizedRows(rows)
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

    if (isEmployeeRequest && normalizedDepartmentNames.length > 0) {
      try {
        const [approvedTransferRows] = await pool.query(
          `SELECT device_id, to_department, id
           FROM device_transfers
           WHERE device_id IS NOT NULL
             AND status IN ('approved', 'da duyet', 'completed', 'hoan thanh')
           ORDER BY id DESC
           LIMIT 1000`
        )

        approvedTransferRows.forEach((row) => {
          const deviceId = Number(row.device_id || 0)
          if (!Number.isInteger(deviceId) || deviceId <= 0 || latestApprovedTransferByDeviceId.has(deviceId)) {
            return
          }

          latestApprovedTransferByDeviceId.set(deviceId, normalizeText(row.to_department || ""))
        })
      } catch (transferHistoryError) {
        if (
          transferHistoryError.code !== "ER_NO_SUCH_TABLE" &&
          transferHistoryError.code !== "ER_BAD_FIELD_ERROR"
        ) {
          throw transferHistoryError
        }
      }
    }

    const filteredRows = normalizedRows.filter((row) => {
      const matchedSearch =
        !search ||
        row.name.toLowerCase().includes(search) ||
        row.code.toLowerCase().includes(search) ||
        row.location.toLowerCase().includes(search) ||
        String(row.departmentName || "").toLowerCase().includes(search) ||
        String(row.roomName || "").toLowerCase().includes(search)

      const matchedCategory = !category || row.category.toLowerCase() === category
      const matchedStatus = !status || row.status === status
      const rowDepartmentNormalized = normalizeText(row.departmentName || "")
      const rowCreatedByNormalized = normalizeText(row.createdBy || "")
      const latestApprovedTarget = latestApprovedTransferByDeviceId.get(Number(row.id || 0)) || ""
      const isWarehouseRow =
        !rowDepartmentNormalized ||
        rowDepartmentNormalized.includes("chua phan khoa") ||
        rowDepartmentNormalized.includes("kho thiet bi") ||
        rowDepartmentNormalized.includes("kho")
      const matchedDepartmentByRole =
        normalizedDepartmentNames.length > 0 &&
        normalizedDepartmentNames.includes(rowDepartmentNormalized) &&
        (!latestApprovedTarget || normalizedDepartmentNames.includes(latestApprovedTarget))
      const matchedRequesterByRole =
        isWarehouseRow && (
          (requester && rowCreatedByNormalized === requester) ||
          (requesterAlt && rowCreatedByNormalized === requesterAlt)
        )
      const latestOrCurrentDepartment = latestApprovedTarget || rowDepartmentNormalized
      const matchedAllocationByRole =
        allocatedDeviceIdsForRequester.has(Number(row.id || 0)) &&
        normalizedDepartmentNames.length > 0 &&
        normalizedDepartmentNames.includes(latestOrCurrentDepartment)
      const matchedEmployeeScope =
        !isEmployeeRequest || matchedRequesterByRole || matchedDepartmentByRole || matchedAllocationByRole

      return matchedSearch && matchedCategory && matchedStatus && matchedEmployeeScope
    })

    return res.json({ devices: filteredRows })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  } finally {
    if (connection) {
      connection.release()
    }
  }
})

router.post("/", async (req, res) => {
  let connection
  let transactionStarted = false

  try {
    const {
      name,
      manufacturer,
      model,
      category,
      status,
      value,
      purchaseDate,
      warrantyExpiry,
      maintenanceInterval,
      departmentId,
      quantity,
      createdBy,
      createdByRole,
      createdByDepartment,
      importMode,
      imageUrl,
    } = req.body || {}

    const normalizedName = String(name || "").trim()
    if (!normalizedName) {
      return res.status(400).json({ message: "Tên thiết bị không được để trống" })
    }

    const normalizedQuantity = toPositiveInteger(quantity, 1)
    if (!Number.isInteger(normalizedQuantity) || normalizedQuantity <= 0) {
      return res.status(400).json({ message: "Số lượng phải là số nguyên lớn hơn 0" })
    }

    if (normalizedQuantity > 1000) {
      return res.status(400).json({ message: "Số lượng tối đa cho mỗi lần thêm là 1000" })
    }

    const normalizedStatus = normalizeStatus(status)
    const initialLocation = "Kho thiết bị"
    const normalizedValue =
      value === null || value === undefined || String(value).trim() === ""
        ? null
        : Number(String(value).replace(/,/g, ""))

    const normalizedDepartmentId =
      departmentId === null || departmentId === undefined || String(departmentId).trim() === ""
        ? null
        : String(departmentId).trim()
    connection = await pool.getConnection()
    await ensureDeviceSerialCounterTable(connection)
    await connection.beginTransaction()
    transactionStarted = true

    const normalizedMaintenanceInterval = normalizeIntervalInput(maintenanceInterval)
    const maintenanceIntervalColumnName = await getMaintenanceIntervalColumnName(connection)
    const createdByColumnName = await getCreatedByColumnName(connection)
    const imageUrlColumnName = await getImageUrlColumnName(connection)
    const manufacturerColumnName = await getManufacturerColumnName(connection)
    const normalizedCreatedBy =
      createdBy === null || createdBy === undefined || String(createdBy).trim() === ""
        ? null
        : String(createdBy).trim()
    const normalizedCreatedByRole = String(createdByRole || "").trim() || "Unknown"
    const normalizedCreatedByDepartment =
      createdByDepartment === null ||
      createdByDepartment === undefined ||
      String(createdByDepartment).trim() === ""
        ? null
        : String(createdByDepartment).trim()
    const normalizedImageUrl =
      imageUrl === null || imageUrl === undefined || String(imageUrl).trim() === ""
        ? null
        : String(imageUrl).trim()
    const optionalInsertColumns = []
    const optionalInsertValues = []

    if (maintenanceIntervalColumnName) {
      optionalInsertColumns.push(maintenanceIntervalColumnName)
      optionalInsertValues.push(normalizedMaintenanceInterval)
    }

    if (createdByColumnName) {
      optionalInsertColumns.push(createdByColumnName)
      optionalInsertValues.push(normalizedCreatedBy)
    }

    if (imageUrlColumnName) {
      optionalInsertColumns.push(imageUrlColumnName)
      optionalInsertValues.push(normalizedImageUrl)
    }

    if (manufacturerColumnName) {
      optionalInsertColumns.push(manufacturerColumnName)
      optionalInsertValues.push(String(manufacturer || "").trim() || null)
    }

    const maintenanceColumnInSql = optionalInsertColumns.length > 0 ? `${optionalInsertColumns.join(", ")}, ` : ""
    const maintenanceValuePlaceholder = optionalInsertValues.length > 0 ? `${optionalInsertValues.map(() => "?").join(", ")}, ` : ""

    const queryVariants = [
      `INSERT INTO devices
       (device_code, device_name, model, category, status, location, \`value\`, purchase_date, warranty_expiry, ${maintenanceColumnInSql}department_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${maintenanceValuePlaceholder}?, NOW(), NOW())`,
      `INSERT INTO devices
       (device_code, device_name, model, category, status, location, \`value\`, purchase_date, warranty_expiry, ${maintenanceColumnInSql}created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${maintenanceValuePlaceholder}NOW(), NOW())`,
      `INSERT INTO devices
       (device_code, device_name, model, category, status, location, \`value\`, ${maintenanceColumnInSql}created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ${maintenanceValuePlaceholder}NOW(), NOW())`,
    ]

    const serialPrefix = resolveSerialPrefixFromDeviceName(normalizedName)
    let nextSerial = await reserveNextSerialRange(connection, serialPrefix, normalizedQuantity)
    let preferredVariantIndex = -1
    let firstInsertId = null
    let createdCount = 0
    let firstCode = ""
    let lastCode = ""

    for (let itemIndex = 0; itemIndex < normalizedQuantity; itemIndex += 1) {
      const generatedCode = formatSerialCode(serialPrefix, nextSerial)

      const insertQuery = `INSERT INTO devices
       (device_code, device_name, model, category, status, location, \`value\`, purchase_date, warranty_expiry, ${maintenanceColumnInSql}department_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${maintenanceValuePlaceholder}?, NOW(), NOW())`

      const insertParams = [
        generatedCode,
        normalizedName,
        model ?? null,
        category ?? null,
        normalizedStatus,
        initialLocation,
        normalizedValue,
        purchaseDate,
        warrantyExpiry,
        ...optionalInsertValues,
        normalizedDepartmentId,
      ]

      const [insertResult] = await connection.query(insertQuery, insertParams)

      if (insertResult && insertResult.insertId) {
        if (firstInsertId === null) {
          firstInsertId = insertResult.insertId
        }
        createdCount += 1
        if (!firstCode) firstCode = generatedCode
        lastCode = generatedCode
      }

      nextSerial += 1
    }

    const totalCost = (Number.isFinite(normalizedValue) ? normalizedValue : 0) * createdCount

    await connection.commit()
    transactionStarted = false

    if (String(importMode || "").trim().toLowerCase() !== "csv") {
      try {
        await logActivity({
          action: "device.create",
          description: buildDeviceCreateDescription({
            role: normalizedCreatedByRole,
            fullName: normalizedCreatedBy,
            department: normalizedCreatedByDepartment,
            deviceName: normalizedName,
            quantity: createdCount,
            totalCost,
          }),
          entityType: "device",
          entityId: firstInsertId,
        })
      } catch {
        // keep successful device creation even if activity logging fails
      }
    }

    return res.json({
      ok: true,
      id: firstInsertId,
      createdCount,
      firstCode: firstCode || null,
      lastCode: lastCode || null,
    })
  } catch (error) {
    if (connection && transactionStarted) {
      try {
        await connection.rollback()
      } catch {
        // ignore rollback errors
      }
    }

    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  } finally {
    if (connection) {
      connection.release()
    }
  }
})

router.post("/import-batch-log", async (req, res) => {
  let connection
  try {
    connection = await pool.getConnection()
    
    const { batchCode, totalCost, createdBy, createdByRole, createdByDepartment, items } = req.body || {}

    const normalizedBatchCode = String(batchCode || "").trim()
    if (!normalizedBatchCode) {
      return res.status(400).json({ message: "Mã lô không hợp lệ" })
    }

    const normalizedCreatedBy = String(createdBy || "").trim() || "Không rõ"
    const normalizedRole = String(createdByRole || "").trim() || "Unknown"
    const normalizedDepartment = String(createdByDepartment || "").trim() || null
    const normalizedTotalCost = Number(totalCost || 0)

    await logActivity({
      action: "device.import_batch",
      description: buildDeviceBatchImportDescription({
        role: normalizedRole,
        fullName: normalizedCreatedBy,
        department: normalizedDepartment,
        batchCode: normalizedBatchCode,
        totalCost: Number.isFinite(normalizedTotalCost) ? normalizedTotalCost : 0,
      }),
      entityType: "device",
      entityId: null,
    })

    const normalizedItems = Array.isArray(items) ? items : []
    for (const rawItem of normalizedItems) {
      const quantity = Number.parseInt(String(rawItem?.quantity ?? 0), 10)
      const unitCost = Number(rawItem?.unitCost || 0)
      const lineTotal = Number(rawItem?.lineTotal || 0)

      const payload = {
        batchCode: normalizedBatchCode,
        itemName: String(rawItem?.itemName || "").trim(),
        manufacturer: String(rawItem?.manufacturer || "").trim() || null,
        model: String(rawItem?.model || "").trim() || null,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
        unitCost: Number.isFinite(unitCost) ? unitCost : 0,
        lineTotal: Number.isFinite(lineTotal) ? lineTotal : 0,
        firstCode: String(rawItem?.firstCode || "").trim() || null,
        lastCode: String(rawItem?.lastCode || "").trim() || null,
      }

      if (!payload.itemName || payload.quantity <= 0) {
        continue
      }

      await logActivity({
        action: "device.import_item",
        description: JSON.stringify(payload),
        entityType: "device",
        entityId: null,
      })

      // Update batch_code for devices in this import range
      if (payload.firstCode && payload.lastCode) {
        try {
          // Check if batch_code column exists
          const batchCodeColumnName = await getBatchCodeColumnName(connection)
          if (batchCodeColumnName) {
            await connection.query(
              `UPDATE devices 
               SET ${batchCodeColumnName} = ?
               WHERE device_code >= ? AND device_code <= ?`,
              [normalizedBatchCode, payload.firstCode, payload.lastCode]
            )
          }
        } catch (updateError) {
          console.error("[WARN] Failed to update batch_code:", updateError.message)
          // Don't fail the request if batch_code update fails, just log the warning
        }
      }
    }

    if (connection) connection.release()
    return res.json({ ok: true })
  } catch (error) {
    if (connection) connection.release()
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.put("/:id", async (req, res) => {
  let connection

  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID thiết bị không hợp lệ" })
    }

    const {
      name,
      model,
      category,
      status,
      value,
      maintenanceInterval,
      imageUrl,
      liquidationValue,
      liquidationFacility,
    } = req.body || {}

    connection = await pool.getConnection()
    const maintenanceIntervalColumnName = await getMaintenanceIntervalColumnName(connection)
    const imageUrlColumnName = await getImageUrlColumnName(connection)

    const updateFields = [
      "device_name = ?",
      "model = ?",
      "category = ?",
      "status = ?",
      "`value` = ?",
    ]

    const updateValues = [
      name ?? null,
      model ?? null,
      category ?? null,
      status ?? null,
      value ?? null,
    ]

    if (maintenanceIntervalColumnName) {
      updateFields.push(`${maintenanceIntervalColumnName} = ?`)
      updateValues.push(normalizeIntervalInput(maintenanceInterval))
    }

    if (imageUrlColumnName) {
      updateFields.push(`${imageUrlColumnName} = ?`)
      updateValues.push(imageUrl ?? null)
    }

    if (liquidationValue !== undefined) {
      updateFields.push("liquidation_value = ?")
      updateValues.push(liquidationValue ?? null)
    }
    
    if (liquidationFacility !== undefined) {
      updateFields.push("liquidation_facility = ?")
      updateValues.push(liquidationFacility ?? null)
    }

    updateFields.push("updated_at = NOW()")

    const [result] = await connection.query(
      `UPDATE devices
       SET ${updateFields.join(",\n           ")}
       WHERE id = ?`,
      [...updateValues, id]
    )

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Không tìm thấy thiết bị" })
    }

    if (status === "inactive" || status === "thanh_ly") {
      await logActivity({
        userId: req.user?.id,
        action: "device.liquidation",
        description: `Thanh lý thiết bị ${String(name || "").trim() || "Không rõ tên"}${liquidationFacility ? " | Tại: " + liquidationFacility : ""}${liquidationValue ? " | Giá trị: " + new Intl.NumberFormat("vi-VN").format(liquidationValue) + " VND" : ""}`,
        entityType: "device",
        entityId: id,
      })
    } else {
      await logActivity({
        userId: req.user?.id,
        action: "device.update",
        description: `Cập nhật thiết bị #${id} - ${String(name || "").trim() || "Không rõ tên"}`,
        entityType: "device",
        entityId: id,
      })
    }

    return res.json({ ok: true })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  } finally {
    if (connection) {
      connection.release()
    }
  }
})

router.get("/maintenance-alerts", async (req, res) => {
  try {
    const role = String(req.query.role || "").trim()
    const requester = normalizeText(String(req.query.requester || ""))
    const requesterAlt = normalizeText(String(req.query.requesterAlt || ""))
    const userId = Number(req.query.userId || 0)
    const isEmployee = isNhanVienRole(role)
    const isAdmin = isAdminRole(role)

    const isMatchedRequester = (rawName) => {
      const normalizedName = normalizeText(String(rawName || ""))
      return (
        (requester && normalizedName === requester) ||
        (requesterAlt && normalizedName === requesterAlt)
      )
    }

    const normalizeTransferStatus = (value) => {
      const text = normalizeText(String(value || ""))
      if (["approved", "da duyet"].includes(text)) {
        return "approved"
      }

      if (["rejected", "tu choi"].includes(text)) {
        return "rejected"
      }

      if (["pending", "cho duyet"].includes(text)) {
        return "pending"
      }

      return text || "pending"
    }

    const notifications = []

    let transferRows = []
    try {
      const transferStatusCondition = isAdmin
        ? `status IN ('pending', 'cho duyet')`
        : `status IN ('approved', 'da duyet', 'rejected', 'tu choi')`

      const [rows] = await pool.query(
        `SELECT
           id,
           request_code,
           COALESCE(device_name, 'Thiết bị chưa xác định') AS device_name,
           requester_name,
           request_date,
           created_at,
           updated_at,
           status
         FROM device_transfers
         WHERE ${transferStatusCondition}
         ORDER BY id DESC
         LIMIT 20`
      )
      transferRows = rows
    } catch (error) {
      if (error.code !== "ER_NO_SUCH_TABLE") {
        throw error
      }
    }

    transferRows.forEach((row) => {
      const requestCode = row.request_code || `DC-${row.id}`
      const transferStatus = normalizeTransferStatus(row.status)

      if (isAdmin) {
        notifications.push({
          id: `transfer-${row.id}`,
          title: `Yêu cầu điều chuyển ${requestCode}`,
          description: `${row.device_name || "Thiết bị"} • ${row.requester_name || "Người dùng hệ thống"}`,
          time: row.created_at || row.request_date || null,
          type: "transfer",
        })
        return
      }

      if (!isMatchedRequester(row.requester_name)) {
        return
      }

      if (transferStatus === "approved") {
        notifications.push({
          id: `transfer-${row.id}`,
          title: `Yêu cầu ${requestCode} đã được duyệt`,
          description: `${row.device_name || "Thiết bị"} • Đã được admin duyệt`,
          time: row.updated_at || row.created_at || row.request_date || null,
          type: "transfer",
        })
        return
      }

      if (transferStatus === "rejected") {
        notifications.push({
          id: `transfer-${row.id}`,
          title: `Yêu cầu ${requestCode} đã bị từ chối`,
          description: `${row.device_name || "Thiết bị"} • Vui lòng kiểm tra lại yêu cầu`,
          time: row.updated_at || row.created_at || row.request_date || null,
          type: "transfer",
        })
      }
    })

    let repairRows = []
    try {
      const repairStatusCondition = isAdmin
        ? `r.status IN ('pending', 'cho xu ly')`
        : `r.status IN ('assigned', 'da phan cong', 'in_progress', 'dang xu ly', 'dang sua')`

      const queryVariants = [
        `SELECT
           r.id,
           r.request_code,
           COALESCE(d.device_name, r.device_name, 'Thiết bị chưa xác định') AS device_name,
           r.reporter_name,
           r.assignee_user_id,
           r.expected_arrival,
           r.progress_note,
           r.created_at,
           r.updated_at,
           r.status
         FROM repair_requests r
         LEFT JOIN devices d ON r.device_id = d.id
         WHERE ${repairStatusCondition}
         ORDER BY r.id DESC
         LIMIT 20`,
        `SELECT
           r.id,
           r.request_code,
           COALESCE(d.device_name, r.device_name, 'Thiết bị chưa xác định') AS device_name,
           r.reporter_name,
           r.assignee_user_id,
           r.expected_arrival,
           r.created_at,
           r.status
         FROM repair_requests r
         LEFT JOIN devices d ON r.device_id = d.id
         WHERE ${repairStatusCondition}
         ORDER BY r.id DESC
         LIMIT 20`,
        `SELECT
           r.id,
           r.request_code,
           COALESCE(d.device_name, r.device_name, 'Thiết bị chưa xác định') AS device_name,
           r.reporter_name,
           r.assignee_user_id,
           r.created_at,
           r.status
         FROM repair_requests r
         LEFT JOIN devices d ON r.device_id = d.id
         WHERE ${repairStatusCondition}
         ORDER BY r.id DESC
         LIMIT 20`,
          `SELECT
            r.id,
            r.request_code,
            COALESCE(d.device_name, r.device_name, 'Thiết bị chưa xác định') AS device_name,
            r.reporter_name,
            NULL AS assignee_user_id,
            r.created_at,
            r.status
          FROM repair_requests r
          LEFT JOIN devices d ON r.device_id = d.id
          WHERE ${repairStatusCondition}
          ORDER BY r.id DESC
          LIMIT 20`,
      ]

      let lastRepairError = null
      for (const query of queryVariants) {
        try {
          const [rows] = await pool.query(query)
          repairRows = rows
          lastRepairError = null
          break
        } catch (error) {
          if (error.code === "ER_BAD_FIELD_ERROR") {
            lastRepairError = error
            continue
          }

          throw error
        }
      }

      if (lastRepairError) {
        throw lastRepairError
      }
    } catch (error) {
      if (!["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR"].includes(error.code)) {
        throw error
      }
    }

    repairRows.forEach((row) => {
      const progressText = normalizeText(String(row.progress_note || ""))
      const normalizedRepairStatus = normalizeStatus(row.status)
      const isWaitingParts = normalizedRepairStatus === "waiting_parts"
      const isPartsEtaConfirmedByAdmin =
        isWaitingParts &&
        progressText.includes("admin") &&
        progressText.includes("du kien co phu tung")

      const requestCode = row.request_code || `RP-${row.id}`

      if (isAdmin) {
        notifications.push({
          id: `repair-${row.id}`,
          title: `Yêu cầu sửa chữa ${requestCode}`,
          description: `${row.device_name || "Thiết bị"} • ${row.reporter_name || "Người dùng hệ thống"}`,
          time: row.created_at || null,
          type: "repair",
        })
        return
      }

      if (isEmployee) {
        const isAssigned = normalizedRepairStatus === "assigned" || row.status === "assigned" || row.status === "da phan cong";
        const isInProgress = normalizedRepairStatus === "repairing" || row.status === "in_progress" || row.status === "dang xu ly" || row.status === "dang sua";
        
        if (!isAssigned && !isInProgress) {
          return
        }

        const assignedUserId = Number(row.assignee_user_id || 0)
        if (!Number.isInteger(userId) || userId <= 0 || assignedUserId !== userId) {
          return
        }

        const titleSuffix = isAssigned ? "đã được admin duyệt" : "đang được bạn xử lý";

        notifications.push({
          id: `repair-${row.id}`,
          title: `Yêu cầu ${requestCode} ${titleSuffix}`,
          description: `${row.device_name || "Thiết bị"} • Người yêu cầu: ${row.reporter_name || "-"}`,
          time: row.updated_at || row.created_at || null,
          type: "repair",
        })
        return
      }

    })

    // Handle maintenance task notifications
    let maintenanceRows = []
    try {
      const maintenanceStatusCondition = isAdmin
        ? `m.status IN ('pending', 'in_progress', 'completed')`
        : `m.status IN ('pending')`

      const maintenanceQueryVariants = [
        `SELECT
           m.id,
           m.task_code,
           COALESCE(d.device_name, m.device_name, 'Thiết bị chưa xác định') AS device_name,
           m.technician_name,
           m.scheduled_date,
           m.created_at,
           m.updated_at,
           m.status
         FROM maintenance_tasks m
         LEFT JOIN devices d ON m.device_id = d.id
         WHERE ${maintenanceStatusCondition}
         ORDER BY m.id DESC
         LIMIT 20`,
      ]

      let lastMaintenanceError = null
      for (const q of maintenanceQueryVariants) {
        try {
          const [rows] = await pool.query(q)
          maintenanceRows = rows
          lastMaintenanceError = null
          break
        } catch (error) {
          if (error.code === 'ER_BAD_FIELD_ERROR') {
            lastMaintenanceError = error
            continue
          }

          throw error
        }
      }

      if (lastMaintenanceError) {
        throw lastMaintenanceError
      }
    } catch (error) {
      if (!['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error.code)) {
        throw error
      }
    }

    maintenanceRows.forEach((row) => {
      const requestCode = row.task_code || `BT-${row.id}`
      const normalizedStatus = normalizeStatus(row.status)

      // For employees: show pending/in-progress maintenance tasks relevant to them
      if (isEmployee) {
        if (normalizedStatus !== "pending") {
          return
        }

        // Notify employees for pending tasks or tasks assigned to them
        const techName = String(row.technician_name || '').trim()
        if (!techName || techName === '' || techName === String(req.query.requester || '').trim()) {
          notifications.push({
            id: `maintenance-${row.id}`,
            title: `Lịch bảo trì ${requestCode}`,
            description: `${row.device_name || 'Thiết bị'} • Dự kiến: ${formatNotificationDate(row.scheduled_date) || row.scheduled_date}`,
            time: row.updated_at || row.created_at || row.scheduled_date || null,
            type: 'maintenance',
          })
        }
      }
    })

    // Handle employee maintenance confirmation notifications ONLY for admin users
    // All admins should see when employees confirm maintenance
    // Employees should NEVER see these notifications
    if (isAdmin && !isEmployee) {
      try {
        const confirmationQueryVariants = Number.isInteger(userId) && userId > 0
          ? [
              {
                query: `SELECT
                          a.id,
                          a.description,
                          a.entity_id,
                          a.created_at
                        FROM activity a
                        WHERE a.action = 'maintenance.employee_confirmed'
                          AND (a.user_id = ? OR a.user_id IS NULL)
                        ORDER BY a.created_at DESC
                        LIMIT 20`,
                params: [userId],
              },
              {
                query: `SELECT
                          a.id,
                          a.description,
                          a.entity_id,
                          a.created_at
                        FROM activity a
                        WHERE a.action = 'maintenance.employee_confirmed'
                        ORDER BY a.created_at DESC
                        LIMIT 20`,
                params: [],
              },
            ]
          : [
              {
                query: `SELECT
                          a.id,
                          a.description,
                          a.entity_id,
                          a.created_at
                        FROM activity a
                        WHERE a.action = 'maintenance.employee_confirmed'
                        ORDER BY a.created_at DESC
                        LIMIT 20`,
                params: [],
              },
            ]

        let confirmationRows = []
        let lastConfirmationError = null

        for (const variant of confirmationQueryVariants) {
          try {
            const [rows] = await pool.query(variant.query, variant.params)
            confirmationRows = rows
            lastConfirmationError = null
            break
          } catch (confirmationError) {
            if (confirmationError.code === "ER_BAD_FIELD_ERROR") {
              lastConfirmationError = confirmationError
              continue
            }

            throw confirmationError
          }
        }

        if (lastConfirmationError) {
          throw lastConfirmationError
        }

        confirmationRows.forEach((row) => {
          notifications.push({
            id: `employee-confirm-${row.id}`,
            title: "Nhân viên xác nhận bảo trì",
            description: row.description || "Nhân viên vừa xác nhận hoàn thành bảo trì",
            time: row.created_at || null,
            type: "maintenance",
          })
        })
      } catch (confirmationError) {
        if (confirmationError.code !== "ER_NO_SUCH_TABLE" && confirmationError.code !== "ER_BAD_FIELD_ERROR") {
          throw confirmationError
        }
      }
    }

    // Handle employee repair confirmation notifications ONLY for admin users
    if (isAdmin && !isEmployee) {
      try {
        const repairConfirmQueryVariants = Number.isInteger(userId) && userId > 0
          ? [
              {
                query: `SELECT
                          a.id,
                          a.description,
                          a.entity_id,
                          a.created_at
                        FROM activity a
                        WHERE a.action = 'repair.employee_confirmed'
                          AND (a.user_id = ? OR a.user_id IS NULL)
                        ORDER BY a.created_at DESC
                        LIMIT 20`,
                params: [userId],
              },
              {
                query: `SELECT
                          a.id,
                          a.description,
                          a.entity_id,
                          a.created_at
                        FROM activity a
                        WHERE a.action = 'repair.employee_confirmed'
                        ORDER BY a.created_at DESC
                        LIMIT 20`,
                params: [],
              },
            ]
          : [
              {
                query: `SELECT
                          a.id,
                          a.description,
                          a.entity_id,
                          a.created_at
                        FROM activity a
                        WHERE a.action = 'repair.employee_confirmed'
                        ORDER BY a.created_at DESC
                        LIMIT 20`,
                params: [],
              },
            ]

        let repairConfirmRows = []
        let lastRepairConfirmError = null

        for (const variant of repairConfirmQueryVariants) {
          try {
            const [rows] = await pool.query(variant.query, variant.params)
            repairConfirmRows = rows
            lastRepairConfirmError = null
            break
          } catch (repairConfirmError) {
            if (repairConfirmError.code === "ER_BAD_FIELD_ERROR") {
              lastRepairConfirmError = repairConfirmError
              continue
            }

            throw repairConfirmError
          }
        }

        if (lastRepairConfirmError) {
          throw lastRepairConfirmError
        }

        repairConfirmRows.forEach((row) => {
          notifications.push({
            id: `repair-confirm-${row.id}`,
            title: "Nhân viên xác nhận sửa chữa",
            description: row.description || "Nhân viên vừa xác nhận sửa chữa",
            time: row.created_at || null,
            type: "repair",
          })
        })
      } catch (repairConfirmError) {
        if (repairConfirmError.code !== "ER_NO_SUCH_TABLE" && repairConfirmError.code !== "ER_BAD_FIELD_ERROR") {
          throw repairConfirmError
        }
      }
    }

    // Handle allocation notifications for employees
    if (isEmployee && Number.isInteger(userId) && userId > 0) {
      try {
        const [allocationRows] = await pool.query(
          `SELECT
             da.id,
             da.allocation_code,
             da.transfer_id,
             da.device_id,
             COALESCE(d.device_name, 'Thiết bị chưa xác định') AS device_name,
             COALESCE(d.device_code, 'N/A') AS serial,
             da.allocation_reason,
             da.created_at,
             da.updated_at,
             da.status,
             dt.request_code
           FROM device_allocations da
           LEFT JOIN devices d ON da.device_id = d.id
           LEFT JOIN device_transfers dt ON da.transfer_id = dt.id
           WHERE da.receiver_user_id = ?
             AND (da.status IS NULL OR da.status IN ('pending', 'approved', 'da duyet'))
           ORDER BY da.id DESC
           LIMIT 20`,
          [userId]
        )

        allocationRows.forEach((row) => {
          const allocationCode = row.request_code || row.allocation_code || `CP-${row.id}`
          const allocationStatus = normalizeStatus(row.status)
          
          notifications.push({
            id: `allocation-${row.id}`,
            title: `Bạn được cấp phát ${row.device_name || "Thiết bị"} [${row.serial || "N/A"}]`,
            description: allocationCode,
            time: row.updated_at || row.created_at || null,
            type: "allocation",
          })
        })
      } catch (allocationError) {
        if (allocationError.code !== "ER_NO_SUCH_TABLE" && allocationError.code !== "ER_BAD_FIELD_ERROR") {
          throw allocationError
        }
      }
    }

    notifications.sort((a, b) => {
      const timeA = a.time ? new Date(a.time).getTime() : 0
      const timeB = b.time ? new Date(b.time).getTime() : 0
      return timeB - timeA
    })

    return res.json({
      notifications: notifications.slice(0, 50),
      total: notifications.length,
    })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.delete("/:id", async (req, res) => {
  let connection

  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID thiết bị không hợp lệ" })
    }
    connection = await pool.getConnection()

    const role = String(
      req.query.role || req.body?.role || req.headers["x-user-role"] || req.headers["x-role"] || ""
    ).trim()

    if (!isAdminRole(role)) {
      return res.status(403).json({ message: "Không được phép xóa" })
    }

    const fullName = String(
      req.query.fullName || req.body?.fullName || req.headers["x-user-fullname"] || req.headers["x-fullname"] || ""
    ).trim()

    // Read device info before deleting so we can log a detailed description
    let deviceName = null
    let deviceCode = null
    try {
      const [deviceRows] = await connection.query(`SELECT device_name, device_code FROM devices WHERE id = ?`, [id])
      if (deviceRows && deviceRows.length) {
        deviceName = deviceRows[0].device_name || null
        deviceCode = deviceRows[0].device_code || null
      }
    } catch (err) {
      // ignore select errors and continue with deletion
    }

    // Perform cascade deletes inside a transaction so admin can fully remove device and related data
    await connection.beginTransaction()
    const cascadeTables = [
      "device_transfers",
      "maintenance_tasks",
      "repair_requests",
      "device_allocations",
    ]

    for (const table of cascadeTables) {
      try {
        await connection.query(`DELETE FROM ${table} WHERE device_id = ?`, [id])
      } catch (err) {
        if (["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR"].includes(err.code)) {
          // ignore missing tables/columns in some DB variants
          continue
        }

        throw err
      }
    }

    const [result] = await connection.query("DELETE FROM devices WHERE id = ?", [id])

    if (!result.affectedRows) {
      await connection.rollback()
      return res.status(404).json({ message: "Không tìm thấy thiết bị" })
    }

    await connection.commit()

    try {
      const description = buildDeviceDeleteDescription({
        role,
        fullName,
        deviceName,
        deviceCode,
        time: new Date(),
      })

      await logActivity({
        action: "device.delete",
        description,
        entityType: "device",
        entityId: id,
      })
    } catch {
      // ignore logging failures
    }

    return res.json({ ok: true })
  } catch (error) {
    if (error.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        message: "Không thể xóa thiết bị vì còn dữ liệu liên quan ở các phân hệ khác.",
      })
    }

    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  } finally {
    if (connection) {
      connection.release()
    }
  }
})

// Endpoint to log QR scan activity
router.post("/:id/log-qr-scan", async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID thiết bị không hợp lệ" })
    }

    const actorUserId = req.body?.userId || req.headers["x-user-id"] || null
    const actionName = String(req.body?.actionName || "").trim()

    // Lấy tên thiết bị
    const [deviceRows] = await pool.query("SELECT device_name FROM devices WHERE id = ?", [id])
    const deviceName = deviceRows[0]?.device_name || "Thiết bị"

    const description = actionName
      ? `Quét mã QR thiết bị "${deviceName}" và thực hiện ${actionName}`
      : `Quét mã QR thiết bị "${deviceName}" và thực hiện thao tác`

    // Call the same logActivity that dashboard counts: action = 'device.qr_scan'
    await logActivity({
      userId: actorUserId,
      action: "device.qr_scan",
      description: description,
      entityType: "device",
      entityId: id,
    })

    return res.json({ ok: true, message: "Logged QR scan successfully" })
  } catch (error) {
    console.error("Lỗi khi ghi log qr scan:", error)
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

// ===========================
// ESP32-CAM: IP Registration & Stream URL
// Lưu in-memory vì Render.com có ephemeral filesystem.
// ESP32-CAM sẽ tự đăng ký lại mỗi khi khởi động.
// ===========================

let _esp32CamConfig = null // { ip, base_url, stream_url, updated_at }

/**
 * POST /api/devices/esp32cam/ip
 * ESP32-CAM gọi endpoint này sau khi kết nối WiFi thành công để thông báo IP hiện tại.
 * Body JSON: { "ip": "192.168.x.x" }
 */
router.post("/esp32cam/ip", (req, res) => {
  const ip = String(req.body?.ip || "").trim()

  if (!ip) {
    return res.status(400).json({ message: "Thiếu địa chỉ IP trong body request" })
  }

  // Validate dạng IP đơn giản
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
  if (!ipRegex.test(ip)) {
    return res.status(400).json({ message: `Địa chỉ IP không hợp lệ: ${ip}` })
  }

  const streamUrl = `http://${ip}:81/stream`
  const baseUrl = `http://${ip}`

  // Lưu vào bộ nhớ (in-memory)
  _esp32CamConfig = {
    ip,
    base_url: baseUrl,
    stream_url: streamUrl,
    updated_at: new Date().toISOString(),
  }

  console.log(`[ESP32-CAM] Đã cập nhật IP: ${ip} | Stream: ${streamUrl}`)
  return res.json({ ok: true, ip, stream_url: streamUrl })
})

/**
 * GET /api/devices/esp32cam/stream
 * Flutter gọi endpoint này để lấy stream_url mới nhất của ESP32-CAM.
 * Trả về: { ok: true, stream_url: "http://...:81/stream", ip: "..." }
 */
router.get("/esp32cam/stream", (req, res) => {
  if (_esp32CamConfig && _esp32CamConfig.stream_url) {
    return res.json({
      ok: true,
      ip: _esp32CamConfig.ip,
      stream_url: _esp32CamConfig.stream_url,
      updated_at: _esp32CamConfig.updated_at,
    })
  }

  // Chưa có cấu hình (server vừa restart hoặc ESP32-CAM chưa kết nối)
  return res.json({
    ok: false,
    ip: null,
    stream_url: null,
    message: "Chưa có cấu hình ESP32-CAM. Hãy khởi động ESP32-CAM và kết nối WiFi.",
  })
})

module.exports = router
