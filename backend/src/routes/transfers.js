const express = require("express")
const { pool } = require("../db")
const { logActivity } = require("../activity")

const router = express.Router()
const TRANSFER_LOCATION_MARKER = "__TO_LOCATION__::"

function normalizeStatus(value) {
  const text = String(value || "").trim().toLowerCase()

  if (["pending", "cho duyet"].includes(text)) {
    return "pending"
  }

  if (["approved", "da duyet"].includes(text)) {
    return "approved"
  }

  if (["completed", "hoan thanh"].includes(text)) {
    return "completed"
  }

  if (["rejected", "tu choi"].includes(text)) {
    return "rejected"
  }

  return "pending"
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
}

function resolveRequestType(reasonText) {
  const normalizedReason = normalizeText(reasonText)

  if (
    normalizedReason.includes("yeu cau cap phat") ||
    normalizedReason.includes("cap phat")
  ) {
    return "allocation"
  }

  return "transfer"
}

function resolveActorUserId(req) {
  const candidate = Number(req?.body?.actorUserId || req?.query?.actorUserId || 0)
  return Number.isInteger(candidate) && candidate > 0 ? candidate : null
}

function isAdminRole(value) {
  const normalized = normalizeText(value)
  return normalized.includes("admin") || normalized.includes("quan tri")
}

async function resolveReceiverDepartmentName(connection, receiverUsers) {
  const receivers = Array.isArray(receiverUsers)
    ? receiverUsers
        .map((receiver) => Number(receiver?.id || 0))
        .filter((receiverId) => Number.isInteger(receiverId) && receiverId > 0)
    : []

  if (!receivers.length) {
    return null
  }

  const placeholders = receivers.map(() => "?").join(", ")
  const queryVariants = [
    `SELECT u.id, u.department_id, dep.name AS department_name, u.department
     FROM users u
     LEFT JOIN departments dep ON u.department_id = dep.id
     WHERE u.id IN (${placeholders})`,
    `SELECT id, department_name, department
     FROM users
     WHERE id IN (${placeholders})`,
    `SELECT id, department_name
     FROM users
     WHERE id IN (${placeholders})`,
    `SELECT id, department
     FROM users
     WHERE id IN (${placeholders})`,
  ]

  for (const query of queryVariants) {
    try {
      const [rows] = await connection.query(query, receivers)
      if (!rows || rows.length === 0) {
        continue
      }

      const departmentNames = new Set()
      rows.forEach((row) => {
        const departmentName = String(row.department_name || row.department || "").trim()
        if (departmentName) {
          departmentNames.add(departmentName)
        }
      })

      if (departmentNames.size === 1) {
        return Array.from(departmentNames)[0]
      }
    } catch (error) {
      if (error.code !== "ER_BAD_FIELD_ERROR" && error.code !== "ER_NO_SUCH_TABLE") {
        throw error
      }
    }
  }

  return null
}

async function saveAllocationReceivers({
  transferId,
  requestCode,
  deviceId,
  fromDepartment,
  toDepartment,
  toLocation,
  reason,
  requester,
  receiverUsers,
  status = "pending",
  db = pool,
}) {
  const receivers = Array.isArray(receiverUsers) ? receiverUsers : []
  if (!receivers.length) {
    return
  }

  const insertQuery = `INSERT INTO device_allocations
    (allocation_code, transfer_id, device_id, from_department, to_department, allocation_location, allocation_reason, requester_name, receiver_user_id, receiver_name, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`

  for (const receiver of receivers) {
    const receiverId = Number(receiver?.id || 0)
    const receiverName = String(receiver?.name || receiver?.username || "").trim() || null

    if (!Number.isInteger(receiverId) || receiverId <= 0) {
      continue
    }

    const baseAllocationCode = String(requestCode || "CP").trim() || "CP"
    const deviceValue = Number.isInteger(deviceId) && deviceId > 0 ? deviceId : null
    const fallbackSuffix = `${transferId || "t"}-${deviceValue || "d"}-${receiverId}`
    let fallbackAllocationCode = `${baseAllocationCode}-${fallbackSuffix}`

    if (fallbackAllocationCode.length > 50) {
      const maxBaseLength = Math.max(1, 50 - (fallbackSuffix.length + 1))
      fallbackAllocationCode = `${baseAllocationCode.slice(0, maxBaseLength)}-${fallbackSuffix}`
    }

    const insertParams = [
      baseAllocationCode,
      transferId,
      deviceValue,
      String(fromDepartment || "").trim() || "Kho thiết bị",
      String(toDepartment || "").trim() || "Chưa xác định",
      String(toLocation || "").trim() || null,
      String(reason || "").trim() || null,
      String(requester || "").trim() || "Người dùng hệ thống",
      receiverId,
      receiverName,
      status,
    ]

    try {
      await db.query(insertQuery, insertParams)
    } catch (error) {
      if (error.code !== "ER_DUP_ENTRY") {
        throw error
      }

      const fallbackParams = [...insertParams]
      fallbackParams[0] = fallbackAllocationCode
      await db.query(insertQuery, fallbackParams)
    }
  }
}

