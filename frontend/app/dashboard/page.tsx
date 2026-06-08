"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Sidebar } from "@/components/admin/sidebar"
import { Header } from "@/components/admin/header"
import { getDefaultPathByRole, resolveAppRole } from "@/lib/role-access"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Calendar,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Plus,
  QrCode,
  ShieldAlert,
  Wrench,
  Boxes, 
} from "lucide-react"

interface DashboardStats {
  totalDevices: number
  activeDevices: number
  maintenanceDevices: number
  inactiveDevices: number
}

interface DashboardSummary {
  assetValue: string | null
  assetValueNote: string
  upcomingMaintenance: number
  repairsCount: number
  qrScanCountToday: number
}

interface DashboardMaintenanceItem {
  title: string
  detail: string
  date: string
}

interface DashboardActivityItem {
  title: string
  desc: string
}

interface LoggedInUser {
  fullName?: string
  role?: string
  username?: string
}

interface DashboardResponse {
  stats?: DashboardStats
  summary?: DashboardSummary
  maintenanceList?: DashboardMaintenanceItem[]
  recentActivities?: DashboardActivityItem[]
}

const topStatConfigs = [
  {
    key: "totalDevices",
    title: "Tổng thiết bị",
    icon: Boxes,
    border: "border-l-primary",
    text: "text-primary",
  },
  {
    key: "activeDevices",
    title: "Đang hoạt động",
    icon: CheckCircle2,
    border: "border-l-success",
    text: "text-success",
  },
  {
    key: "maintenanceDevices",
    title: "Cần bảo trì",
    icon: Wrench,
    border: "border-l-warning",
    text: "text-warning",
  },
  {
    key: "inactiveDevices",
    title: "Không hoạt động",
    icon: ShieldAlert,
    border: "border-l-destructive",
    text: "text-destructive",
  },
] as const

const quickActions = [
  { title: "Thêm thiết bị", icon: Plus, href: "/devices", subtitle: "" },
  { title: "Đặt lịch bảo trì", icon: Calendar, href: "/maintenance", subtitle: "" },
  { title: "Báo cáo sự cố", icon: ShieldAlert, href: "/repairs", subtitle: "" },
  { title: "Quét QR Code", icon: QrCode, href: "", subtitle: "", disabled: true },
]

