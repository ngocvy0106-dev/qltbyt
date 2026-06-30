"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import {
  CalendarDays,
  FileText,
  FilePlus2,
  MoreHorizontal,
  Printer,
  Search,
  Trash2,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"
import { vi } from "date-fns/locale"
import type { DateRange } from "react-day-picker"

type ReportStatus = "completed" | "draft" | "review" | "in_progress"

type ReportItem = {
  id: string
  name: string
  period: string
  updatedAt: string
  status: ReportStatus
}

type MaintenanceSummaryItem = {
  department: string
  total: number
  completed: number
  inProgress: number
  pending: number
  rate: number
}

type ReportTemplateItem = {
  title: string
  type: string
  lastRun: string
  highlighted?: boolean
}

type MetricItem = {
  title: string
  value: string
  note: string
  icon: "cost" | "completed" | "new" | "incident"
}

const statusClass: Record<ReportStatus, string> = {
  completed: "bg-success/20 text-success",
  draft: "bg-warning/20 text-warning",
  review: "bg-info/20 text-info",
  in_progress: "bg-warning/20 text-warning",
}

const statusLabel: Record<ReportStatus, string> = {
  completed: "Hoàn thành",
  draft: "Bản nháp",
  review: "Chờ duyệt",
  in_progress: "Đang sửa",
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function hasPermission(permissions: string[] | undefined, permissionName: string, role?: string | null) {
  if (role && ["admin", "administrator", "super admin", "quản trị viên", "quan tri vien"].includes(
    role.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d")
  )) {
    return true
  }
  if (!permissions) return false
  if (permissions.some((p) => p.toLowerCase().trim() === "toàn quyền")) return true
  return permissions.some((p) => p.toLowerCase().trim() === permissionName.toLowerCase().trim())
}

type ChartPoint = {
  label: string
  value: number
  inputValue?: number
  inputValueRaw?: number
  serviceValue?: number
  serviceValueRaw?: number
}

type CategorySharePoint = {
  name: string
  value: number
  color: string
}

type InventorySummaryItem = {
  inputAt?: string | null
  deviceName: string
  manufacturer: string
  totalQuantity: number
  inUse: number
  inStock: number
  totalInputValue: number
}

type DeviceActivityLogItem = {
  id: string
  serial: string
  deviceName: string
  content?: string
  status: ReportStatus
  updatedAt: string
}

type DeviceStockMovementItem = {
  id: string
  action: string
  content: string
  updatedAt: string | null
}

type LoggedInUser = {
  id?: number | string
  username?: string
  fullName?: string
  role?: string
  departmentName?: string | null
  department?: string | null
}

const colorValueByClass: Record<string, string> = {
  "bg-emerald-500": "#10b981",
  "bg-blue-500": "#3b82f6",
  "bg-amber-500": "#f59e0b",
  "bg-violet-500": "#8b5cf6",
  "bg-rose-500": "#f43f5e",
  "bg-cyan-500": "#06b6d4",
  "bg-lime-500": "#84cc16",
}

function toLocalDateInputValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function parseDateFromInput(value: string) {
  if (!value) {
    return undefined
  }

  const [yearText, monthText, dayText] = value.split("-")
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)

  if (!year || !month || !day) {
    return undefined
  }

  return new Date(year, month - 1, day)
}

function formatDateLabel(value: string) {
  const date = parseDateFromInput(value)
  if (!date) {
    return "--/--/----"
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)
}