function toLogTimestamp(...values) {
  for (const value of values) {
    if (!value) {
      continue
    }

    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString()
    }
  }

  return null
}

function encodeReasonWithLocation(reason, toLocation) {
  const normalizedReason = String(reason || "").trim()
  const normalizedLocation = String(toLocation || "").trim()

  if (!normalizedLocation) {
    return normalizedReason
  }

  if (normalizedReason.includes(TRANSFER_LOCATION_MARKER)) {
    return normalizedReason
  }

  return `${normalizedReason}\n${TRANSFER_LOCATION_MARKER}${normalizedLocation}`
}

function decodeReasonAndLocation(rawReason, rawToLocation) {
  const reasonText = String(rawReason || "")
  const toLocationText = String(rawToLocation || "").trim()

  if (toLocationText) {
    return {
      reason: String(rawReason || "").trim() || null,
      toLocation: toLocationText,
    }
  }

  const markerIndex = reasonText.lastIndexOf(TRANSFER_LOCATION_MARKER)
  if (markerIndex < 0) {
    return {
      reason: reasonText.trim() || null,
      toLocation: null,
    }
  }

  const cleanReason = reasonText.slice(0, markerIndex).trim()
  const parsedLocation = reasonText.slice(markerIndex + TRANSFER_LOCATION_MARKER.length).trim()

  return {
    reason: cleanReason || null,
    toLocation: parsedLocation || null,
  }
}

