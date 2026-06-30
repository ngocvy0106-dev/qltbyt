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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { Eye, MoreHorizontal, Pencil, Plus, QrCode, Search, Trash2 } from "lucide-react"

interface DeviceItem {
  id: number
  code: string
  name: string
  manufacturer?: string | null
  model?: string | null
  departmentName?: string | null
  roomName?: string | null
  category: string
  status: string
  value?: number | string | null
  location: string
  purchaseDate?: string | null
  warrantyExpiry?: string | null
  maintenanceInterval?: string | number | null
  createdBy?: string | null
  imageUrl?: string | null
  batchCode?: string | null
}

interface LoggedInUser {
  id?: number | string
  username?: string
  fullName?: string
  role?: string
  departmentName?: string | null
  department?: string | null
  permissions?: string[]
}

function hasPermission(permissions: string[] | undefined, permissionName: string, role?: string | null) {
  if (isAdminRole(role)) return true
  if (!permissions) return false
  return permissions.includes(permissionName)
}

interface DeviceLogItem {
  id: string
  type: "transfer" | "maintenance" | "repair"
  code: string
  title: string
  status: string
  date: string | null
  description: string
}

function splitDepartmentAndLocation(rawLocation: string) {
  const text = String(rawLocation || "").trim()

  if (!text) {
    return { department: "-", detail: "-" }
  }

  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)

  if (parts.length === 1) {
    return { department: parts[0], detail: "-" }
  }

  const first = parts[0]
  const second = parts[1]
  const firstLower = first.toLowerCase()
  const secondLower = second.toLowerCase()

  const isFirstDepartment = firstLower.includes("khoa") || firstLower.includes("phòng")
  const isSecondDepartment = secondLower.includes("khoa") || secondLower.includes("phòng")

  if (!isFirstDepartment && isSecondDepartment) {
    return {
      department: second,
      detail: [first, ...parts.slice(2)].join(" - "),
    }
  }

  return {
    department: first,
    detail: [second, ...parts.slice(2)].join(" - "),
  }
}

function buildNameSubline(device: DeviceItem) {
  const left = String(device.manufacturer || "").trim()
  const right = String(device.model || "").trim()

  if (left && right) {
    return `${left} - ${right}`
  }

  if (left) {
    return left
  }

  if (right) {
    return right
  }

  return `Serial: ${device.code}`
}

function buildDepartmentDisplay(device: DeviceItem) {
  const department = String(device.departmentName || "").trim()
  const room = String(device.roomName || "").trim()
  const location = String(device.location || "").trim()

  if (department) {
    return {
      department,
      detail: room || location || "-",
    }
  }

  if (room) {
    return {
      department: "-",
      detail: room,
    }
  }

  return splitDepartmentAndLocation(device.location)
}

function encryptQr(text: string): string {
  const key = "QLTBYT_SECRET_2026"
  const utf8Text = encodeURIComponent(text)
  let xorResult = ""
  for (let i = 0; i < utf8Text.length; i++) {
    xorResult += String.fromCharCode(utf8Text.charCodeAt(i) ^ key.charCodeAt(i % key.length))
  }
  return "ENC:" + btoa(xorResult)
}

function buildDeviceQrContent(device: DeviceItem) {
  const code = String(device.code || "-").trim() || "-"
  const name = String(device.name || "-").trim() || "-"

  let statusText = "Không xác định"
  switch (device.status) {
    case "available":
    case "active": statusText = "Hoạt động"; break;
    case "maintenance": statusText = "Đang bảo trì"; break;
    case "repairing": statusText = "Đang sửa chữa"; break;
    case "inactive": statusText = "Đã thanh lý"; break;
    case "broken": statusText = "Hỏng"; break;
    default: statusText = device.status || "-"; break;
  }

  const deptInfo = buildDepartmentDisplay(device)
  let locationInfo = "Chưa phân khoa"
  if (deptInfo.department && deptInfo.department !== "-") {
    locationInfo = deptInfo.department
    if (deptInfo.detail && deptInfo.detail !== "-") {
      locationInfo += ` - ${deptInfo.detail}`
    }
  } else if (deptInfo.detail && deptInfo.detail !== "-") {
    locationInfo = deptInfo.detail
  }

  const payload = JSON.stringify({
    id: code,
    name: name,
    status: statusText,
    location: locationInfo
  })

  // Mã hóa payload để người dùng dùng Camera/Zalo quét sẽ không thấy nội dung thật
  // App Flutter sẽ tự động giải mã ngược lại
  return encryptQr(payload)
}

function formatDeviceValue(value: DeviceItem["value"]) {
  if (value === null || value === undefined) {
    return "-"
  }

  const text = String(value).trim()
  if (!text) {
    return "-"
  }

  const normalized = text.replace(/,/g, "")
  if (/^-?\d+(\.\d+)?$/.test(normalized)) {
    return Number(normalized).toLocaleString("vi-VN")
  }

  return text
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-"
  }

  const text = String(value).trim()
  const dateOnlyMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnlyMatch) {
    const year = dateOnlyMatch[1]
    const month = dateOnlyMatch[2]
    const day = dateOnlyMatch[3]
    return `${day}/${month}/${year}`
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return text
  }

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date)
}

function formatMaintenanceInterval(value?: string | number | null) {
  if (value === null || value === undefined) {
    return "-"
  }

  const text = String(value).trim()
  if (!text) {
    return "-"
  }

  const numericValue = Number(text)
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return `${numericValue} tháng`
  }

  return text
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
  return role === "admin" || role.includes("quan tri") || role.includes("administrator")
}

function generateImportBatchCode() {
  const now = new Date()
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("")
  const timePart = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("")
  const randomPart = Math.floor(Math.random() * 900 + 100)

  return `LO-${datePart}-${timePart}-${randomPart}`
}

function resolveDeviceImageUrl(rawUrl: string | null | undefined, apiBaseUrl: string) {
  const text = String(rawUrl || "").trim()
  if (!text) {
    return null
  }

  if (/^(https?:|data:|blob:)/i.test(text)) {
    return text
  }

  if (text.startsWith("/uploads/")) {
    return `${apiBaseUrl}${text}`
  }

  if (text.startsWith("uploads/")) {
    return `${apiBaseUrl}/${text}`
  }

  if (text.startsWith("/device-images/") || text.startsWith("device-images/")) {
    return text.startsWith("/") ? text : `/${text}`
  }

  return text
}

