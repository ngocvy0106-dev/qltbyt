const express = require("express")
const { pool } = require("../db")

const router = express.Router()

function formatDate(value) {
  if (!value) {
    return "-"
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)
}

function formatMonthLabel(year, month) {
  return `${String(month).padStart(2, "0")}/${year}`
}

function toSafeNumber(value) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function parseDateRange(fromDateRaw, toDateRaw) {
  const fromText = String(fromDateRaw || "").trim()
  const toText = String(toDateRaw || "").trim()

  if (!fromText || !toText) {
    return null
  }

  const fromDate = new Date(`${fromText}T00:00:00`)
  const toDate = new Date(`${toText}T23:59:59.999`)

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return null
  }

  return { fromDate, toDate }
}

function isWithinDateRange(value, dateRange) {
  if (!dateRange) {
    return true
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return false
  }

  return date >= dateRange.fromDate && date <= dateRange.toDate
}

function filterByDateRange(items, fieldName, dateRange) {
  if (!dateRange) {
    return items
  }

  return (items || []).filter((item) => isWithinDateRange(item?.[fieldName], dateRange))
}

function normalizeMaintenanceStatus(value) {
  const text = String(value || "").trim().toLowerCase()

  if (["completed", "hoan thanh"].includes(text)) {
    return "completed"
  }

  if (["in_progress", "inprogress", "dang thuc hien"].includes(text)) {
    return "in_progress"
  }

  return "pending"
}

function normalizeRepairStatus(value) {
  const text = String(value || "").trim().toLowerCase()

  if (["completed", "hoan thanh"].includes(text)) {
    return "completed"
  }

  return "pending"
}

function normalizeDeviceStatus(value) {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")

  if (["active", "in_use", "dang su dung", "hoat dong"].includes(text)) {
    return "in_use"
  }

  if (["available", "in_stock", "ton kho", "san sang"].includes(text)) {
    return "in_stock"
  }

  if (["maintenance", "repairing", "broken", "inactive", "liquidated"].includes(text)) {
    return "other"
  }

  return "other"
}

function normalizeLogStatus(value) {
  const text = String(value || "").trim().toLowerCase()

  if (["completed", "hoan thanh", "approved", "da duyet"].includes(text)) {
    return "completed"
  }

  if (["assigned", "in_progress", "dang sua", "waiting_parts", "cho phu tung"].includes(text)) {
    return "in_progress"
  }

  if (["pending", "cho duyet", "review"].includes(text)) {
    return "review"
  }

  return "draft"
}

const TRANSFER_LOCATION_MARKER = "__TO_LOCATION__::"

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

function normalizePlainText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
}

function buildReportScope(query = {}) {
  const role = normalizePlainText(String(query.role || ""))
  const departmentRaw = String(query.departmentName || query.department || "")
  const departmentNames = departmentRaw
    .split(/[;,]/)
    .map((item) => normalizePlainText(item))
    .filter(Boolean)

  return {
    role,
    isEmployee: role.includes("nhan vien") || role.includes("nhan-vien"),
    isTechnician:
      role.includes("ky thuat vien") ||
      role.includes("ky-thuat-vien") ||
      role.includes("nhan vien") ||
      role.includes("nhan-vien"),
    departmentNames,
    requester: normalizePlainText(String(query.requester || "")),
    requesterAlt: normalizePlainText(String(query.requesterAlt || "")),
    userId: Number(query.userId || 0),
  }
}

function isRequesterMatched(rawName, scope) {
  const normalizedName = normalizePlainText(rawName)
  return (
    (scope.requester && normalizedName === scope.requester) ||
    (scope.requesterAlt && normalizedName === scope.requesterAlt)
  )
}

function isDepartmentMatched(rawDepartmentName, scope) {
  if (!scope.departmentNames.length) {
    return false
  }

  const normalizedDepartment = normalizePlainText(rawDepartmentName)
  return scope.departmentNames.includes(normalizedDepartment)
}

function filterRowsByEmployeeScope(rows, scope, options = {}) {
  if (!scope?.isEmployee) {
    return rows
  }

  const departmentField = options.departmentField || "department_name"
  const requesterField = options.requesterField
  const technicianField = options.technicianField

  return (rows || []).filter((row) => {
    const matchedDepartment = isDepartmentMatched(row?.[departmentField], scope)
    if (matchedDepartment) {
      return true
    }

    if (technicianField) {
      const techValue = row?.[technicianField]
      if (techValue) {
        if (typeof techValue === "object") {
          if (isRequesterMatched(techValue.full_name, scope) || isRequesterMatched(techValue.username, scope)) {
            return true
          }
        } else if (isRequesterMatched(techValue, scope)) {
          return true
        }
      }
    }

    if (requesterField) {
      return isRequesterMatched(row?.[requesterField], scope)
    }

    return false
  })
}

async function loadEmployeeVisibleDeviceIds(scope = {}) {
  const visibleIds = new Set()

  if (!scope?.isEmployee) {
    return visibleIds
  }

  if (Number.isInteger(scope.userId) && scope.userId > 0) {
    try {
      const [allocationRows] = await pool.query(
        `SELECT device_id
         FROM device_allocations
         WHERE receiver_user_id = ?
           AND status IN ('approved', 'da duyet', 'pending', 'dang_cho_duyet')
         ORDER BY id DESC
         LIMIT 800`,
        [scope.userId]
      )

      allocationRows.forEach((row) => {
        const deviceId = Number(row.device_id || 0)
        if (Number.isInteger(deviceId) && deviceId > 0) {
          visibleIds.add(deviceId)
        }
      })
    } catch (allocationError) {
      if (allocationError.code !== "ER_NO_SUCH_TABLE" && allocationError.code !== "ER_BAD_FIELD_ERROR") {
        throw allocationError
      }
    }
  }

  try {
    const transferRows = await safeQueryVariants([
      `SELECT device_id, to_department, requester_name, transfer_reason, status
       FROM device_transfers
       WHERE status IN ('approved', 'da duyet')
       ORDER BY id DESC
       LIMIT 1000`,
    ])

    transferRows.forEach((row) => {
      const deviceId = Number(row.device_id || 0)
      if (!Number.isInteger(deviceId) || deviceId <= 0) {
        return
      }

      const matchedDepartment = isDepartmentMatched(row.to_department, scope)
      const matchedRequester = isRequesterMatched(row.requester_name, scope)

      if (matchedDepartment || matchedRequester) {
        visibleIds.add(deviceId)
      }
    })
  } catch (transferError) {
    if (transferError.code !== "ER_NO_SUCH_TABLE" && transferError.code !== "ER_BAD_FIELD_ERROR") {
      throw transferError
    }
  }

  return visibleIds
}

async function safeQueryVariants(queries) {
  let lastError = null

  for (const query of queries) {
    try {
      const [rows] = await pool.query(query)
      return rows
    } catch (error) {
      if (error.code === "ER_NO_SUCH_TABLE" || error.code === "ER_BAD_FIELD_ERROR") {
        lastError = error
        continue
      }

      throw error
    }
  }

  if (lastError) {
    return []
  }

  return []
}

