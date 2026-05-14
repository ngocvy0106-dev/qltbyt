"use client"

import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  MoreHorizontal,
  Play,
  Plus,
  Search,
  User,
  Wrench,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

type MaintenanceStatus = "pending" | "in_progress" | "completed"

interface MaintenanceItem {
  id: number
  code: string
  deviceId?: number | null
  deviceName: string
  note: string
  type: "Định kỳ" | "Khẩn cấp"
  dueDate: string
  technician: string
  status: MaintenanceStatus
  cost: number
}

interface MaintenanceSummary {
  total: number
  pending: number
  inProgress: number
  completed: number
  totalCost: number
}

interface DeviceOption {
  id: number
  name: string
  code: string
  departmentName?: string | null
  purchaseDate?: string | null
  maintenanceInterval?: number | null
}

interface DepartmentOption {
  id: number
  name: string
}

interface TechnicianOption {
  id: number
  name: string
  role?: string
  departmentName?: string | null
}

interface LoggedInUser {
  id?: number | string
  fullName?: string
  username?: string
  role?: string
  departmentName?: string | null
  department?: string | null
}

const statusClass: Record<MaintenanceStatus, string> = {
  pending: "bg-warning/20 text-warning",
  in_progress: "bg-info/20 text-info",
  completed: "bg-success/20 text-success",
}

const statusLabel: Record<MaintenanceStatus, string> = {
  pending: "Chờ xử lý",
  in_progress: "Đang thực hiện",
  completed: "Hoàn thành",
}

function renderStatusBadge(status: MaintenanceStatus) {
  const iconClass = "h-3.5 w-3.5"

  if (status === "pending") {
    return (
      <Badge className={`${statusClass[status]} gap-1.5`}>
        <Clock3 className={iconClass} />
        {statusLabel[status]}
      </Badge>
    )
  }

  if (status === "in_progress") {
    return (
      <Badge className={`${statusClass[status]} gap-1.5`}>
        <Play className={iconClass} />
        {statusLabel[status]}
      </Badge>
    )
  }

  return (
    <Badge className={`${statusClass[status]} gap-1.5`}>
      <CheckCircle2 className={iconClass} />
      {statusLabel[status]}
    </Badge>
  )
}

function normalizeText(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
}

function isNhanVienRole(value?: string | null) {
  const role = normalizeText(String(value || ""))
  return role.includes("nhan vien") || role.includes("nhan-vien")
}

function isAdminRole(value?: string | null) {
  const role = normalizeText(String(value || ""))
  return role.includes("admin")
}

function normalizeDepartmentValue(value?: string | null): string | null {
  const trimmed = String(value || "").trim()
  if (!trimmed) {
    return null
  }

  return trimmed
}

