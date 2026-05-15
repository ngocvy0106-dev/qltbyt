"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Search,
  Plus,
  Wrench,
  Clock,
  CheckCircle,
  CheckCircle2,
  Package,
  AlertCircle,
  Eye,
  MoreHorizontal,
  FileText,
  User,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type RepairStatus = "pending" | "assigned" | "in_progress" | "waiting_parts" | "completed"

interface RepairItem {
  id: number
  code: string
  deviceId?: number | null
  device: string
  issue: string
  reporter: string
  department: string
  priority: string
  status: RepairStatus
  technician: string
  assigneeUserId?: number | null
  createdAt?: string | null
  startDate?: string | null
  estimatedEnd?: string | null
  progress: string
  part: string
  vendor: string
  orderedDate?: string | null
  expectedArrival?: string | null
  cost: number
  completedDate?: string | null
  completedTime?: string | null
  result: string
}

interface RepairsSummary {
  pending: number
  inProgress: number
  completedThisMonth: number
}

interface DeviceOption {
  id: number
  code?: string | null
  name: string
  departmentName?: string | null
}

interface DepartmentOption {
  id: number
  name: string
}

interface LoggedInUser {
  id?: number
  username?: string
  fullName?: string
  role?: string
  departmentName?: string | null
  department_name?: string | null
  department?: string | null
}

interface TechnicianOption {
  id: number
  name: string
  username?: string
  departmentName?: string
}

function normalizeText(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
}

