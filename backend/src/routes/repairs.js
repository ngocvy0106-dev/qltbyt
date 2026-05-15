const express = require("express")
const { pool } = require("../db")
const { logActivity } = require("../activity")

const router = express.Router()

function normalizeStatus(value) {
  const text = String(value || "").trim().toLowerCase()

  if (["pending", "cho xu ly"].includes(text)) {
    return "pending"
  }

  if (["assigned", "da phan cong"].includes(text)) {
    return "assigned"
  }

  if (["in_progress", "in-progress", "dang sua"].includes(text)) {
    return "in_progress"
  }

  if (["waiting_parts", "waiting-parts", "cho phu tung"].includes(text)) {
    return "waiting_parts"
  }

  if (["completed", "hoan thanh"].includes(text)) {
    return "completed"
  }

  return "pending"
}

function normalizePriority(value) {
  const text = String(value || "").trim().toLowerCase()

  if (["critical", "khan cap"].includes(text)) {
    return "critical"
  }

  if (["high", "cao"].includes(text)) {
    return "high"
  }

  if (["medium", "trung binh"].includes(text)) {
    return "medium"
  }

  if (["low", "thap"].includes(text)) {
    return "low"
  }

  return "medium"
}

function normalizeComparableText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
}

function buildRepairRequestCode() {
  return `RP${Date.now().toString().slice(-6)}`
}

function resolveActorUserId(req) {
  const candidate = Number(req?.body?.actorUserId || req?.query?.actorUserId || 0)
  return Number.isInteger(candidate) && candidate > 0 ? candidate : null
}

function extractCompletedTimeFromProgressNote(progressNote) {
  const text = String(progressNote || "").trim()
  if (!text) {
    return null
  }

  const isoMatch = text.match(/COMPLETED_AT:([0-9TZ:\-.]+)/i)
  if (!isoMatch?.[1]) {
    return null
  }

  const value = isoMatch[1].trim()
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return value
}

