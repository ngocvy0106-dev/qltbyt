const express = require("express")
const { pool } = require("../db")

const router = express.Router()

const statusLabelMap = {
  available: "Hoạt động",
  active: "Hoạt động",
  maintenance: "Bảo trì",
  repairing: "Sửa chữa",
  inactive: "Không hoạt động",
  broken: "Hỏng",
  liquidated: "Thanh lý",
}

function normalizeStatus(value) {
  const raw = String(value || "").trim().toLowerCase()
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")

  if (["available", "active", "hoat dong", "dang hoat dong"].includes(normalized)) {
    return "available"
  }

  if (["maintenance", "bao tri", "dang bao tri"].includes(normalized)) {
    return "maintenance"
  }

  if (["repairing", "sua chua", "dang sua chua"].includes(normalized)) {
    return "repairing"
  }

  if (["inactive", "khong hoat dong", "ngung hoat dong", "tam dung"].includes(normalized)) {
    return "inactive"
  }

  if (["broken", "hong", "hu hong", "hu"].includes(normalized)) {
    return "broken"
  }

  if (["liquidated", "thanh ly", "da thanh ly", "disposed"].includes(normalized)) {
    return "liquidated"
  }

  return normalized || "available"
}

function normalizeRoleName(value) {
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

function resolveRequestType(reasonText, requestCode) {
  const normalizedReason = normalizeText(reasonText)
  if (
    normalizedReason.includes("yeu cau cap phat") ||
    normalizedReason.includes("cap phat")
  ) {
    return "allocation"
  }

  const normalizedCode = String(requestCode || "").trim().toUpperCase()
  if (normalizedCode.startsWith("CP")) {
    return "allocation"
  }

  if (normalizedCode.startsWith("DC")) {
    return "transfer"
  }

  return "transfer"
}

function formatCurrencyVnd(value) {
  const amount = Number(value || 0)
  return `${new Intl.NumberFormat("vi-VN").format(amount)} VND`
}

function getVnDateParts(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date)

  const partMap = {}
  parts.forEach((part) => {
    partMap[part.type] = part.value
  })

  return partMap
}

function formatDate(value) {
  if (!value) {
    return "-"
  }

  const parts = getVnDateParts(value)
  if (!parts) {
    return "-"
  }

  return `${parts.day}/${parts.month}/${parts.year}`
}

function formatDateTime(value) {
  if (!value) {
    return "-"
  }

  const parts = getVnDateParts(value)
  if (!parts) {
    return "-"
  }

  return `${parts.hour}:${parts.minute}:${parts.second} ${parts.day}/${parts.month}/${parts.year}`
}