function getPriorityBadge(priority: string) {
  switch (priority) {
    case "critical":
      return <Badge className="bg-destructive/20 text-destructive border-0">Khẩn cấp</Badge>
    case "high":
      return <Badge className="bg-warning/20 text-warning border-0">Cao</Badge>
    case "medium":
      return <Badge className="bg-info/20 text-info border-0">Trung bình</Badge>
    case "low":
      return <Badge className="bg-muted text-muted-foreground border-0">Thấp</Badge>
    default:
      return <Badge variant="outline">{priority}</Badge>
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge className="bg-warning/20 text-warning border-0"><Clock className="h-3 w-3 mr-1" />Chờ xử lý</Badge>
    case "assigned":
      return <Badge className="bg-info/20 text-info border-0"><CheckCircle className="h-3 w-3 mr-1" />Đã duyệt</Badge>
    case "in_progress":
      return <Badge className="bg-primary/20 text-primary border-0"><Wrench className="h-3 w-3 mr-1" />Đang sửa</Badge>
    case "waiting_parts":
      return <Badge className="bg-destructive/20 text-destructive border-0"><Package className="h-3 w-3 mr-1" />Chờ phụ tùng</Badge>
    case "completed":
      return <Badge className="bg-primary/20 text-primary border-0"><CheckCircle className="h-3 w-3 mr-1" />Hoàn thành</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

const statusClass: Record<RepairStatus, string> = {
  pending: "bg-warning/20 text-warning",
  assigned: "bg-info/20 text-info",
  in_progress: "bg-primary/20 text-primary",
  waiting_parts: "bg-destructive/20 text-destructive",
  completed: "bg-primary/20 text-primary",
}

const statusLabel: Record<RepairStatus, string> = {
  pending: "Chờ xử lý",
  assigned: "Đã duyệt",
  in_progress: "Đang sửa",
  waiting_parts: "Chờ phụ tùng",
  completed: "Hoàn thành",
}

const priorityClass: Record<string, string> = {
  critical: "bg-destructive/20 text-destructive",
  high: "bg-warning/20 text-warning",
  medium: "bg-info/20 text-info",
  low: "bg-muted text-muted-foreground",
}

const priorityLabel: Record<string, string> = {
  critical: "Khẩn cấp",
  high: "Cao",
  medium: "Trung bình",
  low: "Thấp",
}

export function RepairPage() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("requests")
  const [search, setSearch] = useState("")
  const [items, setItems] = useState<RepairItem[]>([])
  const [summary, setSummary] = useState<RepairsSummary>({
    pending: 0,
    inProgress: 0,
    completedThisMonth: 0,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([])
  const [departmentOptions, setDepartmentOptions] = useState<DepartmentOption[]>([])
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser>({})
  const [selectedDeviceId, setSelectedDeviceId] = useState("")
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("")
  const [selectedPriority, setSelectedPriority] = useState("")
  const [selectedTechnicianId, setSelectedTechnicianId] = useState("")
  const [issueDescription, setIssueDescription] = useState("")
  const [reporterName, setReporterName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [technicianOptions, setTechnicianOptions] = useState<TechnicianOption[]>([])
  const [selectedRepairItem, setSelectedRepairItem] = useState<RepairItem | null>(null)
  const [selectedAssigneeId, setSelectedAssigneeId] = useState("")
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false)
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false)
  const [isAcceptDialogOpen, setIsAcceptDialogOpen] = useState(false)
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false)
  const [confirmDialogTitle, setConfirmDialogTitle] = useState("")
  const [confirmDialogMessage, setConfirmDialogMessage] = useState("")
  const [confirmDialogAction, setConfirmDialogAction] = useState<"approve" | "complete" | null>(null)
  const [confirmRepairItem, setConfirmRepairItem] = useState<RepairItem | null>(null)
  const [acceptRepairItem, setAcceptRepairItem] = useState<RepairItem | null>(null)
  const [acceptEstimatedEndDate, setAcceptEstimatedEndDate] = useState("")
  const [acceptHasMissingParts, setAcceptHasMissingParts] = useState(false)
  const [acceptMissingPartName, setAcceptMissingPartName] = useState("")
  const [acceptEstimatedCost, setAcceptEstimatedCost] = useState("")
  const [completingRepairId, setCompletingRepairId] = useState<number | null>(null)
  const [isPartsEtaDialogOpen, setIsPartsEtaDialogOpen] = useState(false)
  const [partsEtaRepairItem, setPartsEtaRepairItem] = useState<RepairItem | null>(null)
  const [partsEtaDate, setPartsEtaDate] = useState("")
  const [mounted, setMounted] = useState(false)
  const prevDataJsonRef = useRef<string | null>(null)

  const isDepartmentEmployee = useMemo(() => {
    const roleText = normalizeText(loggedInUser.role || "")
    return roleText.includes("nhan vien") || roleText.includes("nhan-vien")
  }, [loggedInUser.role])

  const isAdminRole = useMemo(() => {
    const roleText = normalizeText(loggedInUser.role || "")
    return roleText.includes("admin")
  }, [loggedInUser.role])

  const formatDate = (value?: string | null) => {
    if (!value) {
      return "-"
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return String(value)
    }

    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date)
  }

  const formatDateTime = (value?: string | null) => {
    if (!value) {
      return "-"
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return String(value)
    }

    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  }

  const formatCurrency = (value?: number) => `${Number(value || 0).toLocaleString("vi-VN")} VNĐ`

  const toDateInputValue = (value?: string | null) => {
    if (!value) {
      return ""
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return ""
    }

    const yyyy = date.getFullYear()
    const mm = String(date.getMonth() + 1).padStart(2, "0")
    const dd = String(date.getDate()).padStart(2, "0")

    return `${yyyy}-${mm}-${dd}`
  }

  const requestItems = useMemo(
    () => items.filter((item) => item.status === "pending" || item.status === "assigned"),
    [items]
  )
  const inProgressItems = useMemo(
    () => items.filter((item) => item.status === "in_progress"),
    [items]
  )
  const historyItems = useMemo(
    () => items.filter((item) => item.status === "completed"),
    [items]
  )

  const loadRepairData = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      if (search.trim()) {
        params.set("search", search.trim())
      }

      const role = String(loggedInUser.role || "").trim()
      const requester = String(loggedInUser.fullName || "").trim()
      const requesterAlt = String(loggedInUser.username || "").trim()

      if (role) {
        params.set("role", role)
      }

      if (requester) {
        params.set("requester", requester)
      }

      if (requesterAlt) {
        params.set("requesterAlt", requesterAlt)
      }

      const userId = String(loggedInUser.id || "").trim()
      if (userId) {
        params.set("userId", userId)
      }

      const response = await fetch(`${apiBaseUrl}/api/repairs?${params.toString()}`, {
        cache: "no-store",
      })

      if (!response.ok) {
        setItems([])
        setSummary({ pending: 0, inProgress: 0, completedThisMonth: 0 })
        return
      }

      const data = (await response.json()) as {
        items?: RepairItem[]
        summary?: RepairsSummary
      }

      const itemsRes = data.items || []
      const summaryRes = data.summary || { pending: 0, inProgress: 0, completedThisMonth: 0 }

      // Only update state when the fetched data actually changed to avoid unnecessary reloads
      try {
        // Build a stable snapshot that excludes volatile fields (like updated_at)
        const stableItems = (itemsRes || []).map((it) => ({
          id: it.id,
          code: it.code,
          deviceId: it.deviceId,
          device: it.device,
          issue: it.issue,
          reporter: it.reporter,
          department: it.department,
          priority: it.priority,
          status: it.status,
          assigneeUserId: it.assigneeUserId,
          technician: it.technician,
          createdAt: it.createdAt,
        }))

        const newJson = JSON.stringify({ items: stableItems, summary: summaryRes })
        if (prevDataJsonRef.current !== newJson) {
          prevDataJsonRef.current = newJson
          setItems(itemsRes)
          setSummary(summaryRes)
        }
      } catch (e) {
        // Fallback: if serialization fails, update state to be safe
        setItems(itemsRes)
        setSummary(summaryRes)
      }
    } catch {
      setItems([])
      setSummary({ pending: 0, inProgress: 0, completedThisMonth: 0 })
    } finally {
      setIsLoading(false)
    }
  }

  const loadDialogOptions = async () => {
    try {
      const roleText = String(loggedInUser.role || "").trim()
      const departmentText = String(loggedInUser.departmentName || "").trim()

      const buildDeviceQuery = (includeEmployeeScope: boolean) => {
        const params = new URLSearchParams()

        if (roleText) {
          params.set("role", roleText)
        }

        if (departmentText) {
          params.set("departmentName", departmentText)
        }

        if (includeEmployeeScope && isDepartmentEmployee) {
          const requester = String(loggedInUser.fullName || "").trim()
          const requesterAlt = String(loggedInUser.username || "").trim()
          const userId = String(loggedInUser.id || "").trim()

          if (requester) {
            params.set("requester", requester)
          }

          if (requesterAlt) {
            params.set("requesterAlt", requesterAlt)
          }

          if (userId) {
            params.set("userId", userId)
          }
        }

        return params.toString()
      }

      const fetchDevices = async (includeEmployeeScope: boolean) => {
        const deviceQuery = buildDeviceQuery(includeEmployeeScope)
        const response = await fetch(`${apiBaseUrl}/api/devices${deviceQuery ? `?${deviceQuery}` : ""}`, {
          cache: "no-store",
        })

        if (!response.ok) {
          return [] as Array<{ id: number; code?: string | null; name: string; departmentName?: string | null }>
        }

        const devicesData = (await response.json()) as {
          devices?: Array<{ id: number; code?: string | null; name: string; departmentName?: string | null }>
        }

        return devicesData.devices || []
      }

      const [devicesWithScope, departmentsRes, usersRes] = await Promise.all([
        fetchDevices(true),
        fetch(`${apiBaseUrl}/api/departments/summary`, { cache: "no-store" }),
        fetch(`${apiBaseUrl}/api/users/summary`, { cache: "no-store" }),
      ])

      const devicesData = devicesWithScope.length > 0 ? devicesWithScope : await fetchDevices(false)
      setDeviceOptions(
        devicesData.map((item) => ({
          id: item.id,
          code: item.code || null,
          name: item.name,
          departmentName: item.departmentName || null,
        }))
      )

      if (departmentsRes.ok) {
        const departmentsData = (await departmentsRes.json()) as {
          departments?: Array<{ id: number; name: string }>
        }
        setDepartmentOptions(
          departmentsData.departments?.map((item) => ({ id: item.id, name: item.name })) || []
        )
      }

      if (usersRes.ok) {
        const usersData = (await usersRes.json()) as {
          users?: Array<{
            id: number
            name?: string
            username?: string
            role?: string
            department?: string | null
            departmentName?: string | null
          }>
        }

        const currentUserId = Number(loggedInUser.id || 0)
        const currentUsername = normalizeText(String(loggedInUser.username || ""))
        const currentFullName = normalizeText(String(loggedInUser.fullName || ""))
        const matchedCurrentUser = (usersData.users || []).find((item) => {
          const itemUsername = normalizeText(String(item.username || ""))
          const itemFullName = normalizeText(String(item.name || ""))
          return (
            (Number.isInteger(currentUserId) && currentUserId > 0 && Number(item.id) === currentUserId) ||
            (currentUsername && itemUsername === currentUsername) ||
            (currentFullName && itemFullName === currentFullName)
          )
        })

        const resolvedDepartmentName = String(
          matchedCurrentUser?.departmentName || matchedCurrentUser?.department || ""
        ).trim()

        if (resolvedDepartmentName && resolvedDepartmentName !== String(loggedInUser.departmentName || "").trim()) {
          setLoggedInUser((current) => ({
            ...current,
            departmentName: resolvedDepartmentName,
          }))
        }

        const technicians = (usersData.users || [])
          .filter((item) => {
            const roleText = normalizeText(String(item.role || ""))
            return roleText.includes("nhan vien") || roleText.includes("nhan-vien")
          })
          .map((item) => ({
            id: Number(item.id || 0),
            name: String(item.name || item.username || "").trim(),
            username: String(item.username || "").trim() || undefined,
            departmentName: String(item.departmentName || item.department || "").trim() || undefined,
          }))
          .filter((item) => item.id > 0 && item.name)

        setTechnicianOptions(technicians)
      }
    } catch {
      setDeviceOptions([])
      setDepartmentOptions([])
      setTechnicianOptions([])
    }
  }

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem("user")
      if (!storedUser) {
        setLoggedInUser({})
        return
      }

      const parsedUser = JSON.parse(storedUser) as LoggedInUser
      const normalizedDepartmentName =
        String(parsedUser.departmentName || parsedUser.department_name || parsedUser.department || "")
          .trim() || null

      setLoggedInUser({
        ...parsedUser,
        departmentName: normalizedDepartmentName,
      })
    } catch {
      setLoggedInUser({})
    }
    setMounted(true)
  }, [])

  useEffect(() => {
    const displayName =
      String(loggedInUser.fullName || "").trim() ||
      String(loggedInUser.username || "").trim()

    if (displayName) {
      setReporterName(displayName)
    }
  }, [loggedInUser.fullName, loggedInUser.username])

  useEffect(() => {
    loadRepairData()
  }, [apiBaseUrl, search, loggedInUser.role, loggedInUser.fullName, loggedInUser.username, loggedInUser.id])

  useEffect(() => {
    const refreshRepairData = () => {
      void loadRepairData()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshRepairData()
      }
    }

    window.addEventListener("focus", refreshRepairData)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    const intervalId = window.setInterval(refreshRepairData, 8000)

    return () => {
      window.removeEventListener("focus", refreshRepairData)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.clearInterval(intervalId)
    }
  }, [apiBaseUrl, search])

  useEffect(() => {
    const tab = searchParams.get("tab")
    if (["requests", "in-progress", "history"].includes(tab || "")) {
      setActiveTab(tab as string)
    }
  }, [searchParams])

  useEffect(() => {
    loadDialogOptions()
  }, [apiBaseUrl, loggedInUser.role, loggedInUser.departmentName])

  useEffect(() => {
    const userDepartment = normalizeText(String(loggedInUser.departmentName || ""))
    if (!userDepartment || !departmentOptions.length) {
      return
    }

    const matched = departmentOptions.find((item) => normalizeText(item.name) === userDepartment)
    if (matched) {
      setSelectedDepartmentId(String(matched.id))
    }
  }, [departmentOptions, loggedInUser.departmentName])

  useEffect(() => {
    setSelectedDeviceId("")
  }, [selectedDepartmentId])

  useEffect(() => {
    setSelectedTechnicianId("")
  }, [selectedDepartmentId])

  const selectedDepartmentName = useMemo(() => {
    if (!selectedDepartmentId) {
      return String(loggedInUser.departmentName || "").trim()
    }

    const matched = departmentOptions.find((item) => String(item.id) === selectedDepartmentId)
    return String(matched?.name || "").trim()
  }, [departmentOptions, selectedDepartmentId, loggedInUser.departmentName])

  const filteredDeviceOptions = useMemo(() => {
    const departmentText = normalizeText(selectedDepartmentName)
    const openRepairDeviceIds = new Set(
      items
        .filter((item) => item.status !== "completed" && Number.isInteger(item.deviceId))
        .map((item) => Number(item.deviceId))
    )

    const byDepartment = !departmentText
      ? deviceOptions
      : deviceOptions.filter(
          (item) => normalizeText(String(item.departmentName || "")) === departmentText
        )

    if (!isDepartmentEmployee) {
      return byDepartment
    }

    return byDepartment.filter((item) => !openRepairDeviceIds.has(Number(item.id)))
  }, [deviceOptions, selectedDepartmentName, items, isDepartmentEmployee])

  const filteredTechnicianOptions = useMemo(() => {
    const departmentText = normalizeText(selectedDepartmentName)
    if (!departmentText) {
      return technicianOptions
    }

    return technicianOptions.filter(
      (item) => normalizeText(String(item.departmentName || "")) === departmentText
    )
  }, [selectedDepartmentName, technicianOptions])

  const displayDepartmentName =
    String(selectedDepartmentName || loggedInUser.departmentName || loggedInUser.department || "").trim() ||
    "Chưa xác định"

  const shouldShowDepartmentLists = Boolean(selectedDepartmentName)

  const showRequestActionsColumn = isAdminRole || isDepartmentEmployee

  const handleOpenCreateDialog = () => {
    if (isDepartmentEmployee && loggedInUser.departmentName && departmentOptions.length > 0) {
      const userDepartment = normalizeText(String(loggedInUser.departmentName || ""))
      const matched = departmentOptions.find((item) => normalizeText(item.name) === userDepartment)

      if (matched) {
        setSelectedDepartmentId(String(matched.id))
      }
    }

    setSelectedDeviceId("")
    setSelectedPriority("")
    setIssueDescription("")
    setSelectedTechnicianId("")

    setIsCreateDialogOpen(true)
  }

  const handleSubmitRepairRequest = async () => {
    const deviceId = Number(selectedDeviceId)
    const departmentName = String(selectedDepartmentName || "").trim()
    const normalizedReporter = String(reporterName || "").trim()
    const normalizedIssue = String(issueDescription || "").trim()
    const priorityValue = String(selectedPriority || "").trim() || "medium"
    const selectedDevice = deviceOptions.find((item) => Number(item.id) === deviceId)
    const selectedAssignee = isAdminRole
      ? technicianOptions.find((item) => String(item.id) === selectedTechnicianId)
      : null
    const assigneeName = String(selectedAssignee?.name || "").trim()
    const assigneeUserId = Number(selectedTechnicianId)

    if (!Number.isInteger(deviceId) || deviceId <= 0) {
      alert("Vui lòng chọn thiết bị")
      return
    }

    if (!normalizedIssue) {
      alert("Vui lòng nhập mô tả sự cố")
      return
    }

    if (!departmentName) {
      alert("Vui lòng chọn khoa/phòng")
      return
    }

    if (isAdminRole && !assigneeName) {
      alert("Vui lòng chọn nhân viên xử lý")
      return
    }

    try {
      setIsSubmitting(true)

      const response = await fetch(`${apiBaseUrl}/api/repairs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actorUserId: Number(loggedInUser.id || 0) || undefined,
          deviceId,
          issueDescription: normalizedIssue,
          reporterName: normalizedReporter,
          departmentName,
          priority: priorityValue,
        }),
      })

      console.log(`[DEBUG Frontend] POST /api/repairs response status: ${response.status}`)

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        console.log(`[DEBUG Frontend] POST failed with message:`, data?.message)
        alert(data?.message || "Gửi yêu cầu sửa chữa thất bại")
        return
      }

      const responseData = (await response.json().catch(() => null)) as { id?: number; requestCode?: string } | null
      console.log(`[DEBUG Frontend] POST succeeded with ID: ${responseData?.id}, Code: ${responseData?.requestCode}`)
      const requestCode = String(responseData?.requestCode || `RP${Date.now().toString().slice(-6)}`)
      const nowIso = new Date().toISOString()
      const shouldAssignTechnician = Boolean(isAdminRole && assigneeUserId > 0 && responseData?.id)

      if (shouldAssignTechnician) {
        const assignResponse = await fetch(`${apiBaseUrl}/api/repairs/${responseData?.id}/assign`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            actorUserId: Number(loggedInUser.id || 0) || undefined,
            assigneeUserId,
          }),
        })

        if (!assignResponse.ok) {
          const assignData = (await assignResponse.json().catch(() => null)) as { message?: string } | null
          alert(assignData?.message || "Phân công nhân viên xử lý thất bại")
        }
      }

      setItems((prev) => [
        {
          id: Number(responseData?.id || Date.now()),
          code: requestCode,
          deviceId,
          device: `${String(selectedDevice?.code || "").trim() || "Không mã"} - ${String(selectedDevice?.name || "Thiết bị chưa xác định").trim()}`,
          issue: normalizedIssue,
          reporter: normalizedReporter || String(loggedInUser.fullName || loggedInUser.username || "-"),
          department: departmentName,
          priority: priorityValue,
          status: shouldAssignTechnician ? "assigned" : "pending",
          technician: assigneeName || "-",
          createdAt: nowIso,
          progress: "-",
          part: "-",
          vendor: "-",
          cost: 0,
          result: "Thành công",
        },
        ...prev,
      ])

      setSummary((prev) => ({
        ...prev,
        pending: shouldAssignTechnician ? prev.pending : prev.pending + 1,
      }))

      toast({
        description: shouldAssignTechnician
          ? "Đã tạo lịch sửa chữa và thông báo nhân viên"
          : "Đã gửi yêu cầu cho Admin duyệt",
        duration: 2000,
        className: "border-emerald-200 bg-emerald-50 text-emerald-900 rounded-2xl px-4 py-3 shadow-lg",
      })
      setIsCreateDialogOpen(false)
      setIssueDescription("")
      setSelectedPriority("")
      setSelectedDeviceId("")
      setSelectedTechnicianId("")
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsSubmitting(false)
    }
  }

  const openConfirmDialog = (action: "approve" | "complete", item: RepairItem, title: string, message: string) => {
    setConfirmDialogAction(action)
    setConfirmRepairItem(item)
    setConfirmDialogTitle(title)
    setConfirmDialogMessage(message)
    setIsConfirmDialogOpen(true)
  }

  const handleApproveRepairTask = (item: RepairItem) => {
    openConfirmDialog(
      "approve",
      item,
      `Duyệt yêu cầu sửa chữa ${item.code}?`,
      "Bạn có chắc muốn duyệt yêu cầu sửa chữa này không?"
    )
  }

  const performApproveRepairTask = async (item: RepairItem) => {
    try {
      setIsSubmitting(true)

      const response = await fetch(`${apiBaseUrl}/api/repairs/${item.id}/assign`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actorUserId: Number(loggedInUser.id || 0) || undefined,
          status: "assigned",
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "Duyệt yêu cầu thất bại")
        return
      }

      await loadRepairData()
      toast({
        description: "Đã duyệt yêu cầu sửa chữa",
        duration: 2000,
        className:
          "border-emerald-200 bg-emerald-50 text-emerald-900 rounded-2xl px-4 py-3 shadow-lg",
      })
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmRepairTask = async (item: RepairItem) => {
    if (!isDepartmentEmployee || item.status !== "assigned") {
      return
    }

    try {
      setIsSubmitting(true)

      const response = await fetch(`${apiBaseUrl}/api/repairs/${item.id}/confirm`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actorUserId: Number(loggedInUser.id || 0) || undefined,
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "Xác nhận nhận việc thất bại")
        return
      }

      setActiveTab("in-progress")
      await loadRepairData()
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleOpenDetailDialog = (item: RepairItem) => {
    setSelectedRepairItem(item)
    setIsDetailDialogOpen(true)
  }

  const handleAssignTechnician = async () => {
    if (!selectedRepairItem) {
      return
    }

    try {
      setIsSubmitting(true)

      const response = await fetch(`${apiBaseUrl}/api/repairs/${selectedRepairItem.id}/assign`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          selectedAssigneeId.trim()
            ? {
                actorUserId: Number(loggedInUser.id || 0) || undefined,
                assigneeUserId: Number(selectedAssigneeId),
              }
            : {
                actorUserId: Number(loggedInUser.id || 0) || undefined,
                status: "assigned",
              }
        ),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "Phân công nhân viên xử lý thất bại")
        return
      }

      setIsAssignDialogOpen(false)
      setSelectedRepairItem(null)
      await loadRepairData()
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAcceptRepairTask = async (item: RepairItem) => {
    setAcceptRepairItem(item)
    setAcceptEstimatedEndDate(toDateInputValue(item.estimatedEnd))
    setAcceptHasMissingParts(false)
    setAcceptMissingPartName("")
    setAcceptEstimatedCost("")
    setIsAcceptDialogOpen(true)
  }

  const handleSubmitAcceptRepairTask = async () => {
    if (!acceptRepairItem) {
      return
    }

    const assigneeName =
      String(loggedInUser.fullName || "").trim() ||
      String(loggedInUser.username || "").trim()

    const normalizedEstimatedEndDate = String(acceptEstimatedEndDate || "").trim()
    const normalizedMissingPartName = String(acceptMissingPartName || "").trim()
    const normalizedCostText = String(acceptEstimatedCost || "").trim().replace(/,/g, "")
    const estimatedCostValue = normalizedCostText ? Number(normalizedCostText) : 0

    if (!assigneeName) {
      alert("Không xác định được nhân viên xử lý")
      return
    }

    if (!normalizedEstimatedEndDate) {
      alert("Vui lòng nhập ngày dự kiến hoàn thành")
      return
    }

    if (acceptHasMissingParts && !normalizedMissingPartName) {
      alert("Vui lòng nhập phụ tùng thiếu")
      return
    }

    if (!Number.isFinite(estimatedCostValue) || estimatedCostValue < 0) {
      alert("Chi phí dự kiến không hợp lệ")
      return
    }

    try {
      setIsSubmitting(true)

      const response = await fetch(`${apiBaseUrl}/api/repairs/${acceptRepairItem.id}/accept`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actorUserId: Number(loggedInUser.id || 0) || undefined,
          estimatedEndDate: normalizedEstimatedEndDate,
          hasMissingParts: acceptHasMissingParts,
          missingPartName: acceptHasMissingParts ? normalizedMissingPartName : "",
          estimatedCost: acceptHasMissingParts ? estimatedCostValue : 0,
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "Nhận việc thất bại")
        return
      }

      const nextStatus: RepairStatus = acceptHasMissingParts ? "waiting_parts" : "in_progress"
      const nowIso = new Date().toISOString()

      setItems((prev) =>
        prev.map((repairItem) =>
          repairItem.id === acceptRepairItem.id
            ? {
                ...repairItem,
                status: nextStatus,
                technician: assigneeName,
                startDate: repairItem.startDate || nowIso,
                estimatedEnd: normalizedEstimatedEndDate,
                part: acceptHasMissingParts ? normalizedMissingPartName : repairItem.part,
                cost: acceptHasMissingParts ? estimatedCostValue : repairItem.cost,
                orderedDate: acceptHasMissingParts ? repairItem.orderedDate || nowIso : repairItem.orderedDate,
                expectedArrival: acceptHasMissingParts ? normalizedEstimatedEndDate : repairItem.expectedArrival,
              }
            : repairItem
        )
      )

      setIsAcceptDialogOpen(false)
      setAcceptRepairItem(null)
      setAcceptEstimatedEndDate("")
      setAcceptHasMissingParts(false)
      setAcceptMissingPartName("")
      setAcceptEstimatedCost("")

      setActiveTab("in-progress")
      toast({
        description: "Nhận việc thành công",
        duration: 2000,
        className: "border-emerald-200 bg-emerald-50 text-emerald-900 rounded-2xl px-4 py-3 shadow-lg",
      })
      await loadRepairData()
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCompleteRepairTask = (item: RepairItem) => {
    openConfirmDialog(
      "complete",
      item,
      `Xác nhận hoàn thành công việc ${item.code}?`,
      "Bạn có chắc muốn xác nhận hoàn thành công việc này không?"
    )
  }

  const performCompleteRepairTask = async (item: RepairItem) => {
    try {
      setCompletingRepairId(item.id)

      const response = await fetch(`${apiBaseUrl}/api/repairs/${item.id}/complete`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actorUserId: Number(loggedInUser.id || 0) || undefined,
          result: "Hoàn thành sửa chữa",
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "Cập nhật hoàn thành thất bại")
        return
      }

      const completedAt = new Date().toISOString()
      setItems((prev) =>
        prev.map((repairItem) =>
          repairItem.id === item.id
            ? {
                ...repairItem,
                status: "completed",
                completedDate: completedAt,
                completedTime: completedAt,
                progress: "Hoàn thành sửa chữa",
                result: "Hoàn thành sửa chữa",
              }
            : repairItem
        )
      )

      toast({
        description: "Đã chuyển trạng thái: Hoàn thành sửa chữa",
        duration: 2000,
        className: "border-emerald-200 bg-emerald-50 text-emerald-900 rounded-2xl px-4 py-3 shadow-lg",
      })
      await loadRepairData()
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setCompletingRepairId(null)
    }
  }

  const handleConfirmDialogSubmit = async () => {
    if (!confirmDialogAction || !confirmRepairItem) {
      setIsConfirmDialogOpen(false)
      return
    }

    const action = confirmDialogAction
    const item = confirmRepairItem
    setIsConfirmDialogOpen(false)
    setConfirmDialogAction(null)
    setConfirmRepairItem(null)

    if (action === "approve") {
      await performApproveRepairTask(item)
      return
    }

    if (action === "complete") {
      await performCompleteRepairTask(item)
    }
  }

  const handleOpenPartsEtaDialog = (item: RepairItem) => {
    setPartsEtaRepairItem(item)
    setPartsEtaDate(toDateInputValue(item.expectedArrival || item.estimatedEnd))
    setIsPartsEtaDialogOpen(true)
  }

  const handleSubmitPartsEta = async () => {
    if (!partsEtaRepairItem) {
      return
    }

    const normalizedEtaDate = String(partsEtaDate || "").trim()
    const updatedBy = String(loggedInUser.fullName || loggedInUser.username || "").trim()

    if (!normalizedEtaDate) {
      alert("Vui lòng nhập ngày dự kiến có phụ tùng")
      return
    }

    try {
      setIsSubmitting(true)

      const response = await fetch(`${apiBaseUrl}/api/repairs/${partsEtaRepairItem.id}/parts-eta`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedArrivalDate: normalizedEtaDate,
          updatedBy,
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "Cập nhật dự kiến phụ tùng thất bại")
        return
      }

      setItems((prev) =>
        prev.map((repairItem) =>
          repairItem.id === partsEtaRepairItem.id
            ? {
                ...repairItem,
                status: "waiting_parts",
                expectedArrival: normalizedEtaDate,
                progress: updatedBy
                  ? `Admin ${updatedBy} cập nhật dự kiến có phụ tùng: ${normalizedEtaDate}`
                  : `Cập nhật dự kiến có phụ tùng: ${normalizedEtaDate}`,
              }
            : repairItem
        )
      )

      setIsPartsEtaDialogOpen(false)
      setPartsEtaRepairItem(null)
      setPartsEtaDate("")
      toast({
        description: "Đã cập nhật dự kiến có phụ tùng và gửi thông báo cho nhân viên xử lý",
        duration: 2000,
        className: "border-emerald-200 bg-emerald-50 text-emerald-900 rounded-2xl px-4 py-3 shadow-lg",
      })
      await loadRepairData()
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">SỬA CHỮA</h1>
        </div>
        {(isAdminRole || isDepartmentEmployee) && (
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button 
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleOpenCreateDialog}
            >
              <Plus className="h-4 w-4 mr-2" />
              {isAdminRole ? "Tạo lịch sửa chữa" : "Tạo yêu cầu sửa chữa"}
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border max-w-2xl">
            <DialogHeader>
              <DialogTitle>Tạo yêu cầu sửa chữa mới</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Thiết bị</Label>
                  {shouldShowDepartmentLists ? (
                    <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3 max-h-40 overflow-auto">
                      {filteredDeviceOptions.length === 0 ? (
                        <div className="text-sm text-muted-foreground">Không có thiết bị khả dụng trong khoa đã chọn</div>
                      ) : filteredDeviceOptions.map((item) => {
                        const deviceId = String(item.id)
                        const deviceLabel = `${String(item.code || "").trim() || "Không mã"} - ${item.name}`

                        return (
                          <label key={item.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={selectedDeviceId === deviceId}
                              onCheckedChange={(checked) =>
                                setSelectedDeviceId(checked ? deviceId : "")
                              }
                            />
                            <span className="truncate" title={deviceLabel}>{deviceLabel}</span>
                          </label>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
                      Chọn khoa/phòng để xem thiết bị
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Độ ưu tiên</Label>
                  <Select value={selectedPriority || undefined} onValueChange={setSelectedPriority}>
                    <SelectTrigger className="bg-secondary border-border">
                      <SelectValue placeholder="Chọn độ ưu tiên" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Khẩn cấp</SelectItem>
                      <SelectItem value="high">Cao</SelectItem>
                      <SelectItem value="medium">Trung bình</SelectItem>
                      <SelectItem value="low">Thấp</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Mô tả sự cố</Label>
                <Textarea
                  placeholder="Mô tả chi tiết sự cố..."
                  className="bg-secondary border-border"
                  rows={4}
                  value={issueDescription}
                  onChange={(event) => setIssueDescription(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Người báo cáo</Label>
                  <Input
                    placeholder="Họ tên"
                    className="bg-secondary border-border"
                    value={mounted ? reporterName : ""}
                    disabled
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <Label>Khoa/Phòng</Label>
                  {isDepartmentEmployee ? (
                    <Input
                      className="bg-secondary border-border"
                      value={mounted ? displayDepartmentName : ""}
                      disabled
                      readOnly
                    />
                  ) : (
                    <Select
                      value={selectedDepartmentId || undefined}
                      onValueChange={setSelectedDepartmentId}
                    >
                      <SelectTrigger className="bg-secondary border-border">
                        <SelectValue placeholder="Chọn khoa/phòng" />
                      </SelectTrigger>
                      <SelectContent>
                        {departmentOptions.map((item) => (
                          <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
              {isAdminRole && (
                <div className="space-y-2">
                  <Label>Nhân viên xử lý</Label>
                  {shouldShowDepartmentLists ? (
                    <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3 max-h-40 overflow-auto">
                      {filteredTechnicianOptions.length === 0 ? (
                        <div className="text-sm text-muted-foreground">Không có nhân viên trong khoa đã chọn</div>
                      ) : filteredTechnicianOptions.map((item) => (
                        <label key={item.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={selectedTechnicianId === String(item.id)}
                            onCheckedChange={(checked) =>
                              setSelectedTechnicianId(checked ? String(item.id) : "")
                            }
                          />
                          <span className="truncate" title={item.name}>{item.name}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">
                      Chọn khoa/phòng để xem nhân viên
                    </div>
                  )}
                </div>
              )}
              <Button
                className="w-full bg-primary text-primary-foreground"
                onClick={handleSubmitRepairRequest}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Đang gửi..." : "Gửi yêu cầu"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmDialogTitle || "Xác nhận"}</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">
            {confirmDialogMessage || "Bạn có chắc muốn thực hiện thao tác này?"}
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setIsConfirmDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              className="bg-primary text-primary-foreground"
              onClick={handleConfirmDialogSubmit}
              disabled={isSubmitting || completingRepairId !== null}
            >
              Xác nhận
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stats */}
      {(isAdminRole || isDepartmentEmployee) && (
      <div className={`grid gap-4 ${isDepartmentEmployee ? "grid-cols-2 md:grid-cols-2" : "grid-cols-2 md:grid-cols-3"}`}>
        {!isDepartmentEmployee && (
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Yêu cầu mới</p>
                <p className="text-xl font-bold text-foreground">{summary.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        )}
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-info/20 flex items-center justify-center">
                <Wrench className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Đang sửa</p>
                <p className="text-xl font-bold text-foreground">{summary.inProgress}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hoàn thành tháng</p>
                <p className="text-xl font-bold text-foreground">{summary.completedThisMonth}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList className="bg-secondary">
            <TabsTrigger value="requests" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2">
              <AlertCircle className="h-4 w-4" />
              Yêu cầu
              <Badge className="ml-1 bg-warning/20 text-warning border-0 text-xs">{requestItems.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="in-progress" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2">
              <Wrench className="h-4 w-4" />
              Đang sửa
            </TabsTrigger>
            <TabsTrigger value="history" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary gap-2">
              <FileText className="h-4 w-4" />
              Lịch sử
            </TabsTrigger>
          </TabsList>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm kiếm..."
              className="pl-9 w-60 bg-secondary border-border"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <TabsContent value="requests" className="mt-6">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-center text-muted-foreground">Mã</TableHead>
                    <TableHead className="text-center text-muted-foreground">Thiết bị</TableHead>
                    <TableHead className="text-center text-muted-foreground">Sự cố</TableHead>
                    <TableHead className="text-center text-muted-foreground">Người báo</TableHead>
                    <TableHead className="text-center text-muted-foreground">Khoa</TableHead>
                    <TableHead className="text-center text-muted-foreground">Ưu tiên</TableHead>
                    <TableHead className="text-center text-muted-foreground">Trạng thái</TableHead>
                    {showRequestActionsColumn && <TableHead className="text-muted-foreground w-10"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow className="border-border">
                      <TableCell colSpan={showRequestActionsColumn ? 8 : 7} className="py-8 text-center text-muted-foreground">Đang tải dữ liệu sửa chữa...</TableCell>
                    </TableRow>
                  )}
                  {!isLoading && requestItems.length === 0 && (
                    <TableRow className="border-border">
                      <TableCell colSpan={showRequestActionsColumn ? 8 : 7} className="py-8 text-center text-muted-foreground">Chưa có dữ liệu sửa chữa</TableCell>
                    </TableRow>
                  )}
                  {!isLoading && requestItems.map((item) => (
                    <TableRow key={item.id} className="border-border">
                      <TableCell className="text-center"><Badge variant="outline" className="font-mono">{item.code}</Badge></TableCell>
                      <TableCell className="text-center font-medium">{item.device}</TableCell>
                      <TableCell className="text-center max-w-[200px] truncate">{item.issue}</TableCell>
                      <TableCell className="text-center">{item.reporter}</TableCell>
                      <TableCell className="text-center">{item.department}</TableCell>
                      <TableCell className="text-center">{getPriorityBadge(item.priority)}</TableCell>
                      <TableCell className="text-center">{getStatusBadge(item.status)}</TableCell>
                      {showRequestActionsColumn && (
                        <TableCell className="text-center">
                          {isDepartmentEmployee ? (
                            item.status === "assigned" ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full border border-primary/40 text-primary hover:bg-primary/10"
                                onClick={() => void handleConfirmRepairTask(item)}
                                disabled={isSubmitting}
                                aria-label="Xác nhận nhận việc"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )
                          ) : isAdminRole ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="bg-card border-border">
                                {item.status === "pending" && (
                                  <DropdownMenuItem className="gap-2" onClick={() => handleApproveRepairTask(item)}>
                                    <CheckCircle className="h-4 w-4" /> Duyệt
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem className="gap-2" onClick={() => handleOpenDetailDialog(item)}>
                                  <Eye className="h-4 w-4" /> Xem chi tiết
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="in-progress" className="mt-6">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-center text-muted-foreground">Mã</TableHead>
                    <TableHead className="text-center text-muted-foreground">Thiết bị</TableHead>
                    <TableHead className="text-center text-muted-foreground">Sự cố</TableHead>
                    <TableHead className="text-center text-muted-foreground">Nhân viên xử lý</TableHead>
                    <TableHead className="text-center text-muted-foreground">Bắt đầu</TableHead>
                    <TableHead className="text-center text-muted-foreground">Tiến độ</TableHead>
                    {isDepartmentEmployee && (
                      <TableHead className="text-center text-muted-foreground w-24">Hoàn tất</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow className="border-border">
                      <TableCell colSpan={isDepartmentEmployee ? 7 : 6} className="py-8 text-center text-muted-foreground">Đang tải dữ liệu sửa chữa...</TableCell>
                    </TableRow>
                  )}
                  {!isLoading && inProgressItems.length === 0 && (
                    <TableRow className="border-border">
                      <TableCell colSpan={isDepartmentEmployee ? 7 : 6} className="py-8 text-center text-muted-foreground">Không có yêu cầu đang sửa</TableCell>
                    </TableRow>
                  )}
                  {!isLoading && inProgressItems.map((item) => (
                    <TableRow key={item.id} className="border-border">
                      <TableCell className="text-center"><Badge variant="outline" className="font-mono">{item.code}</Badge></TableCell>
                      <TableCell className="text-center font-medium">{item.device}</TableCell>
                      <TableCell className="text-center max-w-[150px] truncate">{item.issue}</TableCell>
                      <TableCell className="text-center">{item.technician}</TableCell>
                      <TableCell className="text-center">{formatDateTime(item.startDate)}</TableCell>
                      <TableCell className="text-center">{getStatusBadge(item.status)}</TableCell>
                      {isDepartmentEmployee && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full border border-border"
                            onClick={() => handleCompleteRepairTask(item)}
                            disabled={completingRepairId === item.id}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-center text-muted-foreground">Mã</TableHead>
                    <TableHead className="text-center text-muted-foreground">Thiết bị</TableHead>
                    <TableHead className="text-center text-muted-foreground">Sự cố</TableHead>
                    <TableHead className="text-center text-muted-foreground">Nhân viên xử lý</TableHead>
                    <TableHead className="text-center text-muted-foreground">Hoàn thành</TableHead>
                    <TableHead className="text-center text-muted-foreground">Thời gian</TableHead>
                    <TableHead className="text-center text-muted-foreground">Kết quả</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow className="border-border">
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Đang tải dữ liệu sửa chữa...</TableCell>
                    </TableRow>
                  )}
                  {!isLoading && historyItems.length === 0 && (
                    <TableRow className="border-border">
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Chưa có lịch sử sửa chữa</TableCell>
                    </TableRow>
                  )}
                  {!isLoading && historyItems.map((item) => (
                    <TableRow key={item.id} className="border-border">
                      <TableCell className="text-center"><Badge variant="outline" className="font-mono">{item.code}</Badge></TableCell>
                      <TableCell className="text-center font-medium">{item.device}</TableCell>
                      <TableCell className="text-center">{item.issue}</TableCell>
                      <TableCell className="text-center">{item.technician}</TableCell>
                      <TableCell className="text-center">{formatDate(item.completedDate)}</TableCell>
                      <TableCell className="text-center">{formatDateTime(item.completedTime || item.completedDate)}</TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-primary/20 text-primary border-0">{item.result}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isAcceptDialogOpen} onOpenChange={setIsAcceptDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle>Nhận việc sửa chữa</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              <p><strong>Mã yêu cầu:</strong> {acceptRepairItem?.code || "-"}</p>
              <p><strong>Thiết bị:</strong> {acceptRepairItem?.device || "-"}</p>
            </div>

            <div className="space-y-2">
              <Label>Dự kiến hoàn thành</Label>
              <Input
                type="date"
                className="bg-secondary border-border"
                value={acceptEstimatedEndDate}
                onChange={(event) => setAcceptEstimatedEndDate(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Tình trạng phụ tùng</Label>
              <Select
                value={acceptHasMissingParts ? "missing" : "available"}
                onValueChange={(value) => setAcceptHasMissingParts(value === "missing")}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Chọn tình trạng phụ tùng" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Đủ phụ tùng</SelectItem>
                  <SelectItem value="missing">Thiếu phụ tùng</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {acceptHasMissingParts && (
              <>
                <div className="space-y-2">
                  <Label>Phụ tùng thiếu</Label>
                  <Input
                    placeholder="Nhập tên phụ tùng thiếu"
                    className="bg-secondary border-border"
                    value={acceptMissingPartName}
                    onChange={(event) => setAcceptMissingPartName(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Chi phí dự kiến (VNĐ)</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="Nhập chi phí dự kiến"
                    className="bg-secondary border-border"
                    value={acceptEstimatedCost}
                    onChange={(event) => setAcceptEstimatedCost(event.target.value)}
                  />
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsAcceptDialogOpen(false)}>Hủy</Button>
              <Button onClick={handleSubmitAcceptRepairTask} disabled={isSubmitting}>
                {isSubmitting ? "Đang lưu..." : "Xác nhận nhận việc"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle>Phân công nhân viên xử lý</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              <p><strong>Mã yêu cầu:</strong> {selectedRepairItem?.code || "-"}</p>
              <p><strong>Thiết bị:</strong> {selectedRepairItem?.device || "-"}</p>
            </div>

            <div className="space-y-2">
              <Label>Nhân viên xử lý</Label>
              <Select value={selectedAssigneeId || undefined} onValueChange={setSelectedAssigneeId}>
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue placeholder="Chọn nhân viên xử lý" />
                </SelectTrigger>
                <SelectContent>
                  {technicianOptions.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsAssignDialogOpen(false)}>Hủy</Button>
              <Button onClick={handleAssignTechnician} disabled={isSubmitting}>
                {isSubmitting ? "Đang lưu..." : "Lưu phân công"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isPartsEtaDialogOpen} onOpenChange={setIsPartsEtaDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle>Cập nhật dự kiến có phụ tùng</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              <p><strong>Mã yêu cầu:</strong> {partsEtaRepairItem?.code || "-"}</p>
              <p><strong>Thiết bị:</strong> {partsEtaRepairItem?.device || "-"}</p>
            </div>

            <div className="space-y-2">
              <Label>Ngày dự kiến có phụ tùng</Label>
              <Input
                type="date"
                className="bg-secondary border-border"
                value={partsEtaDate}
                onChange={(event) => setPartsEtaDate(event.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsPartsEtaDialogOpen(false)}>Hủy</Button>
              <Button onClick={handleSubmitPartsEta} disabled={isSubmitting}>
                {isSubmitting ? "Đang lưu..." : "Xác nhận"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">Chi tiết yêu cầu sửa chữa</DialogTitle>
          </DialogHeader>

          {selectedRepairItem ? (
            <div className="space-y-6 py-2">
              {/* Thông tin cơ bản */}
              <div className="rounded-lg bg-secondary/30 p-4 space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mã yêu cầu</p>
                    <p className="mt-1 text-lg font-bold text-foreground">{selectedRepairItem.code}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Trạng thái</p>
                    <div className="mt-1">
                      <Badge className={statusClass[selectedRepairItem.status]}>
                        {statusLabel[selectedRepairItem.status]}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Thông tin thiết bị */}
              <div className="rounded-lg bg-info/5 border border-info/20 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Thiết bị</h3>
                <div className="space-y-2 text-sm">
                  <p><span className="text-muted-foreground">Tên thiết bị:</span> <span className="font-medium text-foreground">{selectedRepairItem.device}</span></p>
                  <p><span className="text-muted-foreground">Khoa:</span> <span className="font-medium text-foreground">{selectedRepairItem.department}</span></p>
                </div>
              </div>

              {/* Thông tin sự cố */}
              <div className="rounded-lg bg-warning/5 border border-warning/20 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Sự cố</h3>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-muted-foreground mb-1">Mô tả sự cố:</p>
                    <p className="text-foreground bg-background/50 rounded p-2">{selectedRepairItem.issue}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-muted-foreground mb-1">Ưu tiên:</p>
                      <Badge className={priorityClass[selectedRepairItem.priority] || "bg-secondary/20 text-secondary"}>
                        {priorityLabel[selectedRepairItem.priority] || selectedRepairItem.priority}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Thông tin người báo và xử lý */}
              <div className="rounded-lg bg-success/5 border border-success/20 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Nhân sự</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground mb-1">Người báo:</p>
                    <p className="font-medium text-foreground">{selectedRepairItem.reporter}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Nhân viên xử lý:</p>
                    <p className="font-medium text-foreground">{selectedRepairItem.technician || "-"}</p>
                  </div>
                </div>
              </div>

              {/* Thông tin thời gian */}
              <div className="rounded-lg bg-muted/30 p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Ngày tạo</p>
                <p className="text-sm text-foreground font-medium">{formatDateTime(selectedRepairItem.createdAt)}</p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