function csvCell(value: string | number | null | undefined) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`
}

function extractTechnicianFromContent(content?: string) {
  if (!content) return "Nhân viên chưa xác định"
  const patterns = [
    /Xử lý:\s*([^|\n\r]+)/i,
    /Xu? ly:\s*([^|\n\r]+)/i,
    /Nhân viên xử lý:\s*([^|\n\r]+)/i,
    /Nhan vien xu ly:\s*([^|\n\r]+)/i,
  ]

  for (const re of patterns) {
    const m = content.match(re)
    if (m && m[1]) return String(m[1]).trim()
  }

  // As a last resort, try to extract the last token after a pipe
  const parts = content.split("|")
  if (parts.length > 0) {
    const last = parts[parts.length - 1].trim()
    if (last && last.length <= 80) {
      return last
    }
  }

  return "Nhân viên chưa xác định"
}

function normalizeActivityMatchText(value?: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function isMaintenanceDeviceActivityLog(item: DeviceActivityLogItem) {
  const normalizedText = normalizeActivityMatchText(item.content)
  return (
    String(item.id || "").startsWith("maintenance-") ||
    /lich bao tri|tao lich bao tri|len lich bao tri|bao tri|dinh ky/.test(normalizedText)
  )
}

function isRepairDeviceActivityLog(item: DeviceActivityLogItem) {
  const normalizedText = normalizeActivityMatchText(item.content)
  return (
    String(item.id || "").startsWith("repair-") ||
    /yeu cau sua chua|sua chua/.test(normalizedText)
  )
}

function formatDeviceActivityDisplay(item: DeviceActivityLogItem) {
  const text = String(item.content || "")
  const isMaintenance = isMaintenanceDeviceActivityLog(item)
  if (isMaintenance) {
    const tech = extractTechnicianFromContent(text)
    const serial = String(item.serial || "N/A").trim()
    const deviceName = String(item.deviceName || "Thiết bị").trim()
    return `Lịch bảo trì định kì ${deviceName} - ${serial} | Xử lý: ${tech}`
  }

  const isRepair = isRepairDeviceActivityLog(item)
  if (isRepair) {
    const serial = String(item.serial || "N/A").trim()
    const deviceName = String(item.deviceName || "Thiết bị").trim()
    return `${deviceName} - ${serial} | ${text}`
  }

  return text || `${item.serial} - ${item.deviceName}`
}

function getDeviceActivityStatusLabel(item: DeviceActivityLogItem) {
  const isMaintenance = isMaintenanceDeviceActivityLog(item)

  if (isMaintenance && item.status === "in_progress") {
    return "Đang thực hiện"
  }

  return statusLabel[item.status]
}


export function ReportsPage() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"
  const [tab, setTab] = useState("overview")
  const [isLoading, setIsLoading] = useState(true)
  const [animateCharts, setAnimateCharts] = useState(false)
  const [activeCostIndex, setActiveCostIndex] = useState<number | null>(null)
  const [hoveredBar, setHoveredBar] = useState<
    | { monthIndex: number; series: "input" | "service" }
    | null
  >(null)
  const [activeCategoryIndex, setActiveCategoryIndex] = useState<number | null>(null)
  const [isCreateReportDialogOpen, setIsCreateReportDialogOpen] = useState(false)
  const [isDateRangeDialogOpen, setIsDateRangeDialogOpen] = useState(false)
  const [createReportTitle, setCreateReportTitle] = useState("")
  const [selectedFromDate, setSelectedFromDate] = useState("")
  const [selectedToDate, setSelectedToDate] = useState("")
  const [isCreatingReport, setIsCreatingReport] = useState(false)
  const [reportData, setReportData] = useState<ReportItem[]>([])
  const [maintenanceSummaryData, setMaintenanceSummaryData] = useState<MaintenanceSummaryItem[]>([])
  const [reportTemplates, setReportTemplates] = useState<ReportTemplateItem[]>([])
  const [costByMonth, setCostByMonth] = useState<ChartPoint[]>([])
  const [deviceCategoryShare, setDeviceCategoryShare] = useState<CategorySharePoint[]>([])
  const [inventorySummary, setInventorySummary] = useState<InventorySummaryItem[]>([])
  const [deviceActivityLogs, setDeviceActivityLogs] = useState<DeviceActivityLogItem[]>([])
  const [deviceStockMovements, setDeviceStockMovements] = useState<DeviceStockMovementItem[]>([])
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeletingMovementId, setIsDeletingMovementId] = useState<string | null>(null)
  const [selectedDeleteMovement, setSelectedDeleteMovement] = useState<DeviceStockMovementItem | null>(null)
  const { toast } = useToast()
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser>({})
  const [isUserHydrated, setIsUserHydrated] = useState(false)

  const normalizeText = (value: string) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")

  const isNhanVienRole = (value: string) => {
    const role = normalizeText(value)
    return role.includes("nhan vien") || role.includes("nhan-vien")
  }

  const normalizeDepartmentValue = (value: unknown) => {
    const text = String(value || "").trim()
    if (!text) {
      return ""
    }

    const [primaryDepartment] = text.split(/[;,]/)
    return String(primaryDepartment || "").trim()
  }

  const metricIconMap = useMemo(
    () => ({
      cost: {
        icon: FileText,
        iconClass: "bg-primary/10 text-primary",
      },
      completed: {
        icon: CheckCircle2,
        iconClass: "bg-success/20 text-success",
      },
      new: {
        icon: TrendingUp,
        iconClass: "bg-info/20 text-info",
      },
      incident: {
        icon: AlertTriangle,
        iconClass: "bg-destructive/20 text-destructive",
      },
    }),
    [],
  )

  const [dynamicMetrics, setDynamicMetrics] = useState<MetricItem[]>([])

  const selectedRange = useMemo<DateRange | undefined>(() => {
    const from = parseDateFromInput(selectedFromDate)
    const to = parseDateFromInput(selectedToDate)

    if (!from && !to) {
      return undefined
    }

    return {
      from,
      to: to || from,
    }
  }, [selectedFromDate, selectedToDate])

  const emptyMetrics: MetricItem[] = [
    { title: "Tổng chi phí", value: "-", note: "Không có dữ liệu", icon: "cost" },
    { title: "Bảo trì hoàn thành", value: "-", note: "Không có dữ liệu", icon: "completed" },
    { title: "Thiết bị mới", value: "-", note: "Không có dữ liệu", icon: "new" },
    { title: "Sự cố", value: "-", note: "Không có dữ liệu", icon: "incident" },
  ]

  const isEmployeeUser = useMemo(() => isNhanVienRole(String(loggedInUser.role || "")), [loggedInUser.role])

  const displayedMetrics = useMemo(
    () =>
      (dynamicMetrics.length ? dynamicMetrics : emptyMetrics)
        .filter((item) => item.icon !== "cost")
        .sort((a, b) => {
          const order = ["cost", "new", "completed", "incident"]
          return order.indexOf(a.icon) - order.indexOf(b.icon)
        })
        .map((item) => ({
          ...item,
          iconNode: metricIconMap[item.icon] || metricIconMap.cost,
        })),
    [dynamicMetrics, emptyMetrics, metricIconMap, isEmployeeUser],
  )

  const selectedDateRangeLabel = useMemo(() => {
    if (!selectedFromDate && !selectedToDate) {
      return "Tất cả thời gian"
    }

    return `${formatDateLabel(selectedFromDate)} - ${formatDateLabel(selectedToDate)}`
  }, [selectedFromDate, selectedToDate])

  const inventoryTotals = useMemo(() => {
    return inventorySummary.reduce(
      (acc, item) => {
        acc.quantity += Number(item.totalQuantity) || 0
        acc.inUse += Number(item.inUse) || 0
        acc.inStock += Number(item.inStock) || 0
        acc.totalInputValue += Number(item.totalInputValue) || 0
        return acc
      },
      { quantity: 0, inUse: 0, inStock: 0, totalInputValue: 0 },
    )
  }, [inventorySummary])

  const costMax = useMemo(
    () =>
      Math.max(
        1,
        ...costByMonth.map((item) =>
          Math.max(
            Number(item.inputValueRaw ?? (Number(item.inputValue ?? 0) * 1000000)) || 0,
            Number(item.serviceValueRaw ?? (Number(item.serviceValue ?? item.value ?? 0) * 1000000)) || 0,
          ),
        ),
      ),
    [costByMonth],
  )

  const getCostBarHeight = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
      return 0
    }

    const normalized = Math.sqrt(Math.min(1, value / costMax))
    return Math.max(2, normalized * 100)
  }

  const normalizedCategoryShare = useMemo(() => {
    const normalized = deviceCategoryShare
      .map((item) => ({
        name: item.name,
        color: item.color,
        value: Math.max(0, Number(item.value) || 0),
      }))
      .filter((item) => item.value > 0)

    if (!normalized.length) {
      return [] as Array<{
        name: string
        color: string
        value: number
        percent: number
      }>
    }

    const total = normalized.reduce((sum, item) => sum + item.value, 0)
    if (total <= 0) {
      return []
    }

    const withRemainder = normalized.map((item) => {
      const rawPercent = (item.value / total) * 100
      const basePercent = Math.floor(rawPercent)
      return {
        ...item,
        basePercent,
        remainder: rawPercent - basePercent,
      }
    })

    let distributed = withRemainder.reduce((sum, item) => sum + item.basePercent, 0)
    const unitsToDistribute = Math.max(0, 100 - distributed)
    const sortedRemainders = [...withRemainder].sort((a, b) => b.remainder - a.remainder)
    const bonusByName = new Map<string, number>()

    for (let index = 0; index < unitsToDistribute; index += 1) {
      const target = sortedRemainders[index % sortedRemainders.length]
      bonusByName.set(target.name, (bonusByName.get(target.name) || 0) + 1)
      distributed += 1
    }

    return withRemainder.map((item) => ({
      name: item.name,
      color: item.color,
      value: item.value,
      percent: item.basePercent + (bonusByName.get(item.name) || 0),
    }))
  }, [deviceCategoryShare])

  const donutSegments = useMemo(() => {
    if (!normalizedCategoryShare.length) {
      return [] as Array<{
        name: string
        percent: number
        colorClass: string
        colorHex: string
        dashLength: number
        dashGap: number
        dashOffset: number
        shiftX: number
        shiftY: number
      }>
    }

    const radius = 96
    const circumference = 2 * Math.PI * radius

    let accumulatedPercent = 0

    return normalizedCategoryShare.map((item) => {
      const percent = item.percent
      const startPercent = accumulatedPercent
      const dashLength = (percent / 100) * circumference
      const dashGap = Math.max(0, circumference - dashLength)
      const dashOffset = -((startPercent / 100) * circumference)

      const midPercent = startPercent + percent / 2
      const angle = (midPercent / 100) * Math.PI * 2 - Math.PI / 2
      const shiftDistance = 8
      const shiftX = Math.cos(angle) * shiftDistance
      const shiftY = Math.sin(angle) * shiftDistance

      accumulatedPercent += percent

      return {
        name: item.name,
        percent,
        colorClass: item.color,
        colorHex: colorValueByClass[item.color] || "#10b981",
        dashLength,
        dashGap,
        dashOffset,
        shiftX,
        shiftY,
      }
    })
  }, [normalizedCategoryShare])

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem("user")
      if (!storedUser) {
        setLoggedInUser({})
        setIsUserHydrated(true)
        return
      }

      const parsedUser = JSON.parse(storedUser) as LoggedInUser
      const normalizedDepartmentName =
        normalizeDepartmentValue(parsedUser.departmentName) || normalizeDepartmentValue(parsedUser.department)

      setLoggedInUser({
        ...parsedUser,
        departmentName: normalizedDepartmentName || null,
      })
    } catch {
      setLoggedInUser({})
    } finally {
      setIsUserHydrated(true)
    }
  }, [])

  const loadDashboard = async () => {
    try {
      if (!isUserHydrated) {
        return
      }

      setIsLoading(true)

      const queryParams = new URLSearchParams()
      const role = String(loggedInUser.role || "").trim()
      if (role) {
        queryParams.set("role", role)
      }

      if (isNhanVienRole(role)) {
        const departmentName = String(loggedInUser.departmentName || "").trim()
        if (departmentName) {
          queryParams.set("departmentName", departmentName)
        }

        const requester = String(loggedInUser.fullName || "").trim()
        const requesterAlt = String(loggedInUser.username || "").trim()
        if (requester) {
          queryParams.set("requester", requester)
        }

        if (requesterAlt) {
          queryParams.set("requesterAlt", requesterAlt)
        }

        const userId = String(loggedInUser.id || "").trim()
        if (userId) {
          queryParams.set("userId", userId)
        }
      }

      if (selectedFromDate) {
        queryParams.set("fromDate", selectedFromDate)
      }
      if (selectedToDate) {
        queryParams.set("toDate", selectedToDate)
      }
      const dashboardUrl = `${apiBaseUrl}/api/reports/dashboard${queryParams.toString() ? `?${queryParams.toString()}` : ""}`

      const response = await fetch(dashboardUrl, { cache: "no-store" })

      if (!response.ok) {
        return
      }

      const data = (await response.json()) as {
        metrics?: MetricItem[]
        reports?: ReportItem[]
        maintenanceSummary?: MaintenanceSummaryItem[]
        inventorySummary?: InventorySummaryItem[]
        deviceLogs?: DeviceActivityLogItem[]
        deviceStockMovements?: DeviceStockMovementItem[]
        templates?: ReportTemplateItem[]
        charts?: {
          costByMonth?: ChartPoint[]
          deviceCategoryShare?: CategorySharePoint[]
        }
      }

      setDynamicMetrics(Array.isArray(data.metrics) ? data.metrics : [])
      setReportData(Array.isArray(data.reports) ? data.reports : [])
      setMaintenanceSummaryData(Array.isArray(data.maintenanceSummary) ? data.maintenanceSummary : [])
      setDeviceActivityLogs(Array.isArray(data.deviceLogs) ? data.deviceLogs.slice(0, 8) : [])
      setDeviceStockMovements(
        Array.isArray(data.deviceStockMovements) ? data.deviceStockMovements.slice(0, 12) : [],
      )
      setReportTemplates(Array.isArray(data.templates) ? data.templates : [])
      setCostByMonth(Array.isArray(data.charts?.costByMonth) ? data.charts?.costByMonth : [])
      setDeviceCategoryShare(
        Array.isArray(data.charts?.deviceCategoryShare) ? data.charts?.deviceCategoryShare : [],
      )
      setInventorySummary(Array.isArray(data.inventorySummary) ? data.inventorySummary : [])
    } catch {
      setDynamicMetrics([])
      setReportData([])
      setMaintenanceSummaryData([])
      setInventorySummary([])
      setDeviceActivityLogs([])
      setDeviceStockMovements([])
      setReportTemplates([])
      setCostByMonth([])
      setDeviceCategoryShare([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!isUserHydrated) {
      return
    }

    loadDashboard()
  }, [apiBaseUrl, isUserHydrated, loggedInUser.role, loggedInUser.departmentName, loggedInUser.fullName, loggedInUser.username])

  useEffect(() => {
    const timer = window.setTimeout(() => setAnimateCharts(true), 80)

    return () => window.clearTimeout(timer)
  }, [])

  const handleCreateReport = () => {
    setCreateReportTitle("")
    setIsCreateReportDialogOpen(true)
  }

  const handleSubmitCreateReport = async () => {
    try {
      setIsCreatingReport(true)

      const response = await fetch(`${apiBaseUrl}/api/reports/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period: selectedDateRangeLabel,
          templateTitle: createReportTitle.trim() || "Báo cáo mới",
        }),
      })

      const data = (await response.json().catch(() => null)) as { message?: string } | null
      if (!response.ok) {
        window.alert(data?.message || "Tạo báo cáo thất bại")
        return
      }

      toast({
        description: data?.message || "Đã tạo báo cáo mới",
        duration: 2000,
        className: "border-emerald-200 bg-emerald-50 text-emerald-900 rounded-2xl px-4 py-3 shadow-lg",
      })
      setIsCreateReportDialogOpen(false)
      await loadDashboard()
    } catch {
      window.alert("Không thể kết nối server")
    } finally {
      setIsCreatingReport(false)
    }
  }

  const handlePrint = () => {
    const now = formatDateTime(new Date().toISOString())
    const maintenanceTotals = maintenanceSummaryData.reduce(
      (acc, item) => {
        acc.total += Number(item.total || 0)
        acc.inProgress += Number(item.inProgress || 0)
        acc.completed += Number(item.completed || 0)
        acc.pending += Number(item.pending || 0)
        return acc
      },
      { total: 0, inProgress: 0, completed: 0, pending: 0 },
    )

    const maintenanceLogs = deviceActivityLogs.filter((item) => isMaintenanceDeviceActivityLog(item))
    const repairLogs = deviceActivityLogs.filter((item) => isRepairDeviceActivityLog(item))

    const maintenanceInProgressLogs = maintenanceLogs.filter((item) => item.status === "in_progress")
    const maintenanceCompletedLogs = maintenanceLogs.filter((item) => item.status === "completed")

    const maintenanceInProgressRowsHtml = maintenanceInProgressLogs.length
      ? maintenanceInProgressLogs
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(formatDateTime(item.updatedAt))}</td>
                <td>${escapeHtml(item.deviceName)}</td>
                <td>${escapeHtml(item.serial)}</td>
                <td>${escapeHtml(extractTechnicianFromContent(item.content))}</td>
                <td>${escapeHtml(getDeviceActivityStatusLabel(item))}</td>
              </tr>`,
          )
          .join("")
      : `<tr><td colspan="5" class="no-data">Không có thiết bị đang bảo trì</td></tr>`

    const maintenanceCompletedRowsHtml = maintenanceCompletedLogs.length
      ? maintenanceCompletedLogs
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(formatDateTime(item.updatedAt))}</td>
                <td>${escapeHtml(item.deviceName)}</td>
                <td>${escapeHtml(item.serial)}</td>
                <td>${escapeHtml(extractTechnicianFromContent(item.content))}</td>
                <td>${escapeHtml(getDeviceActivityStatusLabel(item))}</td>
              </tr>`,
          )
          .join("")
      : `<tr><td colspan="5" class="no-data">Không có thiết bị đã bảo trì</td></tr>`

    const repairRowsHtml = repairLogs.length
      ? repairLogs
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(formatDateTime(item.updatedAt))}</td>
                <td>${escapeHtml(item.deviceName)}</td>
                <td>${escapeHtml(item.serial)}</td>
                <td>${escapeHtml(formatDeviceActivityDisplay(item))}</td>
                <td>${escapeHtml(getDeviceActivityStatusLabel(item))}</td>
              </tr>`,
          )
          .join("")
      : `<tr><td colspan="5" class="no-data">Không có dữ liệu sửa chữa</td></tr>`

    const summaryOverviewRowsHtml = `
      <tr>
        <td>Tổng thiết bị</td>
        <td>${new Intl.NumberFormat("vi-VN").format(inventoryTotals.quantity)}</td>
        <td>Thiết bị đang sử dụng</td>
        <td>${new Intl.NumberFormat("vi-VN").format(inventoryTotals.inUse)}</td>
      </tr>
      <tr>
        <td>Thiết bị chưa sử dụng</td>
        <td>${new Intl.NumberFormat("vi-VN").format(inventoryTotals.inStock)}</td>
        <td>Tổng giá trị nhập</td>
        <td>${new Intl.NumberFormat("vi-VN").format(inventoryTotals.totalInputValue)} VND</td>
      </tr>
      <tr>
        <td>Tổng lịch bảo trì (kỳ báo cáo)</td>
        <td>${new Intl.NumberFormat("vi-VN").format(maintenanceTotals.total)}</td>
        <td>Tổng yêu cầu sửa chữa ghi nhận</td>
        <td>${new Intl.NumberFormat("vi-VN").format(repairLogs.length)}</td>
      </tr>`

    const maintenanceStatusRowsHtml = `
      <tr>
        <td>Đang thực hiện</td>
        <td>${new Intl.NumberFormat("vi-VN").format(maintenanceTotals.inProgress)}</td>
        <td>Đã bảo trì</td>
        <td>${new Intl.NumberFormat("vi-VN").format(maintenanceTotals.completed)}</td>
      </tr>
      <tr>
        <td>Chờ xử lý</td>
        <td>${new Intl.NumberFormat("vi-VN").format(maintenanceTotals.pending)}</td>
        <td>Tổng lịch</td>
        <td>${new Intl.NumberFormat("vi-VN").format(maintenanceTotals.total)}</td>
      </tr>`

    const inventoryRowsHtml = inventorySummary.length
      ? inventorySummary
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(formatDateTime(String(item.inputAt || "")))}</td>
                <td>${escapeHtml(item.deviceName)}</td>
                <td>${escapeHtml(item.manufacturer)}</td>
                <td>${item.totalQuantity}</td>
                <td>${item.inUse}</td>
                <td>${item.inStock}</td>
                <td>${new Intl.NumberFormat("vi-VN").format(item.totalInputValue)} VND</td>
              </tr>`,
          )
          .join("")
      : `<tr><td colspan="7" style="text-align:center;">Không có dữ liệu</td></tr>`

    const logsRowsHtml = deviceActivityLogs.length
      ? deviceActivityLogs
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(formatDateTime(item.updatedAt))}</td>
                <td>${escapeHtml(item.serial)}</td>
                <td>${escapeHtml(item.deviceName)}</td>
                <td>${escapeHtml(formatDeviceActivityDisplay(item))}</td>
                <td>${escapeHtml(getDeviceActivityStatusLabel(item))}</td>
              </tr>`,
          )
          .join("")
      : `<tr><td colspan="5" style="text-align:center;">Không có dữ liệu</td></tr>`

    const stockRowsHtml = deviceStockMovements.length
      ? deviceStockMovements
          .map(
            (item) => `
              <tr>
                <td>${escapeHtml(formatDateTime(String(item.updatedAt || "")))}</td>
                <td>${escapeHtml(item.action)}</td>
                <td>${escapeHtml(item.content)}</td>
              </tr>`,
          )
          .join("")
      : `<tr><td colspan="3" style="text-align:center;">Không có dữ liệu</td></tr>`

    const html = `
      <html>
        <head>
          <title>In báo cáo</title>
          <style>
            @page { size: A4; margin: 16mm; }
            html, body { height: 100%; }
            body {
              font-family: "Times New Roman", serif;
              color: #111827;
              font-size: 13px;
              margin: 0;
              -webkit-print-color-adjust: exact;
            }
            .report-container { max-width: 210mm; margin: 0 auto; padding: 8mm; }
            .report-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e6e9ee; padding-bottom: 8px; margin-bottom: 12px; }
            .org { font-weight: 700; font-size: 14px; }
            .report-title { font-size: 24px; font-weight: 800; margin: 0 0 10px; text-align: center; text-transform: uppercase; letter-spacing: 0.5px; }
            .report-sub { font-size: 14px; margin: 2px 0 0 0; }
            .meta { color: #6b7280; font-size: 12px; text-align: right; }
            .section-title { font-size: 14px; font-weight: 700; margin: 10px 0 6px; }
            .page-break-before { page-break-before: always; break-before: page; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 12px; page-break-inside: auto; }
            thead { display: table-header-group; }
            tfoot { display: table-row-group; }
            th, td { border: 1px solid #e6e9ee; padding: 6px 8px; vertical-align: top; font-size: 12px; }
            th { background: #f8fafc; text-align: left; font-weight: 700; }
            tr:nth-child(even) td { background: #fbfbfd; }
            tr { page-break-inside: avoid; }
            .no-data { text-align: center; color: #6b7280; padding: 12px 0; }
            .footer { position: fixed; bottom: 8mm; left: 16mm; right: 16mm; font-size: 11px; color: #6b7280; text-align: right; }
            .sign-grid { display:flex; gap: 12px; justify-content: flex-end; margin-top: 16px; }
            .sign-cell { width: 160px; text-align: center; }
            .summary-table td:nth-child(1),
            .summary-table td:nth-child(3) { font-weight: 700; background: #f8fafc; width: 30%; }
            .summary-table td:nth-child(2),
            .summary-table td:nth-child(4) { width: 20%; }
            @media print {
              body { margin: 0; }
              .report-container { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="report-container">
            <header class="report-header">
              <div>
                <div class="org">ĐẠI HỌC CÔNG NGHIỆP THÀNH PHỐ HỒ CHÍ MINH</div>
                <div>Khoa/Phòng: Kho thiết bị y tế</div>
              </div>
              <div class="meta">Thời gian in: ${escapeHtml(now)}</div>
            </header>

            <h1 class="report-title">BÁO CÁO THIẾT BỊ</h1>

            <div class="section-title">Tổng quan thiết bị</div>
            <table class="summary-table">
              <tbody>
                ${summaryOverviewRowsHtml}
              </tbody>
            </table>

            <div class="section-title">Tình trạng bảo trì trong tháng</div>
            <table class="summary-table">
              <tbody>
                ${maintenanceStatusRowsHtml}
              </tbody>
            </table>

            <div class="section-title">Thiết bị đang bảo trì</div>
            <table>
              <thead>
                <tr>
                  <th style="width:16%">Thời gian</th>
                  <th style="width:28%">Tên thiết bị</th>
                  <th style="width:14%">Mã serial</th>
                  <th style="width:26%">Nhân viên xử lý</th>
                  <th style="width:16%">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                ${maintenanceInProgressRowsHtml}
              </tbody>
            </table>

            <div class="section-title">Thiết bị đã bảo trì</div>
            <table>
              <thead>
                <tr>
                  <th style="width:16%">Thời gian</th>
                  <th style="width:28%">Tên thiết bị</th>
                  <th style="width:14%">Mã serial</th>
                  <th style="width:26%">Nhân viên xử lý</th>
                  <th style="width:16%">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                ${maintenanceCompletedRowsHtml}
              </tbody>
            </table>

            <div class="section-title">Liệt kê sửa chữa</div>
            <table>
              <thead>
                <tr>
                  <th style="width:16%">Thời gian</th>
                  <th style="width:24%">Thiết bị</th>
                  <th style="width:12%">Mã serial</th>
                  <th style="width:34%">Nội dung</th>
                  <th style="width:14%">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                ${repairRowsHtml}
              </tbody>
            </table>

            <div class="section-title">Kiểm kê thiết bị</div>
            <table>
              <thead>
                <tr>
                  <th style="width:12%">Thời gian nhập vào</th>
                  <th style="width:36%">Tên thiết bị</th>
                  <th style="width:18%">Hãng sản xuất</th>
                  <th style="width:8%">Tổng số lượng</th>
                  <th style="width:8%">Đang sử dụng</th>
                  <th style="width:8%">Chưa sử dụng</th>
                  <th style="width:10%">Tổng giá trị</th>
                </tr>
              </thead>
              <tbody>
                ${inventoryRowsHtml}
              </tbody>
            </table>

            <div class="section-title page-break-before">Nhật kí thiết bị</div>
            <table>
              <thead>
                <tr>
                  <th style="width:16%">Thời gian</th>
                  <th style="width:12%">Mã serial</th>
                  <th style="width:28%">Tên thiết bị</th>
                  <th style="width:32%">Nội dung</th>
                  <th style="width:12%">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                ${logsRowsHtml}
              </tbody>
            </table>

            <div class="section-title">Tình trạng nhập - Xuất thiết bị</div>
            <table>
              <thead>
                <tr>
                  <th style="width:22%">Thời gian</th>
                  <th style="width:22%">Loại</th>
                  <th style="width:56%">Nội dung</th>
                </tr>
              </thead>
              <tbody>
                ${stockRowsHtml}
              </tbody>
            </table>

            <div class="sign-grid">
              <div class="sign-cell">
                <div style="font-weight:700">Người lập</div>
                <div style="margin-top:40px">(Ký, họ tên)</div>
              </div>
              <div class="sign-cell">
                <div style="font-weight:700">Thủ kho</div>
                <div style="margin-top:40px">(Ký, họ tên)</div>
              </div>
            </div>
          </div>

          <div class="footer">Trang -</div>

          <script>
            window.focus();
            window.print();
          </script>
        </body>
      </html>
    `

    const iframe = document.createElement("iframe")
    iframe.style.position = "fixed"
    iframe.style.width = "0"
    iframe.style.height = "0"
    iframe.style.border = "0"
    document.body.appendChild(iframe)

    const frameDoc = iframe.contentWindow?.document
    if (!frameDoc) {
      document.body.removeChild(iframe)
      window.alert("Không thể mở trình in")
      return
    }

    frameDoc.open()
    frameDoc.write(html)
    frameDoc.close()

    window.setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe)
      }
    }, 3000)
  }

  const handleExport = () => {
    const rows: string[] = []
    const maintenanceTotals = maintenanceSummaryData.reduce(
      (acc, item) => {
        acc.total += Number(item.total || 0)
        acc.inProgress += Number(item.inProgress || 0)
        acc.completed += Number(item.completed || 0)
        acc.pending += Number(item.pending || 0)
        return acc
      },
      { total: 0, inProgress: 0, completed: 0, pending: 0 },
    )

    const maintenanceLogs = deviceActivityLogs.filter((item) => isMaintenanceDeviceActivityLog(item))
    const repairLogs = deviceActivityLogs.filter((item) => isRepairDeviceActivityLog(item))
    const maintenanceInProgressLogs = maintenanceLogs.filter((item) => item.status === "in_progress")
    const maintenanceCompletedLogs = maintenanceLogs.filter((item) => item.status === "completed")

    rows.push("\uFEFF" + ["BÁO CÁO THIẾT BỊ", formatDateTime(new Date().toISOString())].map(csvCell).join(","))
    rows.push("")

    rows.push(["TỔNG QUAN THIẾT BỊ"].map(csvCell).join(","))
    rows.push(["Chỉ số", "Giá trị", "Chỉ số", "Giá trị"].map(csvCell).join(","))
    rows.push(
      [
        "Tổng thiết bị",
        new Intl.NumberFormat("vi-VN").format(inventoryTotals.quantity),
        "Thiết bị đang sử dụng",
        new Intl.NumberFormat("vi-VN").format(inventoryTotals.inUse),
      ]
        .map(csvCell)
        .join(","),
    )
    rows.push(
      [
        "Thiết bị chưa sử dụng",
        new Intl.NumberFormat("vi-VN").format(inventoryTotals.inStock),
        "Tổng giá trị nhập",
        `${new Intl.NumberFormat("vi-VN").format(inventoryTotals.totalInputValue)} VND`,
      ]
        .map(csvCell)
        .join(","),
    )

    rows.push("")
    rows.push(["TÌNH TRẠNG BẢO TRÌ TRONG THÁNG"].map(csvCell).join(","))
    rows.push(["Chỉ số", "Số lượng", "Chỉ số", "Số lượng"].map(csvCell).join(","))
    rows.push(
      [
        "Đang thực hiện",
        new Intl.NumberFormat("vi-VN").format(maintenanceTotals.inProgress),
        "Đã bảo trì",
        new Intl.NumberFormat("vi-VN").format(maintenanceTotals.completed),
      ]
        .map(csvCell)
        .join(","),
    )
    rows.push(
      [
        "Chờ xử lý",
        new Intl.NumberFormat("vi-VN").format(maintenanceTotals.pending),
        "Tổng lịch",
        new Intl.NumberFormat("vi-VN").format(maintenanceTotals.total),
      ]
        .map(csvCell)
        .join(","),
    )

    rows.push("")
    rows.push(["THIẾT BỊ ĐANG BẢO TRÌ"].map(csvCell).join(","))
    rows.push(["Thời gian", "Tên thiết bị", "Mã serial", "Nhân viên xử lý", "Trạng thái"].map(csvCell).join(","))
    maintenanceInProgressLogs.forEach((item) => {
      rows.push(
        [
          formatDateTime(item.updatedAt),
          item.deviceName,
          item.serial,
          extractTechnicianFromContent(item.content),
          getDeviceActivityStatusLabel(item),
        ]
          .map(csvCell)
          .join(","),
      )
    })

    rows.push("")
    rows.push(["THIẾT BỊ ĐÃ BẢO TRÌ"].map(csvCell).join(","))
    rows.push(["Thời gian", "Tên thiết bị", "Mã serial", "Nhân viên xử lý", "Trạng thái"].map(csvCell).join(","))
    maintenanceCompletedLogs.forEach((item) => {
      rows.push(
        [
          formatDateTime(item.updatedAt),
          item.deviceName,
          item.serial,
          extractTechnicianFromContent(item.content),
          getDeviceActivityStatusLabel(item),
        ]
          .map(csvCell)
          .join(","),
      )
    })

    rows.push("")
    rows.push(["LIỆT KÊ SỬA CHỮA"].map(csvCell).join(","))
    rows.push(["Thời gian", "Thiết bị", "Mã serial", "Nội dung", "Trạng thái"].map(csvCell).join(","))
    repairLogs.forEach((item) => {
      rows.push(
        [
          formatDateTime(item.updatedAt),
          item.deviceName,
          item.serial,
          formatDeviceActivityDisplay(item),
          getDeviceActivityStatusLabel(item),
        ]
          .map(csvCell)
          .join(","),
      )
    })

    rows.push("")

    rows.push(["KIỂM KÊ THIẾT BỊ"].map(csvCell).join(","))
    rows.push(
      [
        "Thời gian nhập vào",
        "Tên thiết bị",
        "Hãng sản xuất",
        "Tổng số lượng",
        "Đang sử dụng",
        "Chưa sử dụng",
        "Tổng giá trị nhập vào",
      ]
        .map(csvCell)
        .join(","),
    )

    inventorySummary.forEach((item) => {
      rows.push(
        [
          formatDateTime(String(item.inputAt || "")),
          item.deviceName,
          item.manufacturer,
          item.totalQuantity,
          item.inUse,
          item.inStock,
          `${new Intl.NumberFormat("vi-VN").format(item.totalInputValue)} VND`,
        ]
          .map(csvCell)
          .join(","),
      )
    })

    rows.push("")
    rows.push(["NHẬT KÍ THIẾT BỊ"].map(csvCell).join(","))
    rows.push(["Thời gian", "Mã serial", "Tên thiết bị", "Nội dung", "Trạng thái"].map(csvCell).join(","))

    deviceActivityLogs.forEach((item) => {
      rows.push(
        [
          formatDateTime(item.updatedAt),
          item.serial,
          item.deviceName,
          formatDeviceActivityDisplay(item),
          getDeviceActivityStatusLabel(item),
        ]
          .map(csvCell)
          .join(","),
      )
    })

    rows.push("")
    rows.push(["TÌNH TRẠNG NHẬP - XUẤT THIẾT BỊ"].map(csvCell).join(","))
    rows.push(["Thời gian", "Loại", "Nội dung"].map(csvCell).join(","))

    deviceStockMovements.forEach((item) => {
      rows.push(
        [formatDateTime(String(item.updatedAt || "")), item.action, item.content]
          .map(csvCell)
          .join(","),
      )
    })

    const csvText = rows.join("\n")
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    const dateTag = new Date().toISOString().slice(0, 10)
    link.href = url
    link.download = `bao-cao-thiet-bi-${dateTag}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleExportImportReceipt = async (item: DeviceStockMovementItem) => {
    const rowTime = formatDateTime(String(item.updatedAt || ""))
    const batchCodeMatch = String(item.content || "").match(/LO-\d{8}-\d{6}-\d{3}/i)
    const batchCode = String(batchCodeMatch?.[0] || "").trim()

    let importItems: Array<{
      id: string
      itemName: string
      manufacturer: string
      model: string
      quantity: number
      unitCost: number
      lineTotal: number
      firstCode?: string | null
      lastCode?: string | null
    }> = []

    if (batchCode) {
      try {
        const response = await fetch(
          `${apiBaseUrl}/api/reports/import-batch/${encodeURIComponent(batchCode)}/items`,
          { cache: "no-store" },
        )
        if (response.ok) {
          const data = (await response.json()) as {
            items?: Array<{
              id: string
              itemName: string
              manufacturer: string
              model: string
              quantity: number
              unitCost: number
              lineTotal: number
              firstCode?: string | null
              lastCode?: string | null
            }>
          }
          importItems = Array.isArray(data.items) ? data.items : []
        }
      } catch {
        importItems = []
      }
    }

    const totalCost = importItems.reduce((sum, line) => sum + (Number(line.lineTotal) || 0), 0)
    const totalQuantity = importItems.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0)

    const txDateObj = new Date(String(item.updatedAt || ""))
    const txDay = Number.isNaN(txDateObj.getTime()) ? "-" : String(txDateObj.getDate()).padStart(2, "0")
    const txMonth = Number.isNaN(txDateObj.getTime()) ? "-" : String(txDateObj.getMonth() + 1).padStart(2, "0")
    const txYear = Number.isNaN(txDateObj.getTime()) ? "-" : String(txDateObj.getFullYear())

    const itemRowsHtml = importItems.length
      ? importItems
          .map(
            (line, index) => `
              <tr>
                <td class="center">${index + 1}</td>
                <td>${escapeHtml(line.itemName)}</td>
                <td class="center">Cái</td>
                <td class="right">${new Intl.NumberFormat("vi-VN").format(Number(line.quantity) || 0)}</td>
                <td class="right">${new Intl.NumberFormat("vi-VN").format(Number(line.quantity) || 0)}</td>
                <td class="right">${new Intl.NumberFormat("vi-VN").format(Number(line.unitCost) || 0)}</td>
                <td class="right">${new Intl.NumberFormat("vi-VN").format(Number(line.lineTotal) || 0)}</td>
              </tr>`,
          )
          .join("")
      : `<tr><td colspan="7" class="center">Chưa có dữ liệu chi tiết lô CSV</td></tr>`

    const html = `
      <html>
        <head>
          <title></title>
          <style>
            @page { size: A4 portrait; margin: 14mm; }
            body { font-family: "Times New Roman", serif; color: #111; font-size: 14px; }
            .top { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .top-left { width: 58%; }
            .top-right { width: 40%; text-align: center; font-size: 13px; }
            .bold { font-weight: 700; }
            .center { text-align: center; }
            .right { text-align: right; }
            .doc-title { margin-top: 8px; margin-bottom: 2px; text-align: center; font-size: 34px; font-weight: 700; }
            .doc-sub { margin-bottom: 6px; text-align: center; font-size: 24px; font-weight: 700; }
            .meta-row { display: flex; justify-content: center; gap: 48px; margin-bottom: 8px; font-size: 15px; }
            .line { margin: 4px 0; }
            .info-box { margin-top: 6px; margin-bottom: 8px; }
            .table-title { margin-top: 10px; margin-bottom: 4px; font-weight: 700; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #000; padding: 5px 6px; vertical-align: middle; font-size: 13px; }
            th { font-weight: 700; text-align: center; }
            .sum-row td { font-weight: 700; }
            .sign-grid { margin-top: 14px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
            .sign-cell { text-align: center; }
            .sign-title { font-weight: 700; }
            .sign-note { font-style: italic; font-size: 12px; }
            .sign-space { height: 56px; }
          </style>
        </head>
        <body>
          <div class="top">
            <div class="top-left">
              <div class="bold">ĐẠI HỌC CÔNG NGHIỆP THÀNH PHỐ HỒ CHÍ MINH</div>
              <div>Khoa/Phòng: Kho thiết bị y tế</div>
            </div>
            <div class="top-right">
              <div class="bold">Mẫu số: 01 - VT</div>
              <div>(Ban hành theo Thông tư 200/2014/TT-BTC)</div>
            </div>
          </div>

          <div class="doc-title">PHIẾU NHẬP KHO</div>
          <div class="doc-sub">THIẾT BỊ Y TẾ</div>
          <div class="center line">Ngày ${escapeHtml(txDay)} tháng ${escapeHtml(txMonth)} năm ${escapeHtml(txYear)}</div>
          <div class="center line bold">Số lô: ${escapeHtml(batchCode || "-")}</div>

          <div class="info-box">
            <div class="line">- Họ và tên người giao: ...............................................................</div>
            <div class="line">- Thời gian giao dịch: ${escapeHtml(rowTime)}</div>
            <div class="line">- Nhập tại: Kho thiết bị y tế</div>
          </div>

          <div class="table-title">Danh sách thiết bị theo file CSV</div>
          <table>
            <thead>
              <tr>
                <th>STT</th>
                <th>Tên, nhãn hiệu, quy cách thiết bị</th>
                <th>Đơn vị tính</th>
                <th>Số lượng theo chứng từ</th>
                <th>Số lượng thực nhập</th>
                <th>Đơn giá</th>
                <th>Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              ${itemRowsHtml}
              <tr class="sum-row">
                <td colspan="3" class="center">Cộng</td>
                <td class="right">${new Intl.NumberFormat("vi-VN").format(totalQuantity)}</td>
                <td class="right">${new Intl.NumberFormat("vi-VN").format(totalQuantity)}</td>
                <td></td>
                <td class="right">${new Intl.NumberFormat("vi-VN").format(totalCost)}</td>
              </tr>
            </tbody>
          </table>

          <div class="line" style="margin-top:8px;">- Tổng số tiền (viết bằng chữ): ....................................................................................................</div>
          <div class="line">- Số chứng từ gốc kèm theo: ..........................................................................................................</div>

          <div class="sign-grid">
            <div class="sign-cell">
              <div class="sign-title">Người lập phiếu</div>
              <div class="sign-note">(Ký, họ tên)</div>
              <div class="sign-space"></div>
            </div>
            <div class="sign-cell">
              <div class="sign-title">Người giao hàng</div>
              <div class="sign-note">(Ký, họ tên)</div>
              <div class="sign-space"></div>
            </div>
            <div class="sign-cell">
              <div class="sign-title">Thủ kho</div>
              <div class="sign-note">(Ký, họ tên)</div>
              <div class="sign-space"></div>
            </div>
            <div class="sign-cell">
              <div class="sign-title">Kế toán trưởng</div>
              <div class="sign-note">(Hoặc bộ phận có nhu cầu nhập)</div>
              <div class="sign-note">(Ký, họ tên)</div>
              <div class="sign-space"></div>
            </div>
          </div>

          <script>
            window.focus();
            window.print();
          </script>
        </body>
      </html>
    `

    const iframe = document.createElement("iframe")
    iframe.style.position = "fixed"
    iframe.style.width = "0"
    iframe.style.height = "0"
    iframe.style.border = "0"
    document.body.appendChild(iframe)

    const frameDoc = iframe.contentWindow?.document
    if (!frameDoc) {
      document.body.removeChild(iframe)
      window.alert("Không thể xuất phiếu nhập")
      return
    }

    frameDoc.open()
    frameDoc.write(html)
    frameDoc.close()

    window.setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe)
      }
    }, 3000)
  }

  const handleDeleteStockMovement = async (item: DeviceStockMovementItem) => {
    try {
      setIsDeletingMovementId(item.id)
      const response = await fetch(
        `${apiBaseUrl}/api/reports/stock-movements/${encodeURIComponent(item.id)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        },
      )

      const data = (await response.json().catch(() => null)) as { message?: string } | null
      if (response.status === 404) {
        await loadDashboard()
        toast({
          description: "Bản ghi này đã được xóa trước đó. Danh sách đã được cập nhật lại.",
        })
        return
      }

      if (!response.ok) {
        window.alert(data?.message || "Xóa bản ghi thất bại")
        return
      }

      await loadDashboard()
      toast({
        description: data?.message || "Đã xóa bản ghi thành công",
      })
    } catch {
      window.alert("Không thể kết nối server")
    } finally {
      setIsDeletingMovementId(null)
    }
  }

  const handleDeleteDialogChange = (open: boolean) => {
    setIsDeleteDialogOpen(open)
    if (!open) {
      setSelectedDeleteMovement(null)
    }
  }

  const handleRequestDeleteStockMovement = (item: DeviceStockMovementItem) => {
    setSelectedDeleteMovement(item)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDeleteStockMovement = async () => {
    if (!selectedDeleteMovement) {
      return
    }

    handleDeleteDialogChange(false)
    await handleDeleteStockMovement(selectedDeleteMovement)
  }

  const handleCreateFromTemplate = (template: ReportTemplateItem) => {
    fetch(`${apiBaseUrl}/api/reports/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateTitle: template.title, period: selectedDateRangeLabel }),
    })
      .then((response) => response.json())
        .then((data) => {
        toast({
          description: data?.message || `Tạo báo cáo từ mẫu: ${template.title}`,
          duration: 2000,
          className: "border-emerald-200 bg-emerald-50 text-emerald-900 rounded-2xl px-4 py-3 shadow-lg",
        })
        loadDashboard()
      })
      .catch(() => {
        window.alert("Không thể kết nối server")
      })
  }

  const handleSelectDateRange = (range: DateRange | undefined) => {
    if (!range?.from) {
      return
    }

    setSelectedFromDate(toLocalDateInputValue(range.from))
    setSelectedToDate(toLocalDateInputValue(range.to || range.from))
  }

  return (
    <div className="space-y-6 text-sm">
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={handleDeleteDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa bản ghi nhập/xuất?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa bản ghi nhập/xuất này không?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleDeleteDialogChange(false)}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteStockMovement}
              disabled={isDeletingMovementId === selectedDeleteMovement?.id}
            >
              {isDeletingMovementId === selectedDeleteMovement?.id ? "Đang xóa..." : "Xóa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {displayedMetrics.map((item) => {
          const Icon = item.iconNode.icon

          return (
            <Card key={item.title} className="border-border bg-card">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{item.title}</p>
                  <p className="mt-1 text-2xl font-bold text-foreground">{item.value}</p>
                  {item.note ? <p className="mt-1 text-xs text-muted-foreground">{item.note}</p> : null}
                </div>
                <div className={`rounded-lg p-3 ${item.iconNode.iconClass}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card className="border-border bg-card">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Popover open={isDateRangeDialogOpen} onOpenChange={setIsDateRangeDialogOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2" aria-label="Chọn khoảng ngày">
                    <CalendarDays className="h-4 w-4" />
                    {selectedDateRangeLabel}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={selectedRange}
                    onSelect={handleSelectDateRange}
                    numberOfMonths={1}
                    locale={vi}
                    weekStartsOn={1}
                  />
                </PopoverContent>
              </Popover>

              <Button className="gap-2" onClick={loadDashboard} disabled={isLoading}>
                <Search className="h-4 w-4" />
                {isLoading ? "Đang tải..." : "Tìm kiếm"}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {hasPermission(loggedInUser.permissions, "Xuất báo cáo", loggedInUser.role) && (
                <Button variant="outline" className="gap-2" onClick={handlePrint}>
                  <Printer className="h-4 w-4" />
                  In báo cáo
                </Button>
              )}
            </div>
          </div>

          {tab === "overview" && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {!isEmployeeUser && (
                <div className="contents">
                  <Card className="border-border bg-card xl:col-span-2">
                    <CardContent className="p-5">
                      <h3 className="text-2xl font-semibold text-foreground">Kiểm kê thiết bị</h3>

                      <div className="mt-6 rounded-md border border-border/60 bg-muted/10 p-4">
                      <div className="mb-4 grid grid-cols-2 gap-2 rounded-md bg-background p-3 text-sm md:grid-cols-4">
                        <div>
                          <p className="text-muted-foreground">Tổng thiết bị</p>
                          <p className="font-semibold text-foreground">{inventoryTotals.quantity}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Đang sử dụng</p>
                          <p className="font-semibold text-foreground">{inventoryTotals.inUse}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Chưa sử dụng</p>
                          <p className="font-semibold text-foreground">{inventoryTotals.inStock}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Tổng giá trị nhập vào</p>
                          <p className="font-semibold text-foreground">
                            {new Intl.NumberFormat("vi-VN").format(inventoryTotals.totalInputValue)} VND
                          </p>
                        </div>
                      </div>

                      <div className="max-h-[320px] overflow-auto rounded-md border border-border/60 bg-background">
                        {inventorySummary.length ? (
                          <table className="w-max min-w-full border-collapse text-center">
                            <thead className="sticky top-0 z-10 bg-secondary/60">
                              <tr>
                                <th className="w-[170px] border border-border/70 bg-secondary px-3 py-2 text-xs font-semibold text-foreground whitespace-nowrap">Thời gian nhập vào</th>
                                <th className="border border-border/70 bg-secondary px-3 py-2 text-xs font-semibold text-foreground whitespace-nowrap">Tên thiết bị</th>
                                <th className="border border-border/70 bg-secondary px-3 py-2 text-xs font-semibold text-foreground whitespace-nowrap">Hãng sản xuất</th>
                                <th className="w-[110px] border border-border/70 bg-secondary px-2 py-2 text-xs font-semibold text-foreground whitespace-nowrap">Tổng số lượng</th>
                                <th className="w-[110px] border border-border/70 bg-secondary px-2 py-2 text-xs font-semibold text-foreground whitespace-nowrap">Đang sử dụng</th>
                                <th className="w-[90px] border border-border/70 bg-secondary px-2 py-2 text-xs font-semibold text-foreground whitespace-nowrap">Chưa sử dụng</th>
                                <th className="border border-border/70 bg-secondary px-3 py-2 text-xs font-semibold text-foreground whitespace-nowrap">Tổng giá trị nhập vào</th>
                              </tr>
                            </thead>
                            <tbody>
                              {inventorySummary.map((item) => (
                                <tr key={`inventory-${item.deviceName}-${item.manufacturer}`}>
                                  <td className="w-[170px] border border-border/60 px-3 py-2 text-sm text-foreground whitespace-nowrap">{formatDateTime(String(item.inputAt || ""))}</td>
                                  <td className="border border-border/60 px-3 py-2 text-sm text-foreground whitespace-nowrap">{item.deviceName}</td>
                                  <td className="border border-border/60 px-3 py-2 text-sm text-foreground whitespace-nowrap">{item.manufacturer}</td>
                                  <td className="w-[110px] border border-border/60 px-2 py-2 text-sm text-foreground whitespace-nowrap">{item.totalQuantity}</td>
                                  <td className="w-[110px] border border-border/60 px-2 py-2 text-sm text-foreground whitespace-nowrap">{item.inUse}</td>
                                  <td className="w-[90px] border border-border/60 px-2 py-2 text-sm text-foreground whitespace-nowrap">{item.inStock}</td>
                                  <td className="border border-border/60 px-3 py-2 text-sm text-foreground whitespace-nowrap">
                                    {new Intl.NumberFormat("vi-VN").format(item.totalInputValue)} VND
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="py-6 text-center text-muted-foreground">Chưa có dữ liệu kiểm kê thiết bị</div>
                        )}
                      </div>

                      <div className="mt-4 rounded-md border border-border/60 bg-background p-3">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <h4 className="text-base font-semibold text-foreground">Tình trạng Nhập - Xuất thiết bị</h4>
                        </div>

                        <div className="max-h-[260px] overflow-auto rounded-md border border-border/50">
                          <table className="w-max min-w-full border-collapse text-center">
                            <thead className="sticky top-0 z-20 bg-secondary">
                              <tr>
                                <th className="border border-border/70 bg-secondary px-3 py-2 text-xs font-semibold text-foreground whitespace-nowrap">Thời gian</th>
                                <th className="border border-border/70 bg-secondary px-3 py-2 text-xs font-semibold text-foreground whitespace-nowrap">Loại</th>
                                <th className="border border-border/70 bg-secondary px-3 py-2 text-xs font-semibold text-foreground whitespace-nowrap">Nội dung</th>
                                <th className="border border-border/70 bg-secondary px-3 py-2 text-center whitespace-nowrap">
                                  <span className="sr-only">Thao tác</span>
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {deviceStockMovements.length ? (
                                deviceStockMovements.map((item) => (
                                  <tr key={item.id}>
                                    <td className="border border-border/60 px-3 py-2 text-sm text-foreground whitespace-nowrap">
                                      {formatDateTime(String(item.updatedAt || ""))}
                                    </td>
                                    <td className="border border-border/60 px-3 py-2 text-sm text-foreground whitespace-nowrap">{item.action}</td>
                                    <td className="border border-border/60 px-3 py-2 text-sm text-foreground">{item.content}</td>
                                    <td className="border border-border/60 px-3 py-2 text-center whitespace-nowrap">
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="icon" className="h-8 w-8">
                                            <MoreHorizontal className="h-4 w-4" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          {item.action === "Nhập CSV" && (
                                            <DropdownMenuItem onClick={() => handleExportImportReceipt(item)}>
                                              Xuất phiếu nhập
                                            </DropdownMenuItem>
                                          )}
                                          <DropdownMenuItem
                                            onClick={() => handleRequestDeleteStockMovement(item)}
                                            className="text-destructive focus:text-destructive"
                                          >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Xóa
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={4} className="border border-border/60 px-3 py-5 text-center text-sm text-muted-foreground">
                                    Chưa có nhật kí nhập - xuất thiết bị
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="mt-4 rounded-md border border-border/60 bg-background p-3">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <h4 className="text-base font-semibold text-foreground">Nhật kí thiết bị gần đây</h4>
                        </div>

                        <div className="max-h-[260px] overflow-auto rounded-md border border-border/50">
                          <table className="w-max min-w-full border-collapse text-center">
                            <thead className="sticky top-0 z-10 bg-secondary/50">
                              <tr>
                                <th className="border border-border/70 bg-secondary px-3 py-2 text-xs font-semibold text-foreground whitespace-nowrap">Thời gian</th>
                                <th className="border border-border/70 bg-secondary px-3 py-2 text-xs font-semibold text-foreground whitespace-nowrap">Nội dung</th>
                                <th className="border border-border/70 bg-secondary px-3 py-2 text-xs font-semibold text-foreground whitespace-nowrap">Trạng thái</th>
                              </tr>
                            </thead>
                            <tbody>
                              {deviceActivityLogs.length ? (
                                deviceActivityLogs.map((item) => (
                                  <tr key={`device-log-${item.id}`}>
                                    <td className="border border-border/60 px-3 py-2 text-sm text-foreground whitespace-nowrap">
                                      {formatDateTime(item.updatedAt)}
                                    </td>
                                    <td className="border border-border/60 px-3 py-2 text-sm text-foreground">
                                      {formatDeviceActivityDisplay(item)}
                                    </td>
                                    <td className="border border-border/60 px-3 py-2 text-sm text-foreground text-center">
                                      <Badge className={statusClass[item.status]}>{getDeviceActivityStatusLabel(item)}</Badge>
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={3} className="border border-border/60 px-3 py-5 text-center text-sm text-muted-foreground">
                                    Chưa có nhật kí thiết bị
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

              <Card className="border-border bg-card">
                  <CardContent className="p-5">
                    <h3 className="text-2xl font-semibold text-foreground">Phân bố thiết bị</h3>
                    <p className="mt-1 text-base text-muted-foreground">Theo danh mục</p>

                    <div className="mt-6 flex flex-col items-center gap-5">
                      <div
                        className="relative h-64 w-64 transition-transform duration-500 ease-out"
                        style={{
                          transform: animateCharts ? "scale(1)" : "scale(0.92)",
                          opacity: animateCharts ? 1 : 0.7,
                        }}
                      >
                        <svg viewBox="0 0 240 240" className="h-full w-full">
                          <circle
                            cx="120"
                            cy="120"
                            r="96"
                            fill="none"
                            stroke="hsl(var(--muted))"
                            strokeWidth="34"
                            opacity="0.35"
                          />

                          {donutSegments.map((segment, index) => (
                            <g
                              key={`${segment.name}-${index}`}
                              className="cursor-pointer transition-transform duration-200 ease-out"
                              style={{
                                transform:
                                  activeCategoryIndex === index
                                    ? `translate(${segment.shiftX}px, ${segment.shiftY}px)`
                                    : "translate(0px, 0px)",
                                transformOrigin: "120px 120px",
                              }}
                              onMouseEnter={() => setActiveCategoryIndex(index)}
                              onMouseLeave={() => setActiveCategoryIndex(null)}
                            >
                              <circle
                                cx="120"
                                cy="120"
                                r="96"
                                fill="none"
                                stroke={segment.colorHex}
                                strokeWidth="34"
                                strokeDasharray={`${segment.dashLength} ${segment.dashGap}`}
                                strokeDashoffset={segment.dashOffset}
                                transform="rotate(-90 120 120)"
                              />
                            </g>
                          ))}
                        </svg>

                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                          <div className="flex h-44 w-44 items-center justify-center rounded-full bg-background text-center">
                            {activeCategoryIndex !== null && donutSegments[activeCategoryIndex] ? (
                              <div>
                                <p className="text-sm text-muted-foreground">{donutSegments[activeCategoryIndex].name}</p>
                                <p className="text-2xl font-semibold text-foreground">{donutSegments[activeCategoryIndex].percent}%</p>
                              </div>
                            ) : (
                              <div>
                                <p className="text-sm text-muted-foreground">Tổng thiết bị</p>
                                <p className="text-2xl font-semibold text-foreground">
                                  {normalizedCategoryShare.length ? "100%" : "0%"}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
                        {normalizedCategoryShare.length ? (
                          normalizedCategoryShare.map((item, index) => (
                            <div
                              key={item.name}
                              className={`flex items-center gap-2 rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors ${
                                activeCategoryIndex === index ? "bg-secondary text-foreground" : ""
                              }`}
                            >
                              <span className={`h-3.5 w-3.5 rounded-full ${item.color}`} />
                              <span>{item.name} ({item.percent}%)</span>
                            </div>
                          ))
                        ) : (
                          <span className="text-muted-foreground">Chưa có dữ liệu phân bố thiết bị</span>
                        )}
                      </div>
                      </div>
                    </CardContent>
                  </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-5">
                  <h3 className="text-2xl font-semibold text-foreground">Chi phí theo tháng</h3>

                  <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-lime-500" />
                      <span>Tổng tiền thiết bị nhập</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                      <span>Chi phí bảo trì + thanh lý</span>
                    </div>
                  </div>

                  <div className="mt-6 overflow-x-auto rounded-md border border-border/60 bg-muted/10">
                    <div className="flex h-72 w-max items-end gap-3 p-4">
                      {costByMonth.length ? (
                        costByMonth.map((item, index) => (
                          <div
                            key={`cost-${index}`}
                            className="relative flex h-full w-16 shrink-0 flex-col items-center justify-end gap-2"
                          >
                            <div className="flex h-56 w-full items-end justify-center gap-1">
                              <div
                                onMouseEnter={() => {
                                  setHoveredBar({ monthIndex: index, series: "input" })
                                  // dispatch input value for Dashboard to consume
                                  // prefer raw VND from backend if available, otherwise fall back to million-based * 1e6
                                  const raw = item.inputValueRaw ?? (Number(item.inputValue ?? 0) * 1000000)
                                  const detail = { assetValue: Number(raw || 0), label: item.label }
                                  window.dispatchEvent(new CustomEvent("reports:hoverAssetValue", { detail }))
                                }}
                                onMouseLeave={() => {
                                  setHoveredBar(null)
                                  window.dispatchEvent(new CustomEvent("reports:hoverAssetValue", { detail: { assetValue: null } }))
                                }}
                                className={`w-5 rounded-t-sm bg-lime-500 transition-all duration-700 ease-out opacity-100`}
                                style={{
                                  height: animateCharts
                                    ? `${getCostBarHeight(Number(item.inputValueRaw ?? (Number(item.inputValue ?? 0) * 1000000)) || 0)}%`
                                    : "4%",
                                  transitionDelay: `${index * 70}ms`,
                                }}
                              />
                              <div
                                onMouseEnter={() => {
                                  setHoveredBar({ monthIndex: index, series: "service" })
                                  window.dispatchEvent(new CustomEvent("reports:hoverAssetValue", { detail: { assetValue: null } }))
                                }}
                                onMouseLeave={() => {
                                  setHoveredBar(null)
                                  window.dispatchEvent(new CustomEvent("reports:hoverAssetValue", { detail: { assetValue: null } }))
                                }}
                                className={`w-5 rounded-t-sm bg-slate-400 transition-all duration-700 ease-out opacity-100`}
                                style={{
                                  height: animateCharts
                                    ? `${getCostBarHeight(Number(item.serviceValueRaw ?? (Number(item.serviceValue ?? item.value ?? 0) * 1000000)) || 0)}%`
                                    : "4%",
                                  transitionDelay: `${index * 70 + 30}ms`,
                                }}
                              />
                            </div>
                            <span className="text-sm text-muted-foreground whitespace-nowrap">{item.label}</span>

                            {hoveredBar && hoveredBar.monthIndex === index && (
                              <div className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-md border border-border bg-background px-2 py-1 text-sm font-medium text-foreground whitespace-nowrap">
                                {hoveredBar.series === "input" ? (
                                  <span>
                                    Tổng giá trị: {new Intl.NumberFormat("vi-VN").format(Number(item.inputValueRaw ?? (item.inputValue ?? 0) * 1000000))} VND
                                  </span>
                                ) : (
                                  <span>
                                    Bảo trì + thanh lý: {new Intl.NumberFormat("vi-VN").format(Number(item.serviceValueRaw ?? (item.serviceValue ?? item.value ?? 0) * 1000000))} VND
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="flex w-full items-center justify-center text-muted-foreground">
                          Chưa có dữ liệu chi phí
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

            </div>
          )}

          {tab === "templates" && (
            <Card className="border-border bg-card">
              <CardContent className="p-5">
                <h3 className="text-2xl font-semibold text-foreground">Mẫu báo cáo có sẵn</h3>
                <p className="mt-2 text-base text-muted-foreground">Chọn mẫu để tạo báo cáo nhanh</p>

                <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                  {reportTemplates.length ? (
                    reportTemplates.map((template) => (
                      <Card
                        key={template.title}
                        className={`border-border bg-card ${template.highlighted ? "border-primary" : ""}`}
                      >
                        <CardContent className="space-y-4 p-5">
                          <div className="flex items-start gap-3">
                            <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                              <FileText className="h-5 w-5" />
                            </div>
                            <div>
                              <h4 className="text-xl font-semibold text-foreground">{template.title}</h4>
                              <p className="mt-1 text-sm text-muted-foreground">Loại: {template.type}</p>
                              <p className="mt-1 text-sm text-muted-foreground">Lần cuối: {template.lastRun}</p>
                            </div>
                          </div>

                          <Button
                            variant="outline"
                            className="w-full gap-2"
                            onClick={() => handleCreateFromTemplate(template)}
                          >
                            <FilePlus2 className="h-4 w-4" />
                            Tạo báo cáo
                          </Button>
                        </CardContent>
                      </Card>
                    ))
                  ) : (
                    <div className="col-span-full text-center text-muted-foreground">Chưa có mẫu báo cáo từ hệ thống</div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCreateReportDialogOpen} onOpenChange={setIsCreateReportDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Tạo báo cáo</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Tên báo cáo</Label>
              <Input
                placeholder="Ví dụ: Báo cáo thiết bị tháng này"
                value={createReportTitle}
                onChange={(event) => setCreateReportTitle(event.target.value)}
              />
            </div>

            <div className="space-y-1 text-sm text-muted-foreground">
              <p>Khoảng thời gian: {selectedDateRangeLabel}</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setIsCreateReportDialogOpen(false)}
                disabled={isCreatingReport}
              >
                Hủy
              </Button>
              <Button onClick={handleSubmitCreateReport} disabled={isCreatingReport}>
                {isCreatingReport ? "Đang tạo..." : "Tạo báo cáo"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