function formatShortDateTime(value) {
  if (!value) {
    return "-"
  }

  const parts = getVnDateParts(value)
  if (!parts) {
    return "-"
  }

  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}/${parts.year}`
}

function extractTransferSerial(description) {
  const text = String(description || "")
  if (!text) {
    return "Không rõ"
  }

  const patterns = [/DEV[A-Z0-9]+-\d+/i, /DC-\d+/i]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[0]) {
      return match[0]
    }
  }

  return "Không rõ"
}

async function loadTransferMetaByIds(transferIds) {
  const ids = Array.from(new Set(transferIds)).filter((id) => Number.isInteger(id) && id > 0)
  if (!ids.length) {
    return new Map()
  }

  const placeholders = ids.map(() => "?").join(", ")
  const queryVariants = [
    `SELECT id, request_code, device_name, serial_number, transfer_reason
     FROM device_transfers
     WHERE id IN (${placeholders})`,
    `SELECT id, request_code, device_name, serial_number
     FROM device_transfers
     WHERE id IN (${placeholders})`,
    `SELECT id, request_code, device_name
     FROM device_transfers
     WHERE id IN (${placeholders})`,
  ]

  let rows = []
  let lastError = null

  for (const query of queryVariants) {
    try {
      const [result] = await pool.query(query, ids)
      rows = result
      lastError = null
      break
    } catch (error) {
      if (error.code === "ER_BAD_FIELD_ERROR") {
        lastError = error
        continue
      }

      if (error.code === "ER_NO_SUCH_TABLE") {
        return new Map()
      }

      throw error
    }
  }

  if (lastError) {
    return new Map()
  }

  const metaMap = new Map()
  rows.forEach((row) => {
    const id = Number(row.id || 0)
    if (!Number.isInteger(id) || id <= 0) {
      return
    }

    metaMap.set(id, {
      requestCode: String(row.request_code || "").trim() || `DC-${id}`,
      deviceName: String(row.device_name || "").trim() || "Thiết bị",
      serial: String(row.serial_number || "").trim() || null,
      reason: String(row.transfer_reason || "").trim() || null,
    })
  })

  return metaMap
}

async function loadRepairMetaByIds(repairIds) {
  const ids = Array.from(new Set(repairIds)).filter((id) => Number.isInteger(id) && id > 0)
  if (!ids.length) {
    return new Map()
  }

  const placeholders = ids.map(() => "?").join(", ")
  const queryVariants = [
    `SELECT r.id,
            r.request_code,
            COALESCE(d.device_name, r.device_name, 'Thiết bị') AS device_name,
            COALESCE(d.device_code, '') AS device_code,
            COALESCE(u.full_name, u.username, '') AS assignee_name
     FROM repair_requests r
     LEFT JOIN devices d ON r.device_id = d.id
     LEFT JOIN users u ON r.assignee_user_id = u.id
     WHERE r.id IN (${placeholders})`,
    `SELECT r.id,
            r.request_code,
            COALESCE(d.device_name, r.device_name, 'Thiết bị') AS device_name,
            '' AS device_code,
            COALESCE(u.full_name, u.username, '') AS assignee_name
     FROM repair_requests r
     LEFT JOIN devices d ON r.device_id = d.id
     LEFT JOIN users u ON r.assignee_user_id = u.id
     WHERE r.id IN (${placeholders})`,
    `SELECT r.id,
            r.request_code,
            COALESCE(d.device_name, r.device_name, 'Thiết bị') AS device_name,
            '' AS device_code,
            '' AS assignee_name
     FROM repair_requests r
     LEFT JOIN devices d ON r.device_id = d.id
     WHERE r.id IN (${placeholders})`,
  ]

  let rows = []
  let lastError = null

  for (const query of queryVariants) {
    try {
      const [result] = await pool.query(query, ids)
      rows = result
      lastError = null
      break
    } catch (error) {
      if (error.code === "ER_BAD_FIELD_ERROR") {
        lastError = error
        continue
      }

      if (error.code === "ER_NO_SUCH_TABLE") {
        return new Map()
      }

      throw error
    }
  }

  if (lastError) {
    return new Map()
  }

  const metaMap = new Map()
  rows.forEach((row) => {
    const id = Number(row.id || 0)
    if (!Number.isInteger(id) || id <= 0) {
      return
    }

    metaMap.set(id, {
      requestCode: String(row.request_code || "").trim() || `RP-${id}`,
      deviceName: String(row.device_name || "").trim() || "Thiết bị",
      deviceCode: String(row.device_code || "").trim() || "",
      assigneeName: String(row.assignee_name || "").trim() || "-",
    })
  })

  return metaMap
}

function formatTimeWithDate(value) {
  if (!value) {
    return "-"
  }

  const parts = getVnDateParts(value)
  if (!parts) {
    return "-"
  }

  return `${parts.hour}:${parts.minute} Ngày ${parts.day}/${parts.month}/${parts.year}`
}

function extractImportBatchDetail(description, roleName, fullName) {
  const text = String(description || "").trim()
  if (!text) {
    return "Nhập lô thiết bị"
  }

  const expectedPrefix = `${String(roleName || "").trim()} - ${String(fullName || "").trim()} - `
  if (expectedPrefix.trim() && text.startsWith(expectedPrefix)) {
    return text.slice(expectedPrefix.length).trim() || "Nhập lô thiết bị"
  }

  const parts = text.split(" - ").map((part) => part.trim()).filter(Boolean)
  if (parts.length >= 3) {
    return parts.slice(2).join(" - ") || "Nhập lô thiết bị"
  }

  return text
}

async function getRecentActivitiesFromDb() {
  const excludedActions = new Set([
    "repair.request",
    "repair.employee_confirmed",
    "maintenance.confirm",
    "maintenance.employee_confirmed",
  ])

  const queryVariants = [
        `SELECT a.id, a.\`action\` AS action_name, a.description, a.entity_type, a.entity_id, a.created_at,
          COALESCE(u.full_name, 'Hệ thống') AS full_name,
          COALESCE(r.role_name, 'Người dùng') AS role_name
     FROM activity a
     LEFT JOIN users u ON a.user_id = u.id
     LEFT JOIN role r ON u.role_id = r.id
    WHERE a.\`action\` NOT IN ('device.import_item', 'user.login', 'user.logout', 'repair.create', 'repair.request', 'repair.employee_confirmed', 'maintenance.confirm', 'maintenance.employee_confirmed')
      AND (r.role_name = 'Admin' OR r.role_name IS NULL)
      AND a.created_at >= DATE_SUB(NOW(), INTERVAL 3 DAY)
     ORDER BY a.id DESC`,
        `SELECT a.id, a.\`action\` AS action_name, a.description, a.entity_type, a.entity_id, a.created_at,
          COALESCE(u.full_name, 'Hệ thống') AS full_name,
          COALESCE(r.role_name, 'Người dùng') AS role_name
     FROM activity a
     LEFT JOIN users u ON a.user_id = u.id
     LEFT JOIN role r ON u.role_id = r.id
    WHERE a.\`action\` NOT IN ('device.import_item', 'user.login', 'user.logout', 'repair.create', 'repair.request', 'repair.employee_confirmed', 'maintenance.confirm', 'maintenance.employee_confirmed')
      AND (r.role_name = 'Admin' OR r.role_name IS NULL)
      AND a.created_at >= DATE_SUB(NOW(), INTERVAL 3 DAY)
     ORDER BY a.id DESC`,
  ]

  let lastError = null

  for (const query of queryVariants) {
    try {
      const [rows] = await pool.query(query)
      const transferIds = rows
        .filter((item) => String(item.action_name || "").trim().startsWith("transfer."))
        .map((item) => Number(item.entity_id || 0))
        .filter((id) => Number.isInteger(id) && id > 0)
      const transferMetaMap = await loadTransferMetaByIds(transferIds)

        const repairAssignIds = rows
          .filter((item) => String(item.action_name || "").trim() === "repair.assign")
          .map((item) => Number(item.entity_id || 0))
          .filter((id) => Number.isInteger(id) && id > 0)
        const repairMetaMap = await loadRepairMetaByIds(repairAssignIds)

      const seenTransferIds = new Set()

      const qrScanActionMap = new Map();

      const filteredRows = rows.filter((item, index, array) => {
        if (excludedActions.has(String(item.action_name || "").trim())) return false;
        
        const action = String(item.action_name || "").trim();
        const qrRelatedActions = ['transfer.create', 'transfer.approved', 'maintenance.create', 'repair.create', 'repair.assign', 'device.update'];
        
        if (qrRelatedActions.includes(action)) {
           for (let i = Math.max(0, index - 10); i <= Math.min(array.length - 1, index + 10); i++) {
              if (i !== index) {
                 const other = array[i];
                 if (String(other.action_name || "").trim() === "device.qr_scan" && other.full_name === item.full_name) {
                    const timeDiff = Math.abs(new Date(item.created_at).getTime() - new Date(other.created_at).getTime());
                    if (timeDiff <= 5000) {
                       let actionLabel = "thao tác";
                       if (action.startsWith("transfer.")) {
                           const transferId = Number(item.entity_id || 0);
                           const transferMeta = Number.isInteger(transferId) && transferId > 0 ? transferMetaMap.get(transferId) : null;
                           let transferType = "transfer";
                           if (transferMeta) {
                               transferType = resolveRequestType(transferMeta.reason, transferMeta.requestCode);
                           }
                           actionLabel = transferType === "allocation" ? "Cấp phát" : "Điều chuyển";
                       } else {
                           const actionLabelMap = {
                               "device.update": "Cập nhật",
                               "maintenance.create": "Tạo lịch bảo trì",
                               "repair.create": "Tạo yêu cầu sửa chữa",
                               "repair.assign": "Tạo yêu cầu sửa chữa"
                           };
                           actionLabel = actionLabelMap[action] || "thao tác";
                       }

                       if (!qrScanActionMap.has(other.id)) {
                          qrScanActionMap.set(other.id, actionLabel);
                       }
                       return false;
                    }
                 }
              }
           }
        }
        return true;
      });

      return filteredRows.map((item) => {
        const parsedEntityId = Number(item.entity_id || 0);
        const action = String(item.action_name || "").trim() || "activity"
        let entityName = String(item.description || "").trim() || "Không có mô tả"
        
        if (action === "device.qr_scan" && qrScanActionMap.has(item.id)) {
           const specificAction = qrScanActionMap.get(item.id);
           if (entityName.endsWith("và thực hiện thao tác")) {
              entityName = entityName.replace("thao tác", specificAction);
           }
        }
        const createdText = item.created_at ? formatDateTime(item.created_at) : ""
        const fullName = String(item.full_name || "Hệ thống").trim()
        const roleName = String(item.role_name || "Admin").trim()
        
        const titleLabelMap = {
          "device.create": "Thêm Thiết bị",
          "device.update": "Cập nhật Thiết bị",
          "device.delete": "Xóa Thiết bị",
          "user.create": "Thêm Người dùng",
          "user.update": "Cập nhật Người dùng",
          "user.delete": "Xóa Người dùng",
          "user.lock": "Khóa Người dùng",
          "user.unlock": "Mở khóa Người dùng",
          "user.reset_password": "Đặt lại mật khẩu",
          "transfer.create": "Tạo Yêu cầu điều chuyển",
          "transfer.approved": "Duyệt Yêu cầu điều chuyển",
          "transfer.rejected": "Từ chối Yêu cầu điều chuyển",
          "transfer.delete": "Xóa Yêu cầu điều chuyển",
          "maintenance.create": "Bảo trì",
          "maintenance.delete": "Bảo trì",
          "repair.approve": "Duyệt Yêu cầu sửa chữa",
          "repair.assign": "Phân công Sửa chữa",
          "repair.start": "Bắt đầu Sửa chữa",
          "repair.complete": "Hoàn thành Sửa chữa",
          "repair.employee_confirmed": "Xác nhận Sửa chữa",
          "repair.employee_completed": "Hoàn thành Sửa chữa",
          "device.import_batch": "Nhập Thiết bị từ CSV",
          "device.liquidation": "Thanh lý thiết bị",
          "department.create": "Thêm Khoa/Phòng Ban",
          "department.update": "Cập nhật Khoa/Phòng Ban",
          "department.delete": "Xóa Khoa/Phòng Ban",
        }

        const actionVerbMap = {
          "device.create": "Thêm",
          "device.update": "Chỉnh sửa",
          "device.delete": "Xóa",
          "user.create": "Thêm",
          "user.update": "Chỉnh sửa",
          "user.delete": "Xóa",
          "user.lock": "Khóa",
          "user.unlock": "Mở khóa",
          "user.reset_password": "Đặt lại mật khẩu",
          "transfer.create": "Tạo",
          "transfer.approved": "Duyệt",
          "transfer.rejected": "Từ chối",
          "transfer.delete": "Xóa",
          "maintenance.create": "Tạo",
          "repair.approve": "Duyệt",
          "repair.assign": "Phân công",
          "repair.start": "Bắt đầu",
          "repair.complete": "Hoàn thành",
          "repair.employee_confirmed": "Xác nhận",
          "repair.employee_completed": "Hoàn thành",
          "device.import_batch": "Nhập",
          "department.create": "Thêm",
          "department.update": "Chỉnh sửa",
          "department.delete": "Xóa",
        }

        const titleLabel = titleLabelMap[action] || action
        const actionVerb = actionVerbMap[action] || "Chỉnh sửa"

        // Special handling for device.import_batch - don't add actionVerb prefix
        if (action === "maintenance.create" || action === "maintenance.delete") {
          // maintenance.create/delete have formatted description: "Tạo/Xóa lịch bảo trì (Type) BT-xxx | Thiết bị: ..."
          const shortTime = item.created_at ? formatDateTime(item.created_at) : ""
          return {
            title: titleLabel,
            desc: shortTime
              ? `${roleName} [${fullName}] - ${entityName} - ${shortTime}`
              : `${roleName} [${fullName}] - ${entityName}`,
          }
        }

        if (action === "device.import_batch") {
          // Prefer role/fullName embedded in the activity description when available
          const descText = String(entityName || "").trim()
          const descParts = descText.split(" - ").map((p) => String(p || "").trim()).filter(Boolean)

          let displayRole = roleName
          let displayFullName = fullName
          if (descParts.length >= 2) {
            // description was built as: "<roleLabel> - <displayName> - ..."
            displayRole = descParts[0]
            displayFullName = descParts[1]
          }

          const importDetail = extractImportBatchDetail(entityName, displayRole, displayFullName)
          const importTimeText = item.created_at ? formatTimeWithDate(item.created_at) : ""

          return {
            title: titleLabel,
            desc: importTimeText
              ? `${displayRole} [${displayFullName}] - ${importDetail} - ${importTimeText}`
              : `${displayRole} [${displayFullName}] - ${importDetail}`,
          }
        }

        if (action.startsWith("transfer.")) {
          const transferVerbMap = {
            "transfer.create": "Tạo",
            "transfer.approved": "Duyệt",
            "transfer.rejected": "Từ chối",
            "transfer.delete": "Xóa",
          }
          const transferVerb = transferVerbMap[action] || actionVerb
          const transferId = Number(item.entity_id || 0)
          if (Number.isInteger(transferId) && transferId > 0) {
            if (seenTransferIds.has(transferId)) {
              return null
            }

            seenTransferIds.add(transferId)
          }
          const transferMeta = transferMetaMap.get(transferId)
          const transferCode = transferMeta?.serial || transferMeta?.requestCode || extractTransferSerial(entityName)
          const transferType = resolveRequestType(transferMeta?.reason || entityName, transferMeta?.requestCode)
          const deviceName = transferMeta?.deviceName || "Thiết bị"
          const shortTime = item.created_at ? formatShortDateTime(item.created_at) : ""
          const transferTypeLabel = transferType === "allocation" ? "Cấp phát" : "Điều chuyển"
          const serialLabel = transferCode ? ` [${transferCode}]` : ""
          const transferLabel = `${transferTypeLabel} thiết bị ${deviceName}${serialLabel}`

          return {
            title: "Điều chuyển - Cấp phát",
            desc: shortTime
              ? `${roleName} [${fullName}] - ${transferLabel} - ${shortTime}`
              : `${roleName} [${fullName}] - ${transferLabel}`,
          }
        }

        if (action.startsWith("repair.")) {
          // For repair actions, format with role/name and timestamp
          const shortTime = item.created_at ? formatShortDateTime(item.created_at) : ""

          if (action === "repair.assign") {
            let deviceLabel = "Thiết bị"
            let assigneeName = "-"
            let deviceSerial = ""
            const repairId = Number(item.entity_id || 0)
            const repairMeta = Number.isInteger(repairId) && repairId > 0 ? repairMetaMap.get(repairId) : null
            if (repairMeta) {
              deviceLabel = repairMeta.deviceName || deviceLabel
              deviceSerial = repairMeta.deviceCode || ""
              assigneeName = repairMeta.assigneeName || assigneeName
            } else {
              const assignRegexes = [
                /sửa chữa thiết bị\s+(.+?)\s+cho\s+(.+)$/i,
                /sua chua thiet bi\s+(.+?)\s+cho\s+(.+)$/i,
              ]

              for (const regex of assignRegexes) {
                const match = String(entityName || "").match(regex)
                if (match?.[1]) {
                  deviceLabel = String(match[1] || "").trim() || deviceLabel
                  assigneeName = String(match[2] || "").trim() || assigneeName
                  break
                }
              }
            }
            const serialLabel = deviceSerial ? ` [${deviceSerial}]` : ""
            const formatted = `${roleName} [${fullName}] - Tạo lịch sửa chữa thiết bị ${deviceLabel}${serialLabel} - Nhân viên xử lý: ${assigneeName}`
            return {
              title: titleLabel,
              desc: shortTime ? `${formatted} - ${shortTime}` : formatted,
            }
          }

          return {
            title: titleLabel,
            desc: shortTime
              ? `${roleName} [${fullName}] - ${entityName} - ${shortTime}`
              : `${roleName} [${fullName}] - ${entityName}`,
          }
        }

        if (action === "device.qr_scan") {
          const shortTime = item.created_at ? formatDateTime(item.created_at) : ""
          
          return {
             title: "Quét mã QR",
             desc: shortTime 
               ? `${roleName} [${fullName}] - ${entityName} - ${shortTime}`
               : `${roleName} [${fullName}] - ${entityName}`
          }
        }

        if (action === "device.liquidation") {
          const shortTime = item.created_at ? formatDateTime(item.created_at) : ""
          
          return {
             title: "Thanh lý thiết bị",
             desc: shortTime 
               ? `${roleName} [${fullName}] - ${entityName} - ${shortTime}`
               : `${roleName} [${fullName}] - ${entityName}`
          }
        }


        // If the activity description already embeds a "Role [FullName] - ..." prefix
        // (e.g. from device.import_batch or our detailed device.delete description),
        // avoid adding the action prefix again which causes duplication.
        const entityTrim = String(entityName || "").trim()
        const alreadyPrefixed = /^\s*[^-]+ \[[^\]]+\]\s*-\s*/.test(entityTrim)

        let descTextFinal
        if (alreadyPrefixed) {
          descTextFinal = createdText ? `${entityTrim} - ${createdText}` : entityTrim
        } else {
          descTextFinal = createdText
            ? `${roleName} [${fullName}] - ${actionVerb}: ${entityName} - ${createdText}`
            : `${roleName} [${fullName}] - ${actionVerb}: ${entityName}`
        }

        return {
          title: titleLabel,
          desc: descTextFinal,
        }
      }).filter(Boolean)
    } catch (error) {
      if (error.code === "ER_BAD_FIELD_ERROR") {
        lastError = error
        continue
      }

      if (error.code === "ER_NO_SUCH_TABLE") {
        return []
      }

      throw error
    }
  }

  if (lastError) {
    return []
  }

  return []
}