async function loadMetricData(scope = {}) {
  const isSameMonth = (value, month, year) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return false
    }

    return date.getMonth() === month && date.getFullYear() === year
  }

  const maintenanceRows = await safeQueryVariants([
    `SELECT m.id, m.device_id, m.status, m.cost, m.updated_at, COALESCE(dep.name, 'Chưa phân khoa') AS department_name
     FROM maintenance_tasks m
     LEFT JOIN devices d ON m.device_id = d.id
     LEFT JOIN departments dep ON d.department_id = dep.id`,
    `SELECT id, device_id, status, cost, updated_at, 'Chưa phân khoa' AS department_name FROM maintenance_tasks`,
    `SELECT id, device_id, status, updated_at FROM maintenance_tasks`,
  ])

  const repairRows = await safeQueryVariants([
    `SELECT r.id, r.status, r.cost, r.created_at, r.device_id,
            COALESCE(dep.name, r.department_name, 'Chưa phân khoa') AS department_name,
            r.reporter_name
     FROM repair_requests r
     LEFT JOIN devices d ON r.device_id = d.id
     LEFT JOIN departments dep ON d.department_id = dep.id`,
    `SELECT id, status, cost, created_at, device_id, department_name, reporter_name FROM repair_requests`,
    `SELECT id, status, created_at, device_id, department_name, reporter_name FROM repair_requests`,
    `SELECT id, status, cost, created_at, device_id FROM repair_requests`,
    `SELECT id, status, created_at, device_id FROM repair_requests`,
  ])

  const deviceRows = await safeQueryVariants([
    `SELECT d.id AS device_id, d.created_by, d.created_at, COALESCE(dep.name, 'Chưa phân khoa') AS department_name
     FROM devices d
     LEFT JOIN departments dep ON d.department_id = dep.id`,
    `SELECT d.id AS device_id, d.created_at, COALESCE(dep.name, 'Chưa phân khoa') AS department_name
     FROM devices d
     LEFT JOIN departments dep ON d.department_id = dep.id`,
    `SELECT d.id AS device_id, d.created_by, purchase_date AS created_at, COALESCE(dep.name, 'Chưa phân khoa') AS department_name
     FROM devices d
     LEFT JOIN departments dep ON d.department_id = dep.id`,
    `SELECT d.id AS device_id, purchase_date AS created_at, COALESCE(dep.name, 'Chưa phân khoa') AS department_name
     FROM devices d
     LEFT JOIN departments dep ON d.department_id = dep.id`,
    `SELECT id AS device_id, created_by, created_at FROM devices`,
    `SELECT id AS device_id, created_at FROM devices`,
    `SELECT id AS device_id, created_by, purchase_date AS created_at FROM devices`,
    `SELECT id AS device_id, purchase_date AS created_at FROM devices`,
  ])

  const visibleDeviceIds = await loadEmployeeVisibleDeviceIds(scope)

  const scopedMaintenanceRows = scope?.isEmployee
    ? (maintenanceRows || []).filter((row) => {
        const matchedDepartment = isDepartmentMatched(row?.department_name, scope)
        const deviceId = Number(row?.device_id || 0)
        const matchedVisibleDevice = Number.isInteger(deviceId) && visibleDeviceIds.has(deviceId)
        return matchedDepartment || matchedVisibleDevice
      })
    : maintenanceRows

  const scopedRepairRows = scope?.isEmployee
    ? (repairRows || []).filter((row) => {
        const matchedDepartment = isDepartmentMatched(row?.department_name, scope)
        const matchedRequester = isRequesterMatched(row?.reporter_name, scope)
        const deviceId = Number(row?.device_id || 0)
        const matchedVisibleDevice = Number.isInteger(deviceId) && visibleDeviceIds.has(deviceId)
        return matchedDepartment || matchedRequester || matchedVisibleDevice
      })
    : repairRows
  let scopedDeviceRows = filterRowsByEmployeeScope(deviceRows, scope)

  if (scope?.isEmployee && Number.isInteger(scope.userId) && scope.userId > 0) {
    const allocatedDeviceIds = new Set()
    try {
      const [allocationRows] = await pool.query(
        `SELECT device_id
         FROM device_allocations
         WHERE receiver_user_id = ?
           AND status IN ('approved', 'da duyet', 'pending', 'dang_cho_duyet')
         ORDER BY id DESC
         LIMIT 500`,
        [scope.userId]
      )

      allocationRows.forEach((row) => {
        const deviceId = Number(row.device_id || 0)
        if (Number.isInteger(deviceId) && deviceId > 0) {
          allocatedDeviceIds.add(deviceId)
        }
      })
    } catch (allocationError) {
      if (allocationError.code !== "ER_NO_SUCH_TABLE" && allocationError.code !== "ER_BAD_FIELD_ERROR") {
        throw allocationError
      }
    }

    scopedDeviceRows = (deviceRows || []).filter((row) => {
      const matchedDepartment = isDepartmentMatched(row?.department_name, scope)
      if (matchedDepartment) {
        return true
      }

      const createdByText = String(row?.created_by || "")
      if (createdByText && isRequesterMatched(createdByText, scope)) {
        return true
      }

      const deviceId = Number(row?.device_id || 0)
      return Number.isInteger(deviceId) && allocatedDeviceIds.has(deviceId)
    })
  }

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  const maintenanceTotal = scopedMaintenanceRows.length
  const maintenanceCompleted = scopedMaintenanceRows.filter(
    (item) => normalizeMaintenanceStatus(item.status) === "completed"
  ).length

  const incidentCount = scopedRepairRows.filter(
    (item) => normalizeRepairStatus(item.status) !== "completed"
  ).length

  let newDevicesInMonth = scopedDeviceRows.filter((item) =>
    isSameMonth(item.created_at, currentMonth, currentYear)
  ).length

  if (scope?.isEmployee) {
    const approvedDeviceIds = new Set()

    if (Number.isInteger(scope.userId) && scope.userId > 0) {
      try {
        const [allocationRows] = await pool.query(
          `SELECT device_id, updated_at, created_at
           FROM device_allocations
           WHERE receiver_user_id = ?
             AND status IN ('approved', 'da duyet', 'pending', 'dang_cho_duyet')
           ORDER BY id DESC
           LIMIT 500`,
          [scope.userId]
        )

        allocationRows.forEach((row) => {
          const deviceId = Number(row.device_id || 0)
          if (!Number.isInteger(deviceId) || deviceId <= 0) {
            return
          }

          const timestamp = row.updated_at || row.created_at
          if (timestamp && isSameMonth(timestamp, currentMonth, currentYear)) {
            approvedDeviceIds.add(deviceId)
          }
        })
      } catch (allocationError) {
        if (allocationError.code !== "ER_NO_SUCH_TABLE" && allocationError.code !== "ER_BAD_FIELD_ERROR") {
          throw allocationError
        }
      }
    }

    try {
      const transferRows = await safeQueryVariants([
        `SELECT device_id, to_department, requester_name, transfer_reason, status, updated_at, request_date
         FROM device_transfers
         WHERE status IN ('approved', 'da duyet')
         ORDER BY id DESC
         LIMIT 800`,
      ])

      transferRows.forEach((row) => {
        const deviceId = Number(row.device_id || 0)
        if (!Number.isInteger(deviceId) || deviceId <= 0) {
          return
        }

        const reasonText = normalizePlainText(row.transfer_reason || "")
        const isAllocation = reasonText.includes("cap phat") || reasonText.includes("yeu cau cap phat")
        if (isAllocation) {
          return
        }

        const matchedDepartment = isDepartmentMatched(row.to_department, scope)
        const matchedRequester = isRequesterMatched(row.requester_name, scope)
        if (!matchedDepartment && !matchedRequester) {
          return
        }

        const timestamp = row.updated_at || row.request_date
        if (timestamp && isSameMonth(timestamp, currentMonth, currentYear)) {
          approvedDeviceIds.add(deviceId)
        }
      })
    } catch (transferError) {
      if (transferError.code !== "ER_NO_SUCH_TABLE" && transferError.code !== "ER_BAD_FIELD_ERROR") {
        throw transferError
      }
    }

    newDevicesInMonth = approvedDeviceIds.size
  }

  const maintenanceCost = scopedMaintenanceRows.reduce((sum, item) => sum + toSafeNumber(item.cost), 0)
  const repairCost = scopedRepairRows.reduce((sum, item) => {
    if (Object.prototype.hasOwnProperty.call(item, "device_id")) {
      const deviceId = Number(item.device_id || 0)
      if (!Number.isInteger(deviceId) || deviceId <= 0) {
        return sum
      }
    }

    return sum + toSafeNumber(item.cost)
  }, 0)

  const totalCost = maintenanceCost + repairCost
  const completionRate = maintenanceTotal > 0 ? Math.round((maintenanceCompleted / maintenanceTotal) * 100) : 0

  return [
    {
      title: "Tổng chi phí",
      value: `${new Intl.NumberFormat("vi-VN").format(totalCost)} VND`,
      note: "",
      icon: "cost",
    },
    {
      title: "Bảo trì hoàn thành",
      value: `${maintenanceCompleted}`,
      icon: "completed",
    },
    {
      title: "Thiết bị mới trong tháng",
      value: String(newDevicesInMonth),
      icon: "new",
    },
    {
      title: "Yêu cầu sửa chữa chưa hoàn thành",
      value: String(incidentCount),
      icon: "incident",
    },
  ]
}

