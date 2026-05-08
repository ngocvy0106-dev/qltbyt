const express = require("express")
const { pool } = require("../db")

const router = express.Router()

router.get("/summary", async (_, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         COALESCE(NULLIF(TRIM(category), ''), 'Chưa phân loại') AS category,
         COUNT(*) AS deviceCount
       FROM devices
       GROUP BY COALESCE(NULLIF(TRIM(category), ''), 'Chưa phân loại')
       ORDER BY deviceCount DESC, category ASC`
    )

    return res.json({
      categories: rows.map((row, index) => ({
        id: index + 1,
        name: row.category,
        deviceCount: Number(row.deviceCount || 0),
      })),
    })
  } catch (error) {
    return res.status(500).json({ message: "Lỗi server", detail: String(error.message || error) })
  }
})

module.exports = router
