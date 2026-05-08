#!/usr/bin/env node
/*
  apply_transfer.js
  Usage:
    node apply_transfer.js <id1,id2,...>
  Description:
    For each transfer id provided, this script will set the transfer status to 'approved'
    and update the corresponding device's department/location inside a single transaction.
    This is intended to backfill or manually apply transfers that were created before
    auto-approval behavior was added.

  Environment:
    Uses DB config from environment variables (same as the backend app).
*/

const { pool } = require("../src/db")

function normalizeText(value) {
  return String(value || "").trim()
}

async function getTransferById(connection, id) {
  const [rows] = await connection.query(
    `SELECT id, device_id, from_department, to_department, to_location, requester_name, transfer_reason, status FROM device_transfers WHERE id = ? LIMIT 1`,
    [id]
  )

  if (!rows || rows.length === 0) return null
  const r = rows[0]
  return {
    id: r.id,
    deviceId: Number(r.device_id) || null,
    fromDepartment: r.from_department || null,
    toDepartment: r.to_department || null,
    toLocation: r.to_location || null,
    requester: r.requester_name || null,
    reason: r.transfer_reason || null,
    status: r.status || null,
  }
}

async function getDepartmentIdByName(connection, departmentName) {
  const n = normalizeText(departmentName)
  if (!n) return null
  const [rows] = await connection.query(
    `SELECT id FROM departments WHERE TRIM(name) = ? LIMIT 1`,
    [n]
  )
  if (!rows || rows.length === 0) return null
  return Number(rows[0].id) || null
}

async function applyTransfer(connection, transfer) {
  const deviceId = Number(transfer.deviceId || 0)
  if (!deviceId || deviceId <= 0) {
    throw new Error(`Invalid device id for transfer ${transfer.id}`)
  }

  const toDept = String(transfer.toDepartment || "").trim()
  const toLoc = String(transfer.toLocation || "").trim()
  const requester = String(transfer.requester || "").trim()

  let departmentId = null
  if (toDept && toDept.toLowerCase() !== "chưa xác định") {
    departmentId = await getDepartmentIdByName(connection, toDept)
  }

  const setClauses = []
  const params = []
  if (departmentId) {
    setClauses.push('department_id = ?')
    params.push(departmentId)
  }
  if (toLoc) {
    setClauses.push('location = ?')
    params.push(toLoc)
  }

  if (setClauses.length > 0) {
    setClauses.push('updated_at = NOW()')
    params.push(deviceId)
    await connection.query(
      `UPDATE devices SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    )
  }

  // mark transfer as approved
  await connection.query(`UPDATE device_transfers SET status = 'approved', updated_at = NOW() WHERE id = ?`, [transfer.id])
}

async function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error('Usage: node apply_transfer.js <id1,id2,...>')
    process.exit(1)
  }

  const ids = String(arg).split(',').map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0)
  if (!ids.length) {
    console.error('No valid ids provided')
    process.exit(1)
  }

  const connection = await pool.getConnection()
  try {
    for (const id of ids) {
      console.log('Processing transfer', id)
      await connection.beginTransaction()
      try {
        const transfer = await getTransferById(connection, id)
        if (!transfer) {
          console.warn('Transfer not found:', id)
          await connection.rollback()
          continue
        }

        if (transfer.status === 'approved') {
          console.log('Already approved, skipping:', id)
          await connection.rollback()
          continue
        }

        await applyTransfer(connection, transfer)
        await connection.commit()
        console.log('Applied transfer', id)
      } catch (err) {
        console.error('Failed to apply transfer', id, String(err || ''))
        try { await connection.rollback() } catch (e) {}
      }
    }
  } finally {
    connection.release()
    process.exit(0)
  }
}

main().catch(err => {
  console.error('Fatal error', err)
  process.exit(2)
})