async function updateDeviceStatusByRepairId(deviceId, status) {
  const normalizedDeviceId = Number(deviceId)
  if (!Number.isInteger(normalizedDeviceId) || normalizedDeviceId <= 0) {
    return false
  }

  const normalizedStatus = String(status || "").trim() || "active"
  const queryVariants = [
    `UPDATE devices
     SET status = ?, updated_at = NOW()
     WHERE id = ?`,
    `UPDATE devices
     SET status = ?
     WHERE id = ?`,
  ]

  let lastError = null

  for (const query of queryVariants) {
    try {
      const [result] = await pool.query(query, [normalizedStatus, normalizedDeviceId])
      return Number(result.affectedRows || 0) > 0
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

router.get("/", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim().toLowerCase()

    const [rows] = await pool.query(
      `SELECT
         r.id,
         r.request_code,
         r.device_id,
         COALESCE(d.device_name, r.device_name, 'Thiết bị chưa xác định') AS device_name,
         r.issue_description,
         r.reporter_name,
         r.department_name,
         r.priority,
         r.status,
         r.technician_name,
         r.created_at,
         r.start_date,
         r.estimated_end_date,
         r.progress_note,
         r.part_name,
         r.vendor_name,
         r.ordered_date,
         r.expected_arrival,
         r.cost,
         r.completed_date,
         r.resolution_result,
         r.updated_at
       FROM repair_requests r
       LEFT JOIN devices d ON r.device_id = d.id
       ORDER BY r.id ASC`
    )

    console.log(`[DEBUG] GET /api/repairs returned ${rows.length} rows`)
    if (rows.length > 0) {
      console.log(`[DEBUG] Latest repair IDs: ${rows.slice(-3).map(r => r.id).join(', ')}`)
    }

    const items = rows
      .map((row) => ({
        id: row.id,
        code: row.request_code || `RP${String(row.id).padStart(3, "0")}`,
        deviceId: row.device_id,
        device: row.device_name,
        issue: row.issue_description || "-",
        reporter: row.reporter_name || "-",
        department: row.department_name || "-",
        priority: normalizePriority(row.priority),
        status: normalizeStatus(row.status),
        technician: row.technician_name || "-",
        createdAt: row.created_at,
        startDate: row.start_date,
        estimatedEnd: row.estimated_end_date,
        progress: row.progress_note || "-",
        part: row.part_name || "-",
        vendor: row.vendor_name || "-",
        orderedDate: row.ordered_date,
        expectedArrival: row.expected_arrival,
        cost: Number(row.cost || 0),
        completedDate: row.completed_date,
        completedTime:
          normalizeStatus(row.status) === "completed"
            ? extractCompletedTimeFromProgressNote(row.progress_note) || row.updated_at || row.completed_date
            : null,
        result: row.resolution_result || "Thành công",
      }))
      .filter((item) => {
        if (!search) {
          return true
        }

        return (
          item.code.toLowerCase().includes(search) ||
          item.device.toLowerCase().includes(search) ||
          item.issue.toLowerCase().includes(search) ||
          item.reporter.toLowerCase().includes(search) ||
          item.technician.toLowerCase().includes(search)
        )
      })

    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()

    const completedThisMonth = items.filter((item) => {
      if (!item.completedDate) {
        return false
      }

      const date = new Date(item.completedDate)
      if (Number.isNaN(date.getTime())) {
        return false
      }

      return date.getMonth() === currentMonth && date.getFullYear() === currentYear
    }).length

    return res.json({
      items,
      summary: {
        pending: items.filter((item) => item.status === "pending").length,
        inProgress: items.filter((item) => item.status === "in_progress").length,
        waitingParts: items.filter((item) => item.status === "waiting_parts").length,
        completedThisMonth,
      },
    })
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      return res.json({
        items: [],
        summary: { pending: 0, inProgress: 0, waitingParts: 0, completedThisMonth: 0 },
      })
    }

    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.post("/", async (req, res) => {
  try {
    const actorUserId = resolveActorUserId(req)
    const {
      deviceId,
      issueDescription,
      reporterName,
      departmentName,
      priority,
    } = req.body || {}

    const normalizedDeviceId = Number(deviceId)
    const normalizedIssue = String(issueDescription || "").trim()
    const normalizedReporter = String(reporterName || "").trim()
    const normalizedDepartment = String(departmentName || "").trim()
    const normalizedPriority = normalizePriority(priority)

    if (!Number.isInteger(normalizedDeviceId) || normalizedDeviceId <= 0) {
      return res.status(400).json({ message: "Thiết bị không hợp lệ" })
    }

    if (!normalizedIssue) {
      return res.status(400).json({ message: "Mô tả sự cố không được để trống" })
    }

    if (!normalizedReporter) {
      return res.status(400).json({ message: "Người báo cáo không được để trống" })
    }

    if (!normalizedDepartment) {
      return res.status(400).json({ message: "Khoa/Phòng không được để trống" })
    }

    const requestCode = buildRepairRequestCode()

    const queryVariants = [
      `INSERT INTO repair_requests
       (request_code, device_id, issue_description, reporter_name, department_name, priority, status, technician_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, NOW(), NOW())`,
      `INSERT INTO repair_requests
       (request_code, device_id, issue_description, reporter_name, department_name, priority, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      `INSERT INTO repair_requests
       (request_code, device_id, issue_description, reporter_name, priority, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
    ]

    const queryParams = [
      [
        requestCode,
        normalizedDeviceId,
        normalizedIssue,
        normalizedReporter,
        normalizedDepartment,
        normalizedPriority,
      ],
      [
        requestCode,
        normalizedDeviceId,
        normalizedIssue,
        normalizedReporter,
        normalizedDepartment,
        normalizedPriority,
      ],
      [
        requestCode,
        normalizedDeviceId,
        normalizedIssue,
        normalizedReporter,
        normalizedPriority,
      ],
    ]

    let insertId = null
    let lastError = null

    for (let index = 0; index < queryVariants.length; index += 1) {
      try {
        console.log(`[DEBUG] Attempting INSERT query variant ${index + 1}`)
        const [result] = await pool.query(queryVariants[index], queryParams[index])
        insertId = result.insertId
        console.log(`[DEBUG] INSERT succeeded with ID: ${insertId}`)
        lastError = null
        break
      } catch (error) {
        console.log(`[DEBUG] INSERT variant ${index + 1} failed with error:`, error.code, error.message)
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

    let deviceName = "Thiết bị"
    let deviceCode = "-"
    const deviceMetaQueries = [
      `SELECT device_name, device_code FROM devices WHERE id = ? LIMIT 1`,
      `SELECT name AS device_name, code AS device_code FROM devices WHERE id = ? LIMIT 1`,
      `SELECT device_name, NULL AS device_code FROM devices WHERE id = ? LIMIT 1`,
      `SELECT name AS device_name, NULL AS device_code FROM devices WHERE id = ? LIMIT 1`,
    ]

    for (const query of deviceMetaQueries) {
      try {
        const [deviceRows] = await pool.query(query, [normalizedDeviceId])
        if (Array.isArray(deviceRows) && deviceRows.length) {
          const row = deviceRows[0]
          deviceName = String(row.device_name || "").trim() || "Thiết bị"
          deviceCode = String(row.device_code || "").trim() || "-"
        }
        break
      } catch (error) {
        if (["ER_BAD_FIELD_ERROR", "ER_NO_SUCH_TABLE"].includes(error.code)) {
          continue
        }

        throw error
      }
    }

    const priorityLabels = {
      critical: "Khẩn cấp",
      high: "Cao",
      medium: "Trung bình",
      low: "Thấp",
    }
    const priorityLabel = priorityLabels[normalizedPriority] || "Trung bình"

    await logActivity({
      userId: actorUserId,
      action: "repair.request",
      description: `Đã gửi yêu cầu sửa chữa thiết bị ${deviceName} - Mã Serial ${deviceCode} [Mức độ: ${priorityLabel}]`,
      entityType: "repair",
      entityId: insertId,
    })

    return res.json({ ok: true, id: insertId, requestCode })
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      return res.status(400).json({ message: "Bảng repair_requests chưa được tạo" })
    }

    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.put("/:id/assign", async (req, res) => {
  try {
    const id = Number(req.params.id)
    const actorUserId = resolveActorUserId(req)
    const technicianName = String(req.body?.technicianName || "").trim()
    const requestedStatus = normalizeStatus(req.body?.status)
    const shouldMoveToInProgress = requestedStatus === "in_progress"
    const isApprovalOnly = requestedStatus === "assigned" && !technicianName

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID yêu cầu không hợp lệ" })
    }

    if (!technicianName && !isApprovalOnly) {
      return res.status(400).json({ message: "Vui lòng chọn nhân viên" })
    }

    const [existingRows] = await pool.query(
      `SELECT r.id, r.device_id, r.technician_name, r.status,
              COALESCE(d.device_name, r.device_name) AS device_name,
              COALESCE(d.device_code, '') AS device_code
       FROM repair_requests r
       LEFT JOIN devices d ON r.device_id = d.id
       WHERE r.id = ?
       LIMIT 1`,
      [id]
    )

    if (!existingRows.length) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu sửa chữa" })
    }

    const queryVariants = isApprovalOnly
      ? [
          `UPDATE repair_requests
           SET status = 'assigned', updated_at = NOW()
           WHERE id = ?`,
          `UPDATE repair_requests
           SET status = 'assigned'
           WHERE id = ?`,
        ]
      : shouldMoveToInProgress
      ? [
          `UPDATE repair_requests
           SET technician_name = ?, status = 'in_progress', start_date = COALESCE(start_date, NOW()), updated_at = NOW()
           WHERE id = ?`,
          `UPDATE repair_requests
           SET technician_name = ?, status = 'in_progress', updated_at = NOW()
           WHERE id = ?`,
          `UPDATE repair_requests
           SET technician_name = ?, status = 'in_progress'
           WHERE id = ?`,
        ]
      : [
          `UPDATE repair_requests
           SET technician_name = ?, status = 'assigned', updated_at = NOW()
           WHERE id = ?`,
          `UPDATE repair_requests
           SET technician_name = ?, status = 'assigned'
           WHERE id = ?`,
          `UPDATE repair_requests
           SET technician_name = ?
           WHERE id = ?`,
        ]

    let affectedRows = 0
    let lastError = null

    for (const query of queryVariants) {
      try {
        const params = isApprovalOnly ? [id] : [technicianName, id]
        const [result] = await pool.query(query, params)
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
      return res.status(404).json({ message: "Không tìm thấy yêu cầu sửa chữa" })
    }

    if (isApprovalOnly) {
      await updateDeviceStatusByRepairId(existingRows[0].device_id, "repairing")
      
      const deviceName = existingRows[0].device_name || "Thiết bị"
      const deviceCode = existingRows[0].device_code
      const serialLabel = deviceCode ? ` [${deviceCode}]` : ""
      
      // Log activity for approval
      await logActivity({
        action: "repair.approve",
        description: `Duyệt yêu cầu sửa chữa thiết bị ${deviceName}${serialLabel}`,
        entityType: "repair",
        entityId: id,
        userId: actorUserId,
      })
    } else if (shouldMoveToInProgress) {
      await updateDeviceStatusByRepairId(existingRows[0].device_id, "repairing")
      const deviceName = existingRows[0].device_name || "Thiết bị"
      const deviceCode = existingRows[0].device_code
      const serialLabel = deviceCode ? ` [${deviceCode}]` : ""
      
      // Log activity for starting repair
      await logActivity({
        action: "repair.start",
        description: `Bắt đầu sửa chữa thiết bị ${deviceName}${serialLabel} - Nhân viên: ${technicianName}`,
        entityType: "repair",
        entityId: id,
        userId: actorUserId,
      })
    } else {
      await updateDeviceStatusByRepairId(existingRows[0].device_id, "repairing")
      const deviceName = existingRows[0].device_name || "Thiết bị"
      const deviceCode = existingRows[0].device_code
      const serialLabel = deviceCode ? ` [${deviceCode}]` : ""
      
      // Log activity for assigning technician
      await logActivity({
        action: "repair.assign",
        description: `Phân công sửa chữa thiết bị ${deviceName}${serialLabel} cho ${technicianName}`,
        entityType: "repair",
        entityId: id,
        userId: actorUserId,
      })
    }

    return res.json({ ok: true })
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      return res.status(400).json({ message: "Bảng repair_requests chưa được tạo" })
    }

    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.put("/:id/confirm", async (req, res) => {
  try {
    const id = Number(req.params.id)
    const actorUserId = resolveActorUserId(req)
    const technicianName = String(req.body?.technicianName || "").trim()
    const technicianUsername = String(req.body?.technicianUsername || "").trim()
    const displayName = technicianName || technicianUsername

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID yêu cầu không hợp lệ" })
    }

    if (!displayName) {
      return res.status(400).json({ message: "Thiếu thông tin nhân viên xác nhận" })
    }

    const [existingRows] = await pool.query(
      `SELECT r.id,
              r.technician_name,
              r.status,
              r.issue_description,
              COALESCE(d.device_name, r.device_name, 'Thiết bị') AS device_name,
              COALESCE(d.device_code, '') AS device_code
       FROM repair_requests r
       LEFT JOIN devices d ON r.device_id = d.id
       WHERE r.id = ?
       LIMIT 1`,
      [id]
    )

    if (!existingRows.length) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu sửa chữa" })
    }

    const existing = existingRows[0]
    const currentTechnician = String(existing.technician_name || "").trim()
    const currentStatus = normalizeStatus(existing.status)
    const normalizedCurrentTechnician = normalizeComparableText(currentTechnician)
    const normalizedTechnicianName = normalizeComparableText(technicianName)
    const normalizedTechnicianUsername = normalizeComparableText(technicianUsername)
    const isTechnicianMatched =
      !normalizedCurrentTechnician ||
      normalizedCurrentTechnician === normalizedTechnicianName ||
      normalizedCurrentTechnician === normalizedTechnicianUsername

    if (!isTechnicianMatched) {
      return res.status(403).json({ message: "Yêu cầu này được phân công cho nhân viên khác" })
    }

    if (!["assigned", "pending"].includes(currentStatus)) {
      return res.status(400).json({ message: "Yêu cầu không ở trạng thái có thể xác nhận" })
    }

    const queryVariants = [
      {
        query: `UPDATE repair_requests
                SET technician_name = COALESCE(NULLIF(?, ''), technician_name),
                    status = 'in_progress',
                    start_date = COALESCE(start_date, NOW()),
                    updated_at = NOW()
                WHERE id = ?`,
        params: [displayName, id],
      },
      {
        query: `UPDATE repair_requests
                SET technician_name = COALESCE(NULLIF(?, ''), technician_name),
                    status = 'in_progress',
                    updated_at = NOW()
                WHERE id = ?`,
        params: [displayName, id],
      },
      {
        query: `UPDATE repair_requests
                SET technician_name = COALESCE(NULLIF(?, ''), technician_name),
                    status = 'in_progress'
                WHERE id = ?`,
        params: [displayName, id],
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
      return res.status(404).json({ message: "Không tìm thấy yêu cầu sửa chữa" })
    }

    const deviceName = String(existing.device_name || "Thiết bị").trim() || "Thiết bị"
    const deviceCode = String(existing.device_code || "").trim() || "-"
    const issueReason = String(existing.issue_description || "").trim() || "Không có mô tả"

    await logActivity({
      userId: actorUserId,
      action: "repair.confirm",
      description: `Xác nhận sửa chữa Thiết bị: ${deviceName} - Mã Serial ${deviceCode} [${issueReason}]`,
      entityType: "repair",
      entityId: id,
    })

    return res.json({ ok: true, status: "in_progress" })
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      return res.status(400).json({ message: "Bảng repair_requests chưa được tạo" })
    }

    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.put("/:id/accept", async (req, res) => {
  try {
    const id = Number(req.params.id)
    const actorUserId = resolveActorUserId(req)
    const technicianName = String(req.body?.technicianName || "").trim()
    const technicianUsername = String(req.body?.technicianUsername || "").trim()
    const estimatedEndDate = String(req.body?.estimatedEndDate || "").trim()
    const rawHasMissingParts = req.body?.hasMissingParts
    const hasMissingParts =
      rawHasMissingParts === true ||
      rawHasMissingParts === 1 ||
      String(rawHasMissingParts || "").trim().toLowerCase() === "true" ||
      String(rawHasMissingParts || "").trim() === "1" ||
      String(rawHasMissingParts || "").trim().toLowerCase() === "missing"
    const missingPartName = String(req.body?.missingPartName || "").trim()
    const rawEstimatedCost = req.body?.estimatedCost

    const estimatedCost =
      rawEstimatedCost === null || rawEstimatedCost === undefined || String(rawEstimatedCost).trim() === ""
        ? 0
        : Number(String(rawEstimatedCost).replace(/,/g, ""))

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID yêu cầu không hợp lệ" })
    }

    if (!technicianName) {
      return res.status(400).json({ message: "Thiếu thông tin nhân viên" })
    }

    if (!estimatedEndDate) {
      return res.status(400).json({ message: "Vui lòng nhập ngày dự kiến hoàn thành" })
    }

    if (hasMissingParts && !missingPartName) {
      return res.status(400).json({ message: "Vui lòng nhập phụ tùng thiếu" })
    }

    if (!Number.isFinite(estimatedCost) || estimatedCost < 0) {
      return res.status(400).json({ message: "Chi phí dự kiến không hợp lệ" })
    }

    const [existingRows] = await pool.query(
      `SELECT id, technician_name, status
       FROM repair_requests
       WHERE id = ?
       LIMIT 1`,
      [id]
    )

    if (!existingRows.length) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu sửa chữa" })
    }

    const existing = existingRows[0]
    const currentTechnician = String(existing.technician_name || "").trim()
    const currentStatus = normalizeStatus(existing.status)
    const normalizedCurrentTechnician = normalizeComparableText(currentTechnician)
    const normalizedTechnicianName = normalizeComparableText(technicianName)
    const normalizedTechnicianUsername = normalizeComparableText(technicianUsername)
    const isTechnicianMatched =
      !normalizedCurrentTechnician ||
      normalizedCurrentTechnician === normalizedTechnicianName ||
      normalizedCurrentTechnician === normalizedTechnicianUsername

    if (!isTechnicianMatched) {
      return res.status(403).json({ message: "Yêu cầu này được phân công cho nhân viên khác" })
    }

    if (!["assigned", "pending"].includes(currentStatus)) {
      return res.status(400).json({ message: "Yêu cầu không ở trạng thái có thể nhận việc" })
    }

    const queryVariants = hasMissingParts
      ? [
          {
            query: `UPDATE repair_requests
                    SET technician_name = ?,
                        status = 'waiting_parts',
                        start_date = COALESCE(start_date, NOW()),
                        estimated_end_date = ?,
                        part_name = ?,
                        cost = ?,
                        ordered_date = COALESCE(ordered_date, NOW()),
                        expected_arrival = ?,
                        updated_at = NOW()
                    WHERE id = ?`,
            params: [technicianName, estimatedEndDate, missingPartName, estimatedCost, estimatedEndDate, id],
          },
          {
            query: `UPDATE repair_requests
                    SET technician_name = ?,
                        status = 'waiting_parts',
                        estimated_end_date = ?,
                        part_name = ?,
                        cost = ?,
                        expected_arrival = ?,
                        updated_at = NOW()
                    WHERE id = ?`,
            params: [technicianName, estimatedEndDate, missingPartName, estimatedCost, estimatedEndDate, id],
          },
          {
            query: `UPDATE repair_requests
                    SET technician_name = ?,
                        status = 'waiting_parts',
                        part_name = ?,
                        cost = ?
                    WHERE id = ?`,
            params: [technicianName, missingPartName, estimatedCost, id],
          },
        ]
      : [
          {
            query: `UPDATE repair_requests
                    SET technician_name = ?,
                        status = 'in_progress',
                        start_date = COALESCE(start_date, NOW()),
                        estimated_end_date = ?,
                        updated_at = NOW()
                    WHERE id = ?`,
            params: [technicianName, estimatedEndDate, id],
          },
          {
            query: `UPDATE repair_requests
                    SET technician_name = ?,
                        status = 'in_progress',
                        estimated_end_date = ?,
                        updated_at = NOW()
                    WHERE id = ?`,
            params: [technicianName, estimatedEndDate, id],
          },
          {
            query: `UPDATE repair_requests
                    SET technician_name = ?,
                        status = 'in_progress'
                    WHERE id = ?`,
            params: [technicianName, id],
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
      return res.status(404).json({ message: "Không tìm thấy yêu cầu sửa chữa" })
    }

    await logActivity({
      userId: actorUserId,
      action: "repair.accept",
      description: `Nhân viên ${technicianName} nhận sửa chữa yêu cầu RP${id}`,
      entityType: "repair",
      entityId: id,
    })

    return res.json({
      ok: true,
      status: hasMissingParts ? "waiting_parts" : "in_progress",
    })
  } catch (error) {
    if (error.code === "ER_TRUNCATED_WRONG_VALUE_FOR_FIELD") {
      return res.status(400).json({
        message: "Cột trạng thái trong DB chưa hỗ trợ waiting_parts/completed. Vui lòng cập nhật schema repair_requests.",
      })
    }

    if (error.code === "ER_NO_SUCH_TABLE") {
      return res.status(400).json({ message: "Bảng repair_requests chưa được tạo" })
    }

    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

  router.put("/:id/parts-eta", async (req, res) => {
    try {
      const id = Number(req.params.id)
      const expectedArrivalDate = String(req.body?.expectedArrivalDate || "").trim()
      const updatedBy = String(req.body?.updatedBy || "").trim()

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: "ID yêu cầu không hợp lệ" })
      }

      if (!expectedArrivalDate) {
        return res.status(400).json({ message: "Vui lòng nhập ngày dự kiến có phụ tùng" })
      }

      const progressNote = updatedBy
        ? `Admin ${updatedBy} cập nhật dự kiến có phụ tùng: ${expectedArrivalDate}`
        : `Cập nhật dự kiến có phụ tùng: ${expectedArrivalDate}`

      const queryVariants = [
        {
          query: `UPDATE repair_requests
                  SET status = 'waiting_parts',
                      expected_arrival = ?,
                      progress_note = ?,
                      updated_at = NOW()
                  WHERE id = ?`,
          params: [expectedArrivalDate, progressNote, id],
        },
        {
          query: `UPDATE repair_requests
                  SET status = 'waiting_parts',
                      expected_arrival = ?,
                      updated_at = NOW()
                  WHERE id = ?`,
          params: [expectedArrivalDate, id],
        },
        {
          query: `UPDATE repair_requests
                  SET status = 'waiting_parts',
                      expected_arrival = ?
                  WHERE id = ?`,
          params: [expectedArrivalDate, id],
        },
        {
          query: `UPDATE repair_requests
                  SET status = 'waiting_parts'
                  WHERE id = ?`,
          params: [id],
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
        return res.status(404).json({ message: "Không tìm thấy yêu cầu sửa chữa" })
      }

      return res.json({ ok: true, status: "waiting_parts", expectedArrivalDate })
    } catch (error) {
      if (error.code === "ER_NO_SUCH_TABLE") {
        return res.status(400).json({ message: "Bảng repair_requests chưa được tạo" })
      }

      return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
    }
  })

router.put("/:id/complete", async (req, res) => {
  try {
    const id = Number(req.params.id)
    const actorUserId = resolveActorUserId(req)
    const resolutionResult = String(req.body?.result || "Hoàn thành sửa chữa").trim() || "Hoàn thành sửa chữa"
    const completedAtIso = new Date().toISOString()
    const completedProgressNote = `COMPLETED_AT:${completedAtIso}`

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID yêu cầu không hợp lệ" })
    }

    const [existingRows] = await pool.query(
      `SELECT r.id, r.device_id,
              r.issue_description,
              COALESCE(d.device_name, r.device_name) AS device_name,
              COALESCE(d.device_code, '') AS device_code
       FROM repair_requests r
       LEFT JOIN devices d ON r.device_id = d.id
       WHERE r.id = ?
       LIMIT 1`,
      [id]
    )

    if (!existingRows.length) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu sửa chữa" })
    }

    const queryVariants = [
      {
        query: `UPDATE repair_requests
                SET status = 'completed',
                    completed_date = NOW(),
                    progress_note = ?,
                    resolution_result = ?,
                    updated_at = NOW()
                WHERE id = ?`,
        params: [completedProgressNote, resolutionResult, id],
      },
      {
        query: `UPDATE repair_requests
                SET status = 'completed',
                    completed_date = NOW(),
                    progress_note = ?,
                    resolution_result = ?
                WHERE id = ?`,
        params: [completedProgressNote, resolutionResult, id],
      },
      {
        query: `UPDATE repair_requests
                SET status = 'completed',
                    progress_note = ?,
                    completed_date = NOW()
                WHERE id = ?`,
        params: [completedProgressNote, id],
      },
      {
        query: `UPDATE repair_requests
                SET status = 'completed'
                WHERE id = ?`,
        params: [id],
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
      return res.status(404).json({ message: "Không tìm thấy yêu cầu sửa chữa" })
    }

    await updateDeviceStatusByRepairId(existingRows[0].device_id, "active")

    const deviceName = existingRows[0].device_name || "Thiết bị"
    const deviceCode = String(existingRows[0].device_code || "").trim() || "-"
    const issueReason = String(existingRows[0].issue_description || "").trim() || "Không có mô tả"

    // Log activity for completion
    await logActivity({
      userId: actorUserId,
      action: "repair.complete",
      description: `Xác nhận hoàn thành sửa chữa Thiết bị: ${deviceName} - Mã Serial ${deviceCode} [${issueReason}]`,
      entityType: "repair",
      entityId: id,
    })

    return res.json({ ok: true, status: "completed", completedTime: completedAtIso })
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      return res.status(400).json({ message: "Bảng repair_requests chưa được tạo" })
    }

    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

module.exports = router
