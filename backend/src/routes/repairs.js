const express = require("express")
const { pool } = require("../db")
const { logActivity } = require("../activity")

const router = express.Router()
const { emitter, emitRepairEvent } = require("../sse")

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

function buildRepairRequestCode() {
  return `RP${Date.now().toString().slice(-6)}`
}

function resolveActorUserId(req) {
  const candidate = Number(req?.body?.actorUserId || req?.query?.actorUserId || 0)
  return Number.isInteger(candidate) && candidate > 0 ? candidate : null
}

function isAdminRoleName(value) {
  const role = String(value || "").trim().toLowerCase()
  return role.includes("admin") || role.includes("quản trị") || role.includes("quan tri") || role.includes("administrator")
}

async function loadUserDisplayName(userId) {
  const normalizedUserId = Number(userId || 0)
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    return null
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, full_name, username FROM users WHERE id = ? LIMIT 1`,
      [normalizedUserId]
    )
    if (!rows.length) {
      return null
    }

    const row = rows[0]
    return {
      id: normalizedUserId,
      name: String(row.full_name || row.username || "").trim() || "-",
    }
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      return null
    }

    throw error
  }
}

async function findUserByName(name) {
  const text = String(name || "").trim()
  if (!text) return null

  const candidates = [
    `SELECT id, full_name, username, role_id FROM users WHERE TRIM(LOWER(full_name)) = TRIM(LOWER(?)) LIMIT 1`,
    `SELECT id, full_name, username, role_id FROM users WHERE TRIM(LOWER(username)) = TRIM(LOWER(?)) LIMIT 1`,
    `SELECT id, full_name, username, role_id FROM users WHERE LOWER(full_name) LIKE CONCAT('%', LOWER(?), '%') LIMIT 1`,
  ]

  for (const q of candidates) {
    try {
      const [rows] = await pool.query(q, [text])
      if (Array.isArray(rows) && rows.length) {
        const r = rows[0]
        // try to read role name if possible
        let roleName = null
        try {
          const [rr] = await pool.query(`SELECT role_name FROM role WHERE id = ? LIMIT 1`, [r.role_id || 0])
          if (Array.isArray(rr) && rr.length) roleName = String(rr[0].role_name || "").trim()
        } catch (e) {}

        return {
          id: Number(r.id || 0),
          full_name: String(r.full_name || r.username || "").trim(),
          username: String(r.username || "").trim(),
          role_name: roleName,
        }
      }
    } catch (e) {
      if (e.code === "ER_NO_SUCH_TABLE" || e.code === "ER_BAD_FIELD_ERROR") continue
      throw e
    }
  }

  return null
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
    const role = String(req.query.role || "").trim()
    const isEmployee = isNhanVienRole(role)

    // Prefer explicit header `x-user-id` when available (client may send it).
    // Fallback to query `userId` if header is not present.
    const queryUserId = Number(req.query.userId || 0)
    const headerUserId = Number(req.headers["x-user-id"] || req.headers["x_user_id"] || 0)
    const resolvedUserId = Number.isInteger(headerUserId) && headerUserId > 0 ? headerUserId : (Number.isInteger(queryUserId) && queryUserId > 0 ? queryUserId : 0)
    const normalizedRequesterUserId = Number.isInteger(resolvedUserId) && resolvedUserId > 0 ? resolvedUserId : null
    console.log(`[DEBUG] GET /api/repairs requesterUserId query=${queryUserId} header=${headerUserId} resolved=${normalizedRequesterUserId}`)

    const queryVariants = [
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
        r.assignee_user_id,
        u.username AS assignee_username,
        u.full_name AS assignee_full_name,
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
        r.updated_at,
        r.created_by_user_id,
        c.full_name AS created_by_full_name,
        rc.role_name AS created_by_role_name
      FROM repair_requests r
      LEFT JOIN devices d ON r.device_id = d.id
      LEFT JOIN users u ON r.assignee_user_id = u.id
      LEFT JOIN users c ON r.created_by_user_id = c.id
      LEFT JOIN role rc ON c.role_id = rc.id
      ORDER BY r.id ASC`,
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
         NULL AS assignee_user_id,
         '-' AS assignee_name,
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
       ORDER BY r.id ASC`,
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

    console.log(`[DEBUG] GET /api/repairs returned ${rows.length} rows`)
    if (rows.length > 0) {
      console.log(`[DEBUG] Latest repair IDs: ${rows.slice(-3).map(r => r.id).join(', ')}`)
    }

    // If we have a requester user id, resolve their display name to allow
    // employees to see items they reported (not only those assigned to them).
    let requesterDisplay = null
    if (normalizedRequesterUserId) {
      try {
        requesterDisplay = await loadUserDisplayName(normalizedRequesterUserId)
      } catch (e) {
        requesterDisplay = null
      }
    }

    const mappedRows = rows.map((row) => ({
        id: row.id,
        code: row.request_code || `RP${String(row.id).padStart(3, "0")}`,
        deviceId: row.device_id,
        device: row.device_name,
        issue: row.issue_description || "-",
        reporter: row.reporter_name || "-",
        department: row.department_name || "-",
        priority: normalizePriority(row.priority),
        status: normalizeStatus(row.status),
        assigneeUserId: row.assignee_user_id ? Number(row.assignee_user_id) : null,
        assignee: row.assignee_user_id
          ? {
              id: Number(row.assignee_user_id),
              username: String(row.assignee_username || "").trim() || null,
              full_name: String(row.assignee_full_name || "").trim() || null,
            }
          : null,
        technician: row.assignee_full_name || row.assignee_username || "-",
        createdByUserId: row.created_by_user_id ? Number(row.created_by_user_id) : null,
        createdByIsAdmin: isAdminRoleName(row.created_by_role_name || ""),
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

    // Enrich mapped rows by resolving reporter_name -> user when created_by_user_id absent
    const enriched = await Promise.all(
      mappedRows.map(async (item) => {
        if (!item.createdByUserId && !item.createdByIsAdmin && item.reporter) {
          try {
            const found = await findUserByName(item.reporter)
            if (found) {
              item.createdByIsAdmin = isAdminRoleName(found.role_name || "")
              item.createdByUserId = Number(found.id || 0) || null
            }
          } catch (e) {
            // ignore enrichment errors
          }
        }
        return item
      })
    )

    const items = enriched.filter((item) => {
        // Only employees are scoped to their own assigned repairs or repairs they reported.
        // Admins should see all repairs even if a `userId` header/query is present.
        if (isEmployee) {
          if (normalizedRequesterUserId) {
            const isAssigned = Number.isInteger(item.assigneeUserId) && item.assigneeUserId === normalizedRequesterUserId
            const isReporter = requesterDisplay && typeof requesterDisplay.name === 'string' && item.reporter && item.reporter.trim() === requesterDisplay.name.trim()
            if (!isAssigned && !isReporter) {
              return false
            }
          } else {
            // Role indicates an employee but we couldn't resolve a user id — deny access to employee-specific list.
            return false
          }
        }

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
      assigneeUserId: rawAssigneeUserId,
    } = req.body || {}

    const normalizedDeviceId = Number(deviceId)
    const normalizedIssue = String(issueDescription || "").trim()
    const normalizedReporter = String(reporterName || "").trim()
    const normalizedDepartment = String(departmentName || "").trim()
    const normalizedPriority = normalizePriority(priority)
    const assigneeUserId = Number(rawAssigneeUserId || 0)

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
       (request_code, device_id, issue_description, reporter_name, department_name, priority, status, created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NOW(), NOW())`,
      `INSERT INTO repair_requests
       (request_code, device_id, issue_description, reporter_name, department_name, priority, status, created_by_user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NOW())`,
      `INSERT INTO repair_requests
       (request_code, device_id, issue_description, reporter_name, priority, status, created_by_user_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, NOW())`,
      `INSERT INTO repair_requests
       (request_code, device_id, issue_description, reporter_name, department_name, priority, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW(), NOW())`,
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
        actorUserId || null,
      ],
      [
        requestCode,
        normalizedDeviceId,
        normalizedIssue,
        normalizedReporter,
        normalizedDepartment,
        normalizedPriority,
        actorUserId || null,
      ],
      [
        requestCode,
        normalizedDeviceId,
        normalizedIssue,
        normalizedReporter,
        normalizedPriority,
        actorUserId || null,
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

    // If an assignee is provided at creation time, set it and mark assigned
    const normalizedAssigneeUserId = Number.isInteger(assigneeUserId) && assigneeUserId > 0 ? assigneeUserId : null
    if (normalizedAssigneeUserId) {
      // verify user exists
      try {
        const assignee = await loadUserDisplayName(normalizedAssigneeUserId)
        if (!assignee) {
          // ignore assignment if user not found
          console.log(`[DEBUG] POST /api/repairs new insert ${insertId} - assignee ${normalizedAssigneeUserId} not found`)
        } else {
          try {
            await pool.query(
              `UPDATE repair_requests SET assignee_user_id = ?, status = 'assigned', updated_at = NOW() WHERE id = ?`,
              [normalizedAssigneeUserId, insertId]
            )

            await logActivity({
              userId: actorUserId,
              action: "repair.assign",
              description: `Phân công sửa chữa (khi tạo) yêu cầu ${insertId} cho ${assignee.name}`,
              entityType: "repair",
              entityId: insertId,
            })
          } catch (err) {
            console.log(`[DEBUG] Failed to update assignee for repair ${insertId}:`, String(err && err.message))
          }
        }
      } catch (err) {
        console.log(`[DEBUG] Error loading assignee user ${normalizedAssigneeUserId}:`, String(err && err.message))
      }
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
    const assigneeUserId = Number(req.body?.assigneeUserId || 0)
    console.log(`[DEBUG] PUT /api/repairs/${id}/assign called - actorUserId=${actorUserId}, assigneeUserId=${assigneeUserId}, body=${JSON.stringify(req.body)}`)
    const requestedStatus = normalizeStatus(req.body?.status)
    const shouldMoveToInProgress = requestedStatus === "in_progress"
    const isApprovalOnly = requestedStatus === "assigned" && !assigneeUserId

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID yêu cầu không hợp lệ" })
    }

    if (!assigneeUserId && !isApprovalOnly) {
      return res.status(400).json({ message: "Vui lòng chọn nhân viên" })
    }

    const assigneeUser = assigneeUserId ? await loadUserDisplayName(assigneeUserId) : null
    if (assigneeUserId && !assigneeUser) {
      return res.status(404).json({ message: "Không tìm thấy nhân viên" })
    }

    const existingQueryVariants = [
      {
        query: `SELECT r.id, r.device_id, r.assignee_user_id, r.status, r.reporter_name,
                       COALESCE(d.device_name, r.device_name) AS device_name,
                       COALESCE(d.device_code, '') AS device_code
                FROM repair_requests r
                LEFT JOIN devices d ON r.device_id = d.id
                WHERE r.id = ?
                LIMIT 1`,
        params: [id],
      },
      {
        query: `SELECT r.id, r.device_id, NULL AS assignee_user_id, r.status, r.reporter_name,
                       COALESCE(d.device_name, r.device_name) AS device_name,
                       COALESCE(d.device_code, '') AS device_code
                FROM repair_requests r
                LEFT JOIN devices d ON r.device_id = d.id
                WHERE r.id = ?
                LIMIT 1`,
        params: [id],
      },
    ]


    let existingRows = []
    let lastExistingError = null

    for (const variant of existingQueryVariants) {
      try {
        const [rows] = await pool.query(variant.query, variant.params)
        existingRows = rows
        lastExistingError = null
        break
      } catch (error) {
        if (error.code === "ER_BAD_FIELD_ERROR") {
          lastExistingError = error
          continue
        }

        throw error
      }
    }

    if (lastExistingError) {
      throw lastExistingError
    }

    if (!existingRows.length) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu sửa chữa" })
    }

    const queryVariants = isApprovalOnly
      ? [
          {
            query: `UPDATE repair_requests
                    SET status = 'assigned', updated_at = NOW()
                    WHERE id = ?`,
            params: [id],
          },
          {
            query: `UPDATE repair_requests
                    SET status = 'assigned'
                    WHERE id = ?`,
            params: [id],
          },
        ]
      : shouldMoveToInProgress
      ? [
          {
            query: `UPDATE repair_requests
                    SET assignee_user_id = ?, status = 'in_progress', start_date = COALESCE(start_date, NOW()), updated_at = NOW()
                    WHERE id = ?`,
            params: [assigneeUserId, id],
          },
          {
            query: `UPDATE repair_requests
                    SET assignee_user_id = ?, status = 'in_progress', updated_at = NOW()
                    WHERE id = ?`,
            params: [assigneeUserId, id],
          },
          {
            query: `UPDATE repair_requests
                    SET assignee_user_id = ?, status = 'in_progress'
                    WHERE id = ?`,
            params: [assigneeUserId, id],
          },
          {
            query: `UPDATE repair_requests
                    SET status = 'in_progress'
                    WHERE id = ?`,
            params: [id],
          },
        ]
      : [
          {
            query: `UPDATE repair_requests
                    SET assignee_user_id = ?, status = 'assigned', updated_at = NOW()
                    WHERE id = ?`,
            params: [assigneeUserId, id],
          },
          {
            query: `UPDATE repair_requests
                    SET assignee_user_id = ?, status = 'assigned'
                    WHERE id = ?`,
            params: [assigneeUserId, id],
          },
          {
            query: `UPDATE repair_requests
                    SET assignee_user_id = ?
                    WHERE id = ?`,
            params: [assigneeUserId, id],
          },
          {
            query: `UPDATE repair_requests
                    SET status = 'assigned'
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

    // Ensure technician_name column mirrors the assigned user's display name
    try {
      if (assigneeUserId) {
        const techName = assigneeUser?.name || null
        if (techName) {
          try {
            await pool.query(`UPDATE repair_requests SET technician_name = ?, updated_at = NOW() WHERE id = ?`, [techName, id])
          } catch (e) {
            // ignore write failures to avoid breaking the main flow
          }
        }
      }
    } catch (e) {
      // ignore
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
      // If the request was reported by a known user, assign it to them automatically
      let autoAssignedUserId = null
      try {
        const reporterName = existingRows[0].reporter_name || ""
        if (reporterName) {
          const reporterUser = await findUserByName(reporterName)
          if (reporterUser && reporterUser.id) {
            try {
              await pool.query(
                `UPDATE repair_requests SET assignee_user_id = ?, updated_at = NOW() WHERE id = ?`,
                [reporterUser.id, id]
              )
              autoAssignedUserId = reporterUser.id
              await logActivity({
                userId: actorUserId,
                action: "repair.assign",
                description: `Tự phân công yêu cầu ${id} cho người báo: ${reporterUser.full_name}`,
                entityType: "repair",
                entityId: id,
              })
            } catch (e) {
              // ignore update failure
            }
          }
        }
      } catch (e) {
        // ignore lookup errors
      }

      // If we auto-assigned, also set technician_name for clarity in UI
      if (autoAssignedUserId) {
        try {
          const assigneeInfo = await loadUserDisplayName(autoAssignedUserId)
          if (assigneeInfo && assigneeInfo.name) {
            try {
              await pool.query(`UPDATE repair_requests SET technician_name = ?, updated_at = NOW() WHERE id = ?`, [assigneeInfo.name, id])
            } catch (e) {}
          }
        } catch (e) {
          // ignore
        }
      }

      // notify interested clients that a repair was approved/assigned
      try {
        emitRepairEvent({ id, status: "assigned", assigneeUserId: autoAssignedUserId || null })
      } catch (e) {}
    } else if (shouldMoveToInProgress) {
      await updateDeviceStatusByRepairId(existingRows[0].device_id, "repairing")
      const deviceName = existingRows[0].device_name || "Thiết bị"
      const deviceCode = existingRows[0].device_code
      const serialLabel = deviceCode ? ` [${deviceCode}]` : ""
      const assigneeName = assigneeUser?.name || "-"
      
      // Log activity for starting repair
      await logActivity({
        action: "repair.start",
        description: `Bắt đầu sửa chữa thiết bị ${deviceName}${serialLabel} - Nhân viên: ${assigneeName}`,
        entityType: "repair",
        entityId: id,
        userId: actorUserId,
      })
      try {
        emitRepairEvent({ id, status: "in_progress", assigneeUserId: assigneeUserId || null })
      } catch (e) {}
    } else {
      await updateDeviceStatusByRepairId(existingRows[0].device_id, "repairing")
      const deviceName = existingRows[0].device_name || "Thiết bị"
      const deviceCode = existingRows[0].device_code
      const serialLabel = deviceCode ? ` [${deviceCode}]` : ""
      const assigneeName = assigneeUser?.name || "-"
      
      // Log activity for assigning employee
      await logActivity({
        action: "repair.assign",
        description: `Phân công sửa chữa thiết bị ${deviceName}${serialLabel} cho ${assigneeName}`,
        entityType: "repair",
        entityId: id,
        userId: actorUserId,
      })
      try {
        emitRepairEvent({ id, status: "assigned", assigneeUserId: assigneeUserId || null })
      } catch (e) {}
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

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID yêu cầu không hợp lệ" })
    }

    if (!actorUserId) {
      return res.status(400).json({ message: "Thiếu thông tin người dùng" })
    }

    const existingQueryVariants = [
      {
        query: `SELECT r.id,
                       r.assignee_user_id,
                       r.status,
                       r.issue_description,
                       COALESCE(d.device_name, r.device_name, 'Thiết bị') AS device_name,
                       COALESCE(d.device_code, '') AS device_code
                FROM repair_requests r
                LEFT JOIN devices d ON r.device_id = d.id
                WHERE r.id = ?
                LIMIT 1`,
        params: [id],
      },
      {
        query: `SELECT r.id,
                       NULL AS assignee_user_id,
                       r.status,
                       r.issue_description,
                       COALESCE(d.device_name, r.device_name, 'Thiết bị') AS device_name,
                       COALESCE(d.device_code, '') AS device_code
                FROM repair_requests r
                LEFT JOIN devices d ON r.device_id = d.id
                WHERE r.id = ?
                LIMIT 1`,
        params: [id],
      },
    ]

    let existingRows = []
    let lastExistingError = null

    for (const variant of existingQueryVariants) {
      try {
        const [rows] = await pool.query(variant.query, variant.params)
        existingRows = rows
        lastExistingError = null
        break
      } catch (error) {
        if (error.code === "ER_BAD_FIELD_ERROR") {
          lastExistingError = error
          continue
        }

        throw error
      }
    }

    if (lastExistingError) {
      throw lastExistingError
    }

    if (!existingRows.length) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu sửa chữa" })
    }

    const existing = existingRows[0]
    const currentStatus = normalizeStatus(existing.status)
    const currentAssigneeUserId = Number(existing.assignee_user_id || 0)
    if (Number.isInteger(currentAssigneeUserId) && currentAssigneeUserId > 0 && currentAssigneeUserId !== actorUserId) {
      return res.status(403).json({ message: "Yêu cầu này được phân công cho nhân viên khác" })
    }

    if (!["assigned", "pending"].includes(currentStatus)) {
      return res.status(400).json({ message: "Yêu cầu không ở trạng thái có thể xác nhận" })
    }

    const queryVariants = [
      {
        query: `UPDATE repair_requests
                SET assignee_user_id = ?,
                    status = 'in_progress',
                    start_date = COALESCE(start_date, NOW()),
                    updated_at = NOW()
                WHERE id = ?`,
        params: [actorUserId, id],
      },
      {
        query: `UPDATE repair_requests
                SET assignee_user_id = ?,
                    status = 'in_progress',
                    updated_at = NOW()
                WHERE id = ?`,
        params: [actorUserId, id],
      },
      {
        query: `UPDATE repair_requests
                SET assignee_user_id = ?,
                    status = 'in_progress'
                WHERE id = ?`,
        params: [actorUserId, id],
      },
      {
        query: `UPDATE repair_requests
                SET status = 'in_progress'
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

    if (!actorUserId) {
      return res.status(400).json({ message: "Thiếu thông tin người dùng" })
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

    const existingQueryVariants = [
      {
        query: `SELECT id, assignee_user_id, status
                FROM repair_requests
                WHERE id = ?
                LIMIT 1`,
        params: [id],
      },
      {
        query: `SELECT id, NULL AS assignee_user_id, status
                FROM repair_requests
                WHERE id = ?
                LIMIT 1`,
        params: [id],
      },
    ]

    let existingRows = []
    let lastExistingError = null

    for (const variant of existingQueryVariants) {
      try {
        const [rows] = await pool.query(variant.query, variant.params)
        existingRows = rows
        lastExistingError = null
        break
      } catch (error) {
        if (error.code === "ER_BAD_FIELD_ERROR") {
          lastExistingError = error
          continue
        }

        throw error
      }
    }

    if (lastExistingError) {
      throw lastExistingError
    }

    if (!existingRows.length) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu sửa chữa" })
    }

    const existing = existingRows[0]
    const currentStatus = normalizeStatus(existing.status)
    const currentAssigneeUserId = Number(existing.assignee_user_id || 0)
    if (Number.isInteger(currentAssigneeUserId) && currentAssigneeUserId > 0 && currentAssigneeUserId !== actorUserId) {
      return res.status(403).json({ message: "Yêu cầu này được phân công cho nhân viên khác" })
    }

    if (!["assigned", "pending"].includes(currentStatus)) {
      return res.status(400).json({ message: "Yêu cầu không ở trạng thái có thể nhận việc" })
    }

    const queryVariants = hasMissingParts
      ? [
          {
            query: `UPDATE repair_requests
            SET assignee_user_id = ?,
                        status = 'waiting_parts',
                        start_date = COALESCE(start_date, NOW()),
                        estimated_end_date = ?,
                        part_name = ?,
                        cost = ?,
                        ordered_date = COALESCE(ordered_date, NOW()),
                        expected_arrival = ?,
                        updated_at = NOW()
                    WHERE id = ?`,
          params: [actorUserId, estimatedEndDate, missingPartName, estimatedCost, estimatedEndDate, id],
          },
          {
            query: `UPDATE repair_requests
            SET assignee_user_id = ?,
                        status = 'waiting_parts',
                        estimated_end_date = ?,
                        part_name = ?,
                        cost = ?,
                        expected_arrival = ?,
                        updated_at = NOW()
                    WHERE id = ?`,
          params: [actorUserId, estimatedEndDate, missingPartName, estimatedCost, estimatedEndDate, id],
          },
          {
            query: `UPDATE repair_requests
            SET assignee_user_id = ?,
                        status = 'waiting_parts',
                        part_name = ?,
                        cost = ?
                    WHERE id = ?`,
          params: [actorUserId, missingPartName, estimatedCost, id],
        },
        {
          query: `UPDATE repair_requests
            SET status = 'waiting_parts',
          part_name = ?,
          cost = ?
            WHERE id = ?`,
          params: [missingPartName, estimatedCost, id],
          },
        ]
      : [
          {
            query: `UPDATE repair_requests
            SET assignee_user_id = ?,
                        status = 'in_progress',
                        start_date = COALESCE(start_date, NOW()),
                        estimated_end_date = ?,
                        updated_at = NOW()
                    WHERE id = ?`,
          params: [actorUserId, estimatedEndDate, id],
          },
          {
            query: `UPDATE repair_requests
            SET assignee_user_id = ?,
                        status = 'in_progress',
                        estimated_end_date = ?,
                        updated_at = NOW()
                    WHERE id = ?`,
          params: [actorUserId, estimatedEndDate, id],
          },
          {
            query: `UPDATE repair_requests
            SET assignee_user_id = ?,
                        status = 'in_progress'
                    WHERE id = ?`,
          params: [actorUserId, id],
        },
        {
          query: `UPDATE repair_requests
            SET status = 'in_progress'
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

    const assigneeUser = await loadUserDisplayName(actorUserId)
    const assigneeName = assigneeUser?.name || "-"

    await logActivity({
      userId: actorUserId,
      action: "repair.accept",
      description: `Nhân viên ${assigneeName} nhận sửa chữa yêu cầu RP${id}`,
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

// Server-Sent Events stream for repairs updates
router.get("/stream", (req, res) => {
  // Use simple query params to scope events: ?userId=123&role=admin
  const userId = Number(req.query.userId || 0)
  const role = String(req.query.role || "").trim()

  res.writeHead(200, {
    Connection: "keep-alive",
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
  })

  const onRepair = (payload) => {
    try {
      // If role is admin, send everything; otherwise only send events for the user's assignee id
      if (role && role.toLowerCase().includes("admin")) {
        res.write(`event: repair\ndata: ${JSON.stringify(payload)}\n\n`)
        return
      }

      if (userId && payload && Number(payload.assigneeUserId || 0) === Number(userId)) {
        res.write(`event: repair\ndata: ${JSON.stringify(payload)}\n\n`)
      }
    } catch (e) {
      // ignore
    }
  }

  emitter.on("repair", onRepair)

  // cleanup on client disconnect
  req.on("close", () => {
    emitter.off("repair", onRepair)
  })
})

module.exports = router