export default function AdminDashboard() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"
  const router = useRouter()
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser>({})
  const [stats, setStats] = useState<DashboardStats>({
    totalDevices: 0,
    activeDevices: 0,
    maintenanceDevices: 0,
    inactiveDevices: 0,
  })
  const [summary, setSummary] = useState<DashboardSummary>({
    assetValue: null,
    assetValueNote: "Chưa có dữ liệu",
    upcomingMaintenance: 0,
    repairsCount: 0,
    qrScanCountToday: 0,
  })
  const [hoveredAssetDisplay, setHoveredAssetDisplay] = useState<string | null>(null)
  const [maintenanceList, setMaintenanceList] = useState<DashboardMaintenanceItem[]>([])
  const [recentActivities, setRecentActivities] = useState<DashboardActivityItem[]>([])

  useEffect(() => {
    try {
      const userRaw = localStorage.getItem("user")
      if (!userRaw) {
        setLoggedInUser({})
        return
      }

      setLoggedInUser(JSON.parse(userRaw) as LoggedInUser)
    } catch {
      setLoggedInUser({})
    }
  }, [])

  const normalizeText = (value: string) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")

  const isAdminRole = normalizeText(String(loggedInUser.role || "")).includes("admin")

  const formatRecentActivityDesc = (item: DashboardActivityItem) => {
    const desc = String(item.desc || "").trim()
    const repairApprovalPrefix = "Người dùng [Hệ thống] - Duyệt yêu cầu sửa chữa"

    if (!isAdminRole) {
      return desc
    }

    if (item.title === "Duyệt Yêu cầu sửa chữa" && desc.startsWith(repairApprovalPrefix)) {
      const adminName = String(loggedInUser.fullName || loggedInUser.username || "Admin").trim() || "Admin"
      const suffix = desc.replace(/^Người dùng \[Hệ thống\]\s*-\s*/, "")
      return `Admin [${adminName}] - ${suffix}`
    }

    return desc
  }

  const loadDashboard = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) {
        setIsLoading(true)
      }

      const response = await fetch(`${apiBaseUrl}/api/dashboard/overview`, {
        cache: "no-store",
      })

      if (!response.ok) {
        return
      }

      const data = (await response.json()) as DashboardResponse

      if (data.stats) {
        setStats(data.stats)
      }

      if (data.summary) {
        setSummary(data.summary)
      }

      setMaintenanceList(data.maintenanceList || [])
      setRecentActivities(data.recentActivities || [])
    } catch {
      if (!options?.silent) {
        setStats({
          totalDevices: 0,
          activeDevices: 0,
          maintenanceDevices: 0,
          inactiveDevices: 0,
        })
        setSummary({
          assetValue: null,
          assetValueNote: "Không thể tải dữ liệu từ database",
          upcomingMaintenance: 0,
          repairsCount: 0,
          qrScanCountToday: 0,
        })
        setMaintenanceList([])
        setRecentActivities([])
      }
    } finally {
      if (!options?.silent) {
        setIsLoading(false)
      }
    }
  }, [apiBaseUrl])

  useEffect(() => {
    const token = localStorage.getItem("token")
    const userRaw = localStorage.getItem("user")

    let roleValue = ""
    try {
      roleValue = String(JSON.parse(userRaw || "{}")?.role || "").trim()
    } catch {
      roleValue = ""
    }

    if (token === "logged") {
      if (resolveAppRole(roleValue) !== "admin") {
        router.replace(getDefaultPathByRole(roleValue))
        setIsAuthorized(false)
        return
      }

      setIsAuthorized(true)
      return
    }

    setIsAuthorized(false)
    router.replace("/login")
  }, [router])

  useEffect(() => {
    void loadDashboard()

    const refreshDashboard = () => {
      void loadDashboard({ silent: true })
    }

    const intervalId = window.setInterval(refreshDashboard, 8000)
    window.addEventListener("focus", refreshDashboard)

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshDashboard()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener("focus", refreshDashboard)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [loadDashboard])

  useEffect(() => {
    const handler = (e: any) => {
      try {
        const detail = e.detail as { assetValue: number | null; label?: string }
        if (!detail) return

        if (detail.assetValue == null) {
          setHoveredAssetDisplay(null)
          // restore original dashboard values
          void loadDashboard({ silent: true })
          return
        }

        const formatted = new Intl.NumberFormat("vi-VN").format(Number(detail.assetValue)) + " VND"
        setHoveredAssetDisplay(formatted)
        // keep summary in sync for other UI that may read it
        setSummary((prev) => ({ ...prev, assetValue: formatted, assetValueNote: detail.label ? `Tháng ${detail.label}` : "" }))
      } catch {
        // ignore
      }
    }

    window.addEventListener("reports:hoverAssetValue", handler as EventListener)
    return () => window.removeEventListener("reports:hoverAssetValue", handler as EventListener)
  }, [loadDashboard])

  if (isAuthorized !== true) {
    return null
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />

        <main className="flex-1 overflow-y-auto p-4 lg:p-5">
          <div className="max-w-7xl mx-auto">
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {topStatConfigs.map((item) => (
                  <Card key={item.title} className={`border-border border-l-4 ${item.border}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs text-muted-foreground">{item.title}</p>
                          <p className="mt-4 text-[40px] font-bold leading-none text-foreground">
                            {isLoading ? "--" : stats[item.key].toString()}
                          </p>
                  
                        </div>
                        <div className="rounded-lg bg-primary/10 p-3">
                          <item.icon className="h-5 w-5 text-primary" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className="border-border">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-base text-muted-foreground line-clamp-1">Tổng giá trị tài sản</p>
                        <p className="mt-3 text-3xl xl:text-4xl font-bold leading-tight text-foreground break-words">
                          {hoveredAssetDisplay ? `Tổng giá trị: ${hoveredAssetDisplay}` : summary.assetValue || "--"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-primary/10 p-3 flex-shrink-0">
                        <CircleDollarSign className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-base text-muted-foreground">Số lượng thiết bị sửa chữa</p>
                        <p className="mt-3 text-5xl font-bold leading-none text-foreground">
                          {isLoading ? "--" : summary.repairsCount}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">Chờ xử lý</p>
                      </div>
                      <div className="rounded-lg bg-primary/10 p-3">
                        <Calendar className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-base text-muted-foreground">Số lần quét QR trong ngày</p>
                        <p className="mt-3 text-5xl font-bold leading-none text-foreground">
                          {isLoading ? "--" : summary.qrScanCountToday}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">Hôm nay</p>
                      </div>
                      <div className="rounded-lg bg-primary/10 p-3">
                        <QrCode className="h-6 w-6 text-primary" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card className="border-border">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <CardTitle className="text-xl">Lịch Bảo trì - Sửa chữa</CardTitle>
                      </div>
                      <Button variant="outline">Xem tất cả</Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {maintenanceList.length === 0 && (
                      <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                        Chưa có lịch bảo trì - sửa chữa nào gần đây. 
                      </div>
                    )}

                    {maintenanceList.map((item, index) => (
                      <div key={`${item.title}-${item.date}-${index}`} className="rounded-lg border border-border p-4">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-lg font-semibold text-foreground">{item.title}</p>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">Thiết bị</Badge>
                            <Badge className="bg-warning/20 text-warning">Chờ xử lý</Badge>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">{item.detail}</p>
                        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                          <span>Ngày cập nhật: {item.date}</span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="text-xl">Hoạt động gần đây</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-96 overflow-y-auto pr-3">
                      <div className="space-y-4">
                        {recentActivities.length === 0 && (
                          <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                            Chưa có lịch sử hoạt động nào gần đây.  
                          </div>
                        )}

                        {recentActivities.map((item, index) => (
                          <div key={`${item.title}-${item.desc}-${index}`} className="flex items-start gap-3">
                            <div className="mt-1 rounded-full border border-warning/40 bg-warning/10 p-2 flex-shrink-0">
                              <Clock3 className="h-4 w-4 text-warning" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground">{item.title}</p>
                              <p className="text-xs text-muted-foreground break-words">{formatRecentActivityDesc(item)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