async function loadMaintenanceSummaryData(scope = {}) {
  const rows = await safeQueryVariants([
    `SELECT
       COALESCE(dep.name, 'Chưa phân khoa') AS department_name,
       m.status
     FROM maintenance_tasks m
     LEFT JOIN devices d ON m.device_id = d.id
     LEFT JOIN departments dep ON d.department_id = dep.id`,
    `SELECT
       'Toàn hệ thống' AS department_name,
       status
     FROM maintenance_tasks`,
  ])

    const scopedRows = filterRowsByEmployeeScope(rows, scope)

  const grouped = new Map()

    scopedRows.forEach((row) => {
    const key = String(row.department_name || "Toàn hệ thống").trim() || "Toàn hệ thống"
    if (!grouped.has(key)) {
      grouped.set(key, {
        department: key,
        total: 0,
        completed: 0,
        inProgress: 0,
        pending: 0,
        rate: 0,
      })
    }

    const item = grouped.get(key)
    item.total += 1

    const normalizedStatus = normalizeMaintenanceStatus(row.status)
    if (normalizedStatus === "completed") {
      item.completed += 1
    } else if (normalizedStatus === "in_progress") {
      item.inProgress += 1
    } else {
      item.pending += 1
    }
  })

  return Array.from(grouped.values()).map((item) => ({
    ...item,
    rate: item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0,
  }))
}

async function loadDeviceCategoryShare(scope = {}) {
const rows = await safeQueryVariants([
    `SELECT d.category, COALESCE(dep.name, 'Chưa phân khoa') AS department_name, COUNT(*) AS total
     FROM devices d
     LEFT JOIN departments dep ON d.department_id = dep.id
     GROUP BY d.category, COALESCE(dep.name, 'Chưa phân khoa')
     ORDER BY total DESC`,
    `SELECT category, COUNT(*) AS total FROM devices GROUP BY category ORDER BY total DESC`,
  ])

  let scopedRows = scope?.isEmployee ? rows : rows

  // For employee, also filter by device allocations
  if (scope?.isEmployee) {
    const visibleDeviceIds = await loadEmployeeVisibleDeviceIds(scope)
    
    // Get device IDs with their categories
    const deviceWithCategoriesRows = await safeQueryVariants([
      `SELECT d.id, d.category FROM devices d WHERE d.id IN (${Array.from(visibleDeviceIds).join(',')})`,
      `SELECT id, category FROM devices WHERE id IN (${Array.from(visibleDeviceIds).join(',')})`,
    ])
    
    const categoryCount = new Map()
    deviceWithCategoriesRows.forEach(row => {
      const cat = String(row.category || 'Chưa phân loại')
      categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1)
    })
    
    scopedRows = Array.from(categoryCount.entries()).map(([category, total]) => ({
      category,
      total
    }))
  }

  const mergedByCategory = new Map()
  scopedRows.forEach((row) => {
    const key = String(row.category || "Chưa phân loại")
    mergedByCategory.set(key, (mergedByCategory.get(key) || 0) + toSafeNumber(row.total))
  })

  const normalizedRows = Array.from(mergedByCategory.entries()).map(([category, total]) => ({ category, total }))

  if (!normalizedRows.length) {
    return []
  }

  const total = normalizedRows.reduce((sum, item) => sum + toSafeNumber(item.total), 0)
  if (total <= 0) {
    return []
  }

  const colors = [
    "bg-emerald-500",
    "bg-blue-500",
    "bg-amber-500",
    "bg-violet-500",
    "bg-rose-500",
    "bg-cyan-500",
    "bg-lime-500",
  ]

  return normalizedRows.map((row, index) => ({
    name: String(row.category || "Chưa phân loại"),
    value: Math.round((toSafeNumber(row.total) / total) * 100),
    color: colors[index % colors.length],
  }))
}