router.get("/overview", async (_, res) => {
  try {
    const queryVariants = [
      `SELECT id, device_name, status, updated_at, warranty_expiry, \`value\` AS device_value
       FROM devices`,
      `SELECT id, device_name, status, updated_at, warranty_expiry
       FROM devices`,
    ]

    let devices = []
    let hasValueColumn = true
    let lastError = null

    for (const query of queryVariants) {
      try {
        const [rows] = await pool.query(query)
        devices = rows
        hasValueColumn = query.includes("device_value")
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

    const normalizedDevices = devices.map((device) => {
      const normalizedStatus = normalizeStatus(device.status)

      return {
        id: device.id,
        name: device.device_name,
        status: normalizedStatus,
        statusLabel: statusLabelMap[normalizedStatus] || normalizedStatus,
        value: Number(device.device_value || 0),
        updatedAt: device.updated_at,
        warrantyExpiry: device.warranty_expiry,
      }
    })

    const assetValue = hasValueColumn
      ? normalizedDevices
          .filter((device) => !["broken", "liquidated"].includes(device.status))
          .reduce((sum, device) => sum + Number(device.value || 0), 0)
      : null

    const stats = {
      totalDevices: normalizedDevices.length,
      activeDevices: normalizedDevices.filter((device) => ["available", "active"].includes(device.status)).length,
      maintenanceDevices: normalizedDevices.filter((device) => ["maintenance", "repairing"].includes(device.status)).length,
      inactiveDevices: normalizedDevices.filter((device) => ["inactive", "broken", "liquidated"].includes(device.status)).length,
    }

    const upcomingMaintenance = normalizedDevices.filter((device) => {
      if (!device.warrantyExpiry) {
        return false
      }

      const now = new Date()
      const next30Days = new Date()
      next30Days.setDate(now.getDate() + 30)

      const warrantyDate = new Date(device.warrantyExpiry)
      return warrantyDate >= now && warrantyDate <= next30Days
    }).length

    // Get repairs count
    let repairsCount = 0
    try {
      const [repairsRows] = await pool.query(
        `SELECT COUNT(*) as count FROM repair_requests WHERE status != 'completed'`
      )
      repairsCount = repairsRows[0]?.count || 0
    } catch (error) {
      // If table doesn't exist, repairsCount stays 0
      if (error.code !== "ER_NO_SUCH_TABLE") {
        throw error
      }
    }

    // Get QR scan count for today (in Vietnam timezone)
    let qrScanCountToday = 0
    try {
      const [scanRows] = await pool.query(
        "SELECT created_at FROM activity WHERE `action` = 'device.qr_scan' AND created_at >= DATE_SUB(NOW(), INTERVAL 2 DAY)"
      )
      
      const todayParts = getVnDateParts(new Date())
      if (todayParts) {
        const todayStr = `${todayParts.day}/${todayParts.month}/${todayParts.year}`
        
        qrScanCountToday = scanRows.filter(row => {
          if (!row.created_at) return false
          const rowParts = getVnDateParts(row.created_at)
          if (!rowParts) return false
          const rowStr = `${rowParts.day}/${rowParts.month}/${rowParts.year}`
          return rowStr === todayStr
        }).length
      }
    } catch (error) {
      if (error.code !== "ER_NO_SUCH_TABLE" && error.code !== "ER_BAD_FIELD_ERROR") {
        throw error
      }
    }

    const maintenanceList = normalizedDevices
      .filter((device) => ["maintenance", "repairing", "broken"].includes(device.status))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 5)
      .map((device) => ({
        title: device.name,
        detail: `Trạng thái: ${device.statusLabel}`,
        date: formatDate(device.updatedAt),
      }))

    const recentActivitiesFromDb = await getRecentActivitiesFromDb()
    const recentActivities = recentActivitiesFromDb

    return res.json({
      stats,
      summary: {
        assetValue: assetValue !== null ? formatCurrencyVnd(assetValue) : null,
        assetValueNote:
          assetValue !== null
            ? "Tổng cột giá trị thiết bị (loại trừ trạng thái hỏng và thanh lý)"
            : "Chưa có cột giá trị tài sản trong bảng devices",
        upcomingMaintenance,
        repairsCount,
        qrScanCountToday,
      },
      maintenanceList,
      recentActivities,
    })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

module.exports = router