export function MaintenancePage() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"
  const [items, setItems] = useState<MaintenanceItem[]>([])
  const [summary, setSummary] = useState<MaintenanceSummary>({
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    totalCost: 0,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false)
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const { toast } = useToast()
  const [isDeletingId, setIsDeletingId] = useState<number | null>(null)
  const [isConfirmingId, setIsConfirmingId] = useState<number | null>(null)
  const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([])
  const [departmentOptions, setDepartmentOptions] = useState<DepartmentOption[]>([])
  const [technicianOptions, setTechnicianOptions] = useState<TechnicianOption[]>([])
  const [isUserHydrated, setIsUserHydrated] = useState(false)
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser>({})
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("")
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<number[]>([])
  const [selectedMaintenanceItem, setSelectedMaintenanceItem] = useState<MaintenanceItem | null>(null)
  const [selectedConfirmItem, setSelectedConfirmItem] = useState<MaintenanceItem | null>(null)
  const [selectedDeleteItem, setSelectedDeleteItem] = useState<MaintenanceItem | null>(null)
  const [confirmCost, setConfirmCost] = useState("")
  const [createForm, setCreateForm] = useState({
    deviceId: "",
    type: "Định kỳ",
    dueDate: "",
    technician: "",
    note: "",
  })

  const createdMessages: string[] = []
  const typeOptions = useMemo(
    () => Array.from(new Set(items.map((item) => String(item.type || "").trim()).filter(Boolean))),
    [items]
  )

  const statusOptions = useMemo(
    () =>
      Array.from(
        new Map(
          items
            .map((item) => {
              const rawStatus = String(item.status || "").trim()
              if (!rawStatus) {
                return null
              }

              const value = rawStatus.toLowerCase() as MaintenanceStatus
              const label = statusLabel[value] || rawStatus
              return [value, label] as const
            })
            .filter((item): item is readonly [MaintenanceStatus, string] => Boolean(item))
        )
      ).map(([value, label]) => ({ value, label })),
    [items]
  )

  const formatDate = (value: string) => {
    if (!value) {
      return "-"
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return value
    }

    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(date)
  }

  function computeDueDateFromPurchase(purchase: string | null | undefined, intervalMonths: unknown) {
    if (!purchase) return null
    const months = Number(intervalMonths)
    if (!Number.isFinite(months) || months <= 0) return null

    const d = new Date(String(purchase))
    if (Number.isNaN(d.getTime())) return null

    const result = new Date(d.getTime())
    result.setMonth(result.getMonth() + months)

    const yyyy = result.getFullYear()
    const mm = String(result.getMonth() + 1).padStart(2, "0")
    const dd = String(result.getDate()).padStart(2, "0")
    return `${yyyy}-${mm}-${dd}` // ISO date for input value
  }

  const formatCurrency = (value: number) =>
    `${Number(value || 0).toLocaleString("vi-VN")} ₫`

  const selectedDepartmentName = useMemo(() => {
    const matched = departmentOptions.find((item) => String(item.id) === selectedDepartmentId)
    return String(matched?.name || "").trim()
  }, [departmentOptions, selectedDepartmentId])

  const filteredDepartmentDevices = useMemo(() => {
    const departmentText = normalizeText(selectedDepartmentName)

    if (!departmentText) {
      return []
    }

    return deviceOptions.filter(
      (device) => normalizeText(String(device.departmentName || "")) === departmentText
    )
  }, [deviceOptions, selectedDepartmentName])

  useEffect(() => {
    setSelectedDeviceIds([])
  }, [selectedDepartmentId])

  const loadMaintenance = async () => {
    try {
      setIsLoading(true)

      const params = new URLSearchParams()
      if (search.trim()) {
        params.set("search", search.trim())
      }
      if (typeFilter !== "all") {
        params.set("type", typeFilter)
      }
      if (statusFilter !== "all") {
        params.set("status", statusFilter)
      }

      if (isNhanVienRole(loggedInUser.role)) {
        params.set("role", String(loggedInUser.role || ""))

        const requester = String(loggedInUser.fullName || "").trim()
        const requesterAlt = String(loggedInUser.username || "").trim()
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
      }

      const response = await fetch(`${apiBaseUrl}/api/maintenance?${params.toString()}`, {
        cache: "no-store",
      })

      if (!response.ok) {
        setItems([])
        setSummary({ total: 0, pending: 0, inProgress: 0, completed: 0, totalCost: 0 })
        return
      }

      const data = (await response.json()) as {
        items?: MaintenanceItem[]
        summary?: MaintenanceSummary
      }

      setItems(data.items || [])
      setSummary(
        data.summary || {
          total: 0,
          pending: 0,
          inProgress: 0,
          completed: 0,
          totalCost: 0,
        }
      )
    } catch {
      setItems([])
      setSummary({ total: 0, pending: 0, inProgress: 0, completed: 0, totalCost: 0 })
    } finally {
      setIsLoading(false)
    }
  }

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

  useEffect(() => {
    if (!isUserHydrated) {
      return
    }

    loadMaintenance()
  }, [apiBaseUrl, isUserHydrated, loggedInUser.id, loggedInUser.role, loggedInUser.fullName, loggedInUser.username, search, typeFilter, statusFilter])

  useEffect(() => {
    if (typeFilter === "all") {
      return
    }

    if (!typeOptions.includes(typeFilter)) {
      setTypeFilter("all")
    }
  }, [typeFilter, typeOptions])

  useEffect(() => {
    if (statusFilter === "all") {
      return
    }

    const isExistingStatus = statusOptions.some((option) => option.value === statusFilter)
    if (!isExistingStatus) {
      setStatusFilter("all")
    }
  }, [statusFilter, statusOptions])

  const loadDeviceOptions = async () => {
    try {
      const params = new URLSearchParams()

      if (isNhanVienRole(loggedInUser.role)) {
        params.set("role", String(loggedInUser.role || ""))

        const departmentName = String(loggedInUser.departmentName || "").trim()
        if (departmentName) {
          params.set("departmentName", departmentName)
        }

        const requester = String(loggedInUser.fullName || "").trim()
        const requesterAlt = String(loggedInUser.username || "").trim()
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
      }

      const response = await fetch(`${apiBaseUrl}/api/devices?${params.toString()}`, {
        cache: "no-store",
      })

      if (!response.ok) {
        setDeviceOptions([])
        return
      }

      const data = (await response.json()) as {
        devices?: Array<{ id: number; name: string; code: string; departmentName?: string | null; purchaseDate?: string | null; maintenanceInterval?: number | null }>
      }

      const mapped = (data.devices || []).map((item) => ({
        id: item.id,
        name: String(item.name || "").trim() || "Thiết bị chưa xác định",
        code: String(item.code || "").trim() || "-",
        departmentName: item.departmentName || null,
        purchaseDate: item.purchaseDate || null,
        maintenanceInterval: item.maintenanceInterval || null,
      }))

      // Fetch current maintenance tasks to exclude devices that already have a pending/in-progress maintenance
      try {
        const maintResp = await fetch(`${apiBaseUrl}/api/maintenance`, { cache: "no-store" })
        if (maintResp.ok) {
          const maintData = (await maintResp.json()) as { items?: Array<{ deviceId?: number | null; status?: string }> }
          const scheduledIds = new Set<number>()
          ;(maintData.items || []).forEach((m) => {
            const sid = Number(m.deviceId || 0)
            const st = String(m.status || "").toLowerCase()
            if (sid > 0 && st !== "completed") {
              scheduledIds.add(sid)
            }
          })

          // Exclude scheduled devices from the options
          const available = mapped.filter((d) => !scheduledIds.has(Number(d.id)))
          setDeviceOptions(available)
        } else {
          setDeviceOptions(mapped)
        }
      } catch {
        setDeviceOptions(mapped)
      }
    } catch {
      setDeviceOptions([])
    }
  }

  const loadDepartmentOptions = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/departments/summary`, { cache: "no-store" })

      if (!response.ok) {
        setDepartmentOptions([])
        return
      }

      const data = (await response.json()) as {
        departments?: Array<{ id: number; name: string }>
      }

      setDepartmentOptions(
        (data.departments || [])
          .map((item) => ({ id: Number(item.id), name: String(item.name || "").trim() }))
          .filter((item) => item.id > 0 && item.name)
      )
    } catch {
      setDepartmentOptions([])
    }
  }


  const loadTechnicianOptions = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/users/summary`, {
        cache: "no-store",
      })

      if (!response.ok) {
        setTechnicianOptions([])
        return
      }

      const data = (await response.json()) as {
        users?: Array<{ id: number; name?: string; username?: string; role?: string }>
      }

      const users = (data.users || []).map((item) => ({
        id: Number(item.id),
        name: String(item.name || item.username || "").trim(),
        role: String(item.role || "").trim(),
        departmentName: String((item as any).departmentName || (item as any).department || "").trim() || null,
      }))

      const technicians = users.filter((user) => {
        const role = normalizeText(user.role || "")
        return role.includes("nhan vien") || role.includes("nhan-vien")
      })

      setTechnicianOptions((technicians.length > 0 ? technicians : users).filter((item) => item.id && item.name))
    } catch {
      setTechnicianOptions([])
    }
  }

  const visibleTechnicians = useMemo(() => {
    const dept = normalizeText(selectedDepartmentName || "")
    if (!dept) {
      return technicianOptions
    }

    const filtered = technicianOptions.filter((t) => normalizeText(String(t.departmentName || "")) === dept)
    return filtered.length > 0 ? filtered : technicianOptions
  }, [technicianOptions, selectedDepartmentName])

  const handleOpenCreateDialog = async () => {
    await Promise.all([loadDeviceOptions(), loadDepartmentOptions(), loadTechnicianOptions()])
    setCreateForm({
      deviceId: "",
      type: "Định kỳ",
      dueDate: "",
      technician: "",
      note: "",
    })
    setSelectedDepartmentId("")
    setSelectedDeviceIds([])
    setIsCreateDialogOpen(true)
  }

  useEffect(() => {
    // when type is Định kỳ and a single device is selected (non-admin), auto compute dueDate
    if (createForm.type === "Định kỳ" && !isAdminRole(loggedInUser.role)) {
      const deviceId = Number(createForm.deviceId || 0)
      if (deviceId > 0) {
        const dev = deviceOptions.find((d) => Number(d.id) === deviceId)
        const iso = computeDueDateFromPurchase(dev?.purchaseDate, dev?.maintenanceInterval)
        if (iso) {
          setCreateForm((prev) => ({ ...prev, dueDate: iso }))
        }
      }
    }
  }, [createForm.type, createForm.deviceId, deviceOptions, loggedInUser.role])

  const toggleMaintenanceDevice = (deviceId: number) => {
    setSelectedDeviceIds((prev) =>
      prev.includes(deviceId) ? prev.filter((item) => item !== deviceId) : [...prev, deviceId]
    )
  }

  const handleCreateMaintenance = async () => {
    // Only 'Định kỳ' is supported from the form; dueDate will be computed per-device

    if (!createForm.technician.trim()) {
      alert("Vui lòng chọn nhân viên xử lý")
      return
    }

    const isAdmin = isAdminRole(loggedInUser.role)
    const selectedDevices = isAdmin
      ? deviceOptions.filter((item) => selectedDeviceIds.includes(item.id))
      : deviceOptions.filter((item) => item.id === Number(createForm.deviceId))

    if (isAdmin) {
      if (!selectedDepartmentName) {
        alert("Vui lòng chọn khoa")
        return
      }

      if (!selectedDeviceIds.length) {
        alert("Vui lòng chọn ít nhất 1 thiết bị")
        return
      }
    } else {
      const deviceId = Number(createForm.deviceId)
      if (!Number.isInteger(deviceId) || deviceId <= 0) {
        alert("Vui lòng chọn thiết bị")
        return
      }
    }

    if (!selectedDevices.length) {
      alert("Thiết bị không hợp lệ")
      return
    }

    try {
      setIsCreating(true)

      for (const device of selectedDevices) {
        // determine dueDate: for periodic use device-specific computed date, otherwise use form value
        let deviceDueDate = String(createForm.dueDate || "")
        if (createForm.type === "Định kỳ") {
          const iso = computeDueDateFromPurchase(device.purchaseDate, device.maintenanceInterval)
          if (!iso) {
            alert(`Không thể tính ngày hẹn cho thiết bị ${device.code} - ${device.name}. Vui lòng kiểm tra chu kỳ hoặc ngày mua.`)
            setIsCreating(false)
            return
          }
          deviceDueDate = iso
        }

        const response = await fetch(`${apiBaseUrl}/api/maintenance`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            deviceId: device.id,
            deviceName: device.name,
            type: createForm.type,
            dueDate: deviceDueDate,
            technician: createForm.technician.trim(),
            note: createForm.note.trim(),
            status: "pending",
            userId: loggedInUser.id,
            role: loggedInUser.role,
            createdBy: loggedInUser.fullName || loggedInUser.username || "Unknown",
          }),
        })

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { message?: string } | null
          alert(data?.message || `Tạo lịch bảo trì thất bại cho thiết bị ${device.code}`)
          return
        }

        // Parse response and send notification to employee
        const result = (await response.json().catch(() => null)) as { ok?: boolean; id?: number } | null
        if (result?.ok && result?.id) {
          try {
            const notifyResponse = await fetch(`${apiBaseUrl}/api/maintenance/${result.id}/notify`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                technicianName: createForm.technician.trim(),
              }),
            })

            if (notifyResponse.ok) {
              const notifyData = (await notifyResponse.json().catch(() => null)) as {
                ok?: boolean
                notificationSent?: boolean
              } | null
              if (notifyData?.notificationSent) {
                console.log("Notification sent successfully to employee")
              }
            }
          } catch (notifyError) {
            console.warn("Failed to send notification:", notifyError)
          }
        }
      }

      setIsCreateDialogOpen(false)
      await loadMaintenance()
      await loadDeviceOptions()

      toast({
        description: "Tạo lịch bảo trì thành công",
        duration: 2000,
        className: "border-emerald-200 bg-emerald-50 text-emerald-900 rounded-2xl px-4 py-3 shadow-lg",
      })
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsCreating(false)
    }
  }

  const handleViewMaintenanceDetail = (item: MaintenanceItem) => {
    setSelectedMaintenanceItem(item)
    setIsDetailDialogOpen(true)
  }

  const handleDeleteDialogChange = (open: boolean) => {
    setIsDeleteDialogOpen(open)
    if (!open) {
      setSelectedDeleteItem(null)
    }
  }

  const handleRequestDeleteMaintenance = (item: MaintenanceItem) => {
    setSelectedDeleteItem(item)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDeleteMaintenance = async () => {
    if (!selectedDeleteItem) {
      return
    }

    handleDeleteDialogChange(false)
    await handleDeleteMaintenance(selectedDeleteItem)
  }

  const handleDeleteMaintenance = async (item: MaintenanceItem) => {
    if (!item?.id) {
      return
    }

    try {
      setIsDeletingId(item.id)

      const response = await fetch(`${apiBaseUrl}/api/maintenance/${item.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: loggedInUser.id,
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "Xóa lịch bảo trì thất bại")
        return
      }

      if (selectedMaintenanceItem?.id === item.id) {
        setIsDetailDialogOpen(false)
        setSelectedMaintenanceItem(null)
      }

      await loadMaintenance()
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsDeletingId(null)
    }
  }

  const handleOpenConfirmMaintenance = (item: MaintenanceItem) => {
    // Lần 1 (pending): Mở dialog để nhập chi phí
    if (item.status === "pending") {
      setSelectedConfirmItem(item)
      setConfirmCost("")
      setIsConfirmDialogOpen(true)
    } else if (item.status === "in_progress") {
      // Lần 2 (in_progress → completed): Gọi API trực tiếp với chi phí hiện tại
      handleConfirmWithCost(item, item.cost)
    }
  }

  const handleConfirmWithCost = async (item: MaintenanceItem, cost: number) => {
    try {
      setIsConfirmingId(item.id)

      const response = await fetch(`${apiBaseUrl}/api/maintenance/${item.id}/confirm`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cost: cost,
          actorId: loggedInUser.id,
          actorRole: loggedInUser.role,
          actorFullName: loggedInUser.fullName,
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "Xác nhận bảo trì thất bại")
        return
      }

      // Show success message based on current status
      const nextStatus = item.status === "pending" ? "in_progress" : "completed"
      const successMessage = nextStatus === "completed" 
        ? "Xác nhận hoàn thành thành công" 
        : "Xác nhận thực hiện thành công"
      alert(successMessage)
      setIsConfirmDialogOpen(false)
      setSelectedConfirmItem(null)
      setConfirmCost("")
      await loadMaintenance()
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsConfirmingId(null)
    }
  }

  const handleConfirmMaintenance = () => {
    if (!selectedConfirmItem) {
      return
    }

    const numericCost = Number(String(confirmCost || "").replace(/,/g, ""))
    if (!Number.isFinite(numericCost) || numericCost < 0) {
      alert("Vui lòng nhập chi phí hợp lệ")
      return
    }

    handleConfirmWithCost(selectedConfirmItem, numericCost)
  }

  return (
    <div className="space-y-6">
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={handleDeleteDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa lịch bảo trì?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa lịch bảo trì {selectedDeleteItem?.code} không?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleDeleteDialogChange(false)}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteMaintenance}
              disabled={isDeletingId === selectedDeleteItem?.id}
            >
              {isDeletingId === selectedDeleteItem?.id ? "Đang xóa..." : "Xóa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div>
        <h1 className="text-2xl font-bold text-foreground">BẢO TRÌ</h1>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        <Card className="border-border bg-card">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Tổng công việc</p>
              <p className="mt-1 text-4xl font-bold text-foreground">{summary.total}</p>
            </div>
            <div className="rounded-lg bg-primary/10 p-3">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Chờ xử lý</p>
              <p className="mt-1 text-4xl font-bold text-foreground">{summary.pending}</p>
            </div>
            <div className="rounded-lg bg-warning/20 p-3">
              <Clock3 className="h-5 w-5 text-warning" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Đang thực hiện</p>
              <p className="mt-1 text-4xl font-bold text-foreground">{summary.inProgress}</p>
            </div>
            <div className="rounded-lg bg-info/20 p-3">
              <Play className="h-5 w-5 text-info" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Hoàn thành</p>
              <p className="mt-1 text-4xl font-bold text-foreground">{summary.completed}</p>
            </div>
            <div className="rounded-lg bg-success/20 p-3">
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Tổng chi phí</p>
              <p className="mt-1 text-3xl font-bold text-foreground">{formatCurrency(summary.totalCost)}</p>
            </div>
            <div className="rounded-lg bg-secondary p-3">
              <FileText className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        {isAdminRole(loggedInUser.role) && (
          <div className="flex items-center justify-end gap-3">
            <Button className="gap-2" onClick={handleOpenCreateDialog}>
              <Plus className="h-4 w-4" />
              Tạo lịch bảo trì
            </Button>
          </div>
        )}

        {isAdminRole(loggedInUser.role) ? (
          <Card className="border-border bg-card">
                <CardContent className="space-y-4 p-6">
                  <div>
                    <h2 className="text-[30px] font-bold leading-tight text-foreground">Danh sách bảo trì</h2>
                  </div>

                  <div className="flex flex-col gap-3 lg:flex-row">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-9"
                        placeholder="Tìm kiếm theo thiết bị, nhân viên xử lý..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </div>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="w-full lg:w-[160px]">
                        <SelectValue placeholder="Loại" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả</SelectItem>
                        {typeOptions.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-full lg:w-[160px]">
                        <SelectValue placeholder="Trạng thái" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả</SelectItem>
                        {statusOptions.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-full">
                    <table className="w-full table-auto text-center min-w-0">
                      <thead>
                        <tr className="border-b border-border text-center">
                          <th className="px-2 py-4 text-sm font-semibold text-muted-foreground">Thiết bị</th>
                          <th className="px-2 py-4 text-sm font-semibold text-muted-foreground">Loại</th>
                          <th className="px-2 py-4 text-sm font-semibold text-muted-foreground">Ngày hẹn</th>
                          <th className="px-2 py-4 text-sm font-semibold text-muted-foreground">Nhân viên xử lý</th>
                          <th className="px-2 py-4 text-sm font-semibold text-muted-foreground">Trạng thái</th>
                          <th className="w-12 px-2 py-4" />
                        </tr>
                      </thead>
                      <tbody>
                        {isLoading && (
                          <tr>
                            <td colSpan={6} className="px-2 py-8 text-center text-muted-foreground">Đang tải dữ liệu bảo trì...</td>
                          </tr>
                        )}

                        {!isLoading && items.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-2 py-8 text-center text-muted-foreground">Chưa có dữ liệu</td>
                          </tr>
                        )}

                        {!isLoading && items.map((item) => (
                          <tr key={item.id} className="border-b border-border/60 hover:bg-secondary/40">
                            <td className="max-w-[28rem] px-2 py-4 text-center break-words">
                              <p className="break-words text-base font-semibold text-foreground">{item.deviceName}</p>
                              <p className="break-words text-sm text-muted-foreground">{item.note}</p>
                            </td>
                            <td className="px-2 py-4 text-center text-foreground">
                              <span className="inline-flex items-center justify-center gap-2">
                                <span className={`h-2.5 w-2.5 rounded-full ${item.type === "Định kỳ" ? "bg-info" : "bg-destructive"}`} />
                                {item.type}
                              </span>
                            </td>
                            <td className="px-2 py-4 text-center text-foreground">
                              <span className="inline-flex items-center justify-center gap-2">
                                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                                {formatDate(item.dueDate)}
                              </span>
                            </td>
                            <td className="px-2 py-4 text-center text-foreground">
                              <span className="inline-flex items-center justify-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                {item.technician}
                              </span>
                            </td>
                            <td className="px-2 py-4 text-center">
                              {renderStatusBadge(item.status)}
                            </td>
                            <td className="px-2 py-4 text-center text-muted-foreground">
                              {isNhanVienRole(loggedInUser.role) ? (
                                item.status !== "completed" && (
                                    <button
                                      type="button"
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary transition-colors hover:bg-primary/20"
                                      title={item.status === "in_progress" ? "Xác nhận hoàn thành" : "Xác nhận thực hiện"}
                                      onClick={() => handleOpenConfirmMaintenance(item)}
                                    >
                                      <CheckCircle2 className="h-4 w-4" />
                                    </button>
                                  )
                              ) : (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button type="button" className="rounded-md p-1 hover:bg-secondary">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-40 bg-card border-border">
                                    <DropdownMenuItem onClick={() => handleViewMaintenanceDetail(item)}>Xem chi tiết</DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => handleRequestDeleteMaintenance(item)}
                                      disabled={isDeletingId === item.id}
                                    >
                                      {isDeletingId === item.id ? "Đang xóa..." : "Xóa"}
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
        ) : (
          <Card className="border-border bg-card">
                <CardContent className="space-y-4 p-6">
                  <div>
                    <h2 className="text-[30px] font-bold leading-tight text-foreground">Danh sách bảo trì</h2>
                  </div>

                  <div className="flex flex-col gap-3 lg:flex-row">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-9"
                        placeholder="Tìm kiếm theo thiết bị, nhân viên xử lý..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </div>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="w-full lg:w-[160px]">
                        <SelectValue placeholder="Loại" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả</SelectItem>
                        {typeOptions.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-full lg:w-[160px]">
                        <SelectValue placeholder="Trạng thái" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tất cả</SelectItem>
                        {statusOptions.map((status) => (
                          <SelectItem key={status.value} value={status.value}>
                            {status.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-full">
                    <table className="w-full table-auto text-center min-w-0">
                      <thead>
                        <tr className="border-b border-border text-center">
                          <th className="px-2 py-4 text-sm font-semibold text-muted-foreground">Thiết bị</th>
                          <th className="px-2 py-4 text-sm font-semibold text-muted-foreground">Loại</th>
                          <th className="px-2 py-4 text-sm font-semibold text-muted-foreground">Ngày hẹn</th>
                          <th className="px-2 py-4 text-sm font-semibold text-muted-foreground">Nhân viên xử lý</th>
                          <th className="px-2 py-4 text-sm font-semibold text-muted-foreground">Trạng thái</th>
                          <th className="w-12 px-2 py-4" />
                        </tr>
                      </thead>
                      <tbody>
                        {isLoading && (
                          <tr>
                            <td colSpan={6} className="px-2 py-8 text-center text-muted-foreground">Đang tải dữ liệu bảo trì...</td>
                          </tr>
                        )}

                        {!isLoading && items.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-2 py-8 text-center text-muted-foreground">Chưa có dữ liệu</td>
                          </tr>
                        )}

                        {!isLoading && items.map((item) => (
                          <tr key={item.id} className="border-b border-border/60 hover:bg-secondary/40">
                            <td className="max-w-[28rem] px-2 py-4 text-center break-words">
                              <p className="break-words text-base font-semibold text-foreground">{item.deviceName}</p>
                              <p className="break-words text-sm text-muted-foreground">{item.note}</p>
                            </td>
                            <td className="px-2 py-4 text-center text-foreground">
                              <span className="inline-flex items-center justify-center gap-2">
                                <span className={`h-2.5 w-2.5 rounded-full ${item.type === "Định kỳ" ? "bg-info" : "bg-destructive"}`} />
                                {item.type}
                              </span>
                            </td>
                            <td className="px-2 py-4 text-center text-foreground">
                              <span className="inline-flex items-center justify-center gap-2">
                                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                                {formatDate(item.dueDate)}
                              </span>
                            </td>
                            <td className="px-2 py-4 text-center text-foreground">
                              <span className="inline-flex items-center justify-center gap-2">
                                <User className="h-4 w-4 text-muted-foreground" />
                                {item.technician}
                              </span>
                            </td>
                            <td className="px-2 py-4 text-center">
                              {renderStatusBadge(item.status)}
                            </td>
                            <td className="px-2 py-4 text-center text-muted-foreground">
                              {item.status !== "completed" && (
                                <button
                                  type="button"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary transition-colors hover:bg-primary/20"
                                  title="Xác nhận bảo trì"
                                  onClick={() => handleOpenConfirmMaintenance(item)}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
        )}
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-card border-border max-h-[95vh] overflow-y-auto w-full max-w-md flex flex-col">
          <DialogHeader>
            <DialogTitle>Tạo lịch bảo trì</DialogTitle>
          </DialogHeader>

          <div className="space-y-2 overflow-y-auto flex-1">
            {isAdminRole(loggedInUser.role) ? (
              <>
                <div className="space-y-1">
                  <label className="text-sm font-bold text-foreground">Khoa</label>
                  <Select value={selectedDepartmentId || undefined} onValueChange={setSelectedDepartmentId}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Chọn khoa" />
                    </SelectTrigger>
                    <SelectContent>
                      {departmentOptions.map((department) => (
                        <SelectItem key={department.id} value={String(department.id)}>
                          {department.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-bold text-foreground">Thiết bị trong khoa</label>
                  <div className="max-h-24 space-y-1 overflow-y-auto rounded-md border border-border bg-secondary/40 p-2">
                    {!selectedDepartmentName ? (
                      <p className="text-xs text-muted-foreground">Chọn khoa để xem thiết bị.</p>
                    ) : filteredDepartmentDevices.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Không có thiết bị.</p>
                    ) : (
                      filteredDepartmentDevices.map((device) => {
                        const checked = selectedDeviceIds.includes(device.id)

                        return (
                          <label
                            key={device.id}
                            className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-card px-2 py-1 hover:bg-secondary/60"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleMaintenanceDevice(device.id)}
                              className="mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-foreground">
                                {device.code} - {device.name}
                              </p>
                              {createForm.type === "Định kỳ" ? (
                                (() => {
                                  const iso = computeDueDateFromPurchase(device.purchaseDate, device.maintenanceInterval)
                                  return iso ? (
                                    <p className="text-xs text-info">Ngày hẹn: {formatDate(iso)}</p>
                                  ) : (
                                    <p className="text-xs text-warning">Chu kỳ/ngày mua chưa có</p>
                                  )
                                })()
                              ) : null}
                            </div>
                          </label>
                        )
                      })
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground">Thiết bị</label>
                <Select value={createForm.deviceId || undefined} onValueChange={(value) => setCreateForm((prev) => ({ ...prev, deviceId: value }))}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Chọn thiết bị" />
                  </SelectTrigger>
                  <SelectContent>
                    {deviceOptions.map((device) => (
                      <SelectItem key={device.id} value={String(device.id)}>
                        {device.code} - {device.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-bold text-foreground">Loại bảo trì</label>
              <div className="h-9 flex items-center px-3 rounded border border-border bg-secondary/50 text-sm text-foreground">Định kỳ</div>
              <input type="hidden" name="type" value="Định kỳ" />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-foreground">Nhân viên xử lý</label>
              <Select value={createForm.technician || undefined} onValueChange={(value) => setCreateForm((prev) => ({ ...prev, technician: value }))}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Chọn nhân viên" />
                </SelectTrigger>
                <SelectContent>
                  {visibleTechnicians.map((technician) => (
                    <SelectItem key={technician.id} value={technician.name}>
                      {technician.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-foreground">Ghi chú</label>
              <Input
                placeholder="Ghi chú"
                value={createForm.note}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, note: event.target.value }))}
                className="h-9 text-sm"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isCreating}>
                Hủy
              </Button>
              <Button onClick={handleCreateMaintenance} disabled={isCreating}>
                {isCreating ? "Đang tạo..." : "Tạo lịch"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="bg-card border-border w-full max-w-lg">
          <DialogHeader>
            <DialogTitle>Chi tiết bảo trì</DialogTitle>
          </DialogHeader>

          {selectedMaintenanceItem && (
            <div className="grid gap-3 text-sm text-foreground">
              <div className="grid grid-cols-3 gap-3 rounded-md border border-border/60 bg-secondary/30 p-3">
                <span className="text-muted-foreground">Mã lịch</span>
                <span className="col-span-2 font-medium">{selectedMaintenanceItem.code}</span>

                <span className="text-muted-foreground">Thiết bị</span>
                <span className="col-span-2 font-medium">{selectedMaintenanceItem.deviceName}</span>

                <span className="text-muted-foreground">Loại</span>
                <span className="col-span-2 font-medium">{selectedMaintenanceItem.type}</span>

                <span className="text-muted-foreground">Ngày hẹn</span>
                <span className="col-span-2 font-medium">{formatDate(selectedMaintenanceItem.dueDate)}</span>

                <span className="text-muted-foreground">Nhân viên xử lý</span>
                <span className="col-span-2 font-medium">{selectedMaintenanceItem.technician}</span>

                <span className="text-muted-foreground">Trạng thái</span>
                <span className="col-span-2">{renderStatusBadge(selectedMaintenanceItem.status)}</span>

                <span className="text-muted-foreground">Chi phí</span>
                <span className="col-span-2 font-medium">{formatCurrency(selectedMaintenanceItem.cost)}</span>

                <span className="text-muted-foreground">Ghi chú</span>
                <span className="col-span-2 font-medium">{selectedMaintenanceItem.note || "-"}</span>
              </div>

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
                  Đóng
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <DialogContent className="bg-card border-border w-full max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận thực hiện bảo trì</DialogTitle>
          </DialogHeader>

          {selectedConfirmItem && (
            <div className="space-y-4">
              <div className="rounded-md border border-border/60 bg-secondary/30 p-3 text-sm text-foreground">
                <p className="font-semibold">{selectedConfirmItem.deviceName}</p>
                <p className="text-muted-foreground">{selectedConfirmItem.code}</p>
                <p className="text-muted-foreground">Ngày hẹn: {formatDate(selectedConfirmItem.dueDate)}</p>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-foreground">Chi phí bảo trì</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={confirmCost}
                  onChange={(event) => setConfirmCost(event.target.value.replace(/\D/g, ""))}
                  placeholder="Nhập chi phí bảo trì"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsConfirmDialogOpen(false)} disabled={isConfirmingId === selectedConfirmItem.id}>
                  Hủy
                </Button>
                <Button onClick={handleConfirmMaintenance} disabled={isConfirmingId === selectedConfirmItem.id}>
                  {isConfirmingId === selectedConfirmItem.id ? "Đang xác nhận..." : "Xác nhận"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  )
}