async function loadInventorySummaryData(dateRange = null, scope = {}) {
  // Load visible device IDs for employees
  const visibleDeviceIds = scope?.isEmployee ? await loadEmployeeVisibleDeviceIds(scope) : null
  const toSqlDateTime = (date) => date.toISOString().slice(0, 19).replace("T", " ")

  const rows = dateRange
    ? await safeQueryVariants([
          `SELECT d.id AS device_id, d.device_name, d.manufacturer, d.status, COALESCE(dep.name, 'Chưa phân khoa') AS department_name, d.` + "`value`" + ` AS device_value, d.created_at AS input_at
         FROM devices d
         LEFT JOIN departments dep ON d.department_id = dep.id
         WHERE created_at BETWEEN '${toSqlDateTime(dateRange.fromDate)}' AND '${toSqlDateTime(dateRange.toDate)}'`,
          `SELECT d.id AS device_id, d.device_name, d.model AS manufacturer, d.status, COALESCE(dep.name, 'Chưa phân khoa') AS department_name, d.` + "`value`" + ` AS device_value, d.created_at AS input_at
         FROM devices d
         LEFT JOIN departments dep ON d.department_id = dep.id
         WHERE created_at BETWEEN '${toSqlDateTime(dateRange.fromDate)}' AND '${toSqlDateTime(dateRange.toDate)}'`,
          `SELECT d.id AS device_id, d.device_name, d.status, COALESCE(dep.name, 'Chưa phân khoa') AS department_name, d.` + "`value`" + ` AS device_value, d.created_at AS input_at
         FROM devices d
         LEFT JOIN departments dep ON d.department_id = dep.id
         WHERE created_at BETWEEN '${toSqlDateTime(dateRange.fromDate)}' AND '${toSqlDateTime(dateRange.toDate)}'`,
          `SELECT d.device_name, d.manufacturer, d.status, COALESCE(dep.name, 'Chưa phân khoa') AS department_name, d.` + "`value`" + ` AS device_value, d.updated_at AS input_at
         FROM devices d
         LEFT JOIN departments dep ON d.department_id = dep.id
         WHERE purchase_date BETWEEN '${toSqlDateTime(dateRange.fromDate).slice(0, 10)}' AND '${toSqlDateTime(dateRange.toDate).slice(0, 10)}'`,
          `SELECT d.device_name, d.model AS manufacturer, d.status, COALESCE(dep.name, 'Chưa phân khoa') AS department_name, d.` + "`value`" + ` AS device_value, d.updated_at AS input_at
         FROM devices d
         LEFT JOIN departments dep ON d.department_id = dep.id
         WHERE purchase_date BETWEEN '${toSqlDateTime(dateRange.fromDate).slice(0, 10)}' AND '${toSqlDateTime(dateRange.toDate).slice(0, 10)}'`,
          `SELECT d.device_name, d.status, COALESCE(dep.name, 'Chưa phân khoa') AS department_name, d.` + "`value`" + ` AS device_value, d.updated_at AS input_at
         FROM devices d
         LEFT JOIN departments dep ON d.department_id = dep.id
         WHERE purchase_date BETWEEN '${toSqlDateTime(dateRange.fromDate).slice(0, 10)}' AND '${toSqlDateTime(dateRange.toDate).slice(0, 10)}'`,
          `SELECT d.device_name, d.manufacturer, d.status, COALESCE(dep.name, 'Chưa phân khoa') AS department_name, d.created_at AS input_at
         FROM devices d
         LEFT JOIN departments dep ON d.department_id = dep.id
         WHERE created_at BETWEEN '${toSqlDateTime(dateRange.fromDate)}' AND '${toSqlDateTime(dateRange.toDate)}'`,
          `SELECT d.device_name, d.model AS manufacturer, d.status, COALESCE(dep.name, 'Chưa phân khoa') AS department_name, d.created_at AS input_at
         FROM devices d
         LEFT JOIN departments dep ON d.department_id = dep.id
         WHERE created_at BETWEEN '${toSqlDateTime(dateRange.fromDate)}' AND '${toSqlDateTime(dateRange.toDate)}'`,
          `SELECT d.device_name, d.status, COALESCE(dep.name, 'Chưa phân khoa') AS department_name, d.created_at AS input_at
         FROM devices d
         LEFT JOIN departments dep ON d.department_id = dep.id
         WHERE created_at BETWEEN '${toSqlDateTime(dateRange.fromDate)}' AND '${toSqlDateTime(dateRange.toDate)}'`,
          `SELECT device_name, manufacturer, status, ` + "`value`" + ` AS device_value, created_at AS input_at
         FROM devices
         WHERE created_at BETWEEN '${toSqlDateTime(dateRange.fromDate)}' AND '${toSqlDateTime(dateRange.toDate)}'`,
          `SELECT device_name, model AS manufacturer, status, ` + "`value`" + ` AS device_value, created_at AS input_at
         FROM devices
         WHERE created_at BETWEEN '${toSqlDateTime(dateRange.fromDate)}' AND '${toSqlDateTime(dateRange.toDate)}'`,
          `SELECT device_name, status, ` + "`value`" + ` AS device_value, created_at AS input_at
         FROM devices
         WHERE created_at BETWEEN '${toSqlDateTime(dateRange.fromDate)}' AND '${toSqlDateTime(dateRange.toDate)}'`,
          `SELECT device_name, manufacturer, status, created_at AS input_at
         FROM devices
         WHERE created_at BETWEEN '${toSqlDateTime(dateRange.fromDate)}' AND '${toSqlDateTime(dateRange.toDate)}'`,
          `SELECT device_name, model AS manufacturer, status, created_at AS input_at
         FROM devices
         WHERE created_at BETWEEN '${toSqlDateTime(dateRange.fromDate)}' AND '${toSqlDateTime(dateRange.toDate)}'`,
          `SELECT device_name, status, created_at AS input_at
         FROM devices
         WHERE created_at BETWEEN '${toSqlDateTime(dateRange.fromDate)}' AND '${toSqlDateTime(dateRange.toDate)}'`,
      ])
        : await safeQueryVariants([
          `SELECT d.id AS device_id, d.device_name, d.manufacturer, d.status, COALESCE(dep.name, 'Chưa phân khoa') AS department_name, d.` + "`value`" + ` AS device_value, d.updated_at AS input_at
         FROM devices d
         LEFT JOIN departments dep ON d.department_id = dep.id`,
          `SELECT d.id AS device_id, d.device_name, d.model AS manufacturer, d.status, COALESCE(dep.name, 'Chưa phân khoa') AS department_name, d.` + "`value`" + ` AS device_value, d.updated_at AS input_at
         FROM devices d
         LEFT JOIN departments dep ON d.department_id = dep.id`,
          `SELECT d.id AS device_id, d.device_name, d.status, COALESCE(dep.name, 'Chưa phân khoa') AS department_name, d.` + "`value`" + ` AS device_value, d.updated_at AS input_at
         FROM devices d
         LEFT JOIN departments dep ON d.department_id = dep.id`,
          `SELECT d.device_name, d.manufacturer, d.status, COALESCE(dep.name, 'Chưa phân khoa') AS department_name, d.updated_at AS input_at
         FROM devices d
         LEFT JOIN departments dep ON d.department_id = dep.id`,
          `SELECT d.device_name, d.model AS manufacturer, d.status, COALESCE(dep.name, 'Chưa phân khoa') AS department_name, d.updated_at AS input_at
         FROM devices d
         LEFT JOIN departments dep ON d.department_id = dep.id`,
          `SELECT d.device_name, d.status, COALESCE(dep.name, 'Chưa phân khoa') AS department_name, d.updated_at AS input_at
         FROM devices d
         LEFT JOIN departments dep ON d.department_id = dep.id`,
          `SELECT device_name, manufacturer, status, ` + "`value`" + ` AS device_value, updated_at AS input_at
         FROM devices`,
          `SELECT device_name, model AS manufacturer, status, ` + "`value`" + ` AS device_value, updated_at AS input_at
         FROM devices`,
          `SELECT device_name, status, ` + "`value`" + ` AS device_value, updated_at AS input_at
         FROM devices`,
          `SELECT device_name, manufacturer, status, updated_at AS input_at
         FROM devices`,
          `SELECT device_name, model AS manufacturer, status, updated_at AS input_at
         FROM devices`,
          `SELECT device_name, status, updated_at AS input_at
           FROM devices`,
          `SELECT device_name, manufacturer, status, ` + "`value`" + ` AS device_value, purchase_date AS input_at
           FROM devices`,
          `SELECT device_name, model AS manufacturer, status, ` + "`value`" + ` AS device_value, purchase_date AS input_at
           FROM devices`,
          `SELECT device_name, status, ` + "`value`" + ` AS device_value, purchase_date AS input_at
           FROM devices`,
          `SELECT device_name, manufacturer, status, purchase_date AS input_at
           FROM devices`,
          `SELECT device_name, model AS manufacturer, status, purchase_date AS input_at
           FROM devices`,
          `SELECT device_name, status, purchase_date AS input_at
         FROM devices`,
      ])

  const scopedRows = filterRowsByEmployeeScope(rows, scope)

    if (!scopedRows.length) {
      return []
    }

    // For employee, also filter by device allocations
    let finalRows = scopedRows
    if (scope?.isEmployee && visibleDeviceIds) {
      finalRows = scopedRows.filter((row) => {
        const deviceId = Number(row.device_id || 0)
        return visibleDeviceIds.has(deviceId)
      })
    }

    const grouped = new Map()

    finalRows.forEach((row) => {
    const deviceName = String(row.device_name || "Thiết bị chưa đặt tên").trim() || "Thiết bị chưa đặt tên"
    const manufacturer = String(row.manufacturer || "-").trim() || "-"
    const key = `${deviceName}__${manufacturer}`

    if (!grouped.has(key)) {
      grouped.set(key, {
        deviceName,
        manufacturer,
        totalQuantity: 0,
        inUse: 0,
        inStock: 0,
        totalInputValue: 0,
        latestInputAt: null,
      })
    }

    const item = grouped.get(key)
    item.totalQuantity += 1

    const departmentName = String(row.department_name || "").trim()
    const hasAssignedDepartment = normalizePlainText(departmentName) !== "chua phan khoa"
    const status = normalizeDeviceStatus(row.status)

    if (hasAssignedDepartment && status === "in_use") {
      item.inUse += 1
    }

    if (!hasAssignedDepartment || status === "in_stock") {
      item.inStock += 1
    }

    item.totalInputValue += toSafeNumber(row.device_value)

    const inputDate = new Date(row.input_at)
    if (!Number.isNaN(inputDate.getTime())) {
      const currentLatest = item.latestInputAt ? new Date(item.latestInputAt) : null
      if (!currentLatest || Number.isNaN(currentLatest.getTime()) || inputDate > currentLatest) {
        item.latestInputAt = inputDate.toISOString()
      }
    }
  })

  return Array.from(grouped.values())
    .map((item) => ({
      deviceName: item.deviceName,
      manufacturer: item.manufacturer,
      totalQuantity: item.totalQuantity,
      inUse: item.inUse,
      inStock: item.inStock,
      totalInputValue: Math.round(item.totalInputValue),
      inputAt: item.latestInputAt,
    }))
    .sort((a, b) => b.totalQuantity - a.totalQuantity)
}

