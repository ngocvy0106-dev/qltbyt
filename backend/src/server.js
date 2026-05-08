require("dotenv").config()

const express = require("express")
const cors = require("cors")
const path = require("path")
const authRoutes = require("./routes/auth")
const rolesRoutes = require("./routes/roles")
const devicesRoutes = require("./routes/devices")
const usersRoutes = require("./routes/users")
const dashboardRoutes = require("./routes/dashboard")
const categoriesRoutes = require("./routes/categories")
const departmentsRoutes = require("./routes/departments")
const reportsRoutes = require("./routes/reports")
const maintenanceRoutes = require("./routes/maintenance")
const repairsRoutes = require("./routes/repairs")
const transfersRoutes = require("./routes/transfers")

const app = express()
const port = Number(process.env.PORT || 4000)

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

let frontendOriginRegex = null
if (process.env.FRONTEND_ORIGIN_REGEX) {
  try {
    frontendOriginRegex = new RegExp(process.env.FRONTEND_ORIGIN_REGEX)
  } catch (error) {
    console.warn("Invalid FRONTEND_ORIGIN_REGEX:", error.message)
  }
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true)
      }

      const isAllowedOrigin =
        allowedOrigins.includes(origin) ||
        (frontendOriginRegex ? frontendOriginRegex.test(origin) : false)

      if (isAllowedOrigin) {
        return callback(null, true)
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`))
    },
    credentials: true,
  })
)
app.use(express.json())
app.use("/uploads", express.static(path.resolve(__dirname, "..", "uploads")))
app.use("/device-images", express.static(path.resolve(__dirname, "..", "..", "frontend", "public", "device-images")))

app.get("/api/health", (_, res) => {
  res.json({ ok: true })
})

app.use("/api/auth", authRoutes)
app.use("/api/roles", rolesRoutes)
app.use("/api/devices", devicesRoutes)
app.use("/api/users", usersRoutes)
app.use("/api/dashboard", dashboardRoutes)
app.use("/api/categories", categoriesRoutes)
app.use("/api/departments", departmentsRoutes)
app.use("/api/reports", reportsRoutes)
app.use("/api/maintenance", maintenanceRoutes)
app.use("/api/repairs", repairsRoutes)
app.use("/api/transfers", transfersRoutes)

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`)
})
