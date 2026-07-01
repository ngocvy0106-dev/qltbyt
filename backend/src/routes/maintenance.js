const express = require("express")
const { pool } = require("../db")
const { logActivity } = require("../activity")

const router = express.Router()

function normalizeStatus(value) {
  const text = String(value || "").trim().toLowerCase()

  if (["pending", "cho xu ly", "cho xu ly"].includes(text)) {
    return "pending"
  }

  if (["in_progress", "inprogress", "dang thuc hien"].includes(text)) {
    return "in_progress"
  }

  if (["completed", "hoan thanh"].includes(text)) {
    return "completed"
  }

  return "pending"
}

function normalizeType(value) {
  const text = String(value || "").trim().toLowerCase()

  if (["khan cap", "urgent"].includes(text)) {
    return "Khẩn cấp"
  }

  return "Định kỳ"
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
}

function isEmployeeRole(value) {
  const role = normalizeText(value)
  return role.includes("nhan vien") || role.includes("nhan-vien") || role.includes("employee") || role.includes("staff")
}

function formatDeviceLabel(deviceName, deviceCode) {
  const name = String(deviceName || "").trim() || "-"
  const code = String(deviceCode || "").trim()

  return code ? `${name} [${code}]` : name
}

router.post("/", async (req, res) => {
  try {
    const {
      deviceId,
      deviceName,
      note,
      type,
      dueDate,
      technician,
      status,
      cost,
      role,
      userId,
      createdBy,
    } = req.body || {}

    // Only admin role can create maintenance tasks
    const userRole = String(role || "").trim().toLowerCase()
    if (userRole !== "admin") {
      return res.status(403).json({ message: "Chỉ admin mới có thể tạo lịch bảo trì" })
    }

    const normalizedDeviceId =
      deviceId === null || deviceId === undefined || String(deviceId).trim() === ""
        ? null
        : Number(deviceId)
    let normalizedDeviceName = String(deviceName || "").trim() || null
    let normalizedDeviceCode = null
    const normalizedNote = String(note || "").trim() || "Bảo trì định kỳ"
    const normalizedType = normalizeType(type)
    const normalizedDueDate = String(dueDate || "").trim()
    const normalizedTechnician = String(technician || "").trim() || null
    const normalizedStatus = normalizeStatus(status)
    const normalizedCost =
      cost === null || cost === undefined || String(cost).trim() === ""
        ? 0
        : Number(String(cost).replace(/,/g, ""))

    if (!normalizedDueDate) {
      return res.status(400).json({ message: "Ngày hẹn bảo trì không được để trống" })
    }

    if (!normalizedDeviceName && !Number.isInteger(normalizedDeviceId)) {
      return res.status(400).json({ message: "Thiết bị không hợp lệ" })
    }

    if ((!normalizedDeviceName || normalizedDeviceName === "-") && Number.isInteger(normalizedDeviceId)) {
      const [deviceRows] = await pool.query(
        `SELECT device_name, device_code
         FROM devices
         WHERE id = ?
         LIMIT 1`,
        [normalizedDeviceId]
      )

      normalizedDeviceName = String(deviceRows?.[0]?.device_name || "").trim() || normalizedDeviceName
      normalizedDeviceCode = String(deviceRows?.[0]?.device_code || "").trim() || null
    }

    const taskCode = `BT-${Date.now().toString().slice(-6)}`

    const queryVariants = [
      `INSERT INTO maintenance_tasks
       (task_code, device_id, device_name, note, maintenance_type, scheduled_date, technician_name, status, cost, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      `INSERT INTO maintenance_tasks
       (task_code, device_id, device_name, note, maintenance_type, scheduled_date, technician_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      `INSERT INTO maintenance_tasks
       (task_code, device_id, device_name, note, maintenance_type, scheduled_date, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    ]

    const queryParams = [
      [
        taskCode,
        Number.isInteger(normalizedDeviceId) ? normalizedDeviceId : null,
        normalizedDeviceName,
        normalizedNote,
        normalizedType,
        normalizedDueDate,
        normalizedTechnician,
        normalizedStatus,
        Number.isFinite(normalizedCost) ? normalizedCost : 0,
      ],
      [
        taskCode,
        Number.isInteger(normalizedDeviceId) ? normalizedDeviceId : null,
        normalizedDeviceName,
        normalizedNote,
        normalizedType,
        normalizedDueDate,
        normalizedTechnician,
        normalizedStatus,
      ],
      [
        taskCode,
        Number.isInteger(normalizedDeviceId) ? normalizedDeviceId : null,
        normalizedDeviceName,
        normalizedNote,
        normalizedType,
        normalizedDueDate,
        normalizedStatus,
      ],
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

        throw error
      }
    }

    if (lastError) {
      throw lastError
    }

    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    const hh = String(now.getHours()).padStart(2, "0")
    const min = String(now.getMinutes()).padStart(2, "0")
    const ss = String(now.getSeconds()).padStart(2, "0")
    const timeStr = `${hh}:${min}:${ss}`
    const isoDate = `${yyyy}-${mm}-${dd}`
    
    // Parse normalizedDueDate to get day/month/year
    const parsedDueDate = new Date(normalizedDueDate)
    const dueDd = String(parsedDueDate.getDate()).padStart(2, "0")
    const dueMm = String(parsedDueDate.getMonth() + 1).padStart(2, "0")
    const dueYyyy = parsedDueDate.getFullYear()
    const dueDisplayDate = `${dueDd}/${dueMm}/${dueYyyy}`
    const dueDateIso = normalizedDueDate.split("T")[0] || normalizedDueDate
    
    const activityDescription = `Tạo lịch bảo trì ${normalizedType} ${taskCode} - Thiết bị : ${formatDeviceLabel(normalizedDeviceName, normalizedDeviceCode)}`

    const normalizedUserId = Number.isInteger(Number(userId)) && Number(userId) > 0 ? Number(userId) : null

    await logActivity({
      userId: normalizedUserId,
      action: "maintenance.create",
      description: activityDescription,
      entityType: "maintenance",
      entityId: insertId,
    })

    // Retroactively update any existing activity rows for maintenance.create
    // to match the new format with maintenance type and device serial
    try {
      await pool.query(
        `UPDATE activity a
         JOIN maintenance_tasks m ON a.entity_id = m.id
         LEFT JOIN devices d ON d.id = m.device_id
         SET a.description = CONCAT(
           'Tạo lịch bảo trì ',
           IFNULL(m.maintenance_type, 'Định kỳ'),
           ' ',
           IFNULL(m.task_code, '-'),
           ' - Thiết bị : ',
           TRIM(CONCAT(
             IFNULL(m.device_name, '-'),
             CASE
               WHEN d.device_code IS NOT NULL AND TRIM(d.device_code) <> '' THEN CONCAT(' [', TRIM(d.device_code), ']')
               ELSE ''
             END
           ))
         )
         WHERE a.entity_type = 'maintenance'
           AND a.action = 'maintenance.create'`
      )
    } catch (updateErr) {
      // Non-fatal: if activity table/columns don't exist or DB error, ignore so endpoint still succeeds
      console.warn('[WARN] Failed to retroactively update activity descriptions:', String(updateErr.message || updateErr))
    }

    return res.json({ ok: true, id: insertId, taskCode })
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      return res.status(400).json({ message: "Bảng maintenance_tasks chưa được tạo" })
    }

    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

// Send notification to technician after creating maintenance task
router.post("/:id/notify", async (req, res) => {
  try {
    const maintenanceId = Number(req.params.id)
    const { technicianName } = req.body || {}

    if (!Number.isInteger(maintenanceId) || maintenanceId <= 0) {
      return res.status(400).json({ message: "ID bảo trì không hợp lệ" })
    }

    if (!technicianName || !String(technicianName).trim()) {
      return res.status(400).json({ message: "Tên nhân viên không hợp lệ" })
    }

    // Get maintenance details
    const [maintenanceRows] = await pool.query(
      `SELECT id, task_code, device_name, scheduled_date, maintenance_type
       FROM maintenance_tasks
       WHERE id = ?
       LIMIT 1`,
      [maintenanceId]
    )

    if (!maintenanceRows.length) {
      return res.status(404).json({ message: "Lịch bảo trì không tồn tại" })
    }

    const maintenance = maintenanceRows[0]

    // Find user with matching name
    const [userRows] = await pool.query(
      `SELECT id, full_name FROM users
       WHERE full_name = ? OR username = ?
       LIMIT 1`,
      [String(technicianName).trim(), String(technicianName).trim()]
    )

    if (!userRows.length) {
      // User not found, but don't fail - just return success
      return res.json({ ok: true, notificationSent: false, message: "Nhân viên không tìm thấy" })
    }

    const recipient = userRows[0]
    const notificationMessage = `Bạn được giao lịch bảo trì ${maintenance.task_code} cho thiết bị ${maintenance.device_name} vào ngày ${maintenance.scheduled_date}`

    try {
      // Insert activity record for technician notification
      await logActivity({
        action: "maintenance.assigned",
        description: notificationMessage,
        entityType: "maintenance_task",
        entityId: maintenanceId,
        userId: recipient.id,
      })

      return res.json({ ok: true, notificationSent: true })
    } catch (activityError) {
      console.warn("Failed to log activity notification:", activityError.message)
      // Don't fail - just return success anyway
      return res.json({ ok: true, notificationSent: false, message: "Không thể ghi thông báo" })
    }
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.get("/", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim().toLowerCase()
    const type = String(req.query.type || "all").trim()
    const status = String(req.query.status || "all").trim()
    const role = String(req.query.role || "").trim()
    const requester = String(req.query.requester || "").trim()
    const requesterAlt = String(req.query.requesterAlt || "").trim()
    const isEmployee = isEmployeeRole(role)

    const [rows] = await pool.query(
      `SELECT
         m.id,
         m.task_code,
         m.device_id,
         COALESCE(d.device_name, m.device_name, 'Thiết bị chưa xác định') AS device_name,
         m.note,
         m.maintenance_type,
         m.scheduled_date,
         m.technician_name,
         m.status,
         m.cost,
         m.updated_at
       FROM maintenance_tasks m
       LEFT JOIN devices d ON m.device_id = d.id
       ORDER BY m.id ASC`
    )

    const mapped = rows.map((row) => ({
      id: row.id,
      code: row.task_code || `BT-${String(row.id).padStart(3, "0")}`,
      deviceId: row.device_id,
      deviceName: row.device_name,
      note: row.note || "-",
      type: normalizeType(row.maintenance_type),
      dueDate: row.scheduled_date,
      technician: String(row.technician_name || "").trim() || "Chưa phân công",
      status: normalizeStatus(row.status),
      cost: row.cost ?? 0,
    }))

    const matchesEmployee = (value) => {
      if (!isEmployee) {
        return true
      }

      const normalizedValue = normalizeText(String(value || ""))
      const normalizedRequester = normalizeText(requester)
      const normalizedRequesterAlt = normalizeText(requesterAlt)

      return (
        (normalizedRequester && normalizedValue === normalizedRequester) ||
        (normalizedRequesterAlt && normalizedValue === normalizedRequesterAlt)
      )
    }

    const filtered = mapped.filter((item) => {
      if (!matchesEmployee(item.technician)) {
        return false
      }

      const matchedSearch =
        !search ||
        item.deviceName.toLowerCase().includes(search) ||
        item.technician.toLowerCase().includes(search) ||
        item.note.toLowerCase().includes(search)

      const matchedType = type === "all" || item.type === type
      const matchedStatus = status === "all" || item.status === status

      return matchedSearch && matchedType && matchedStatus
    })

    const summary = {
      total: filtered.length,
      pending: filtered.filter((item) => item.status === "pending").length,
      inProgress: filtered.filter((item) => item.status === "in_progress").length,
      completed: filtered.filter((item) => item.status === "completed").length,
      totalCost: filtered.reduce((sum, item) => sum + Number(item.cost || 0), 0),
    }

    return res.json({ items: filtered, summary })
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      return res.json({
        items: [],
        summary: {
          total: 0,
          pending: 0,
          inProgress: 0,
          completed: 0,
          totalCost: 0,
        },
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

    const queryVariants = [
      `SELECT
         m.id,
         m.device_id,
         COALESCE(d.device_name, m.device_name, 'Thiết bị chưa xác định') AS device_name,
         COALESCE(d.device_code, '-') AS serial_number,
         m.scheduled_date,
         m.completion_date,
         m.technician_name AS assigned_technician,
         m.technician_name,
         m.cost AS maintenance_cost,
         m.status,
         m.created_by,
         m.note AS notes
       FROM maintenance_tasks m
       LEFT JOIN devices d ON m.device_id = d.id
       WHERE m.id = ?`,
      `SELECT
         m.id,
         m.device_id,
         COALESCE(d.device_name, m.device_name, 'Thiết bị chưa xác định') AS device_name,
         COALESCE(d.device_code, '-') AS serial_number,
         m.scheduled_date,
         m.technician_name,
         m.cost AS maintenance_cost,
         m.status,
         m.note AS notes
       FROM maintenance_tasks m
       LEFT JOIN devices d ON m.device_id = d.id
       WHERE m.id = ?`,
       `SELECT
         m.id,
         m.device_id,
         COALESCE(d.device_name, m.device_name, 'Thiết bị chưa xác định') AS device_name,
         COALESCE(d.device_code, '-') AS serial_number,
         m.scheduled_date,
         m.technician_name,
         m.status,
         m.note AS notes
       FROM maintenance_tasks m
       LEFT JOIN devices d ON m.device_id = d.id
       WHERE m.id = ?`
    ]

    let rows = []
    let lastError = null

    for (const query of queryVariants) {
      try {
        const [r] = await pool.query(query, [id])
        rows = r
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

    if (rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy lịch bảo trì" })
    }

    return res.json(rows[0])
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.put("/:id/confirm", async (req, res) => {
  try {
    const id = Number(req.params.id)
    const costValue = Number(String(req.body?.cost ?? "").replace(/,/g, ""))

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID bảo trì không hợp lệ" })
    }

    if (!Number.isFinite(costValue) || costValue < 0) {
      return res.status(400).json({ message: "Chi phí bảo trì không hợp lệ" })
    }

    const [existingRows] = await pool.query(
      `SELECT m.id, m.task_code, m.device_id, m.device_name, m.status, d.device_code
       FROM maintenance_tasks m
       LEFT JOIN devices d ON d.id = m.device_id
       WHERE m.id = ?
       LIMIT 1`,
      [id]
    )

    if (!existingRows.length) {
      return res.status(404).json({ message: "Không tìm thấy lịch bảo trì" })
    }

    const existing = existingRows[0]
    const currentStatus = normalizeStatus(existing.status)
    if (currentStatus === "completed") {
      return res.status(400).json({ message: "Lịch bảo trì đã được xác nhận" })
    }

        const nextStatus = currentStatus === "pending" ? "in_progress" : "completed"

        // First confirmation moves the task to in_progress; the second completes it.
    const queryVariants = [
      {
        query: `UPDATE maintenance_tasks
        SET status = ?,
                    cost = ?,
                    updated_at = NOW()
                WHERE id = ?`,
      params: [nextStatus, costValue, id],
      },
      {
        query: `UPDATE maintenance_tasks
        SET status = ?,
                    cost = ?
                WHERE id = ?`,
      params: [nextStatus, costValue, id],
      },
      {
        query: `UPDATE maintenance_tasks
        SET status = ?
                WHERE id = ?`,
      params: [nextStatus, id],
      },
    ]

    let affectedRows = 0
    let lastError = null

    for (const variant of queryVariants) {
      try {
        const [result] = await pool.query(variant.query, variant.params)
        affectedRows = Number(result.affectedRows || 0)
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

    if (!affectedRows) {
      return res.status(404).json({ message: "Không tìm thấy lịch bảo trì" })
    }

      // If the maintenance task references a device, update its status accordingly
      // When confirmed in_progress: set to 'maintenance', when completed: set to 'hoạt động'
      try {
        const deviceId = Number(existing.device_id || existing.deviceId || 0)
        if (Number.isFinite(deviceId) && deviceId > 0) {
          try {
            const deviceStatus = nextStatus === "completed" ? "hoạt động" : "maintenance"
            await pool.query(
              `UPDATE devices
               SET status = ?,
                   updated_at = NOW()
               WHERE id = ?`,
              [deviceStatus, deviceId]
            )
          } catch (deviceUpdateErr) {
            // If devices table doesn't have these fields or column names differ, ignore
            console.warn('[WARN] Failed to update device status for maintenance confirm:', String(deviceUpdateErr.message || deviceUpdateErr))
          }
        }
      } catch (err) {
        // ignore
      }

    // If actor information is provided, associate the activity with that user
    const actorId = Number(req.body?.actorId || 0)
    
    // Format device label with code
    const deviceCode = existing.device_code ? ` - ${existing.device_code}` : ""
    const deviceLabel = `${existing.device_name || "-"}${deviceCode}`
    
    const logPayload = {
      action: "maintenance.confirm",
      description: `${nextStatus === "in_progress" ? "Xác nhận nhận bảo trì" : "Xác nhận hoàn thành bảo trì"} Thiết bị: ${deviceLabel}`,
      entityType: "maintenance",
      entityId: id,
    }

    if (Number.isInteger(actorId) && actorId > 0) {
      logPayload.userId = actorId
    }

    await logActivity(logPayload)

    // If actor is an employee, send notification to all admin users
    const actorRole = String(req.body?.actorRole || "").trim()
    if (isEmployeeRole(actorRole)) {
      try {
        // Find all admin users with schema-compatible query variants.
        let adminUsers = []
        const adminUserQueries = [
          `SELECT u.id, u.full_name
           FROM users u
           LEFT JOIN role r ON u.role_id = r.id
           WHERE LOWER(COALESCE(r.role_name, '')) IN ('admin', 'quan tri vien', 'quản trị viên', 'administrator')
              OR LOWER(COALESCE(u.role, '')) LIKE '%admin%'
           LIMIT 100`,
          `SELECT u.id, u.full_name
           FROM users u
           LEFT JOIN role r ON u.role_id = r.id
           WHERE LOWER(COALESCE(r.role_name, '')) IN ('admin', 'quan tri vien', 'quản trị viên', 'administrator')
           LIMIT 100`,
          `SELECT u.id, u.full_name
           FROM users u
           WHERE LOWER(COALESCE(u.role, '')) LIKE '%admin%'
           LIMIT 100`,
        ]

        let lastAdminQueryError = null
        for (const adminQuery of adminUserQueries) {
          try {
            const [rows] = await pool.query(adminQuery)
            adminUsers = rows
            lastAdminQueryError = null
            break
          } catch (adminQueryError) {
            if (["ER_BAD_FIELD_ERROR", "ER_NO_SUCH_TABLE"].includes(adminQueryError.code)) {
              lastAdminQueryError = adminQueryError
              continue
            }

            throw adminQueryError
          }
        }

        if (lastAdminQueryError) {
          throw lastAdminQueryError
        }

        // Create activity notification for each admin with required message format.
        const actorFullName = String(req.body?.actorFullName || "Nhân viên").trim()
        const serialSuffix = String(existing.device_code || "").trim()
        const normalizedDeviceName = String(existing.device_name || "-").trim() || "-"
        const periodicDeviceLabel = serialSuffix
          ? `${normalizedDeviceName} [${serialSuffix}]`
          : normalizedDeviceName
        const actionText = nextStatus === "completed" 
          ? "xác nhận hoàn thành lịch bảo trì" 
          : "xác nhận lịch bảo trì"
        const adminNotificationMessage = `${actorFullName} ${actionText} định kỳ thiết bị ${periodicDeviceLabel}`

        for (const admin of adminUsers) {
          try {
            await logActivity({
              action: "maintenance.employee_confirmed",
              description: adminNotificationMessage,
              entityType: "maintenance",
              entityId: id,
              userId: admin.id,
            })
          } catch (notificationErr) {
            console.warn(`[WARN] Failed to create admin notification for user ${admin.id}:`, String(notificationErr.message || notificationErr))
          }
        }
      } catch (adminNotificationErr) {
        console.warn("[WARN] Failed to send admin notifications for employee maintenance confirm:", String(adminNotificationErr.message || adminNotificationErr))
        // Non-fatal: don't fail the overall request
      }
    }

    return res.json({ ok: true, status: nextStatus, cost: costValue })
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      return res.status(400).json({ message: "Bảng maintenance_tasks chưa được tạo" })
    }

    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID bảo trì không hợp lệ" })
    }

    const [rows] = await pool.query(
      `SELECT m.id, m.task_code, m.device_name, m.maintenance_type, d.device_code
       FROM maintenance_tasks m
       LEFT JOIN devices d ON d.id = m.device_id
       WHERE m.id = ?
       LIMIT 1`,
      [id]
    )

    const item = rows?.[0]
    if (!item) {
      return res.status(404).json({ message: "Không tìm thấy lịch bảo trì" })
    }

    const [result] = await pool.query("DELETE FROM maintenance_tasks WHERE id = ?", [id])
    if (!result.affectedRows) {
      return res.status(404).json({ message: "Không tìm thấy lịch bảo trì" })
    }

    const maintenanceType = String(item.maintenance_type || "Định kỳ").trim()
    const userId = Number(req.body?.userId || req.query?.userId || 0)
    const normalizedUserId = Number.isInteger(userId) && userId > 0 ? userId : null

    await logActivity({
      userId: normalizedUserId,
      action: "maintenance.delete",
      description: `Xóa lịch bảo trì ${maintenanceType} ${item.task_code || `BT-${id}`} - Thiết bị : ${formatDeviceLabel(item.device_name, item.device_code)}`,
      entityType: "maintenance",
      entityId: id,
    })

    return res.json({ ok: true })
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      return res.status(400).json({ message: "Bảng maintenance_tasks chưa được tạo" })
    }

    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

// Get maintenance notifications for a technician
router.get("/notifications/:technicianName", async (req, res) => {
  try {
    const technicianName = String(req.params.technicianName || "").trim()

    if (!technicianName) {
      return res.status(400).json({ message: "Tên nhân viên không hợp lệ" })
    }

    // Find user by technician name
    const [userRows] = await pool.query(
      `SELECT id FROM users
       WHERE full_name = ? OR username = ?
       LIMIT 1`,
      [technicianName, technicianName]
    )

    if (!userRows.length) {
      return res.json({ notifications: [] })
    }

    const userId = userRows[0].id

    try {
      // Query maintenance notifications from activity table
      const [rows] = await pool.query(
        `SELECT id, action, description, entity_type, entity_id, created_at
         FROM activity
         WHERE user_id = ? AND action = 'maintenance.assigned'
         ORDER BY created_at DESC
         LIMIT 50`,
        [userId]
      )

      const notifications = rows.map((row) => ({
        id: row.id,
        description: row.description,
        type: row.action,
        relatedEntityId: row.entity_id,
        relatedEntityType: row.entity_type,
        createdAt: row.created_at,
      }))

      return res.json({ notifications })
    } catch (error) {
      if (error.code === "ER_NO_SUCH_COLUMN") {
        // user_id column might not exist in activity table
        return res.json({ notifications: [] })
      }

      throw error
    }
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

module.exports = router