async function loadRecentReportsFromActivity(scope = {}) {
  // For employee scope, derive recent reports from device activity logs scoped to the employee.
  if (scope?.isEmployee) {
    const logs = await loadDeviceActivityLogsData(scope)
    if (!logs || !logs.length) return []

    return logs.slice(0, 20).map((row) => {
      const createdAt = row.updatedAt || null
      return {
        id: String(row.id || `ACT-${Math.random().toString(36).slice(2, 9)}`),
        name: String(row.content || row.deviceName || "Hoạt động thiết bị"),
        period: createdAt
          ? `Tháng ${String(new Date(createdAt).getMonth() + 1).padStart(2, "0")}/${new Date(createdAt).getFullYear()}`
          : "-",
        updatedAt: createdAt || new Date().toISOString(),
        status: row.status || "completed",
      }
    })
  }

  const rows = await safeQueryVariants([
    `SELECT id, ` + "`action` AS action_name, description, created_at" + `
     FROM activity
     ORDER BY id DESC
     LIMIT 20`,
    `SELECT id, ` + "`action` AS action_name, description" + `
     FROM activity
     ORDER BY id DESC
     LIMIT 20`,
  ])

  if (!rows.length) {
    return []
  }

  return rows.map((row) => {
    const createdAt = row.created_at || null
    const actionName = String(row.action_name || "Hoạt động hệ thống")

    return {
      id: `ACT-${row.id}`,
      name: String(row.description || actionName),
      period: createdAt
        ? `Tháng ${String(new Date(createdAt).getMonth() + 1).padStart(2, "0")}/${new Date(createdAt).getFullYear()}`
        : "-",
      updatedAt: createdAt || new Date().toISOString(),
      status: "completed",
    }
  })
}

async function loadCostByMonthData(scope = {}) {
  const now = new Date()
  const currentYear = now.getFullYear()
  const points = []

  for (let month = 1; month <= 12; month += 1) {
    points.push({
      year: currentYear,
      month,
      label: formatMonthLabel(currentYear, month),
      importTotal: 0,
      serviceTotal: 0,
    })
  }

  const findPoint = (value) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return null
    }

    return points.find((item) => item.year === date.getFullYear() && item.month === date.getMonth() + 1) || null
  }

  const sumRowsIntoPoints = (rows, targetKey, options = {}) => {
    const { useUpdatedAt = false, onlyLiquidated = false } = options

    rows.forEach((row) => {
      const dateSource = useUpdatedAt ? row.updated_at || row.date_value : row.date_value
      const point = findPoint(dateSource)
      if (!point) {
        return
      }

      if (onlyLiquidated) {
        const normalizedStatus = String(row.status || "")
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/đ/g, "d")

        const isLiquidated = ["liquidated", "thanh ly", "da thanh ly", "disposed"].includes(normalizedStatus)
        if (!isLiquidated) {
          return
        }
        point[targetKey] += toSafeNumber(row.liquidation_value ?? row.device_value)
      } else {
        point[targetKey] += toSafeNumber(row.cost ?? row.device_value)
      }
    })
  }

  const maintenanceRows = await safeQueryVariants([
    `SELECT m.updated_at AS date_value, m.cost, m.status, m.technician_name, COALESCE(dep.name, 'Chưa phân khoa') AS department_name
     FROM maintenance_tasks m
     LEFT JOIN devices d ON m.device_id = d.id
     LEFT JOIN departments dep ON d.department_id = dep.id
     WHERE m.status IN ('completed', 'hoan thanh')`,
    `SELECT m.updated_at AS date_value, m.cost, m.status, m.technician_name
     FROM maintenance_tasks m
     WHERE m.status IN ('completed', 'hoan thanh')`,
    `SELECT updated_at AS date_value, cost, technician_name FROM maintenance_tasks WHERE status IN ('completed', 'hoan thanh')`,
  ])

  const deviceRows = await safeQueryVariants([
    `SELECT
       d.id AS device_id,
       d.created_at AS date_value,
       d.updated_at,
       d.status,
       d.value AS device_value,
       d.liquidation_value,
       COALESCE(dep.name, 'Chưa phân khoa') AS department_name
     FROM devices d
     LEFT JOIN departments dep ON d.department_id = dep.id`,
    `SELECT
       id AS device_id,
       purchase_date AS date_value,
       updated_at,
       status,
       value AS device_value,
       liquidation_value,
       'Chưa phân khoa' AS department_name
     FROM devices`,
    `SELECT id AS device_id, created_at AS date_value, updated_at, status, value AS device_value, liquidation_value FROM devices`,
    `SELECT id AS device_id, purchase_date AS date_value, updated_at, status, value AS device_value, liquidation_value FROM devices`,
  ])

  const visibleDeviceIds = scope?.isEmployee ? await loadEmployeeVisibleDeviceIds(scope) : new Set()
  const scopedMaintenanceRows = filterRowsByEmployeeScope(maintenanceRows, scope, {
    technicianField: "technician_name",
  })
  const scopedDeviceRows = filterRowsByEmployeeScope(deviceRows, scope)

  if (scope?.isEmployee) {
    const allocationRows = await safeQueryVariants([
      `SELECT
         a.device_id,
         a.created_at AS event_date,
         a.updated_at,
         COALESCE(d.
         ` + "`value`" + `, 0) AS device_value
       FROM device_allocations a
       LEFT JOIN devices d ON a.device_id = d.id
       WHERE a.receiver_user_id = ?
         AND a.status IN ('approved', 'da duyet', 'pending', 'dang_cho_duyet')`,
    ].map((query) => query.replace("?", String(scope.userId || 0))))

    const transferRowsForCost = await safeQueryVariants([
      `SELECT
         t.device_id,
         COALESCE(t.request_date, t.created_at, t.updated_at) AS event_date,
         t.updated_at,
         COALESCE(d.
         ` + "`value`" + `, 0) AS device_value
       FROM device_transfers t
       LEFT JOIN devices d ON t.device_id = d.id
       WHERE t.device_id IS NOT NULL`,
    ])

    const employeeImportRows = [...allocationRows, ...transferRowsForCost].filter((row) => {
      const deviceId = Number(row.device_id || 0)
      return Number.isInteger(deviceId) && visibleDeviceIds.has(deviceId)
    })

    const countedImportKeys = new Set()
    employeeImportRows.forEach((row) => {
      const point = findPoint(row.event_date || row.updated_at)
      if (!point) {
        return
      }

      const eventDate = new Date(row.event_date || row.updated_at)
      if (Number.isNaN(eventDate.getTime())) {
        return
      }

      const deviceId = Number(row.device_id || 0)
      const importKey = `${eventDate.getFullYear()}-${eventDate.getMonth() + 1}-${deviceId}`
      if (countedImportKeys.has(importKey)) {
        return
      }
      countedImportKeys.add(importKey)

      point.importTotal += toSafeNumber(row.device_value)
    })
  } else {
    // Green bars: monthly import value from devices table.
    sumRowsIntoPoints(scopedDeviceRows, "importTotal")
  }

  // Gray bars: maintenance cost for employees; admin also includes liquidation cost.
  sumRowsIntoPoints(scopedMaintenanceRows, "serviceTotal")
  if (!scope?.isEmployee) {
    sumRowsIntoPoints(scopedDeviceRows, "serviceTotal", { useUpdatedAt: true, onlyLiquidated: true })
  }

  return points.map((item) => ({
    label: item.label,
    // keep million-based summary for chart scale
    value: Math.round(item.serviceTotal / 1000000),
    inputValue: Math.round(item.importTotal / 1000000),
    serviceValue: Math.round(item.serviceTotal / 1000000),
    // provide raw VND values for exact display
    inputValueRaw: Math.round(item.importTotal || 0),
    serviceValueRaw: Math.round(item.serviceTotal || 0),
  }))
}

