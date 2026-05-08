const mysql = require("mysql2/promise")

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  timezone: "+07:00",
  waitForConnections: true,
  connectionLimit: 10,
})

pool.on("connection", (connection) => {
  connection.query("SET time_zone = '+07:00'")
})

module.exports = { pool }