async function getTransferById(connection, id) {
  const queryVariants = [
    `SELECT
       id,
       device_id,
       from_department,
       to_department,
       to_location,
       requester_name,
       transfer_reason
     FROM device_transfers
     WHERE id = ?
     LIMIT 1`,
    `SELECT
       id,
       device_id,
       from_department,
       to_department,
       requester_name,
       transfer_reason
     FROM device_transfers
     WHERE id = ?
     LIMIT 1`,
    `SELECT
       id,
       device_id,
       from_department,
       to_department,
       requester_name
     FROM device_transfers
     WHERE id = ?
     LIMIT 1`,
  ]

  let lastError = null

  for (const query of queryVariants) {
    try {
      const [rows] = await connection.query(query, [id])
      if (!rows.length) {
        return null
      }

      const row = rows[0]
      const decoded = decodeReasonAndLocation(row.transfer_reason, row.to_location)
      return {
        id: row.id,
        deviceId: Number(row.device_id || 0) || null,
        fromDepartment: String(row.from_department || "").trim() || null,
        toDepartment: String(row.to_department || "").trim() || null,
        toLocation: decoded.toLocation,
        requester: String(row.requester_name || "").trim() || null,
        reason: decoded.reason,
      }
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

  return null
}

async function getDepartmentIdByName(connection, departmentName) {
  const normalizedName = String(departmentName || "").trim()
  if (!normalizedName) {
    return null
  }

  // Try exact match first (existing behavior), then try case-insensitive match
  let [rows] = await connection.query(
    `SELECT id
     FROM departments
     WHERE TRIM(name) = ?
     LIMIT 1`,
    [normalizedName]
  )

  if (!rows || rows.length === 0) {
    const [rows2] = await connection.query(
      `SELECT id
       FROM departments
       WHERE LOWER(TRIM(name)) = LOWER(?)
       LIMIT 1`,
      [normalizedName]
    )
    rows = rows2
  }

  if (!rows.length) {
    return null
  }

  return Number(rows[0].id || 0) || null
}

async function getDeviceCreatedByColumnName(connection) {
  const [rows] = await connection.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'devices'
       AND COLUMN_NAME = 'created_by'
     LIMIT 1`
  )

  if (!rows || rows.length === 0) {
    return null
  }

  return String(rows[0].COLUMN_NAME || "").trim() || null
}

async function applyApprovedTransferToDevice(connection, transfer) {
  const deviceId = Number(transfer?.deviceId || 0)
  if (!Number.isInteger(deviceId) || deviceId <= 0) {
    return
  }

  const toDepartment = String(transfer?.toDepartment || "").trim()
  const toLocation = String(transfer?.toLocation || "").trim()
  const requester = String(transfer?.requester || "").trim()
  const requestType = resolveRequestType(transfer?.reason)
  let departmentId = null

  if (toDepartment && toDepartment.toLowerCase() !== "chưa xác định") {
    departmentId = await getDepartmentIdByName(connection, toDepartment)
  }

  const setClauses = []
  const queryParams = []

  if (departmentId) {
    setClauses.push("department_id = ?")
    queryParams.push(departmentId)
    if (toLocation) {
      setClauses.push("location = ?")
      queryParams.push(toLocation)
    }
  } else if (toDepartment) {
    // Keep the target department text instead of NULL so downstream queries that still
    // store department assignments as names continue to resolve the moved device correctly.
    setClauses.push("department_id = ?")
    queryParams.push(toDepartment)
    const locValue = toLocation || toDepartment
    setClauses.push("location = ?")
    queryParams.push(locValue)
  } else if (toLocation) {
    setClauses.push("location = ?")
    queryParams.push(toLocation)
  }

  if (requestType === "allocation" && requester) {
    const createdByColumnName = await getDeviceCreatedByColumnName(connection)
    if (createdByColumnName) {
      setClauses.push(`${createdByColumnName} = ?`)
      queryParams.push(requester)
    }
  }

  if (!setClauses.length) {
    return
  }

  setClauses.push("updated_at = NOW()")
  queryParams.push(deviceId)

  await connection.query(
    `UPDATE devices
     SET ${setClauses.join(", ")}
     WHERE id = ?`,
    queryParams
  )
}

router.get("/", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim().toLowerCase()
    const role = normalizeText(String(req.query.role || ""))
    const requester = normalizeText(String(req.query.requester || ""))
    const requesterAlt = normalizeText(String(req.query.requesterAlt || ""))
    const isEmployeeRequest = role.includes("nhan vien") || role.includes("nhan-vien")

    const queryVariants = [
      `SELECT
         t.id,
         t.request_code,
         t.device_id,
         COALESCE(d.device_name, t.device_name, 'Thiết bị chưa xác định') AS device_name,
         COALESCE(d.device_code, t.serial_number, '-') AS serial_number,
         t.from_department,
         t.to_department,
        t.to_location,
         t.request_date,
         t.requester_name,
         t.transfer_reason,
         t.status
       FROM device_transfers t
       LEFT JOIN devices d ON t.device_id = d.id
       ORDER BY t.id ASC`,
      `SELECT
         t.id,
         t.request_code,
         t.device_id,
         COALESCE(d.device_name, t.device_name, 'Thiết bị chưa xác định') AS device_name,
         COALESCE(d.device_code, t.serial_number, '-') AS serial_number,
         t.from_department,
         t.to_department,
         t.transfer_reason,
         t.request_date,
         t.requester_name,
         t.status
       FROM device_transfers t
       LEFT JOIN devices d ON t.device_id = d.id
       ORDER BY t.id ASC`,
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

    const mapped = rows.map((row) => {
      const decoded = decodeReasonAndLocation(row.transfer_reason, row.to_location)

      return {
        id: row.id,
        code: row.request_code || `DC-${String(row.id).padStart(3, "0")}`,
        deviceId: Number(row.device_id || 0) || null,
        deviceName: row.device_name,
        serial: row.serial_number,
        from: row.from_department || "-",
        to: row.to_department || "-",
        toLocation: decoded.toLocation,
        requestDate: row.request_date,
        requester: row.requester_name || "-",
        reason: decoded.reason,
        requestType: resolveRequestType(decoded.reason),
        status: normalizeStatus(row.status),
      }
    })

    const filteredItems = mapped.filter((item) => {
      const normalizedRequesterName = normalizeText(item.requester)
      const requesterMatchedByRole =
        !isEmployeeRequest ||
        normalizedRequesterName === requester ||
        (requesterAlt && normalizedRequesterName === requesterAlt)

      if (!search) {
        return requesterMatchedByRole
      }

      return (
        requesterMatchedByRole &&
        (
          item.code.toLowerCase().includes(search) ||
          item.deviceName.toLowerCase().includes(search) ||
          item.serial.toLowerCase().includes(search) ||
          item.from.toLowerCase().includes(search) ||
          item.to.toLowerCase().includes(search) ||
          item.requester.toLowerCase().includes(search)
        )
      )
    })

    return res.json({
      items: filteredItems,
      summary: {
        total: filteredItems.length,
        pending: filteredItems.filter((item) => item.status === "pending").length,
        completed: filteredItems.filter((item) => item.status === "completed").length,
        rejected: filteredItems.filter((item) => item.status === "rejected").length,
      },
    })
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      return res.json({
        items: [],
        summary: { total: 0, pending: 0, completed: 0, rejected: 0 },
      })
    }

    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID không hợp lệ" })
    }

    const [rows] = await pool.query(
      `SELECT
         t.id,
         t.request_code,
         t.device_id,
         COALESCE(d.device_name, t.device_name, 'Thiết bị chưa xác định') AS device_name,
         COALESCE(d.device_code, t.serial_number, '-') AS serial_number,
         t.from_department,
         t.to_department,
         t.to_location,
         t.request_date,
         t.requester_name,
         t.transfer_reason,
         t.status
       FROM device_transfers t
       LEFT JOIN devices d ON t.device_id = d.id
       WHERE t.id = ?`,
      [id]
    )

    if (rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu" })
    }

    const row = rows[0]
    const decoded = decodeReasonAndLocation(row.transfer_reason, row.to_location)
    row.transfer_reason = decoded.reason
    row.to_location = decoded.toLocation

    return res.json(row)
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.post("/", async (req, res) => {
  let connection

  try {
    // Temporary debug logging to inspect payloads coming from the mobile app
    try {
      console.log('DEBUG: POST /api/transfers received from', req.ip || req.connection?.remoteAddress)
      console.log('DEBUG: headers:', JSON.stringify(req.headers || {}))
      console.log('DEBUG: body:', JSON.stringify(req.body || {}))
    } catch (logErr) {
      console.error('DEBUG: failed to log request payload', String(logErr || ''))
    }

    const {
      deviceId,
      deviceName,
      serial,
      fromDepartment,
      toDepartment,
      requester,
      requesterUserId,
      reason,
      toLocation,
      requestType,
      requestCode,
      receiverUsers,
    } = req.body || {}

    const normalizedDeviceId =
      deviceId === null || deviceId === undefined || String(deviceId).trim() === ""
        ? null
        : Number(deviceId)
    const normalizedDeviceName = String(deviceName || "").trim() || null
    const normalizedSerial = String(serial || "").trim() || null
    const normalizedFrom = String(fromDepartment || "Kho thiết bị").trim() || "Kho thiết bị"
    const normalizedTo = String(toDepartment || "Chưa xác định").trim() || "Chưa xác định"
    const normalizedRequester =
      String(requester || "Người dùng hệ thống").trim() || "Người dùng hệ thống"
    const normalizedRequesterUserId =
      requesterUserId === null || requesterUserId === undefined || String(requesterUserId).trim() === ""
        ? null
        : Number(requesterUserId)
    const normalizedReason = String(reason || "").trim()
    const normalizedToLocation = String(toLocation || "").trim() || null
    const requesterRole = String(
      req.body?.requesterRole || req.body?.actorRole || req.headers["x-user-role"] || ""
    ).trim()
    const initialStatus = isAdminRole(requesterRole) ? "approved" : "pending"

    if (!normalizedDeviceName && !normalizedDeviceId) {
      return res.status(400).json({ message: "Thiết bị không hợp lệ" })
    }

    if (!normalizedReason) {
      return res.status(400).json({ message: "Lý do điều chuyển không được để trống" })
    }

    const requestTypeValue = String(requestType || "").trim().toLowerCase()
    const prefix = requestTypeValue === "allocation" ? "CP" : "DC"
    const normalizedRequestCode = String(requestCode || "").trim()
    const generatedCode = `${prefix}-${Date.now().toString().slice(-5)}`
    const finalRequestCode = normalizedRequestCode || generatedCode

    connection = await pool.getConnection()
    await connection.beginTransaction()

    const allocationReceiverDepartment =
      requestTypeValue === "allocation" && Array.isArray(receiverUsers) && receiverUsers.length > 0
        ? await resolveReceiverDepartmentName(connection, receiverUsers)
        : null
    const finalTargetDepartment = allocationReceiverDepartment || normalizedTo

    const queryVariants = [
      `INSERT INTO device_transfers
       (request_code, device_id, device_name, serial_number, from_department, to_department, to_location, request_date, requester_name, transfer_reason, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), ?, ?, ?, NOW(), NOW())`,
      `INSERT INTO device_transfers
       (request_code, device_id, device_name, serial_number, from_department, to_department, request_date, requester_name, transfer_reason, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?, ?, ?, NOW(), NOW())`,
      `INSERT INTO device_transfers
       (request_code, device_id, device_name, serial_number, from_department, to_department, request_date, requester_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURDATE(), ?, ?, NOW(), NOW())`,
    ]

    const queryParams = [
      [
        finalRequestCode,
        Number.isFinite(normalizedDeviceId) ? normalizedDeviceId : null,
        normalizedDeviceName,
        normalizedSerial,
        normalizedFrom,
        finalTargetDepartment,
        normalizedToLocation,
        normalizedRequester,
        normalizedReason,
        initialStatus,
      ],
      [
        finalRequestCode,
        Number.isFinite(normalizedDeviceId) ? normalizedDeviceId : null,
        normalizedDeviceName,
        normalizedSerial,
        normalizedFrom,
        finalTargetDepartment,
        normalizedRequester,
        encodeReasonWithLocation(normalizedReason, normalizedToLocation),
        initialStatus,
      ],
      [
        finalRequestCode,
        Number.isFinite(normalizedDeviceId) ? normalizedDeviceId : null,
        normalizedDeviceName,
        normalizedSerial,
        normalizedFrom,
        finalTargetDepartment,
        normalizedRequester,
        initialStatus,
      ],
    ]

    let insertId = null
    let lastError = null

    for (let index = 0; index < queryVariants.length; index += 1) {
      try {
        const [result] = await connection.query(queryVariants[index], queryParams[index])
        insertId = result.insertId
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

    // If receiverUsers were provided, persist allocations so the recipient(s)
    // will see the device in their device list. This applies both to explicit
    // 'allocation' requests and to transfer requests that include receivers.
    if (Array.isArray(receiverUsers) && receiverUsers.length > 0) {
      try {
        await saveAllocationReceivers({
          transferId: insertId,
          requestCode: finalRequestCode,
          deviceId: Number.isFinite(normalizedDeviceId) ? normalizedDeviceId : null,
          fromDepartment: normalizedFrom,
          toDepartment: finalTargetDepartment,
          toLocation: normalizedToLocation,
          reason: normalizedReason,
          requester: normalizedRequester,
          receiverUsers,
          status: initialStatus,
          db: connection,
        })
      } catch (allocationError) {
        if (
          allocationError.code !== "ER_NO_SUCH_TABLE" &&
          allocationError.code !== "ER_BAD_FIELD_ERROR"
        ) {
          throw allocationError
        }
      }
    }

    const shouldApplyDeviceUpdateImmediately =
      initialStatus === "approved" ||
      (requestTypeValue === "allocation" && Array.isArray(receiverUsers) && receiverUsers.length > 0)

    if (shouldApplyDeviceUpdateImmediately) {
      await applyApprovedTransferToDevice(connection, {
        deviceId: Number.isFinite(normalizedDeviceId) ? normalizedDeviceId : null,
        toDepartment: finalTargetDepartment,
        toLocation: normalizedToLocation,
        requester: normalizedRequester,
        reason: normalizedReason,
      })
    }

    await connection.commit()

    const actorUserId = resolveActorUserId(req)

    // Build a friendly role label from requesterRole (if provided) or fallback
    const rawRole = String(requesterRole || "").toLowerCase()
    let roleLabel = "Người dùng"
    if (rawRole.includes("admin")) {
      roleLabel = "Admin"
    } else if (rawRole.includes("nhan") || rawRole.includes("nhân")) {
      roleLabel = "Nhân viên"
    } else if (rawRole) {
      // use provided role as-is (capitalized)
      roleLabel = String(req.body.requesterRole || "").toString()
    }

    const requesterDisplay = String(normalizedRequester || "Người dùng hệ thống").trim()
    const activityDescription = `${roleLabel} [${requesterDisplay}] - Tạo yêu cầu ${finalRequestCode} | ${normalizedFrom} -> ${finalTargetDepartment}${normalizedToLocation ? ` (${normalizedToLocation})` : ""}`

    await logActivity({
      userId: Number.isInteger(normalizedRequesterUserId) ? normalizedRequesterUserId : actorUserId,
      action: "transfer.create",
      description: activityDescription,
      entityType: "transfer",
      entityId: insertId,
    })

    return res.json({ ok: true, id: insertId, requestCode: finalRequestCode })
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback()
      } catch {
        // ignore rollback errors
      }
    }

    if (error.code === "ER_NO_SUCH_TABLE") {
      return res.status(400).json({ message: "Bảng device_transfers chưa được tạo" })
    }

    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  } finally {
    if (connection) {
      connection.release()
    }
  }
})

router.put("/:id/status", async (req, res) => {
  let connection

  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID yêu cầu không hợp lệ" })
    }

    const status = normalizeStatus(req.body?.status)
    const reason = String(req.body?.reason || "").trim() || null
    const actorUserId = resolveActorUserId(req)
    connection = await pool.getConnection()
    await connection.beginTransaction()

    const transfer = await getTransferById(connection, id)
    if (!transfer) {
      await connection.rollback()
      return res.status(404).json({ message: "Không tìm thấy yêu cầu điều chuyển" })
    }

    const queryVariants = [
      `UPDATE device_transfers
       SET status = ?, transfer_reason = COALESCE(?, transfer_reason), updated_at = NOW()
       WHERE id = ?`,
      `UPDATE device_transfers
       SET status = ?, updated_at = NOW()
       WHERE id = ?`,
    ]

    const queryParams = [[status, reason, id], [status, id]]

    let result = null
    let lastError = null

    for (let index = 0; index < queryVariants.length; index += 1) {
      try {
        const [queryResult] = await connection.query(queryVariants[index], queryParams[index])
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
      await connection.rollback()
      throw lastError
    }

    if (!result || !result.affectedRows) {
      await connection.rollback()
      return res.status(404).json({ message: "Không tìm thấy yêu cầu điều chuyển" })
    }

    if (status === "approved") {
      await applyApprovedTransferToDevice(connection, transfer)
      // Also mark any allocations created for this transfer as approved
      try {
        await connection.query(
          `UPDATE device_allocations SET status = 'approved', updated_at = NOW() WHERE transfer_id = ?`,
          [id]
        )
      } catch (allocErr) {
        if (allocErr.code !== 'ER_NO_SUCH_TABLE' && allocErr.code !== 'ER_BAD_FIELD_ERROR') {
          throw allocErr
        }
      }
    }

    await connection.commit()

    await logActivity({
      userId: actorUserId,
      action: `transfer.${status}`,
      description: (function() {
        const rawRole = String(req.body?.actorRole || req.headers['x-user-role'] || '').toLowerCase();
        let roleLabel = 'Người dùng';
        if (rawRole.includes('admin')) {
          roleLabel = 'Admin';
        } else if (rawRole.includes('nhan') || rawRole.includes('nhân')) {
          roleLabel = 'Nhân viên';
        } else if (rawRole) {
          roleLabel = String(req.body?.actorRole || req.headers['x-user-role'] || '').toString();
        }
        const actorName = String(req.body?.actorName || req.headers['x-user-name'] || '').trim() || 'Người dùng hệ thống';
        return `${roleLabel} [${actorName}] - Yêu cầu điều chuyển #${id} chuyển trạng thái sang ${status}`;
      })(),
      entityType: "transfer",
      entityId: id,
    })

    return res.json({ ok: true })
  } catch (error) {
    if (connection) {
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

// Assign a specific device (from warehouse) to a transfer before approval
router.put("/:id/assign-device", async (req, res) => {
  try {
    const id = Number(req.params.id)
    const deviceId = Number(req.body?.deviceId || 0)

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID yêu cầu không hợp lệ" })
    }

    if (!Number.isInteger(deviceId) || deviceId <= 0) {
      return res.status(400).json({ message: "ID thiết bị không hợp lệ" })
    }

    // attempt to get device code for serial
    const [deviceRows] = await pool.query(`SELECT device_code FROM devices WHERE id = ? LIMIT 1`, [deviceId])
    const deviceCode = deviceRows?.[0]?.device_code || null

    const updateVariants = [
      `UPDATE device_transfers SET device_id = ?, serial_number = COALESCE(?, serial_number), updated_at = NOW() WHERE id = ?`,
      `UPDATE device_transfers SET device_id = ?, updated_at = NOW() WHERE id = ?`,
    ]

    const updateParams = [[deviceId, deviceCode, id], [deviceId, id]]

    let result = null
    let lastError = null
    for (let i = 0; i < updateVariants.length; i += 1) {
      try {
        const [r] = await pool.query(updateVariants[i], updateParams[i])
        result = r
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
      return res.status(404).json({ message: "Không tìm thấy yêu cầu" })
    }

    // log assignment activity with actor role/name when available
    try {
      const actorUserId = resolveActorUserId(req)
      const rawRole = String(req.body?.actorRole || req.headers['x-user-role'] || '').toLowerCase()
      let roleLabel = 'Người dùng'
      if (rawRole.includes('admin')) {
        roleLabel = 'Admin'
      } else if (rawRole.includes('nhan') || rawRole.includes('nhân')) {
        roleLabel = 'Nhân viên'
      } else if (rawRole) {
        roleLabel = String(req.body?.actorRole || req.headers['x-user-role'] || '').toString()
      }
      const actorName = String(req.body?.actorName || req.headers['x-user-name'] || '').trim() || 'Người dùng hệ thống'
      const deviceLabel = deviceCode || String(deviceId || "").trim() || "thiết bị"

      await logActivity({
        userId: actorUserId,
        action: 'transfer.assign-device',
        description: `${roleLabel} [${actorName}] - Gán ${deviceLabel} cho yêu cầu #${id}`,
        entityType: 'transfer',
        entityId: id,
      })
    } catch (err) {
      // do not block the main flow if logging fails
      console.error('Failed to log assign-device activity', String(err || ''))
    }

    return res.json({ ok: true })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id)
    const actorUserId = resolveActorUserId(req)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID yêu cầu không hợp lệ" })
    }

    const [existingRows] = await pool.query(
      `SELECT request_code
       FROM device_transfers
       WHERE id = ?
       LIMIT 1`,
      [id]
    )

    const [result] = await pool.query(`DELETE FROM device_transfers WHERE id = ?`, [id])

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu điều chuyển" })
    }

    const requestCode = String(existingRows?.[0]?.request_code || "").trim() || `#${id}`
    await logActivity({
      userId: actorUserId,
      action: "transfer.delete",
      description: (function() {
        const rawRole = String(req.body?.actorRole || req.headers['x-user-role'] || '').toLowerCase();
        let roleLabel = 'Người dùng';
        if (rawRole.includes('admin')) {
          roleLabel = 'Admin';
        } else if (rawRole.includes('nhan') || rawRole.includes('nhân')) {
          roleLabel = 'Nhân viên';
        } else if (rawRole) {
          roleLabel = String(req.body?.actorRole || req.headers['x-user-role'] || '').toString();
        }
        const actorName = String(req.body?.actorName || req.headers['x-user-name'] || '').trim() || 'Người dùng hệ thống';
        return `${roleLabel} [${actorName}] - Xóa yêu cầu điều chuyển ${requestCode}`;
      })(),
      entityType: "transfer",
      entityId: id,
    })

    return res.json({ ok: true })
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      return res.status(400).json({ message: "Bảng device_transfers chưa được tạo" })
    }

    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.get("/device/:deviceId/logs", async (req, res) => {
  try {
    const deviceId = Number(req.params.deviceId)
    if (!Number.isInteger(deviceId) || deviceId <= 0) {
      return res.status(400).json({ message: "ID thiết bị không hợp lệ" })
    }

    const logs = []

    let transferRows = []
    let transferQueryError = null
    const transferQueryVariants = [
      `SELECT
         id,
         request_code,
         from_department,
         to_department,
         to_location,
         request_date,
         requester_name,
         transfer_reason,
         status,
         updated_at
       FROM device_transfers
       WHERE device_id = ?
       ORDER BY id DESC`,
      `SELECT
         id,
         request_code,
         from_department,
         to_department,
         request_date,
         requester_name,
         transfer_reason,
         status,
         updated_at
       FROM device_transfers
       WHERE device_id = ?
       ORDER BY id DESC`,
      `SELECT
         id,
         request_code,
         from_department,
         to_department,
         request_date,
         requester_name,
         status,
         updated_at
       FROM device_transfers
       WHERE device_id = ?
       ORDER BY id DESC`,
    ]

    for (const query of transferQueryVariants) {
      try {
        const [rows] = await pool.query(query, [deviceId])
        transferRows = rows
        transferQueryError = null
        break
      } catch (error) {
        if (error.code === "ER_BAD_FIELD_ERROR") {
          transferQueryError = error
          continue
        }

        throw error
      }
    }

    if (transferQueryError) {
      throw transferQueryError
    }

    transferRows.forEach((row) => {
      const status = normalizeStatus(row.status)
      const decoded = decodeReasonAndLocation(row.transfer_reason, row.to_location)
      const toLocation = String(decoded.toLocation || "").trim()
      const destinationText =
        String(row.to_department || "").trim() +
        (toLocation ? ` (${toLocation})` : "")

      logs.push({
        id: `transfer-${row.id}`,
        type: "transfer",
        code: row.request_code || `DC-${String(row.id).padStart(3, "0")}`,
        title: "Điều chuyển thiết bị",
        status,
        date: toLogTimestamp(row.updated_at, row.request_date),
        description:
          `${row.from_department || "-"} → ${destinationText || "-"}` +
          (decoded.reason ? ` | Lý do: ${decoded.reason}` : "") +
          (row.requester_name ? ` | Người yêu cầu: ${row.requester_name}` : ""),
      })
    })

    let maintenanceRows = []
    let maintenanceQueryError = null
    const maintenanceQueryVariants = [
      `SELECT
         id,
         task_code,
         maintenance_type,
         note,
         scheduled_date,
         technician_name,
         status,
         updated_at
       FROM maintenance_tasks
       WHERE device_id = ?
       ORDER BY id DESC`,
      `SELECT
         id,
         task_code,
         maintenance_type,
         note,
         scheduled_date,
         status,
         updated_at
       FROM maintenance_tasks
       WHERE device_id = ?
       ORDER BY id DESC`,
      `SELECT
         id,
         task_code,
         maintenance_type,
         note,
         scheduled_date,
         status
       FROM maintenance_tasks
       WHERE device_id = ?
       ORDER BY id DESC`,
    ]

    for (const query of maintenanceQueryVariants) {
      try {
        const [rows] = await pool.query(query, [deviceId])
        maintenanceRows = rows
        maintenanceQueryError = null
        break
      } catch (error) {
        if (error.code === "ER_BAD_FIELD_ERROR") {
          maintenanceQueryError = error
          continue
        }

        if (error.code === "ER_NO_SUCH_TABLE") {
          maintenanceRows = []
          maintenanceQueryError = null
          break
        }

        throw error
      }
    }

    if (maintenanceQueryError) {
      throw maintenanceQueryError
    }

    maintenanceRows.forEach((row) => {
      logs.push({
        id: `maintenance-${row.id}`,
        type: "maintenance",
        code: row.task_code || `BT-${String(row.id).padStart(3, "0")}`,
        title: "Bảo trì thiết bị",
        status: String(row.status || "pending"),
        date: toLogTimestamp(row.updated_at, row.scheduled_date),
        description:
          `${row.maintenance_type || "Định kỳ"}` +
          (row.note ? ` | ${row.note}` : "") +
          (row.technician_name ? ` | Nhân viên xử lý: ${row.technician_name}` : ""),
      })
    })

    let repairRows = []
    let repairQueryError = null
    const repairQueryVariants = [
      `SELECT
         id,
         request_code,
         issue_description,
         technician_name,
         status,
         created_at,
         completed_date,
         updated_at
       FROM repair_requests
       WHERE device_id = ?
       ORDER BY id DESC`,
      `SELECT
         id,
         request_code,
         issue_description,
         status,
         created_at,
         completed_date,
         updated_at
       FROM repair_requests
       WHERE device_id = ?
       ORDER BY id DESC`,
      `SELECT
         id,
         request_code,
         issue_description,
         status,
         created_at,
         completed_date
       FROM repair_requests
       WHERE device_id = ?
       ORDER BY id DESC`,
    ]

    for (const query of repairQueryVariants) {
      try {
        const [rows] = await pool.query(query, [deviceId])
        repairRows = rows
        repairQueryError = null
        break
      } catch (error) {
        if (error.code === "ER_BAD_FIELD_ERROR") {
          repairQueryError = error
          continue
        }

        if (error.code === "ER_NO_SUCH_TABLE") {
          repairRows = []
          repairQueryError = null
          break
        }

        throw error
      }
    }

    if (repairQueryError) {
      throw repairQueryError
    }

    repairRows.forEach((row) => {
    logs.push({
        id: `repair-${row.id}`,
        type: "repair",
        code: row.request_code || `RP${String(row.id).padStart(3, "0")}`,
        title: "Sửa chữa thiết bị",
        status: String(row.status || "pending"),
        date: toLogTimestamp(row.completed_date, row.updated_at, row.created_at),
        description:
          `${row.issue_description || "Không có mô tả"}` +
          (row.technician_name ? ` | Nhân viên xử lý: ${row.technician_name}` : ""),
      })
    })

    try {
      const [liqRows] = await pool.query(
        `SELECT
           id,
           created_at,
           description
         FROM activity
         WHERE entity_type = 'device' 
           AND entity_id = ?
           AND \`action\` = 'device.liquidation'
         ORDER BY id DESC`,
        [deviceId]
      )
      
      const liquidationRows = liqRows || []
      liquidationRows.forEach((row) => {
        logs.push({
          id: `liquidation-${row.id}`,
          type: "liquidation",
          code: `LQ${String(row.id).padStart(3, "0")}`,
          title: "Thanh lý thiết bị",
          status: "hoan_thanh",
          date: toLogTimestamp(row.created_at),
          description: row.description || "Đã thanh lý thiết bị",
        })
      })
    } catch (e) {
      // ignore
    }

    logs.sort((left, right) => {
      const leftTime = left.date ? new Date(left.date).getTime() : 0
      const rightTime = right.date ? new Date(right.date).getTime() : 0
      return rightTime - leftTime
    })

    return res.json({ logs })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

module.exports = router