function buildDeviceImageCandidates(rawUrl: string | null | undefined, apiBaseUrl: string) {
  const resolved = resolveDeviceImageUrl(rawUrl, apiBaseUrl)
  if (!resolved) {
    return []
  }

  const candidates: string[] = []
  const pushCandidate = (value: string) => {
    const text = String(value || "").trim()
    if (!text || candidates.includes(text)) {
      return
    }

    candidates.push(text)
  }

  pushCandidate(resolved)

  const encodedResolved = encodeURI(resolved)
  if (encodedResolved !== resolved) {
    pushCandidate(encodedResolved)
  }

  const match = resolved.match(/^(.*\/)([^/?#]+?)(?:\.([a-zA-Z0-9]+))?(\?.*)?$/)
  if (!match) {
    return candidates
  }

  const prefix = match[1] || ""
  const fileName = match[2] || ""
  const query = match[4] || ""

  if (!fileName) {
    return candidates
  }

  const variants = ["jpg", "jpeg", "png", "webp", "jfif"]
  variants.forEach((extension) => {
    pushCandidate(`${prefix}${fileName}.${extension}${query}`)
    pushCandidate(encodeURI(`${prefix}${fileName}.${extension}${query}`))
  })

  return candidates
}

function getWarrantyAlert(warrantyExpiry?: string | null) {
  if (!warrantyExpiry) {
    return null
  }

  const expiryDate = new Date(warrantyExpiry)
  if (Number.isNaN(expiryDate.getTime())) {
    return null
  }

  const now = new Date()
  const diffMs = expiryDate.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return { label: "Hết hạn BH", className: "bg-destructive/20 text-destructive" }
  }

  if (diffDays <= 90) {
    return { label: "Sắp hết hạn BH", className: "bg-warning/20 text-warning" }
  }

  return null
}

const statusClasses: Record<string, string> = {
  available: "bg-primary/15 text-primary",
  active: "bg-primary/15 text-primary",
  maintenance: "bg-warning/20 text-warning",
  repairing: "bg-warning/20 text-warning",
  inactive: "bg-muted text-muted-foreground",
  broken: "bg-destructive/20 text-destructive",
}

const statusLabels: Record<string, string> = {
  available: "Hoạt động",
  active: "Hoạt động",
  maintenance: "Đang bảo trì",
  repairing: "Đang sửa chữa",
  inactive: "Đã thanh lý",
  broken: "Hỏng",
}

export function DevicesPage() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"
  const [devices, setDevices] = useState<DeviceItem[]>([])
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser>({})
  const [isUserHydrated, setIsUserHydrated] = useState(false)
  const { toast } = useToast()

  const normalizeDepartmentValue = (value: unknown) => {
    const text = String(value || "").trim()
    if (!text) {
      return ""
    }

    const [primaryDepartment] = text.split(/[;,]/)
    return String(primaryDepartment || "").trim()
  }
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedDevice, setSelectedDevice] = useState<DeviceItem | null>(null)
  const [detailTab, setDetailTab] = useState<"info" | "logs">("info")
  const [deviceLogs, setDeviceLogs] = useState<DeviceLogItem[]>([])
  const [isLogsLoading, setIsLogsLoading] = useState(false)
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [isDeletingId, setIsDeletingId] = useState<number | null>(null)
  const [detailQrCodeDataUrl, setDetailQrCodeDataUrl] = useState("")
  const [exportCategories, setExportCategories] = useState<string[]>([])
  const [exportDepartments, setExportDepartments] = useState<string[]>([])
  const [selectedDeleteDevice, setSelectedDeleteDevice] = useState<DeviceItem | null>(null)
  const [editForm, setEditForm] = useState({
    name: "",
    model: "",
    category: "",
    status: "active",
    location: "",
    value: "",
    maintenanceInterval: "",
    imageUrl: "",
  })
  const [createForm, setCreateForm] = useState({
    name: "",
    manufacturer: "",
    model: "",
    category: "",
    status: "active",
    location: "",
    value: "",
    quantity: "1",
    purchaseDate: "",
    warrantyExpiry: "",
    maintenanceInterval: "",
    imageUrl: "",
  })
  const [createTab, setCreateTab] = useState("manual")
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [isImportingCsv, setIsImportingCsv] = useState(false)

  const categories = useMemo(
    () => Array.from(new Set(devices.map((device) => device.category).filter(Boolean))),
    [devices]
  )

  const departments = useMemo(
    () =>
      Array.from(
        new Set(
          devices
            .map((device) => buildDepartmentDisplay(device).department)
            .filter((department) => department && department !== "-")
        )
      ),
    [devices]
  )

  const statusOptions = useMemo(() => {
    return Array.from(
      new Map(
        devices
          .map((device) => {
            const rawStatus = String(device.status || "").trim()
            if (!rawStatus) {
              return null
            }

            const value = rawStatus.toLowerCase()
            const label = statusLabels[value] || rawStatus
            return [value, label] as const
          })
          .filter((item): item is readonly [string, string] => Boolean(item))
      )
    ).map(([value, label]) => ({ value, label }))
  }, [devices])

  const sortedDevices = useMemo(() => {
    return [...devices].sort((first, second) => {
      const nameCompare = String(first.name || "").localeCompare(String(second.name || ""), "vi", {
        sensitivity: "base",
      })

      if (nameCompare !== 0) {
        return nameCompare
      }

      return String(first.code || "").localeCompare(String(second.code || ""), "vi", {
        sensitivity: "base",
      })
    })
  }, [devices])

  useEffect(() => {
    if (statusFilter === "all") {
      return
    }

    const isExistingStatus = statusOptions.some((option) => option.value === statusFilter)
    if (!isExistingStatus) {
      setStatusFilter("all")
    }
  }, [statusFilter, statusOptions])

  const loadDevices = async (options?: { silent?: boolean }) => {
    try {
      if (!isUserHydrated) {
        return
      }

      if (!options?.silent) {
        setIsLoading(true)
      }

      const params = new URLSearchParams()

      if (search.trim()) {
        params.set("search", search.trim())
      }

      if (categoryFilter !== "all") {
        params.set("category", categoryFilter)
      }

      if (statusFilter !== "all") {
        params.set("status", statusFilter)
      }

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
        setDevices([])
        return
      }

      const data = (await response.json()) as {
        devices?: Array<
          DeviceItem & {
            device_value?: number | string | null
            price?: number | string | null
            created_by?: string | null
          }
        >
      }

      const normalizedDevices = (data.devices || []).map((device) => ({
        ...device,
        value: device.value ?? device.device_value ?? device.price ?? null,
        createdBy: device.createdBy ?? device.created_by ?? null,
        imageUrl: resolveDeviceImageUrl(
          device.imageUrl ?? (device as { image_url?: string | null }).image_url ?? null,
          apiBaseUrl
        ),
      }))

      setDevices(normalizedDevices)
    } catch {
      setDevices([])
    } finally {
      if (!options?.silent) {
        setIsLoading(false)
      }
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

      console.log("[DEBUG] Loaded user from localStorage:", parsedUser)

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

    loadDevices()
  }, [apiBaseUrl, search, categoryFilter, statusFilter, isUserHydrated, loggedInUser.role, loggedInUser.departmentName])

  const creatorName =
    String(loggedInUser.fullName || "").trim() ||
    String(loggedInUser.username || "").trim() ||
    null
  const creatorRole = String(loggedInUser.role || "").trim() || "Unknown"
  const creatorDepartment = String(loggedInUser.departmentName || "").trim() || null
  const employeeDepartment = useMemo(
    () => normalizeDepartmentValue(loggedInUser.departmentName) || normalizeDepartmentValue(loggedInUser.department),
    [loggedInUser.departmentName, loggedInUser.department]
  )

  const visibleDevices = useMemo(() => {
    if (!isNhanVienRole(loggedInUser.role) || !employeeDepartment) {
      return sortedDevices
    }

    const normalizedEmployeeDepartment = normalizeText(employeeDepartment)
    return sortedDevices.filter((device) => {
      const department = normalizeText(buildDepartmentDisplay(device).department)
      return department && department === normalizedEmployeeDepartment
    })
  }, [employeeDepartment, loggedInUser.role, sortedDevices])

  useEffect(() => {
    if (!isUserHydrated) {
      return
    }

    const refreshDevices = () => {
      void loadDevices({ silent: true })
    }

    const handleDevicesChanged = () => {
      refreshDevices()
    }

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "devices-refresh-token") {
        refreshDevices()
      }
    }

    const refreshIntervalId = window.setInterval(refreshDevices, 10000)
    window.addEventListener("focus", refreshDevices)
    window.addEventListener("devices-data-changed", handleDevicesChanged as EventListener)
    window.addEventListener("storage", handleStorageChange)

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshDevices()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.clearInterval(refreshIntervalId)
      window.removeEventListener("focus", refreshDevices)
      window.removeEventListener("devices-data-changed", handleDevicesChanged as EventListener)
      window.removeEventListener("storage", handleStorageChange)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [
    apiBaseUrl,
    search,
    categoryFilter,
    statusFilter,
    isUserHydrated,
    loggedInUser.role,
    loggedInUser.departmentName,
  ])

  useEffect(() => {
    if (!selectedDevice) {
      return
    }

    const updatedDevice = devices.find((device) => device.id === selectedDevice.id)
    if (updatedDevice) {
      setSelectedDevice(updatedDevice)
    }
  }, [devices, selectedDevice])

  const loadDeviceLogs = async (device: DeviceItem) => {
    const deviceId = Number(device.id || 0)
    if (!Number.isInteger(deviceId) || deviceId <= 0) {
      setDeviceLogs([])
      return
    }

    try {
      setIsLogsLoading(true)
      const response = await fetch(`${apiBaseUrl}/api/transfers/device/${deviceId}/logs`, {
        cache: "no-store",
      })

      if (!response.ok) {
        setDeviceLogs([])
        return
      }

      const data = (await response.json()) as { logs?: DeviceLogItem[] }
      setDeviceLogs(Array.isArray(data.logs) ? data.logs : [])
    } catch {
      setDeviceLogs([])
    } finally {
      setIsLogsLoading(false)
    }
  }

  const openDetailDialog = (device: DeviceItem) => {
    setSelectedDevice(device)
    setDetailTab("info")
    void loadDeviceLogs(device)
    setIsDetailDialogOpen(true)
  }

  const openEditDialog = (device: DeviceItem) => {
    if (!hasPermission(loggedInUser.permissions, "Sửa thiết bị", loggedInUser.role)) {
      alert("Bạn không có quyền sửa thiết bị")
      return
    }

    setSelectedDevice(device)
    setEditForm({
      name: device.name || "",
      model: String(device.model || ""),
      category: device.category || "",
      status: device.status || "active",
      location: device.location || "",
      value: String(device.value ?? ""),
      maintenanceInterval: String(device.maintenanceInterval || ""),
      imageUrl: String(device.imageUrl || ""),
    })
    setIsEditDialogOpen(true)
  }

  useEffect(() => {
    if (!isDetailDialogOpen || !selectedDevice) {
      setDetailQrCodeDataUrl("")
      return
    }

    let active = true

    const loadQrCode = async () => {
      try {
        const QRCode = await import("qrcode")
        const qrPayload = buildDeviceQrContent(selectedDevice)

        const dataUrl = await QRCode.toDataURL(qrPayload, {
          margin: 1,
          width: 220,
        })

        if (active) {
          setDetailQrCodeDataUrl(dataUrl)
        }
      } catch {
        if (active) {
          setDetailQrCodeDataUrl("")
        }
      }
    }

    void loadQrCode()

    return () => {
      active = false
    }
  }, [isDetailDialogOpen, selectedDevice])

  const handleSaveEdit = async () => {
    if (!selectedDevice) {
      return
    }

    try {
      setIsSubmitting(true)

      const response = await fetch(`${apiBaseUrl}/api/devices/${selectedDevice.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editForm.name.trim(),
          model: editForm.model.trim(),
          category: editForm.category.trim(),
          status: editForm.status,
          value: editForm.value.trim() || null,
          maintenanceInterval: editForm.maintenanceInterval.trim() || null,
          imageUrl: editForm.imageUrl.trim() || null,
        }),
      })

      if (!response.ok) {
        alert("Cập nhật thiết bị thất bại")
        return
      }

      setIsEditDialogOpen(false)
      await loadDevices()
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteDialogChange = (open: boolean) => {
    setIsDeleteDialogOpen(open)
    if (!open) {
      setSelectedDeleteDevice(null)
    }
  }

  const handleRequestDeleteDevice = (device: DeviceItem) => {
    setSelectedDeleteDevice(device)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDeleteDevice = async () => {
    if (!selectedDeleteDevice) {
      return
    }

    handleDeleteDialogChange(false)
    await handleDeleteDevice(selectedDeleteDevice)
  }

  const handleDeleteDevice = async (device: DeviceItem) => {
    if (!hasPermission(loggedInUser.permissions, "Xóa thiết bị", loggedInUser.role)) {
      alert("Bạn không có quyền xóa thiết bị")
      return
    }

    try {
      setIsDeletingId(device.id)
      const roleParam = encodeURIComponent(String(loggedInUser.role || ""))
      const fullNameParam = encodeURIComponent(String(loggedInUser.fullName || loggedInUser.username || ""))
      const response = await fetch(
        `${apiBaseUrl}/api/devices/${device.id}?role=${roleParam}&fullName=${fullNameParam}`,
        {
          method: "DELETE",
        }
      )

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "Xóa thiết bị thất bại")
        return
      }

      setDevices((prev) => prev.filter((item) => item.id !== device.id))
      toast({
        description: `Đã xóa thiết bị ${device.code} thành công`,
        duration: 2000,
        className: "border-emerald-200 bg-emerald-50 text-emerald-900 rounded-2xl px-4 py-3 shadow-lg",
      })
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsDeletingId(null)
    }
  }

  const uploadDeviceImage = async (file: File, mode: "create" | "edit") => {
    if (!file) {
      return
    }

    try {
      setIsUploadingImage(true)
      const formData = new FormData()
      formData.append("image", file)

      const response = await fetch(`${apiBaseUrl}/api/devices/upload-image`, {
        method: "POST",
        body: formData,
      })

      const data = (await response.json().catch(() => null)) as { imageUrl?: string; message?: string } | null
      if (!response.ok || !data?.imageUrl) {
        alert(data?.message || "Tải ảnh lên thất bại")
        return
      }

      if (mode === "create") {
        setCreateForm((prev) => ({ ...prev, imageUrl: data.imageUrl || "" }))
      } else {
        setEditForm((prev) => ({ ...prev, imageUrl: data.imageUrl || "" }))
      }
    } catch {
      alert("Không thể tải ảnh lên server")
    } finally {
      setIsUploadingImage(false)
    }
  }

  const printText = (title: string, lines: string[]) => {
    const popup = window.open("", "_blank", "width=700,height=700")
    if (!popup) {
      alert("Trình duyệt đang chặn cửa sổ in")
      return
    }

    popup.document.write(`
      <html>
        <head><title>${title}</title></head>
        <body style="font-family: Arial, sans-serif; padding: 24px;">
          <h2>${title}</h2>
          ${lines.map((line) => `<p>${line}</p>`).join("")}
        </body>
      </html>
    `)
    popup.document.close()
    popup.focus()
    popup.print()
  }

  const escapeHtml = (value: string) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;")

  const printHtmlByHiddenIframe = (html: string) => {
    const iframe = document.createElement("iframe")
    iframe.setAttribute("aria-hidden", "true")
    iframe.style.position = "fixed"
    iframe.style.right = "0"
    iframe.style.bottom = "0"
    iframe.style.width = "0"
    iframe.style.height = "0"
    iframe.style.border = "0"

    document.body.appendChild(iframe)

    const iframeWindow = iframe.contentWindow
    if (!iframeWindow) {
      document.body.removeChild(iframe)
      alert("Không thể khởi tạo khung in")
      return
    }

    const cleanup = () => {
      window.setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe)
        }
      }, 500)
    }

    iframeWindow.onafterprint = cleanup
    iframeWindow.document.open()
    iframeWindow.document.write(html)
    iframeWindow.document.close()

    // Fallback cleanup in case onafterprint is not fired by browser.
    window.setTimeout(cleanup, 5000)
  }

  const handlePrintQr = async (device: DeviceItem) => {
    const qrPayload = buildDeviceQrContent(device)

    let qrUrl = ""
    try {
      const QRCode = await import("qrcode")
      qrUrl = await QRCode.toDataURL(qrPayload, {
        margin: 1,
        width: 220,
      })
    } catch {
      alert("Không thể tạo mã QR cho thiết bị")
      return
    }

    const escapedTitle = escapeHtml(`Tem thiết bị ${device.code}`)
    const escapedCode = escapeHtml(String(device.code || "-"))
    const escapedName = escapeHtml(String(device.name || "-"))
    const escapedModel = escapeHtml(String(device.model || "-"))

    const printHtml = `
      <html>
        <head>
          <title>${escapedTitle}</title>
          <style>
            @page {
              size: 80mm 40mm;
              margin: 2mm;
            }

            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            .label {
              width: 76mm;
              height: 36mm;
              border: 1px solid #1f2937;
              border-radius: 2.5mm;
              padding: 2.5mm;
              display: flex;
              gap: 2.5mm;
              box-sizing: border-box;
              overflow: hidden;
            }

            .qr-image {
              width: 30mm;
              height: 30mm;
              border: 1px solid #111827;
              border-radius: 1.2mm;
              padding: 1mm;
              object-fit: contain;
              background: #fff;
              box-sizing: border-box;
              flex-shrink: 0;
            }

            .meta {
              min-width: 0;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
            }

            .code {
              font-size: 12px;
              font-weight: 700;
              letter-spacing: 0.2px;
            }

            .name {
              margin-top: 1mm;
              font-size: 11px;
              font-weight: 600;
              line-height: 1.2;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .model {
              margin-top: 1mm;
              font-size: 10px;
              color: #374151;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .hint {
              margin-top: 1.5mm;
              font-size: 8.5px;
              color: #6b7280;
              text-transform: uppercase;
              letter-spacing: 0.3px;
            }
          </style>
        </head>
        <body>
          <div class="label">
            <img id="qr-print-image" src="${qrUrl}" alt="QR thiết bị" class="qr-image" />
            <div class="meta">
              <div>
                <div class="code">${escapedCode}</div>
                <div class="name">${escapedName}</div>
                <div class="model">Model: ${escapedModel}</div>
              </div>
              <div class="hint">Quet QR de xem chi tiet</div>
            </div>
          </div>

          <script>
            (function () {
              var hasPrinted = false;
              var printNow = function () {
                if (hasPrinted) {
                  return;
                }

                hasPrinted = true;
                window.focus();
                window.print();
              };

              var qrImage = document.getElementById("qr-print-image");
              if (!qrImage) {
                setTimeout(printNow, 120);
                return;
              }

              if (qrImage.complete) {
                setTimeout(printNow, 120);
                return;
              }

              qrImage.addEventListener("load", printNow, { once: true });
              qrImage.addEventListener("error", printNow, { once: true });

              // Fallback: still print if image load event is delayed.
              setTimeout(printNow, 1500);
            })();
          </script>
        </body>
      </html>
    `

    printHtmlByHiddenIframe(printHtml)
  }

  const exportToCsv = (data: DeviceItem[]) => {
    if (!data.length) {
      alert("Không có dữ liệu để xuất")
      return
    }

    const headers = [
      "STT",
      "Mã Serial",
      "Tên thiết bị",
      "Hãng sản xuất",
      "Danh mục",
      "Khoa/Phòng",
      "Trạng thái",
      "Giá trị",
      "Ngày mua",
      "Hết hạn bảo hành",
      "Chu kỳ bảo trì",
      "Người tạo",
    ]

    const rows = data.map((device, index) => {
      const department = buildDepartmentDisplay(device).department
      return [
        String(index + 1),
        device.code,
        device.name,
        String(device.manufacturer || "-"),
        device.category,
        department,
        statusLabels[device.status] || device.status,
        formatDeviceValue(device.value),
        formatDate(device.purchaseDate),
        formatDate(device.warrantyExpiry),
        formatMaintenanceInterval(device.maintenanceInterval),
        String(device.createdBy || "-"),
      ]
    })

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n")

    const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    const dateTag = new Date().toISOString().slice(0, 10)
    link.href = url
    link.download = `danh-sach-thiet-bi-${dateTag}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleConfirmExportExcel = () => {
    const filtered = devices.filter((device) => {
      const matchedCategory =
        exportCategories.length === 0 ||
        exportCategories.includes(String(device.category || "").toLowerCase())
      const department = buildDepartmentDisplay(device).department
      const matchedDepartment =
        exportDepartments.length === 0 ||
        exportDepartments.includes(String(department || "").toLowerCase())

      return matchedCategory && matchedDepartment
    })

    exportToCsv(filtered)
    setIsExportDialogOpen(false)
  }

  const toggleExportCategory = (category: string) => {
    const normalized = category.toLowerCase()
    setExportCategories((prev) =>
      prev.includes(normalized)
        ? prev.filter((item) => item !== normalized)
        : [...prev, normalized]
    )
  }

  const toggleExportDepartment = (department: string) => {
    const normalized = department.toLowerCase()
    setExportDepartments((prev) =>
      prev.includes(normalized)
        ? prev.filter((item) => item !== normalized)
        : [...prev, normalized]
    )
  }

  const normalizeCsvHeader = (text: string) =>
    String(text || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]/g, "")

  const parseCsvLine = (line: string) => {
    const cells: string[] = []
    let current = ""
    let inQuotes = false

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index]
      const next = line[index + 1]

      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"'
          index += 1
          continue
        }

        inQuotes = !inQuotes
        continue
      }

      if (char === "," && !inQuotes) {
        cells.push(current.trim())
        current = ""
        continue
      }

      current += char
    }

    cells.push(current.trim())
    return cells
  }

  const normalizeCsvDate = (value: string) => {
    const text = String(value || "").trim()
    if (!text) {
      return null
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return text
    }

    const match = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
    if (!match) {
      return text
    }

    const firstNumber = Number.parseInt(match[1], 10)
    const secondNumber = Number.parseInt(match[2], 10)
    const year = Number.parseInt(match[3], 10)

    const isValidYmd = (checkYear: number, checkMonth: number, checkDay: number) => {
      if (!Number.isInteger(checkYear) || !Number.isInteger(checkMonth) || !Number.isInteger(checkDay)) {
        return false
      }

      if (checkMonth < 1 || checkMonth > 12 || checkDay < 1 || checkDay > 31) {
        return false
      }

      const date = new Date(Date.UTC(checkYear, checkMonth - 1, checkDay))
      return (
        date.getUTCFullYear() === checkYear &&
        date.getUTCMonth() === checkMonth - 1 &&
        date.getUTCDate() === checkDay
      )
    }

    const ddMMyyyyCandidate = { day: firstNumber, month: secondNumber }
    const mmDDyyyyCandidate = { day: secondNumber, month: firstNumber }

    const ddMMyyyyValid = isValidYmd(year, ddMMyyyyCandidate.month, ddMMyyyyCandidate.day)
    const mmDDyyyyValid = isValidYmd(year, mmDDyyyyCandidate.month, mmDDyyyyCandidate.day)

    if (ddMMyyyyValid && !mmDDyyyyValid) {
      return `${year}-${String(ddMMyyyyCandidate.month).padStart(2, "0")}-${String(ddMMyyyyCandidate.day).padStart(2, "0")}`
    }

    if (mmDDyyyyValid && !ddMMyyyyValid) {
      return `${year}-${String(mmDDyyyyCandidate.month).padStart(2, "0")}-${String(mmDDyyyyCandidate.day).padStart(2, "0")}`
    }

    if (ddMMyyyyValid && mmDDyyyyValid) {
      // Ambiguous values like 4/12/2026 are interpreted as MM/DD/YYYY
      // to better match common spreadsheet exports.
      return `${year}-${String(mmDDyyyyCandidate.month).padStart(2, "0")}-${String(mmDDyyyyCandidate.day).padStart(2, "0")}`
    }

    return text
  }

  const handleImportCsvDevices = async () => {
    if (!csvFile) {
      alert("Vui lòng chọn file CSV")
      return
    }

    let csvContent = ""
    try {
      csvContent = await csvFile.text()
    } catch {
      alert("Không thể đọc file CSV")
      return
    }

    const lines = csvContent
      .replace(/^\uFEFF/, "")
      .split(/\r\n|\n|\r/)
      .map((line) => line.trim())
      .filter(Boolean)

    if (lines.length < 2) {
      alert("File CSV chưa có dữ liệu")
      return
    }

    const headers = parseCsvLine(lines[0]).map(normalizeCsvHeader)
    const findIndex = (aliases: string[]) => headers.findIndex((header) => aliases.includes(header))

    const indexMap = {
      name: findIndex(["tenthietbi", "devicename", "name", "ten"]),
      manufacturer: findIndex(["hangsanxuat", "manufacturer", "hang"]),
      model: findIndex(["model"]),
      category: findIndex(["danhmuc", "category"]),
      status: findIndex(["trangthai", "status"]),
      location: findIndex(["vitri", "location"]),
      value: findIndex(["giatri", "value"]),
      quantity: findIndex(["soluong", "quantity", "qty"]),
      purchaseDate: findIndex(["ngaymua", "purchasedate", "purchasedate", "purchase_date"]),
      warrantyExpiry: findIndex(["hethanbaohanh", "warrantyexpiry", "warranty_expiry"]),
      maintenanceInterval: findIndex([
        "chukibaotri",
        "chukybaotri",
        "chukibaotrithang",
        "chukybaotrithang",
        "maintenanceinterval",
        "maintenance_interval",
        "maintenanceintervalmonth",
        "interval",
      ]),
      imageUrl: findIndex(["hinhanh", "hinhanhthietbi", "image", "imageurl", "imgurl", "urlanh"]),
    }

    if (indexMap.name < 0) {
      alert("File CSV cần có cột Tên thiết bị (name)")
      return
    }

    setIsImportingCsv(true)
    let successCount = 0
    let failedCount = 0
    let importedTotalCost = 0
    const importedItems: Array<{
      itemName: string
      manufacturer: string | null
      model: string | null
      quantity: number
      unitCost: number
      lineTotal: number
      firstCode: string | null
      lastCode: string | null
    }> = []
    const failedDetails: string[] = []
    const importBatchCode = generateImportBatchCode()

    try {
      const dataLines = lines.slice(1)
      const maxConcurrent = 5

      const tasks = dataLines.map((line, lineIndex) => async () => {
        const displayRowNumber = lineIndex + 2
        const cells = parseCsvLine(line)
        const readCell = (index: number) => (index >= 0 ? String(cells[index] || "").trim() : "")

        const name = readCell(indexMap.name)
        if (!name) {
          return {
            ok: false,
            lineNumber: displayRowNumber,
            name: "[Không có tên thiết bị]",
            message: "Thiếu cột tên thiết bị",
          }
        }

        const model = readCell(indexMap.model) || null
        const manufacturer = readCell(indexMap.manufacturer) || model || null

        const rawValue = readCell(indexMap.value)
        const numericValueText = rawValue.replace(/[.,\s]/g, "")
        const quantityText = readCell(indexMap.quantity)
        const parsedQuantity = Number.parseInt(quantityText || "1", 10)
        const quantity = Number.isInteger(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : 1
        const purchaseDate = normalizeCsvDate(readCell(indexMap.purchaseDate))
        const warrantyExpiry = normalizeCsvDate(readCell(indexMap.warrantyExpiry))
        const maintenanceInterval = readCell(indexMap.maintenanceInterval)
        const imageUrl = resolveDeviceImageUrl(readCell(indexMap.imageUrl) || null, apiBaseUrl)

        const response = await fetch(`${apiBaseUrl}/api/devices`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            manufacturer,
            model,
            category: readCell(indexMap.category) || null,
            status: readCell(indexMap.status) || "active",
            location: readCell(indexMap.location) || null,
            value: numericValueText || null,
            quantity,
            purchaseDate,
            warrantyExpiry,
            maintenanceInterval: maintenanceInterval || null,
            imageUrl,
            createdBy: creatorName,
            createdByRole: creatorRole,
            createdByDepartment: creatorDepartment,
            importMode: "csv",
          }),
        })

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { message?: string } | null
          return {
            ok: false,
            lineNumber: displayRowNumber,
            name,
            message: data?.message || "Không xác định nguyên nhân",
          }
        }

        const createdData = (await response.json().catch(() => null)) as
          | { firstCode?: string | null; lastCode?: string | null }
          | null

        return {
          ok: true,
          lineNumber: displayRowNumber,
          name,
          manufacturer,
          model,
          quantity,
          numericValueText,
          createdData,
        }
      })

      for (let startIndex = 0; startIndex < tasks.length; startIndex += maxConcurrent) {
        const batch = tasks.slice(startIndex, startIndex + maxConcurrent)
        const results = await Promise.all(batch.map((task) => task()))

        results.forEach((result) => {
          if (!result.ok) {
            failedCount += 1
            failedDetails.push(`Dòng ${result.lineNumber}: ${result.name} - ${result.message}`)
            return
          }

          successCount += 1
          const quantity = Number(result.quantity ?? 0)
          const numericValue = Number(result.numericValueText || 0)
          const unitCost = Number.isFinite(numericValue) ? numericValue : 0
          const lineTotal = unitCost * quantity
          importedTotalCost += lineTotal

          importedItems.push({
            itemName: result.name,
            manufacturer: result.manufacturer || null,
            model: result.model || null,
            quantity,
            unitCost,
            lineTotal,
            firstCode: result.createdData?.firstCode ?? null,
            lastCode: result.createdData?.lastCode ?? null,
          })
        })
      }

      if (successCount > 0) {
        await fetch(`${apiBaseUrl}/api/devices/import-batch-log`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            batchCode: importBatchCode,
            totalCost: importedTotalCost,
            createdBy: creatorName,
            createdByRole: creatorRole,
            createdByDepartment: creatorDepartment,
            items: importedItems,
          }),
        }).catch(() => null)

        await loadDevices()
      }

      if (failedCount === 0) {
        setIsCreateDialogOpen(false)
        setCsvFile(null)
      }

      const previewDetails = failedDetails.slice(0, 10)
      const overflowNote = failedDetails.length > 10 ? `\n...và ${failedDetails.length - 10} dòng lỗi khác` : ""

      const resultMessage =
        `Nhập CSV hoàn tất. Mã lô: ${importBatchCode}. Thành công: ${successCount}, thất bại: ${failedCount}` +
        (failedCount > 0
          ? `\n\nDanh sách lỗi:\n- ${previewDetails.join("\n- ")}${overflowNote}`
          : "")

      toast({ title: "Nhập CSV hoàn tất", description: resultMessage })
    } catch {
      toast({ title: "Lỗi", description: "Không thể nhập file CSV" })
    } finally {
      setIsImportingCsv(false)
    }
  }

  const handleCreateDevice = async () => {
    const requiredChecks = [
      { key: "name", label: "Tên thiết bị", value: createForm.name.trim() },
      { key: "manufacturer", label: "Hãng sản xuất", value: createForm.manufacturer.trim() },
      { key: "model", label: "Model", value: createForm.model.trim() },
      { key: "category", label: "Danh mục", value: createForm.category.trim() },
      { key: "value", label: "Giá trị", value: createForm.value.trim() },
      { key: "quantity", label: "Số lượng", value: createForm.quantity.trim() },
      { key: "purchaseDate", label: "Ngày mua", value: createForm.purchaseDate.trim() },
      { key: "warrantyExpiry", label: "Hết hạn bảo hành", value: createForm.warrantyExpiry.trim() },
      { key: "maintenanceInterval", label: "Chu kỳ bảo trì", value: createForm.maintenanceInterval.trim() },
    ]

    const missingField = requiredChecks.find((item) => !item.value)
    if (missingField) {
      alert(`${missingField.label} là bắt buộc`) 
      return
    }

    const numericValue = Number(String(createForm.value).replace(/,/g, ""))
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      alert("Giá trị phải là số lớn hơn 0")
      return
    }

    const quantity = Number.parseInt(createForm.quantity, 10)
    if (!Number.isInteger(quantity) || quantity <= 0) {
      alert("Số lượng phải là số nguyên lớn hơn 0")
      return
    }

    try {
      setIsSubmitting(true)

      const response = await fetch(`${apiBaseUrl}/api/devices`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: createForm.name.trim(),
          manufacturer: createForm.manufacturer.trim(),
          model: createForm.model.trim(),
          category: createForm.category.trim(),
          status: createForm.status,
          value: numericValue,
          quantity,
          purchaseDate: createForm.purchaseDate || null,
          warrantyExpiry: createForm.warrantyExpiry || null,
          maintenanceInterval: createForm.maintenanceInterval.trim() || null,
          imageUrl: createForm.imageUrl.trim() || null,
          createdBy: creatorName,
          createdByRole: creatorRole,
          createdByDepartment: creatorDepartment,
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "Thêm thiết bị thất bại")
        return
      }

      setIsCreateDialogOpen(false)
      setCreateForm({
        name: "",
        manufacturer: "",
        model: "",
        category: "",
        status: "active",
        location: "",
        value: "",
        quantity: "1",
        purchaseDate: "",
        warrantyExpiry: "",
        maintenanceInterval: "",
        imageUrl: "",
      })
      await loadDevices()
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={handleDeleteDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa thiết bị?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa thiết bị {selectedDeleteDevice?.code} không?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleDeleteDialogChange(false)}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteDevice}
              disabled={isDeletingId === selectedDeleteDevice?.id}
            >
              {isDeletingId === selectedDeleteDevice?.id ? "Đang xóa..." : "Xóa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div>
        <h1 className="text-2xl font-bold text-foreground">QUẢN LÝ THIẾT BỊ</h1>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Tìm kiếm thiết bị..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full lg:w-[180px]">
                <SelectValue placeholder="Danh mục" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Danh mục</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category.toLowerCase()}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full lg:w-[160px]">
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Trạng thái</SelectItem>
                {statusOptions.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setIsExportDialogOpen(true)}>Xuất Excel</Button>
            {hasPermission(loggedInUser.permissions, "Thêm thiết bị", loggedInUser.role) && (
              <Button className="gap-2" onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                Thêm thiết bị
              </Button>
            )}
          </div>

          <div className="max-h-[62vh] overflow-x-auto overflow-y-auto bg-card">
            <table className="min-w-[1500px] table-auto border-collapse text-center align-middle [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-20 [&_thead]:bg-[#a7d8c8] [&_thead_th]:bg-[#a7d8c8] [&_thead_th]:border-b [&_thead_th]:border-[#7fc8af] [&_thead_th]:font-bold [&_thead_th]:text-[#0f3b2f] [&_thead_th:first-child]:rounded-tl-lg [&_thead_th:last-child]:rounded-tr-lg [&_tbody]:bg-card [&_tbody_td]:border-b [&_tbody_td]:border-border/60 [&_th]:border-r [&_th]:border-border/60 [&_td]:border-r [&_td]:border-border/60 [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
                <thead>
                <tr className="border-b border-primary/45 text-center">
              <th className="w-16 px-4 py-4 text-center text-sm font-bold text-foreground">STT</th>
                <th className="w-24 px-4 py-4 text-sm font-bold text-foreground text-center whitespace-nowrap">Mã Serial</th>
              <th className="px-4 py-4 text-center text-sm font-bold text-foreground">Tên thiết bị</th>
              <th className="px-4 py-4 text-center text-sm font-bold text-foreground">Hãng sản xuất</th>
              <th className="px-4 py-4 text-center text-sm font-bold text-foreground">Danh mục</th>
              <th className="px-4 py-4 text-center text-sm font-bold text-foreground">Khoa/Phòng</th>
              <th className="px-4 py-4 text-center text-sm font-bold text-foreground">Trạng thái</th>
              <th className="px-4 py-4 text-center text-sm font-bold text-foreground">Giá trị</th>
              <th className="px-4 py-4 text-center text-sm font-bold text-foreground">Ngày mua</th>
              <th className="px-4 py-4 text-center text-sm font-bold text-foreground">Hết hạn bảo hành</th>
              <th className="px-4 py-4 text-center text-sm font-bold text-foreground">Chu kỳ bảo trì</th>
              <th className="px-4 py-4 text-center text-sm font-bold text-foreground">Người tạo</th>
                        <th className="w-12 px-4 py-4" />
                    </tr>
                </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">
                      Đang tải dữ liệu thiết bị...
                    </td>
                  </tr>
                )}

                {!isLoading && visibleDevices.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">
                      Chưa có thiết bị nào. 
                    </td>
                  </tr>
                )}

                {visibleDevices.map((device, index) => {
                  const warrantyAlert = getWarrantyAlert(device.warrantyExpiry)

                  return (
                    <tr key={device.id} className="border-b border-border/60 hover:bg-secondary/40">
                      <td className="px-4 py-4 text-center text-sm text-foreground whitespace-nowrap">{index + 1}</td>
                      <td className="px-4 py-4 text-center text-sm font-semibold text-foreground whitespace-nowrap">{device.code}</td>
                      <td className="px-4 py-4 text-center whitespace-nowrap">
                        <p className="text-base font-semibold text-foreground">
                          {device.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {buildNameSubline(device)}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-center text-sm text-foreground whitespace-nowrap">
                        {String(device.manufacturer || "-")}
                      </td>
                      <td className="px-4 py-4 text-center text-sm text-foreground whitespace-nowrap">{device.category}</td>
                      <td className="px-4 py-4 text-center text-sm text-foreground whitespace-nowrap">
                        <p className="text-base font-semibold text-foreground">
                          {buildDepartmentDisplay(device).department}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {buildDepartmentDisplay(device).detail}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <Badge className={`${statusClasses[device.status] || "bg-muted text-muted-foreground"} text-sm w-fit`}>
                            {statusLabels[device.status] || device.status}
                          </Badge>
                          {warrantyAlert && (
                            <Badge className={`${warrantyAlert.className} text-xs w-fit`}>
                              {warrantyAlert.label}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center text-sm text-foreground whitespace-nowrap">{formatDeviceValue(device.value)}</td>
                      <td className="px-4 py-4 text-center text-sm text-foreground whitespace-nowrap">{formatDate(device.purchaseDate)}</td>
                      <td className="px-4 py-4 text-center text-sm text-foreground whitespace-nowrap">{formatDate(device.warrantyExpiry)}</td>
                      <td className="px-4 py-4 text-center text-sm text-foreground whitespace-nowrap">
                        {formatMaintenanceInterval(device.maintenanceInterval)}
                      </td>
                      <td className="px-4 py-4 text-center text-sm text-foreground whitespace-nowrap">
                        {String(device.createdBy || "-")}
                      </td>
                      <td className="px-4 py-4 text-center text-muted-foreground">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button type="button" className="rounded-md p-1 hover:bg-secondary">
                              <MoreHorizontal className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44 bg-card border-border">
                            <DropdownMenuItem className="gap-2" onClick={() => openDetailDialog(device)}>
                              <Eye className="h-4 w-4" />
                              Xem chi tiết
                            </DropdownMenuItem>
                            {hasPermission(loggedInUser.permissions, "Sửa thiết bị", loggedInUser.role) ? (
                              <DropdownMenuItem className="gap-2" onClick={() => openEditDialog(device)}>
                                <Pencil className="h-4 w-4" />
                                Chỉnh sửa
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem className="gap-2 text-muted-foreground focus:text-muted-foreground" onClick={() => alert("Bạn không có quyền sửa thiết bị")}>
                                <Pencil className="h-4 w-4" />
                                Chỉnh sửa (Không có quyền)
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="gap-2" onClick={() => handlePrintQr(device)}>
                              <QrCode className="h-4 w-4" />
                              In tem thiết bị
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {hasPermission(loggedInUser.permissions, "Xóa thiết bị", loggedInUser.role) ? (
                              <DropdownMenuItem
                                className="gap-2 text-destructive focus:text-destructive"
                                onClick={() => handleRequestDeleteDevice(device)}
                              >
                                <Trash2 className="h-4 w-4" />
                                Xóa
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                className="gap-2 text-destructive focus:text-destructive opacity-50"
                                onClick={() => alert("Không được phép xóa")}
                              >
                                <Trash2 className="h-4 w-4" />
                                Không được phép xóa
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-h-[92vh] w-[92vw] overflow-hidden bg-card border-border sm:max-w-[860px]">
          <DialogHeader>
            <DialogTitle>Chi tiết thiết bị</DialogTitle>
          </DialogHeader>

          {selectedDevice && (
            (() => {
              const imageCandidates = buildDeviceImageCandidates(selectedDevice.imageUrl, apiBaseUrl)

              return (
            <Tabs value={detailTab} onValueChange={(value) => setDetailTab(value as "info" | "logs")}>
              <TabsList className="bg-secondary">
                <TabsTrigger value="info">Thông tin</TabsTrigger>
                <TabsTrigger value="logs">Nhật kí thiết bị</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="pt-2">
                <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
                  <div className="rounded-lg border border-border p-3">
                    <h3 className="text-base font-semibold text-foreground">Thông tin thiết bị</h3>
                    <div className="mt-2 grid grid-cols-1 gap-x-5 gap-y-1.5 text-[13px] md:grid-cols-2">
                      <div className="flex items-start gap-2">
                        <span className="w-24 shrink-0 font-semibold">Mã:</span>
                        <span className="break-words">{selectedDevice.code}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-24 shrink-0 font-semibold">Tên:</span>
                        <span className="break-words">{selectedDevice.name}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-24 shrink-0 font-semibold">Model:</span>
                        <span className="break-words">{selectedDevice.model || "-"}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-24 shrink-0 font-semibold">Danh mục:</span>
                        <span className="break-words">{selectedDevice.category}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-24 shrink-0 font-semibold">Khoa/Phòng:</span>
                        <span className="break-words">{buildDepartmentDisplay(selectedDevice).department}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-24 shrink-0 font-semibold">Vị trí:</span>
                        <span className="break-words">{selectedDevice.location || "-"}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-24 shrink-0 font-semibold">Trạng thái:</span>
                        <span className="break-words">{statusLabels[selectedDevice.status] || selectedDevice.status}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-24 shrink-0 font-semibold">Giá trị:</span>
                        <span className="break-words">{formatDeviceValue(selectedDevice.value)}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-24 shrink-0 font-semibold">Ngày mua:</span>
                        <span className="break-words">{formatDate(selectedDevice.purchaseDate)}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-24 shrink-0 font-semibold">Hết hạn bảo hành:</span>
                        <span className="break-words">{formatDate(selectedDevice.warrantyExpiry)}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-24 shrink-0 font-semibold">Chu kỳ bảo trì:</span>
                        <span className="break-words">{formatMaintenanceInterval(selectedDevice.maintenanceInterval)}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="w-24 shrink-0 font-semibold">Người tạo:</span>
                        <span className="break-words">{String(selectedDevice.createdBy || "-")}</span>
                      </div>
                    </div>

                    <div className="mt-3 border-t border-border pt-3">
                      <p className="mb-2 text-sm font-semibold text-foreground">Mã QR thiết bị</p>
                      <div className="inline-flex h-40 w-40 items-center justify-center rounded-md border border-border bg-secondary/20 p-2">
                        {detailQrCodeDataUrl ? (
                          <img src={detailQrCodeDataUrl} alt="QR thiết bị" className="h-28 w-28" />
                        ) : (
                          <div className="flex h-28 w-28 items-center justify-center text-xs text-muted-foreground">
                            Không thể tạo mã QR
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-lg border border-border p-3">
                      <p className="mb-2 text-sm font-semibold text-foreground">Hình ảnh thiết bị</p>
                      <div className="overflow-hidden rounded-md border border-border bg-secondary/20">
                        {imageCandidates.length > 0 ? (
                          <img
                            src={imageCandidates[0]}
                            alt={`Ảnh ${selectedDevice.name}`}
                            className="h-36 w-full object-contain bg-white"
                            data-fallback-index="0"
                            onError={(event) => {
                              const currentIndex = Number(event.currentTarget.dataset.fallbackIndex || "0")
                              const nextIndex = currentIndex + 1

                              if (nextIndex < imageCandidates.length) {
                                event.currentTarget.dataset.fallbackIndex = String(nextIndex)
                                event.currentTarget.src = imageCandidates[nextIndex]
                                return
                              }

                              event.currentTarget.onerror = null
                              event.currentTarget.src = "/placeholder.jpg"
                            }}
                          />
                        ) : (
                          <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">
                            Chưa có hình ảnh
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                </div>
              </TabsContent>

              <TabsContent value="logs" className="max-h-[62vh] overflow-y-auto pt-2 pr-1">
                {isLogsLoading && (
                  <p className="text-sm text-muted-foreground">Đang tải nhật kí thiết bị...</p>
                )}

                {!isLogsLoading && deviceLogs.length === 0 && (
                  <p className="text-sm text-muted-foreground">Chưa có nhật kí điều chuyển, bảo trì hoặc sửa chữa.</p>
                )}

                {!isLogsLoading && deviceLogs.length > 0 && (
                  <div className="space-y-2">
                    {deviceLogs.map((log) => (
                      <div key={log.id} className="rounded-md border border-border p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-foreground">{log.title} - {log.code}</p>
                          <Badge className="bg-secondary text-foreground">{String(log.status || "-")}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">{log.description || "-"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{log.date ? formatDate(log.date) : "-"}</p>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
              )
            })()
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa thiết bị</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Tên thiết bị</Label>
              <Input value={editForm.name} onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))} />
            </div>

            <div className="space-y-1">
              <Label>Model</Label>
              <Input value={editForm.model ?? ""} onChange={(event) => setEditForm((prev) => ({ ...prev, model: event.target.value }))} />
            </div>

            <div className="space-y-1">
              <Label>Danh mục</Label>
              <Input value={editForm.category ?? ""} onChange={(event) => setEditForm((prev) => ({ ...prev, category: event.target.value }))} />
            </div>

            <div className="space-y-1">
              <Label>Vị trí</Label>
              <Input value={editForm.location ?? ""} disabled readOnly />
            </div>

            <div className="space-y-1">
              <Label>Giá trị</Label>
              <Input value={editForm.value ?? ""} onChange={(event) => setEditForm((prev) => ({ ...prev, value: event.target.value }))} />
            </div>

            <div className="space-y-1">
              <Label>Chu kỳ bảo trì (tháng)</Label>
              <Input
                type="number"
                min={1}
                value={editForm.maintenanceInterval ?? ""}
                onChange={(event) =>
                  setEditForm((prev) => ({
                    ...prev,
                    maintenanceInterval: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-1">
              <Label>Hình ảnh thiết bị</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) {
                    void uploadDeviceImage(file, "edit")
                  }
                  event.currentTarget.value = ""
                }}
              />
            </div>

            <div className="space-y-1">
              <Label>Trạng thái</Label>
              <Select value={editForm.status} onValueChange={(value) => setEditForm((prev) => ({ ...prev, status: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Hoạt động</SelectItem>
                  <SelectItem value="maintenance">Đang bảo trì</SelectItem>
                  <SelectItem value="repairing">Đang sửa chữa</SelectItem>
                  <SelectItem value="inactive">Đã thanh lý</SelectItem>
                  <SelectItem value="broken">Hỏng</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isSubmitting}>
                Hủy
              </Button>
              <Button onClick={handleSaveEdit} disabled={isSubmitting || isUploadingImage}>
                {isUploadingImage ? "Đang tải ảnh..." : isSubmitting ? "Đang lưu..." : "Lưu thay đổi"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle>Thêm thiết bị</DialogTitle>
          </DialogHeader>

          <Tabs value={createTab} onValueChange={setCreateTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="manual">Nhập tay</TabsTrigger>
              <TabsTrigger value="csv">Nhập CSV</TabsTrigger>
            </TabsList>

            <TabsContent value="manual" className="space-y-3 pt-3">
              <div className="space-y-1">
                <Label>Số lượng thiết bị <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min={1}
                  value={createForm.quantity}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, quantity: event.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label>Tên thiết bị <span className="text-destructive">*</span></Label>
                <Input value={createForm.name ?? ""} onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))} />
              </div>

              <div className="space-y-1">
                <Label>Hãng sản xuất <span className="text-destructive">*</span></Label>
                <Input
                  value={createForm.manufacturer ?? ""}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, manufacturer: event.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label>Model <span className="text-destructive">*</span></Label>
                <Input value={createForm.model ?? ""} onChange={(event) => setCreateForm((prev) => ({ ...prev, model: event.target.value }))} />
              </div>

              <div className="space-y-1">
                <Label>Danh mục <span className="text-destructive">*</span></Label>
                <Input value={createForm.category ?? ""} onChange={(event) => setCreateForm((prev) => ({ ...prev, category: event.target.value }))} />
              </div>

              <div className="space-y-1">
                <Label>Vị trí</Label>
                <Input value="Tự động cập nhật khi cấp phát/điều chuyển" disabled readOnly />
              </div>

              <div className="space-y-1">
                <Label>Giá trị <span className="text-destructive">*</span></Label>
                <Input value={createForm.value ?? ""} onChange={(event) => setCreateForm((prev) => ({ ...prev, value: event.target.value }))} />
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Ngày mua <span className="text-destructive">*</span></Label>
                  <Input type="date" value={createForm.purchaseDate ?? ""} onChange={(event) => setCreateForm((prev) => ({ ...prev, purchaseDate: event.target.value }))} />
                </div>

                <div className="space-y-1">
                  <Label>Hết hạn bảo hành <span className="text-destructive">*</span></Label>
                  <Input type="date" value={createForm.warrantyExpiry ?? ""} onChange={(event) => setCreateForm((prev) => ({ ...prev, warrantyExpiry: event.target.value }))} />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Chu kỳ bảo trì (tháng) <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min={1}
                  value={createForm.maintenanceInterval ?? ""}
                  onChange={(event) => setCreateForm((prev) => ({ ...prev, maintenanceInterval: event.target.value }))}
                />
              </div>

              <div className="space-y-1">
                <Label>Hình ảnh thiết bị</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) {
                      void uploadDeviceImage(file, "create")
                    }
                    event.currentTarget.value = ""
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Chọn ảnh từ máy tính để tự tải lên server.
                </p>
              </div>

              <div className="space-y-1">
                <Label>Trạng thái</Label>
                <Select value={createForm.status} onValueChange={(value) => setCreateForm((prev) => ({ ...prev, status: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn trạng thái" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Hoạt động</SelectItem>
                    <SelectItem value="maintenance">Đang bảo trì</SelectItem>
                    <SelectItem value="repairing">Đang sửa chữa</SelectItem>
                    <SelectItem value="inactive">Đã thanh lý</SelectItem>
                    <SelectItem value="broken">Hỏng</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isSubmitting}>
                  Hủy
                </Button>
                <Button onClick={handleCreateDevice} disabled={isSubmitting || isUploadingImage}>
                  {isUploadingImage ? "Đang tải ảnh..." : isSubmitting ? "Đang lưu..." : "Thêm thiết bị"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="csv" className="space-y-3 pt-3">
              <div className="space-y-1">
                <Label>Chọn file CSV</Label>
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setCsvFile(event.target.files?.[0] || null)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isImportingCsv}>
                  Hủy
                </Button>
                <Button onClick={handleImportCsvDevices} disabled={isImportingCsv}>
                  {isImportingCsv ? "Đang nhập..." : "Nhập thiết bị từ CSV"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Xuất Excel theo điều kiện</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Danh mục</Label>
              <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border border-border p-3">
                {categories.length === 0 && (
                  <p className="text-sm text-muted-foreground">Không có danh mục</p>
                )}
                {categories.map((category) => {
                  const normalized = category.toLowerCase()
                  return (
                    <label key={category} className="flex items-center gap-2 text-sm text-foreground">
                      <Checkbox
                        checked={exportCategories.includes(normalized)}
                        onCheckedChange={() => toggleExportCategory(category)}
                      />
                      <span>{category}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Khoa/Phòng</Label>
              <div className="max-h-36 space-y-2 overflow-y-auto rounded-md border border-border p-3">
                {departments.length === 0 && (
                  <p className="text-sm text-muted-foreground">Không có khoa/phòng</p>
                )}
                {departments.map((department) => {
                  const normalized = department.toLowerCase()
                  return (
                    <label key={department} className="flex items-center gap-2 text-sm text-foreground">
                      <Checkbox
                        checked={exportDepartments.includes(normalized)}
                        onCheckedChange={() => toggleExportDepartment(department)}
                      />
                      <span>{department}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setExportCategories([])
                  setExportDepartments([])
                }}
              >
                Bỏ chọn tất cả
              </Button>
              <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsExportDialogOpen(false)}>
                Hủy
              </Button>
              <Button onClick={handleConfirmExportExcel}>Xuất file</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
