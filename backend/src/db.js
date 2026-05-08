const mysql = require("mysql2/promise")
const fs = require("fs")

const shouldUseSsl = String(process.env.DB_SSL || "false").toLowerCase() === "true"
const sslRejectUnauthorized = String(process.env.DB_SSL_REJECT_UNAUTHORIZED || "true").toLowerCase() !== "false"
const sslCaPath = process.env.DB_SSL_CA_PATH

const sslConfig = shouldUseSsl
  ? {
      minVersion: "TLSv1.2",
      rejectUnauthorized: sslRejectUnauthorized,
      ...(sslCaPath ? { ca: fs.readFileSync(sslCaPath, "utf8") } : {}),
    }
  : undefined

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: sslConfig,
  timezone: "+07:00",
  waitForConnections: true,
  connectionLimit: 10,
})

pool.on("connection", (connection) => {
  connection.query("SET time_zone = '+07:00'")
})

module.exports = { pool }