async function loadMaintenanceTrendData(scope = {}) {
  const rows = await safeQueryVariants([
    `SELECT m.scheduled_date AS date_value, COALESCE(dep.name, 'Chưa phân khoa') AS department_name
     FROM maintenance_tasks m
     LEFT JOIN devices d ON m.device_id = d.id
     LEFT JOIN departments dep ON d.department_id = dep.id`,
    `SELECT scheduled_date AS date_value FROM maintenance_tasks`,
  ])

  const scopedRows = filterRowsByEmployeeScope(rows, scope)

  const now = new Date()
  const points = []

  for (let index = 5; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1)
    points.push({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      label: formatMonthLabel(date.getFullYear(), date.getMonth() + 1),
      value: 0,
    })
  }

  scopedRows.forEach((row) => {
    const date = new Date(row.date_value)
    if (Number.isNaN(date.getTime())) {
      return
    }

    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const point = points.find((item) => item.year === year && item.month === month)
    if (!point) {
      return
    }

    point.value += 1
  })

  return points
}

async function loadDeviceActivityLogsData(scope = {}) {
  const limit = 12
  const logs = []

  const transferQueries = [
    `SELECT
       t.id,
       t.device_id,
       COALESCE(d.device_code, t.serial_number, '-') AS serial,
       COALESCE(d.device_name, t.device_name, 'Thiết bị chưa xác định') AS device_name,
      COALESCE(dep.name, 'Chưa phân khoa') AS department_name,
       t.from_department,
       t.to_department,
       t.requester_name,
       t.transfer_reason,
       t.status,
       t.updated_at,
       t.request_date
     FROM device_transfers t
     LEFT JOIN devices d ON t.device_id = d.id
     LEFT JOIN departments dep ON d.department_id = dep.id
     WHERE d.id IS NOT NULL
       AND d.department_id IS NOT NULL
     ORDER BY t.id DESC
     LIMIT ${limit}`,
    `SELECT
       t.id,
       t.device_id,
       COALESCE(d.device_code, t.serial_number, '-') AS serial,
       COALESCE(d.device_name, t.device_name, 'Thiết bị chưa xác định') AS device_name,
      COALESCE(dep.name, 'Chưa phân khoa') AS department_name,
       t.from_department,
       t.to_department,
       t.requester_name,
       t.transfer_reason,
       t.status,
       t.updated_at,
       t.request_date
     FROM device_transfers t
     LEFT JOIN devices d ON t.device_id = d.id
     LEFT JOIN departments dep ON d.department_id = dep.id
     ORDER BY t.id DESC
     LIMIT ${limit}`,
  ]

  const maintenanceQueries = [
    `SELECT
       m.id,
       m.device_id,
       COALESCE(d.device_code, '-') AS serial,
       COALESCE(d.device_name, 'Thiết bị chưa xác định') AS device_name,
       COALESCE(dep.name, 'Chưa phân khoa') AS department_name,
       m.technician_name,
       m.maintenance_type,
       m.note,
       m.status,
       m.updated_at,
       m.scheduled_date
     FROM maintenance_tasks m
     LEFT JOIN devices d ON m.device_id = d.id
     LEFT JOIN departments dep ON d.department_id = dep.id
     WHERE d.id IS NOT NULL
       AND d.department_id IS NOT NULL
     ORDER BY m.id DESC
     LIMIT ${limit}`,
    `SELECT
       m.id,
       m.device_id,
       COALESCE(d.device_code, '-') AS serial,
       COALESCE(d.device_name, 'Thiết bị chưa xác định') AS device_name,
       COALESCE(dep.name, 'Chưa phân khoa') AS department_name,
       m.technician_name,
       m.maintenance_type,
       m.note,
       m.status,
       m.updated_at,
       m.scheduled_date
     FROM maintenance_tasks m
     LEFT JOIN devices d ON m.device_id = d.id
     LEFT JOIN departments dep ON d.department_id = dep.id
     ORDER BY m.id DESC
     LIMIT ${limit}`,
  ]

  const repairQueries = [
    `SELECT
       r.id,
       r.device_id,
       COALESCE(d.device_code, '-') AS serial,
       COALESCE(d.device_name, r.device_name, 'Thiết bị chưa xác định') AS device_name,
      COALESCE(dep.name, r.department_name, 'Chưa phân khoa') AS department_name,
      COALESCE(r.reporter_name, 
        (SELECT u.username FROM activity a 
         LEFT JOIN users u ON u.id = a.user_id 
         WHERE a.entity_type = 'repair' AND a.entity_id = r.id AND a.action = 'repair.request' 
         LIMIT 1), 
        'Không xác định') AS reporter_name,
       r.issue_description,
       r.assignee_user_id AS assignee_id,
       assignee.username AS assignee_username,
       assignee.full_name AS assignee_full_name,
       r.status,
       r.updated_at,
       r.created_at
     FROM repair_requests r
     LEFT JOIN devices d ON r.device_id = d.id
     LEFT JOIN departments dep ON d.department_id = dep.id
     LEFT JOIN users assignee ON r.assignee_user_id = assignee.id
     WHERE d.id IS NOT NULL
       AND d.department_id IS NOT NULL
     ORDER BY r.id DESC
     LIMIT ${limit}`,
    `SELECT
       r.id,
       r.device_id,
       COALESCE(d.device_code, '-') AS serial,
       COALESCE(d.device_name, r.device_name, 'Thiết bị chưa xác định') AS device_name,
      COALESCE(dep.name, r.department_name, 'Chưa phân khoa') AS department_name,
      COALESCE(r.reporter_name, 'Không xác định') AS reporter_name,
      r.issue_description,
       r.assignee_user_id AS assignee_id,
       assignee.username AS assignee_username,
       assignee.full_name AS assignee_full_name,
       r.status,
       r.updated_at,
       r.created_at
     FROM repair_requests r
     LEFT JOIN devices d ON r.device_id = d.id
     LEFT JOIN departments dep ON d.department_id = dep.id
     LEFT JOIN users assignee ON r.assignee_user_id = assignee.id
     ORDER BY r.id DESC
     LIMIT ${limit}`,
  ]

  const transferRows = await safeQueryVariants(transferQueries)
  const visibleDeviceIds = scope?.isEmployee ? await loadEmployeeVisibleDeviceIds(scope) : new Set()

  const scopedTransferRows = scope?.isEmployee
    ? transferRows.filter((row) => {
        const matchedDept = isDepartmentMatched(row.department_name, scope)
        const matchedRequester = isRequesterMatched(row.requester_name, scope)
        const deviceId = Number(row.device_id || 0)
        const matchedDevice = Number.isInteger(deviceId) && visibleDeviceIds.has(deviceId)
        return matchedDept || matchedRequester || matchedDevice
      })
    : transferRows

  scopedTransferRows.forEach((row) => {
    const toLocation = ""
    const destinationText =
      String(row.to_department || "").trim() +
      (toLocation ? ` (${toLocation})` : "")

    logs.push({
      id: `transfer-${row.id}`,
      serial: String(row.serial || "-").trim() || "-",
      deviceName: String(row.device_name || "Thiết bị chưa xác định").trim() || "Thiết bị chưa xác định",
      content:
        `${row.device_name || "Thiết bị"} [${row.serial || "-"}] đã chuyển đến ${destinationText || "-"}` +
        (row.requester_name ? ` | Thực hiện: ${row.requester_name}` : ""),
      status: normalizeLogStatus(row.status),
      updatedAt: row.updated_at || row.request_date || null,
    })
  })

  const maintenanceRows = await safeQueryVariants(maintenanceQueries)
  const scopedMaintenanceRows = scope?.isEmployee
    ? filterRowsByEmployeeScope(maintenanceRows, scope, { technicianField: "technician_name" })
    : filterRowsByEmployeeScope(maintenanceRows, scope)

  scopedMaintenanceRows.forEach((row) => {
    const typeText = String(row.maintenance_type || "").trim().toLowerCase()
    const typeLabel = typeText.includes("khẩn") || typeText.includes("khan") ? "khẩn cấp" : "định kì"
    const technicianLabel = String(row.technician_name || "").trim() || "Nhân viên chưa xác định"
    const deviceName = String(row.device_name || "Thiết bị chưa xác định").trim() || "Thiết bị chưa xác định"
    const serial = String(row.serial || "-").trim() || "-"

    logs.push({
      id: `maintenance-${row.id}`,
      serial,
      deviceName,
      content: `Lịch bảo trì ${typeLabel} ${deviceName} - ${serial} | Nhân viên xử lý: ${technicianLabel} `,
      status: normalizeLogStatus(row.status),
      updatedAt: row.updated_at || row.scheduled_date || null,
    })
  })

  const repairRows = await safeQueryVariants(repairQueries)
  const scopedRepairRows = scope?.isEmployee
    ? (repairRows || []).filter((row) => {
        const matchedDept = isDepartmentMatched(row.department_name, scope)
        const matchedRequester = isRequesterMatched(row.reporter_name, scope)
        const deviceId = Number(row.device_id || 0)
        const matchedDevice = Number.isInteger(deviceId) && visibleDeviceIds.has(deviceId)
        return matchedDept || matchedRequester || matchedDevice
      })
    : filterRowsByEmployeeScope(repairRows, scope, { requesterField: "reporter_name" })

  scopedRepairRows.forEach((row) => {
    const reporterName = String(row.reporter_name || "Không xác định").trim() || "Không xác định"
    const issueDesc = String(row.issue_description || "Không có mô tả").trim() || "Không có mô tả"
    
    logs.push({
      id: `repair-${row.id}`,
      serial: String(row.serial || "-").trim() || "-",
      deviceName: String(row.device_name || "Thiết bị chưa xác định").trim() || "Thiết bị chưa xác định",
      content:
        `Yêu cầu sửa chữa: ${issueDesc} | Người yêu cầu: ${reporterName}`,
      status: normalizeLogStatus(row.status),
      updatedAt: row.updated_at || row.created_at || null,
    })
  })

  return logs
    .filter((item) => {
      if (!item.updatedAt) {
        return false
      }

      // For employees, be more lenient - return logs even if serial is unknown, as long as we have content
      if (scope?.isEmployee) {
        return Boolean(item.content || item.deviceName)
      }

      // For others (admin), be stricter
      const serial = String(item.serial || "").trim()
      const deviceNameNormalized = normalizePlainText(item.deviceName)
      const isUnknownDeviceName =
        !deviceNameNormalized ||
        deviceNameNormalized === "thiet bi chua xac dinh" ||
        deviceNameNormalized === "thiet bi chua dat ten"
      const hasKnownSerial = Boolean(serial && serial !== "-")

      return hasKnownSerial && !isUnknownDeviceName
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, limit)
}

async function loadDeviceStockMovementsData(scope = {}) {
  const rows = await safeQueryVariants([
    `SELECT id, description, ` + "`action` AS action_name, created_at" + `
     FROM activity
     WHERE ` + "`action`" + ` IN ('device.create', 'device.import_batch', 'device.delete', 'device.liquidation')
     ORDER BY id DESC
     LIMIT 30`,
    `SELECT id, description, ` + "`action` AS action_name" + `
     FROM activity
     WHERE ` + "`action`" + ` IN ('device.create', 'device.import_batch', 'device.delete', 'device.liquidation')
     ORDER BY id DESC
     LIMIT 30`,
  ])

  if (!rows.length) return []

  // For employee scope, filter activity rows to those mentioning devices visible to the employee
  if (scope?.isEmployee) {
    const visibleDeviceIds = await loadEmployeeVisibleDeviceIds(scope)
    if (!visibleDeviceIds || !visibleDeviceIds.size) {
      return []
    }

    const ids = Array.from(visibleDeviceIds)
    const placeholders = ids.map(() => "?").join(",")
    let deviceLookup = []
    try {
      const [deviceRows] = await pool.query(
        `SELECT id, device_code, device_name FROM devices WHERE id IN (${placeholders})`,
        ids,
      )
      deviceLookup = deviceRows || []
    } catch (e) {
      deviceLookup = []
    }

    const keywords = new Set()
    deviceLookup.forEach((d) => {
      if (d.device_code) keywords.add(String(d.device_code).toLowerCase())
      if (d.device_name) keywords.add(String(d.device_name).toLowerCase())
    })

    const filtered = rows.filter((row) => {
      const desc = String(row.description || "").toLowerCase()
      for (const k of keywords) {
        if (!k) continue
        if (desc.includes(k)) return true
      }
      return false
    })

    return filtered.map((row) => {
      const actionName = String(row.action_name || "").trim()
      let actionLabel = "Nhập tay"

      if (actionName === "device.import_batch") {
        actionLabel = "Nhập CSV"
      } else if (actionName === "device.delete" || actionName === "device.liquidation") {
        actionLabel = "Xuất"
      }

      return {
        id: `stock-${row.id}`,
        action: actionLabel,
        content: String(row.description || "-").trim() || "-",
        updatedAt: row.created_at || null,
      }
    })
  }

  const results = []
  for (const row of rows) {
    const actionName = String(row.action_name || "").trim()
    let actionLabel = "Nhập tay"

    if (actionName === "device.import_batch") {
      actionLabel = "Nhập CSV"
    } else if (actionName === "device.delete" || actionName === "device.liquidation") {
      actionLabel = "Xuất"
    }

    let content = String(row.description || "-").trim() || "-"

    // For deletes, try to find an import batch code related to the device and show it
    if (actionName === "device.delete") {
      try {
        const desc = String(row.description || "")
        const serialMatch = desc.match(/(DEV[\w-]*)/i)
        const deviceSerial = serialMatch ? String(serialMatch[1]).trim() : null

        if (deviceSerial) {
          // Search recent import_batch or import_item activity that mentions this serial
          const [matchRows] = await pool.query(
            `SELECT id, ` + "`action`" + ` AS action_name, description FROM activity WHERE ` + "`action`" + ` IN ('device.import_batch','device.import_item') AND description LIKE ? ORDER BY id DESC LIMIT 1`,
            [`%${deviceSerial}%`]
          )

          if (matchRows && matchRows.length) {
            const matchRow = matchRows[0]
            const mAction = String(matchRow.action_name || "").trim()
            const mDesc = String(matchRow.description || "").trim()

            let batchCode = null
            if (mAction === "device.import_batch") {
              const bMatch = mDesc.match(/Nhập lô thiết bị:\s*([^\s\]]+)/i)
              if (bMatch && bMatch[1]) batchCode = bMatch[1].trim()
            } else if (mAction === "device.import_item") {
              try {
                const payload = JSON.parse(mDesc)
                if (payload && payload.batchCode) batchCode = String(payload.batchCode).trim()
              } catch {
                // ignore
              }
            }

            if (batchCode) {
              // try to extract role/fullname/device name from the delete description if present
              const roleFullMatch = desc.match(/^\s*([^\-\[]+)\s*\[([^\]]*)\]\s*-\s*Xóa thiết bị\s*([^\[]]*)\s*\[([^\]]+)\]/i)
              if (roleFullMatch) {
                const roleLabel = roleFullMatch[1].trim()
                const fullName = roleFullMatch[2].trim()
                const deviceName = roleFullMatch[3] ? roleFullMatch[3].trim() : "Thiết bị"
                const deviceCode = roleFullMatch[4] ? roleFullMatch[4].trim() : deviceSerial
                content = `${roleLabel} [${fullName}] - Xóa thiết bị ${deviceName} [${deviceCode}] - Lô thiết bị: ${batchCode}`
              } else {
                // fallback: append batch code
                content = `${desc} - Lô thiết bị: ${batchCode}`
              }
            }
          }
        }
      } catch (e) {
        // ignore and fall back to raw description
      }
    }

    results.push({
      id: `stock-${row.id}`,
      action: actionLabel,
      content,
      updatedAt: row.created_at || null,
    })
  }

  return results
}

async function loadDashboardData(dateRange = null, scope = {}) {
  const [metrics, reports, maintenanceSummary, deviceCategoryShare, inventorySummary, costByMonth, maintenanceTrend, deviceLogs, deviceStockMovements] = await Promise.all([
    loadMetricData(scope),
    loadRecentReportsFromActivity(scope),
    loadMaintenanceSummaryData(scope),
    loadDeviceCategoryShare(scope),
    loadInventorySummaryData(dateRange, scope),
    loadCostByMonthData(scope),
    loadMaintenanceTrendData(scope),
    loadDeviceActivityLogsData(scope),
    loadDeviceStockMovementsData(scope),
  ])

  const filteredReports = filterByDateRange(reports, "updatedAt", dateRange)
  const filteredDeviceLogs = filterByDateRange(deviceLogs, "updatedAt", dateRange)
  const filteredDeviceStockMovements = filterByDateRange(deviceStockMovements, "updatedAt", dateRange)

  return {
    source: "database",
    metrics,
    reports: filteredReports,
    maintenanceSummary,
    inventorySummary,
    deviceLogs: filteredDeviceLogs,
    deviceStockMovements: filteredDeviceStockMovements,
    templates: [],
    charts: {
      costByMonth,
      deviceCategoryShare,
      maintenanceTrend,
    },
  }
}

router.get("/dashboard", async (req, res) => {
  try {
    const dateRange = parseDateRange(req.query.fromDate, req.query.toDate)
    const reportScope = buildReportScope(req.query)
    const data = await loadDashboardData(dateRange, reportScope)
    return res.json(data)
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.get("/import-batch/:batchCode/items", async (req, res) => {
  try {
    const batchCode = String(req.params.batchCode || "").trim()
    if (!batchCode) {
      return res.status(400).json({ message: "Mã lô không hợp lệ" })
    }

    const [rows] = await pool.query(
      `SELECT id, description, created_at
       FROM activity
       WHERE ` + "`action`" + ` = 'device.import_item'
         AND description LIKE ?
       ORDER BY id ASC
       LIMIT 500`,
      [`%${batchCode}%`],
    )

    const items = (rows || [])
      .map((row) => {
        try {
          const payload = JSON.parse(String(row.description || "{}"))
          if (String(payload.batchCode || "").trim() !== batchCode) {
            return null
          }

          return {
            id: `item-${row.id}`,
            itemName: String(payload.itemName || "").trim() || "-",
            manufacturer: String(payload.manufacturer || "").trim() || "-",
            model: String(payload.model || "").trim() || "-",
            quantity: Number(payload.quantity || 0),
            unitCost: Number(payload.unitCost || 0),
            lineTotal: Number(payload.lineTotal || 0),
            firstCode: String(payload.firstCode || "").trim() || null,
            lastCode: String(payload.lastCode || "").trim() || null,
            createdAt: row.created_at || null,
          }
        } catch {
          return null
        }
      })
      .filter((item) => Boolean(item))

    const parseSerialCode = (code) => {
      const text = String(code || "").trim().toUpperCase()
      const matchedNewFormat = text.match(/^DEV([A-Z0-9]+)-(\d+)$/)
      if (matchedNewFormat) {
        const value = Number.parseInt(matchedNewFormat[2], 10)
        if (!Number.isFinite(value)) {
          return null
        }

        return {
          raw: text,
          prefix: matchedNewFormat[1],
          value,
        }
      }

      const matchedLegacyFormat = text.match(/^DEV-(\d+)$/)
      if (!matchedLegacyFormat) {
        return null
      }

      const value = Number.parseInt(matchedLegacyFormat[1], 10)
      if (!Number.isFinite(value)) {
        return null
      }

      return {
        raw: text,
        prefix: "",
        value,
      }
    }

    for (const item of items) {
      if (item.firstCode && item.lastCode) {
        continue
      }

      const quantity = Number(item.quantity || 0)
      if (!Number.isInteger(quantity) || quantity <= 0) {
        continue
      }

      const [deviceRows] = await pool.query(
        `SELECT device_code
         FROM devices
         WHERE device_name = ?
           AND (? IS NULL OR manufacturer = ?)
           AND (? IS NULL OR model = ?)
           AND device_code REGEXP '^DEV([A-Z0-9]+)?-[0-9]+$'
         ORDER BY id DESC
         LIMIT ?`,
        [
          item.itemName,
          item.manufacturer === "-" ? null : item.manufacturer,
          item.manufacturer === "-" ? null : item.manufacturer,
          item.model === "-" ? null : item.model,
          item.model === "-" ? null : item.model,
          quantity,
        ],
      )

      const serialCodes = (deviceRows || [])
        .map((row) => parseSerialCode(row.device_code))
        .filter((value) => value && Number.isInteger(value.value))
        .sort((a, b) => {
          if (a.value !== b.value) {
            return a.value - b.value
          }

          return a.raw.localeCompare(b.raw)
        })

      if (!serialCodes.length) {
        continue
      }

      item.firstCode = serialCodes[0].raw
      item.lastCode = serialCodes[serialCodes.length - 1].raw
    }

    return res.json({
      ok: true,
      batchCode,
      items,
    })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.delete("/stock-movements/:id", async (req, res) => {
  try {
    const rawId = String(req.params.id || "").trim()
    const match = rawId.match(/^stock-(\d+)$/i)
    if (!match) {
      return res.status(400).json({ message: "Mã bản ghi không hợp lệ" })
    }

    const activityId = Number.parseInt(match[1], 10)
    if (!Number.isInteger(activityId) || activityId <= 0) {
      return res.status(400).json({ message: "Mã bản ghi không hợp lệ" })
    }

    const [result] = await pool.query(
      `DELETE FROM activity
       WHERE id = ?
         AND ` + "`action`" + ` IN ('device.create', 'device.import_batch', 'device.delete')
       LIMIT 1`,
      [activityId],
    )

    if (!result || Number(result.affectedRows || 0) <= 0) {
      return res.status(404).json({ message: "Không tìm thấy bản ghi để xóa" })
    }

    return res.json({ ok: true, message: "Đã xóa bản ghi nhập/xuất" })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.post("/create", async (req, res) => {
  try {
    const templateTitle = String(req.body?.templateTitle || "Báo cáo mới").trim() || "Báo cáo mới"
    const periodLabel = String(req.body?.period || "Tháng hiện tại").trim() || "Tháng hiện tại"

    return res.json({
      ok: true,
      message: `Đã ghi nhận yêu cầu tạo báo cáo: ${templateTitle} (${periodLabel})`,
    })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

router.post("/print", async (_, res) => {
  return res.json({ ok: true, message: "Đang chuẩn bị in báo cáo" })
})

router.post("/export", async (_, res) => {
  return res.json({ ok: true, message: "Đã bắt đầu xuất Excel" })
})

module.exports = router
