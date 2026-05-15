"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
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
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"
import {
  ArrowRightLeft,
  CheckCircle2,
  Clock3,
  MoreHorizontal,
  Plus,
  Search,
  XCircle,
} from "lucide-react"

type TransferStatus = "all" | "pending" | "approved" | "completed" | "rejected"
type TransferPageTab = "requests" | "warehouse" | "transfers"
type CreateRequestTab = "transfer" | "allocation"
type RequestType = "transfer" | "allocation"

interface TransferItem {
  id: number
  deviceId?: number | null
  code: string
  deviceName: string
  serial: string
  from: string
  to: string
  toLocation?: string | null
  requestDate: string
  requester: string
  reason?: string | null
  requestType?: RequestType
  status: Exclude<TransferStatus, "all">
}

interface TransferSummary {
  total: number
  pending: number
  completed: number
  rejected: number
}

interface WarehouseDeviceItem {
  id: number
  code: string
  name: string
  category: string
  departmentName?: string | null
  location?: string | null
  status?: string | null
}

interface LoggedInUser {
  id?: number
  username?: string
  fullName?: string
  role?: string
  departmentName?: string | null
  department?: string | null
}

interface DepartmentOption {
  id: number
  name: string
}

interface UserOption {
  id: number
  name: string
  username?: string
  role?: string
  department?: string | null
}

const statusLabel: Record<Exclude<TransferStatus, "all">, string> = {
  pending: "Chờ duyệt",
  approved: "Đã duyệt",
  completed: "Hoàn thành",
  rejected: "Từ chối",
}

const statusClass: Record<Exclude<TransferStatus, "all">, string> = {
  pending: "bg-warning/20 text-warning",
  approved: "bg-info/20 text-info",
  completed: "bg-success/20 text-success",
  rejected: "bg-destructive/20 text-destructive",
}

const statusBadges: Record<Exclude<TransferStatus, "all">, React.ReactNode> = {
  pending: <Badge className={`${statusClass.pending} border-0`}><Clock3 className="h-3 w-3 mr-1" />{statusLabel.pending}</Badge>,
  approved: <Badge className={`${statusClass.approved} border-0`}><CheckCircle2 className="h-3 w-3 mr-1" />{statusLabel.approved}</Badge>,
  completed: <Badge className={`${statusClass.completed} border-0`}><CheckCircle2 className="h-3 w-3 mr-1" />{statusLabel.completed}</Badge>,
  rejected: <Badge className={`${statusClass.rejected} border-0`}><XCircle className="h-3 w-3 mr-1" />{statusLabel.rejected}</Badge>,
}

export function TransfersPage() {
  const searchParams = useSearchParams()
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"
  const [pageTab, setPageTab] = useState<TransferPageTab>("requests")
  const [transferItems, setTransferItems] = useState<TransferItem[]>([])
  const [warehouseDevices, setWarehouseDevices] = useState<WarehouseDeviceItem[]>([])
  const [stats, setStats] = useState<TransferSummary>({
    total: 0,
    pending: 0,
    completed: 0,
    rejected: 0,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isWarehouseLoading, setIsWarehouseLoading] = useState(false)
  const [isRequestSubmitting, setIsRequestSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<TransferStatus>("all")
  const [search, setSearch] = useState("")
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false)
  const [isCreateTransferDialogOpen, setIsCreateTransferDialogOpen] = useState(false)
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false)
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [assigningDeviceId, setAssigningDeviceId] = useState<number | null>(null)
  const [selectedWarehouseDeviceIds, setSelectedWarehouseDeviceIds] = useState<number[]>([])
  const [selectedTransfer, setSelectedTransfer] = useState<TransferItem | null>(null)
  const [selectedDeleteTransfer, setSelectedDeleteTransfer] = useState<TransferItem | null>(null)
  const [transferReason, setTransferReason] = useState("")
  const [requestToDepartment, setRequestToDepartment] = useState("")
  const [requestToLocation, setRequestToLocation] = useState("")
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser>({})
  const [isUserLoaded, setIsUserLoaded] = useState(false)
  const [departmentOptions, setDepartmentOptions] = useState<DepartmentOption[]>([])
  const [userOptions, setUserOptions] = useState<UserOption[]>([])
  const [createTransferReason, setCreateTransferReason] = useState("")
  const [toDepartment, setToDepartment] = useState("")
  const [toLocation, setToLocation] = useState("")
  const [selectedDeviceId, setSelectedDeviceId] = useState("")
  const [fromDepartment, setFromDepartment] = useState("")
  const [createRequestTab, setCreateRequestTab] = useState<CreateRequestTab>("transfer")
  const [allocationSearch, setAllocationSearch] = useState("")
  const [warehouseSearch, setWarehouseSearch] = useState("")
  const [allocationReason, setAllocationReason] = useState("")
  const [allocationLocation, setAllocationLocation] = useState("")
  const [allocationToDepartment, setAllocationToDepartment] = useState("")
  const [selectedAllocationNames, setSelectedAllocationNames] = useState<string[]>([])
  const [allocationQuantity, setAllocationQuantity] = useState("1")
  const [selectedReceiverUserIds, setSelectedReceiverUserIds] = useState<number[]>([])
  const [selectedTransferDeviceIds, setSelectedTransferDeviceIds] = useState<number[]>([])
  const [isBulkTransferDialogOpen, setIsBulkTransferDialogOpen] = useState(false)
  const [bulkTransferToDepartment, setBulkTransferToDepartment] = useState("")
  const [bulkTransferToLocation, setBulkTransferToLocation] = useState("")
  const [bulkTransferReason, setBulkTransferReason] = useState("")
  const [selectedBulkTransferReceiverIds, setSelectedBulkTransferReceiverIds] = useState<number[]>([])
  const { toast } = useToast()

  const notifyDevicesChanged = () => {
    const refreshToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`

    try {
      localStorage.setItem("devices-refresh-token", refreshToken)
    } catch {
      // ignore storage failures
    }

    window.dispatchEvent(new Event("devices-data-changed"))
  }

  useEffect(() => {
    const tabParam = String(searchParams.get("tab") || "").trim().toLowerCase()
    const validTabs: TransferStatus[] = ["all", "pending", "approved", "completed", "rejected"]

    if (!tabParam || !validTabs.includes(tabParam as TransferStatus)) {
      return
    }

    setPageTab("requests")
    setActiveTab(tabParam as TransferStatus)
  }, [searchParams])

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

  const normalizeDepartmentValue = (value: unknown) => {
    const text = String(value || "").trim()
    if (!text) {
      return ""
    }

    const [primaryDepartment] = text.split(/[;,]/)
    return String(primaryDepartment || "").trim()
  }

  const loadTransfers = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams()
      if (search.trim()) {
        params.set("search", search.trim())
      }

      const roleText = String(loggedInUser.role || "").trim()
      const requesterName = String(loggedInUser.fullName || "").trim()
      const requesterAlt = String(loggedInUser.username || "").trim()

      if (roleText) {
        params.set("role", roleText)
      }

      if (requesterName) {
        params.set("requester", requesterName)
      }

      if (requesterAlt) {
        params.set("requesterAlt", requesterAlt)
      }

      const response = await fetch(`${apiBaseUrl}/api/transfers?${params.toString()}`, {
        cache: "no-store",
      })

      if (!response.ok) {
        setTransferItems([])
        setStats({ total: 0, pending: 0, completed: 0, rejected: 0 })
        return
      }

      const data = (await response.json()) as {
        items?: TransferItem[]
        summary?: TransferSummary
      }

      setTransferItems(data.items || [])
      setStats(data.summary || { total: 0, pending: 0, completed: 0, rejected: 0 })
    } catch {
      setTransferItems([])
      setStats({ total: 0, pending: 0, completed: 0, rejected: 0 })
    } finally {
      setIsLoading(false)
    }
  }

  const loadWarehouseDevices = async () => {
    try {
      setIsWarehouseLoading(true)
      const response = await fetch(`${apiBaseUrl}/api/devices`, {
        cache: "no-store",
      })

      if (!response.ok) {
        setWarehouseDevices([])
        return
      }

      const data = (await response.json()) as {
        devices?: Array<{
          id: number
          code: string
          name: string
          category: string
          departmentName?: string | null
          location?: string | null
          status?: string | null
        }>
      }

      setWarehouseDevices(data.devices || [])
    } catch {
      setWarehouseDevices([])
    } finally {
      setIsWarehouseLoading(false)
    }
  }

  const loadDepartments = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/departments/summary`, {
        cache: "no-store",
      })

      if (!response.ok) {
        setDepartmentOptions([])
        return
      }

      const data = (await response.json()) as { departments?: Array<{ id: number; name: string }> }
      const items = (data.departments || []).map((item) => ({ id: item.id, name: String(item.name || "").trim() }))
      setDepartmentOptions(items.filter((item) => item.name))
    } catch {
      setDepartmentOptions([])
    }
  }

  const loadUsers = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/users/summary`, {
        cache: "no-store",
      })

      if (!response.ok) {
        setUserOptions([])
        return
      }

      const data = (await response.json()) as {
        users?: Array<{
          id: number
          name?: string
          username?: string
          role?: string
          department?: string | null
        }>
      }

      const users = (data.users || []).map((item) => ({
        id: Number(item.id || 0),
        name: String(item.name || item.username || "").trim(),
        username: String(item.username || "").trim() || undefined,
        role: String(item.role || "").trim() || undefined,
        department: String(item.department || "").trim() || null,
      }))

      setUserOptions(users.filter((item) => item.id > 0 && item.name))
    } catch {
      setUserOptions([])
    }
  }

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem("user")
      if (!storedUser) {
        setLoggedInUser({})
        setIsUserLoaded(true)
        return
      }

      const parsedUser = JSON.parse(storedUser) as LoggedInUser
      const normalizedDepartmentName =
        normalizeDepartmentValue(parsedUser.departmentName) || normalizeDepartmentValue(parsedUser.department)

      setLoggedInUser({
        ...parsedUser,
        departmentName: normalizedDepartmentName || null,
      })
      setIsUserLoaded(true)
    } catch {
      setLoggedInUser({})
      setIsUserLoaded(true)
    }
  }, [])

  useEffect(() => {
    loadDepartments()
  }, [apiBaseUrl])

  useEffect(() => {
    loadUsers()
  }, [apiBaseUrl])

  useEffect(() => {
    if (pageTab === "requests") {
      if (!isUserLoaded) {
        return
      }
      loadTransfers()
      return
    }

    loadWarehouseDevices()
  }, [apiBaseUrl, pageTab, search, loggedInUser.fullName, loggedInUser.username, loggedInUser.role, isUserLoaded])

  const normalizeText = (value: string) => String(value || "").trim().toLowerCase()

  const isAdminUser = useMemo(() => {
    const role = normalizeText(loggedInUser.role || "")
    return ["admin", "administrator", "quản trị viên", "quan tri vien", "super admin"].includes(role)
  }, [loggedInUser.role])

  const isDepartmentEmployee = useMemo(() => {
    const role = normalizeText(loggedInUser.role || "")
    return role.includes("nhân viên") || role.includes("nhan vien")
  }, [loggedInUser.role])

  useEffect(() => {
    if (isDepartmentEmployee && pageTab !== "requests") {
      setPageTab("requests")
    }
  }, [isDepartmentEmployee, pageTab])

  useEffect(() => {
    setSelectedReceiverUserIds([])
  }, [requestToDepartment])

  useEffect(() => {
    setSelectedBulkTransferReceiverIds([])
  }, [bulkTransferToDepartment])

  useEffect(() => {
    setSelectedDeviceId("")
  }, [fromDepartment])

  const canCreateDepartmentTransfer = isAdminUser || isDepartmentEmployee

  const employeeDepartment = useMemo(
    () => normalizeDepartmentValue(loggedInUser.departmentName) || normalizeDepartmentValue(loggedInUser.department),
    [loggedInUser.departmentName, loggedInUser.department]
  )

  useEffect(() => {
    if (!isDepartmentEmployee || employeeDepartment) {
      return
    }

    let cancelled = false

    const syncDepartmentFromServer = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/users/summary`, {
          cache: "no-store",
        })

        if (!response.ok || cancelled) {
          return
        }

        const data = (await response.json()) as {
          users?: Array<{
            id?: number
            username?: string
            name?: string
            department?: string | null
          }>
        }

        const userId = Number(loggedInUser.id || 0)
        const username = normalizeText(String(loggedInUser.username || ""))
        const fullName = normalizeText(String(loggedInUser.fullName || ""))

        const matchedUser = (data.users || []).find((item) => {
          const itemId = Number(item.id || 0)
          const itemUsername = normalizeText(String(item.username || ""))
          const itemName = normalizeText(String(item.name || ""))

          if (userId > 0 && itemId > 0) {
            return userId === itemId
          }

          if (username && itemUsername) {
            return username === itemUsername
          }

          return Boolean(fullName && itemName && fullName === itemName)
        })

        const syncedDepartment = normalizeDepartmentValue(matchedUser?.department)
        if (!syncedDepartment || cancelled) {
          return
        }

        setLoggedInUser((prev) => ({
          ...prev,
          departmentName: syncedDepartment,
          department: syncedDepartment,
        }))
      } catch {
        // keep silent because this is only a best-effort fallback sync
      }
    }

    void syncDepartmentFromServer()

    return () => {
      cancelled = true
    }
  }, [
    apiBaseUrl,
    isDepartmentEmployee,
    employeeDepartment,
    loggedInUser.id,
    loggedInUser.username,
    loggedInUser.fullName,
  ])

  const departmentNames = useMemo(() => departmentOptions.map((item) => item.name), [departmentOptions])

  const employeesBySelectedDepartment = useMemo(() => {
    const selectedDepartment = normalizeText(requestToDepartment)
    if (!selectedDepartment) {
      return [] as UserOption[]
    }

    return userOptions.filter((item) => {
      const departmentMatched = normalizeText(String(item.department || "")) === selectedDepartment
      if (!departmentMatched) {
        return false
      }

      const roleText = normalizeText(String(item.role || ""))
      return roleText.includes("nhân viên") || roleText.includes("nhan vien")
    })
  }, [requestToDepartment, userOptions])

  const employeesByBulkTransferDepartment = useMemo(() => {
    const selectedDepartment = normalizeText(bulkTransferToDepartment)
    if (!selectedDepartment) {
      return [] as UserOption[]
    }

    return userOptions.filter((item) => {
      const departmentMatched = normalizeText(String(item.department || "")) === selectedDepartment
      if (!departmentMatched) {
        return false
      }

      const roleText = normalizeText(String(item.role || ""))
      return roleText.includes("nhân viên") || roleText.includes("nhan vien")
    })
  }, [bulkTransferToDepartment, userOptions])

  const availableDevicesForTransfer = useMemo(() => {
    return warehouseDevices.filter((item) => {
      const itemDepartment = String(item.departmentName || "").trim()
      const itemLocation = String(item.location || "").trim()
      const hasDepartment =
        itemDepartment && itemDepartment !== "-" && !normalizeText(itemDepartment).includes("chưa phân khoa")
      const hasLocation = itemLocation && itemLocation !== "-"

      if (!hasDepartment || !hasLocation) {
        return false
      }

      if (isAdminUser) {
        return true
      }

      if (isDepartmentEmployee) {
        return itemDepartment === employeeDepartment
      }

      return false
    })
  }, [warehouseDevices, isAdminUser, isDepartmentEmployee, employeeDepartment])

  const transferDeviceOptions = useMemo(() => {
    if (!isAdminUser) {
      return availableDevicesForTransfer
    }

    const normalizedFrom = normalizeText(fromDepartment)
    if (!normalizedFrom) {
      return []
    }

    return availableDevicesForTransfer.filter((item) => {
      const itemDepartment = normalizeText(String(item.departmentName || ""))
      return itemDepartment === normalizedFrom
    })
  }, [availableDevicesForTransfer, fromDepartment, isAdminUser])

  const selectedDeviceForTransfer = useMemo(
    () => transferDeviceOptions.find((item) => String(item.id) === selectedDeviceId) || null,
    [transferDeviceOptions, selectedDeviceId]
  )

  const filteredTransfers = useMemo(() => {
    const text = search.trim().toLowerCase()

    return transferItems.filter((item) => {
      const tabMatched = activeTab === "all" || item.status === activeTab
      const searchMatched =
        !text ||
        item.code.toLowerCase().includes(text) ||
        item.deviceName.toLowerCase().includes(text) ||
        item.serial.toLowerCase().includes(text) ||
        item.from.toLowerCase().includes(text) ||
        item.to.toLowerCase().includes(text) ||
        item.requester.toLowerCase().includes(text)

      return tabMatched && searchMatched
    })
  }, [activeTab, search, transferItems])

  const transferOnlyItems = useMemo(() => {
    return filteredTransfers.filter((item) => (item.requestType || "transfer") === "transfer")
  }, [filteredTransfers])

  const transferDevicesByDepartment = useMemo(() => {
    const text = search.trim().toLowerCase()
    const source = availableDevicesForTransfer.filter((item) => {
      if (!text) {
        return true
      }

      return (
        String(item.code || "").toLowerCase().includes(text) ||
        String(item.name || "").toLowerCase().includes(text) ||
        String(item.category || "").toLowerCase().includes(text) ||
        String(item.location || "").toLowerCase().includes(text) ||
        String(item.departmentName || "").toLowerCase().includes(text)
      )
    })

    const grouped = new Map<string, WarehouseDeviceItem[]>()

    source.forEach((item) => {
      const department = String(item.departmentName || "Chưa phân khoa").trim() || "Chưa phân khoa"
      if (!grouped.has(department)) {
        grouped.set(department, [])
      }

      grouped.get(department)?.push(item)
    })

    return Array.from(grouped.entries())
      .map(([department, items]) => ({
        department,
        items: items.sort((first, second) => {
          const nameCompare = String(first.name || "").localeCompare(String(second.name || ""), "vi", {
            sensitivity: "base",
          })
          if (nameCompare !== 0) {
            return nameCompare
          }

          return String(first.code || "").localeCompare(String(second.code || ""), "vi", {
            sensitivity: "base",
          })
        }),
      }))
      .sort((first, second) => first.department.localeCompare(second.department, "vi", { sensitivity: "base" }))
  }, [availableDevicesForTransfer, search])

  const filteredWarehouseDevices = useMemo(() => {
    const text = warehouseSearch.trim().toLowerCase()

    const filtered = warehouseDevices.filter((item) => {
      const departmentText = String(item.departmentName || "").trim().toLowerCase()
      const isNoDepartment =
        !departmentText ||
        departmentText === "-" ||
        departmentText === "chưa phân khoa" ||
        departmentText === "chua phan khoa"

      if (!isNoDepartment) {
        return false
      }

      if (!text) {
        return true
      }

      return (
        String(item.code || "").toLowerCase().includes(text) ||
        String(item.name || "").toLowerCase().includes(text) ||
        String(item.category || "").toLowerCase().includes(text) ||
        String(item.location || "").toLowerCase().includes(text)
      )
    })

    return filtered.sort((first, second) => {
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
  }, [warehouseDevices, warehouseSearch])

  const selectedWarehouseDevices = useMemo(() => {
    if (!selectedWarehouseDeviceIds.length) {
      return [] as WarehouseDeviceItem[]
    }

    const deviceMap = new Map(warehouseDevices.map((item) => [item.id, item]))
    return selectedWarehouseDeviceIds
      .map((id) => deviceMap.get(id))
      .filter((item): item is WarehouseDeviceItem => Boolean(item))
  }, [warehouseDevices, selectedWarehouseDeviceIds])

  const selectedWarehouseDevice = selectedWarehouseDevices.length === 1 ? selectedWarehouseDevices[0] : null

  const selectedTransferDevices = useMemo(() => {
    if (!selectedTransferDeviceIds.length) {
      return [] as WarehouseDeviceItem[]
    }

    const deviceMap = new Map(availableDevicesForTransfer.map((item) => [item.id, item]))
    return selectedTransferDeviceIds
      .map((id) => deviceMap.get(id))
      .filter((item): item is WarehouseDeviceItem => Boolean(item))
  }, [availableDevicesForTransfer, selectedTransferDeviceIds])

  const excludedBulkTransferDepartments = useMemo(() => {
    const excluded = new Set<string>()
    selectedTransferDevices.forEach((device) => {
      const department = String(device.departmentName || "").trim()
      if (department) {
        excluded.add(department)
      }
    })
    return excluded
  }, [selectedTransferDevices])

  const allocationGroupedDevices = useMemo(() => {
    const searchText = allocationSearch.trim().toLowerCase()
    const sourceDevices = warehouseDevices.filter((item) => {
      const departmentText = String(item.departmentName || "").trim().toLowerCase()
      const isNoDepartment =
        !departmentText ||
        departmentText === "-" ||
        departmentText === "chưa phân khoa" ||
        departmentText === "chua phan khoa"

      if (!isNoDepartment) {
        return false
      }

      if (!searchText) {
        return true
      }

      return String(item.name || "").toLowerCase().includes(searchText)
    })

    const groupedMap = new Map<
      string,
      {
        key: string
        name: string
        quantity: number
        devices: WarehouseDeviceItem[]
      }
    >()

    sourceDevices.forEach((item) => {
      const name = String(item.name || "").trim()
      if (!name) {
        return
      }

      const key = normalizeText(name)
      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          key,
          name,
          quantity: 0,
          devices: [],
        })
      }

      const grouped = groupedMap.get(key)
      if (!grouped) {
        return
      }

      grouped.quantity += 1
      grouped.devices.push(item)
    })

    return Array.from(groupedMap.values()).sort((a, b) => a.name.localeCompare(b.name, "vi"))
  }, [warehouseDevices, allocationSearch])

  const handleOpenRequestDialog = (device: WarehouseDeviceItem) => {
    // Do not auto-select device to avoid showing serial immediately
    setSelectedWarehouseDeviceIds([])
    setTransferReason("")
    setRequestToDepartment("")
    setRequestToLocation("")
    setSelectedReceiverUserIds([])
    setIsRequestDialogOpen(true)
  }

  const handleOpenBulkRequestDialog = () => {
    if (selectedWarehouseDeviceIds.length === 0) {
      alert("Vui lòng chọn ít nhất 1 thiết bị để cấp phát")
      return
    }

    setTransferReason("")
    setRequestToDepartment("")
    setRequestToLocation("")
    setSelectedReceiverUserIds([])
    setIsRequestDialogOpen(true)
  }

  const toggleWarehouseDeviceSelection = (deviceId: number) => {
    setSelectedWarehouseDeviceIds((prev) =>
      prev.includes(deviceId) ? prev.filter((item) => item !== deviceId) : [...prev, deviceId]
    )
  }

  const toggleSelectAllWarehouseDevices = () => {
    const filteredIds = filteredWarehouseDevices.map((item) => item.id)
    const isAllSelected =
      filteredIds.length > 0 && filteredIds.every((id) => selectedWarehouseDeviceIds.includes(id))

    if (isAllSelected) {
      setSelectedWarehouseDeviceIds((prev) => prev.filter((id) => !filteredIds.includes(id)))
      return
    }

    setSelectedWarehouseDeviceIds((prev) => Array.from(new Set([...prev, ...filteredIds])))
  }

  const toggleReceiverUser = (userId: number) => {
    setSelectedReceiverUserIds((prev) =>
      prev.includes(userId) ? prev.filter((item) => item !== userId) : [...prev, userId]
    )
  }

  const toggleTransferDeviceSelection = (deviceId: number) => {
    setSelectedTransferDeviceIds((prev) =>
      prev.includes(deviceId) ? prev.filter((item) => item !== deviceId) : [...prev, deviceId]
    )
  }

  const toggleBulkTransferReceiver = (userId: number) => {
    setSelectedBulkTransferReceiverIds((prev) =>
      prev.includes(userId) ? prev.filter((item) => item !== userId) : [...prev, userId]
    )
  }

  const handleOpenCreateTransferFlow = () => {
    if (!canCreateDepartmentTransfer) {
      alert("Chỉ Admin hoặc Nhân viên khoa mới được tạo yêu cầu điều chuyển giữa các khoa")
      return
    }

    if (isDepartmentEmployee && !employeeDepartment) {
      alert("Tài khoản nhân viên chưa được gán khoa/phòng")
      return
    }

    loadWarehouseDevices()
    setSelectedWarehouseDeviceIds([])
    setFromDepartment("")
    setToDepartment("")
    setToLocation("")
    setSelectedDeviceId("")
    setCreateTransferReason("")
    setCreateRequestTab(isDepartmentEmployee ? "allocation" : "transfer")
    setAllocationSearch("")
    setAllocationReason("")
    setAllocationLocation("")
    setAllocationToDepartment("")
    setSelectedAllocationNames([])
    setAllocationQuantity("1")
    setIsCreateTransferDialogOpen(true)
  }

  const handleOpenBulkTransferDialog = () => {
    if (selectedTransferDeviceIds.length === 0) {
      alert("Vui lòng chọn ít nhất 1 thiết bị để điều chuyển")
      return
    }

    setBulkTransferToDepartment("")
    setBulkTransferToLocation("")
    setBulkTransferReason("")
    setSelectedBulkTransferReceiverIds([])
    setIsBulkTransferDialogOpen(true)
  }

  const handleSubmitBulkTransfer = async () => {
    if (selectedTransferDevices.length === 0) {
      return
    }

    if (!bulkTransferToDepartment.trim()) {
      alert("Vui lòng chọn khoa chuyển đến")
      return
    }

    if (!bulkTransferToLocation.trim()) {
      alert("Vui lòng nhập vị trí điều chuyển đến")
      return
    }

    if (selectedBulkTransferReceiverIds.length === 0) {
      alert("Vui lòng chọn người nhận thiết bị")
      return
    }

    const invalidSameDepartment = selectedTransferDevices.find(
      (device) => normalizeText(String(device.departmentName || "")) === normalizeText(bulkTransferToDepartment)
    )

    if (invalidSameDepartment) {
      alert("Có thiết bị đang ở khoa chuyển đến. Vui lòng chọn khoa khác")
      return
    }

    try {
      setIsRequestSubmitting(true)

      const requestCode = `DC-${Date.now().toString().slice(-5)}`

      const requesterName =
        String(loggedInUser.fullName || "").trim() ||
        String(loggedInUser.username || "").trim() ||
        "Người dùng hệ thống"

      const selectedReceivers = userOptions
        .filter((user) => selectedBulkTransferReceiverIds.includes(user.id))
        .map((user) => ({
          id: user.id,
          name: user.name,
          username: user.username,
        }))

      for (const device of selectedTransferDevices) {
        const response = await fetch(`${apiBaseUrl}/api/transfers`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            deviceId: device.id,
            deviceName: device.name,
            serial: device.code,
            fromDepartment: String(device.departmentName || "").trim() || "-",
            toDepartment: bulkTransferToDepartment.trim(),
            requester: requesterName,
            requesterUserId: loggedInUser.id || null,
            requesterRole: loggedInUser.role || null,
            actorRole: loggedInUser.role || null,
            reason: bulkTransferReason.trim() || "Điều chuyển thiết bị",
            toLocation: bulkTransferToLocation.trim(),
            requestType: "transfer",
            receiverUsers: selectedReceivers,
          }),
        })

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { message?: string } | null
          alert(data?.message || "Gửi yêu cầu điều chuyển thất bại")
          return
        }
      }

      toast({ description: "Đã điều chuyển thiết bị thành công", variant: 'success' })
      setIsBulkTransferDialogOpen(false)
      setPageTab("requests")
      setActiveTab(isAdminUser ? "approved" : "pending")
      setSearch("")
      setSelectedTransferDeviceIds([])
      await loadTransfers()
      notifyDevicesChanged()
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsRequestSubmitting(false)
    }
  }

  const toggleAllocationName = (nameKey: string) => {
    setSelectedAllocationNames((prev) =>
      prev.includes(nameKey) ? prev.filter((item) => item !== nameKey) : [...prev, nameKey]
    )
  }

  const handleSubmitDepartmentTransfer = async () => {
    if (!canCreateDepartmentTransfer) {
      alert("Bạn không có quyền tạo điều chuyển giữa các khoa")
      return
    }

    if (isAdminUser && !fromDepartment.trim()) {
      alert("Vui lòng chọn khoa chuyển đi")
      return
    }

    const selectedDevice = selectedDeviceForTransfer
    const from = String(selectedDevice?.departmentName || "").trim() || (isDepartmentEmployee ? employeeDepartment : fromDepartment)
    if (!from) {
      alert("Thiết bị chưa có khoa chuyển đi hợp lệ")
      return
    }

    if (!toDepartment) {
      alert("Vui lòng chọn khoa chuyển đến")
      return
    }

    if (toDepartment === from) {
      alert("Khoa chuyển đến phải khác khoa chuyển đi")
      return
    }

    if (!toLocation.trim()) {
      alert("Vui lòng nhập vị trí di chuyển tới")
      return
    }

    if (!selectedDevice) {
      alert("Vui lòng chọn thiết bị")
      return
    }

    if (!createTransferReason.trim()) {
      alert("Vui lòng nhập lý do điều chuyển")
      return
    }

    try {
      setIsRequestSubmitting(true)

      const requesterName =
        String(loggedInUser.fullName || "").trim() ||
        String(loggedInUser.username || "").trim() ||
        "Người dùng hệ thống"

      const response = await fetch(`${apiBaseUrl}/api/transfers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          deviceId: selectedDevice.id,
          deviceName: selectedDevice.name,
          serial: selectedDevice.code,
          fromDepartment: from,
          toDepartment,
          requester: requesterName,
          requesterUserId: loggedInUser.id || null,
          requesterRole: loggedInUser.role || null,
          actorRole: loggedInUser.role || null,
          reason: createTransferReason.trim(),
          toLocation: toLocation.trim(),
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "Tạo yêu cầu điều chuyển thất bại")
        return
      }

      setIsCreateTransferDialogOpen(false)
      setPageTab("requests")
      setActiveTab(isAdminUser ? "approved" : "pending")
      setSearch("")
      await loadTransfers()
      notifyDevicesChanged()
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsRequestSubmitting(false)
    }
  }

  const handleSubmitTransferRequest = async () => {
    if (selectedWarehouseDevices.length === 0) {
      return
    }

    if (isAdminUser && !requestToDepartment) {
      alert("Vui lòng chọn khoa chuyển đến")
      return
    }

    if (isAdminUser && !requestToLocation.trim()) {
      alert("Vui lòng nhập vị trí chuyển đến")
      return
    }

    if (!transferReason.trim()) {
      alert(isAdminUser ? "Vui lòng nhập lý do cấp phát" : "Vui lòng nhập lý do muốn điều chuyển")
      return
    }

    if (isAdminUser && selectedReceiverUserIds.length === 0) {
      alert("Vui lòng chọn ít nhất 1 nhân viên nhận thiết bị")
      return
    }

    try {
      setIsRequestSubmitting(true)

      const requesterName =
        String(loggedInUser.fullName || "").trim() ||
        String(loggedInUser.username || "").trim() ||
        "Người dùng hệ thống"

      const selectedReceivers = userOptions
        .filter((user) => selectedReceiverUserIds.includes(user.id))
        .map((user) => ({
          id: user.id,
          name: user.name,
          username: user.username,
        }))

      const requestTypeValue = isAdminUser ? "allocation" : "transfer"
      const requestCode = `${isAdminUser ? "CP" : "DC"}-${Date.now().toString().slice(-5)}`

      // Format reason with role and name for allocation requests (only "Yêu cầu" for employee)
      const roleLabel = isAdminUser ? "Admin" : "Nhân viên"
      const formattedReason = isAdminUser && requestTypeValue === "allocation"
        ? `${roleLabel} [${requesterName}] - Cấp phát (${transferReason.trim()})`
        : requestTypeValue === "allocation"
          ? `${roleLabel} [${requesterName}] - Yêu cầu cấp phát (${transferReason.trim()})`
          : transferReason.trim()

      for (const device of selectedWarehouseDevices) {
        const response = await fetch(`${apiBaseUrl}/api/transfers`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            deviceId: device.id,
            deviceName: device.name,
            serial: requestTypeValue === "allocation" ? null : device.code,
            fromDepartment: "Kho thiết bị",
            toDepartment: isAdminUser ? requestToDepartment : "Chưa xác định",
            requester: requesterName,
            requesterUserId: loggedInUser.id || null,
            requesterRole: loggedInUser.role || null,
            actorRole: loggedInUser.role || null,
            reason: formattedReason,
            toLocation: isAdminUser ? requestToLocation.trim() : null,
            requestType: requestTypeValue,
            requestCode,
            receiverUsers: isAdminUser ? selectedReceivers : [],
          }),
        })

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { message?: string } | null
          alert(data?.message || "Gửi yêu cầu điều chuyển thất bại")
          return
        }

        await response.json().catch(() => null)
      }

      if (isAdminUser) {
        toast({
          description: `Đã điều chuyển ${selectedWarehouseDevices.length} thiết bị thành công`,
          duration: 2000,
          className: "border-emerald-200 bg-emerald-50 text-emerald-900 rounded-2xl px-4 py-3 shadow-lg",
        })
      } else {
        toast({
          description: `Đã gửi yêu cầu điều chuyển cho ${selectedWarehouseDevices.length} thiết bị`,
          duration: 2000,
          className: "border-emerald-200 bg-emerald-50 text-emerald-900 rounded-2xl px-4 py-3 shadow-lg",
        })
      }

      setIsRequestDialogOpen(false)
      setPageTab("requests")
      setActiveTab(isAdminUser ? "approved" : "pending")
      setSearch("")
      setSelectedWarehouseDeviceIds([])
      await loadTransfers()
      await loadWarehouseDevices()
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsRequestSubmitting(false)
    }
  }

  const handleSubmitAllocationRequest = async () => {
    if (isAdminUser && selectedReceiverUserIds.length === 0) {
      alert("Vui lòng chọn ít nhất 1 nhân viên nhận thiết bị")
      return
    }

    const requesterName =
      String(loggedInUser.fullName || "").trim() ||
      String(loggedInUser.username || "").trim() ||
      "Người dùng hệ thống"

    const selectedReceivers = userOptions
      .filter((user) => selectedReceiverUserIds.includes(user.id))
      .map((user) => ({
        id: user.id,
        name: user.name,
        username: user.username,
      }))

    const destinationDepartment = isAdminUser
      ? String(allocationToDepartment || "").trim()
      : String(employeeDepartment || "").trim()

    if (!destinationDepartment) {
      alert("Vui lòng chọn khoa nhận cấp phát")
      return
    }

    if (!selectedAllocationNames.length) {
      alert("Vui lòng chọn ít nhất 1 loại thiết bị cần cấp phát")
      return
    }

    if (!allocationReason.trim()) {
      alert("Vui lòng nhập lý do cấp phát")
      return
    }

    const quantityPerType = Number.parseInt(allocationQuantity, 10)
    if (!Number.isInteger(quantityPerType) || quantityPerType <= 0) {
      alert("Số lượng cấp phát phải là số nguyên dương")
      return
    }

    const selectedGroups = allocationGroupedDevices.filter((item) =>
      selectedAllocationNames.includes(item.key)
    )

    const invalidGroup = selectedGroups.find((item) => item.quantity < quantityPerType)
    if (invalidGroup) {
      alert(`Thiết bị ${invalidGroup.name} chỉ còn ${invalidGroup.quantity} trong kho`)
      return
    }

    const selectedDevices = selectedGroups.flatMap((item) => item.devices.slice(0, quantityPerType))
    if (!selectedDevices.length) {
      alert("Không tìm thấy thiết bị hợp lệ để gửi yêu cầu")
      return
    }

    try {
      setIsRequestSubmitting(true)

      // Format reason to match dashboard activity description
      const roleLabel = isAdminUser ? "Admin" : "Nhân viên"
      // Only add "Yêu cầu cấp phát" for employee requests
      const formattedReason = !isAdminUser
        ? `${roleLabel} [${requesterName}] - Yêu cầu cấp phát (${allocationReason.trim()})`
        : `${roleLabel} [${requesterName}] - Cấp phát (${allocationReason.trim()})`

      // Generate one code for all devices in this batch
      const requestCode = `CP-${Date.now().toString().slice(-5)}`;

      for (const device of selectedDevices) {
        const response = await fetch(`${apiBaseUrl}/api/transfers`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            deviceId: device.id,
            deviceName: device.name,
            serial: null,
            fromDepartment: "Kho thiết bị",
            toDepartment: destinationDepartment,
            requester: requesterName,
            requesterUserId: loggedInUser.id || null,
            requesterRole: loggedInUser.role || null,
            actorRole: loggedInUser.role || null,
            reason: formattedReason,
            toLocation: isAdminUser ? null : allocationLocation.trim() || null,
            requestType: "allocation",
            requestCode,
            receiverUsers: isAdminUser ? selectedReceivers : [],
          }),
        })

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { message?: string; detail?: string } | null
          const errorMsg = data?.detail || data?.message || `Gửi yêu cầu cấp phát thất bại cho thiết bị ${device.code}`
          alert(errorMsg)
          return
        }
      }

      alert(
        isAdminUser
          ? `Đã cấp phát ${selectedDevices.length} thiết bị thành công`
          : `Đã gửi ${selectedDevices.length} yêu cầu cấp phát để admin duyệt`
      )
      setIsCreateTransferDialogOpen(false)
      setPageTab("requests")
      setActiveTab(isAdminUser ? "approved" : "pending")
      setSearch("")
      await loadTransfers()
      await loadWarehouseDevices()
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsRequestSubmitting(false)
    }
  }

  const handleOpenTransferDetail = (item: TransferItem) => {
    setSelectedTransfer(item)
    setIsDetailDialogOpen(true)
  }

  const handleUpdateTransferStatus = async (
    item: TransferItem,
    status: Exclude<TransferStatus, "all">,
    reason?: string | null
  ) => {
    try {
      setIsRequestSubmitting(true)
      const actorUserId = loggedInUser.id || null

      const response = await fetch(`${apiBaseUrl}/api/transfers/${item.id}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status,
          reason: reason || null,
          actorUserId,
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "Cập nhật trạng thái thất bại")
        return
      }

      await loadTransfers()
      notifyDevicesChanged()
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsRequestSubmitting(false)
    }
  }

  const handleApproveTransfer = async (item: TransferItem) => {
    // Open approval dialog so admin can pick serial if needed
    setSelectedTransfer(item)
    setAssigningDeviceId(null)
    // ensure we have latest warehouse devices
    await loadWarehouseDevices()
    setIsApproveDialogOpen(true)
  }

  const handleRejectTransfer = async (item: TransferItem) => {
    const reason = window.prompt("Nhập lý do từ chối", item.reason || "")
    if (reason === null) {
      return
    }

    await handleUpdateTransferStatus(item, "rejected", reason.trim())
  }

  const handleDeleteDialogChange = (open: boolean) => {
    setIsDeleteDialogOpen(open)
    if (!open) {
      setSelectedDeleteTransfer(null)
    }
  }

  const handleRequestDeleteTransfer = (item: TransferItem) => {
    setSelectedDeleteTransfer(item)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDeleteTransfer = async () => {
    if (!selectedDeleteTransfer) {
      return
    }

    handleDeleteDialogChange(false)
    await handleDeleteTransfer(selectedDeleteTransfer)
  }

  const handleDeleteTransfer = async (item: TransferItem) => {
    try {
      setIsRequestSubmitting(true)

      const actorUserId = loggedInUser.id || null
      const actorQuery = actorUserId ? `?actorUserId=${actorUserId}` : ""
      const response = await fetch(`${apiBaseUrl}/api/transfers/${item.id}${actorQuery}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "Xóa yêu cầu thất bại")
        return
      }

      await loadTransfers()
      notifyDevicesChanged()
      toast({ description: `Đã xóa yêu cầu ${item.code} thành công` })
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsRequestSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={handleDeleteDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa yêu cầu điều chuyển?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa yêu cầu {selectedDeleteTransfer?.code} không?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleDeleteDialogChange(false)}>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteTransfer} disabled={isRequestSubmitting}>
              {isRequestSubmitting ? "Đang xóa..." : "Xóa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">QUẢN LÝ ĐIỀU CHUYỂN - CẤP PHÁT</h1>
        </div>
        {!isAdminUser && (
          <Button className="gap-2" onClick={handleOpenCreateTransferFlow}>
            <Plus className="h-4 w-4" />
            Tạo yêu cầu
          </Button>
        )}
      </div>

      {!isDepartmentEmployee && (
        <Tabs value={pageTab} onValueChange={(value) => setPageTab(value as TransferPageTab)}>
          <TabsList className="bg-secondary">
            <TabsTrigger value="requests">Yêu cầu</TabsTrigger>
            <TabsTrigger value="transfers">Điều chuyển thiết bị</TabsTrigger>
            <TabsTrigger value="warehouse">Cấp phát thiết bị</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {pageTab === "requests" && (
        <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TransferStatus)}>
          <TabsList className="bg-secondary">
            <TabsTrigger value="all">Tất cả</TabsTrigger>
            <TabsTrigger value="pending">Chờ duyệt</TabsTrigger>
            <TabsTrigger value="approved">Đã duyệt</TabsTrigger>
            <TabsTrigger value="rejected">Từ chối</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full lg:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tìm kiếm..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] table-auto text-center">
              <thead>
                <tr className="border-b border-border text-center">
                  <th className="px-4 py-4 text-sm font-semibold text-muted-foreground">Mã yêu cầu</th>
                  <th className="px-4 py-4 text-sm font-semibold text-muted-foreground">Thiết bị</th>
                  <th className="px-4 py-4 text-sm font-semibold text-muted-foreground">Điều chuyển</th>
                  <th className="px-4 py-4 text-sm font-semibold text-muted-foreground">Ngày yêu cầu</th>
                  <th className="px-4 py-4 text-sm font-semibold text-muted-foreground">Người yêu cầu</th>
                  <th className="px-4 py-4 text-sm font-semibold text-muted-foreground">Trạng thái</th>
                  <th className="w-12 px-4 py-4" />
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      Đang tải dữ liệu điều chuyển...
                    </td>
                  </tr>
                )}

                {!isLoading && filteredTransfers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      Chưa có dữ liệu điều chuyển
                    </td>
                  </tr>
                )}

                {!isLoading && filteredTransfers.map((item) => (
                  <tr key={item.id} className="border-b border-border/60 hover:bg-secondary/40">
                    <td className="px-4 py-4 text-sm font-semibold text-foreground">{item.code}</td>
                    <td className="px-4 py-4">
                      <div>
                        <p className="font-semibold text-foreground">{item.deviceName}</p>
                        <p className="text-xs text-muted-foreground mt-1">{item.serial ? String(item.serial).trim() : "-"}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-foreground">
                      {item.from} <span className="mx-2 text-muted-foreground">→</span> {item.to}
                    </td>
                    <td className="px-4 py-4 text-sm text-foreground">{formatDate(item.requestDate)}</td>
                    <td className="px-4 py-4 text-sm text-foreground">{item.requester}</td>
                    <td className="px-4 py-4">
                      <Badge className={statusClass[item.status]}>{statusLabel[item.status]}</Badge>
                    </td>
                    <td className="px-4 py-4 text-right text-muted-foreground">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="rounded-md p-1 hover:bg-secondary">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40 bg-card border-border">
                          <DropdownMenuItem onClick={() => handleOpenTransferDetail(item)}>Xem chi tiết</DropdownMenuItem>
                          {item.status === "pending" ? (
                            <>
                              <DropdownMenuItem onClick={() => handleApproveTransfer(item)}>Duyệt</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleRejectTransfer(item)}>
                                Từ chối
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleRequestDeleteTransfer(item)}>
                              Xóa
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
        </>
      )}

      {pageTab === "transfers" && (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Tìm thiết bị theo mã, tên, khoa/phòng..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">
                Đã chọn: {selectedTransferDeviceIds.length}
              </span>
              <Button size="sm" onClick={handleOpenBulkTransferDialog} disabled={selectedTransferDeviceIds.length === 0}>
                Điều chuyển đã chọn
              </Button>
            </div>
          </div>

          {isWarehouseLoading ? (
            <Card className="border-border bg-card">
              <CardContent className="px-4 py-8 text-center text-muted-foreground">
                Đang tải dữ liệu thiết bị...
              </CardContent>
            </Card>
          ) : transferDevicesByDepartment.length === 0 ? (
            <Card className="border-border bg-card">
              <CardContent className="px-4 py-8 text-center text-muted-foreground">
                Không có thiết bị phù hợp để điều chuyển
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {transferDevicesByDepartment.map((group) => (
                <Card key={group.department} className="border-border bg-card">
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-lg font-semibold text-foreground">{group.department}</p>
                      </div>
                      <Badge className="bg-primary/10 text-primary">{group.items.length} thiết bị</Badge>
                    </div>

                    <div className="space-y-2">
                      {group.items.map((device) => (
                        <label
                          key={device.id}
                          className="flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 hover:bg-secondary"
                        >
                          <input
                            type="checkbox"
                            checked={selectedTransferDeviceIds.includes(device.id)}
                            onChange={() => toggleTransferDeviceSelection(device.id)}
                            className="mt-1 h-4 w-4"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {device.code} - {device.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {device.category || "-"} • {device.location || "-"}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {pageTab === "warehouse" && !isDepartmentEmployee && (
        <Card className="border-border bg-card">
          <CardContent className="p-0">
            <div className="border-b border-border/60 px-4 py-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative w-full md:max-w-xs">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Tìm thiết bị theo mã, tên, danh mục..."
                    value={warehouseSearch}
                    onChange={(event) => setWarehouseSearch(event.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    Đã chọn: {selectedWarehouseDeviceIds.length}
                  </span>
                  <Button size="sm" onClick={handleOpenBulkRequestDialog} disabled={selectedWarehouseDeviceIds.length === 0}>
                    Cấp phát đã chọn
                  </Button>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] table-auto text-center">
                <thead>
                  <tr className="border-b border-border text-center">
                    <th className="w-12 px-4 py-4 text-sm font-semibold text-muted-foreground" />
                    <th className="px-4 py-4 text-sm font-semibold text-muted-foreground">Mã thiết bị</th>
                    <th className="px-4 py-4 text-sm font-semibold text-muted-foreground">Tên thiết bị</th>
                    <th className="px-4 py-4 text-sm font-semibold text-muted-foreground">Danh mục</th>
                    <th className="px-4 py-4 text-sm font-semibold text-muted-foreground">Khoa/Phòng</th>
                    <th className="px-4 py-4 text-sm font-semibold text-muted-foreground">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {isWarehouseLoading && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        Đang tải dữ liệu thiết bị trong kho...
                      </td>
                    </tr>
                  )}

                  {!isWarehouseLoading && filteredWarehouseDevices.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        Không có thiết bị nào chưa nhập khoa/phòng
                      </td>
                    </tr>
                  )}

                  {!isWarehouseLoading && filteredWarehouseDevices.map((item) => (
                    <tr key={item.id} className="border-b border-border/60 hover:bg-secondary/40">
                      <td className="px-4 py-4 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={selectedWarehouseDeviceIds.includes(item.id)}
                          onChange={() => toggleWarehouseDeviceSelection(item.id)}
                        />
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-foreground">{item.code || "-"}</td>
                      <td className="px-4 py-4 text-sm text-foreground">{item.name || "-"}</td>
                      <td className="px-4 py-4 text-sm text-foreground">{item.category || "-"}</td>
                      <td className="px-4 py-4 text-sm text-warning">Chưa nhập</td>
                      <td className="px-4 py-4 text-sm text-foreground">
                        <Badge className="bg-success/20 text-success">Hoạt động</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={isCreateTransferDialogOpen} onOpenChange={setIsCreateTransferDialogOpen}>
        <DialogContent className="bg-card border-border max-w-[560px] w-[92vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader className="gap-0">
            <DialogTitle>
              {createRequestTab === "transfer"
                ? "Tạo yêu cầu điều chuyển thiết bị"
                : "Tạo yêu cầu cấp phát thiết bị"}
            </DialogTitle>
          </DialogHeader>

          <div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="font-bold">Thiết bị cần cấp phát</Label>
                  <Input
                    placeholder="Nhập tên thiết bị cần cấp phát"
                    value={allocationSearch}
                    onChange={(event) => setAllocationSearch(event.target.value)}
                  />
                  <div className="max-h-56 space-y-2 overflow-auto rounded-md border border-border p-2">
                    {allocationGroupedDevices.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Không có thiết bị phù hợp trong kho</p>
                    ) : (
                      allocationGroupedDevices.map((item) => {
                        const checked = selectedAllocationNames.includes(item.key)

                        return (
                          <label
                            key={item.key}
                            className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-secondary"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAllocationName(item.key)}
                              className="mt-1 h-4 w-4"
                            />
                            <div>
                              <p className="text-sm font-medium text-foreground">{item.name}</p>
                            </div>
                          </label>
                        )
                      })
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="font-bold">Khoa nhận cấp phát</Label>
                  {isAdminUser ? (
                    <Select value={allocationToDepartment || undefined} onValueChange={setAllocationToDepartment}>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn khoa nhận thiết bị" />
                      </SelectTrigger>
                      <SelectContent>
                        {departmentNames.map((department) => (
                          <SelectItem key={department} value={department}>
                            {department}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={employeeDepartment || "-"} readOnly />
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="font-bold">Số lượng</Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={allocationQuantity}
                    onChange={(event) => setAllocationQuantity(event.target.value)}
                    placeholder="Nhập số lượng"
                  />
                </div>

                {!isAdminUser && (
                  <div className="space-y-1">
                    <Label className="font-bold">Vị trí cấp phát</Label>
                    <Input
                      placeholder="Nhập vị trí đặt thiết bị"
                      value={allocationLocation}
                      onChange={(event) => setAllocationLocation(event.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="font-bold">Lý do cấp phát</Label>
                  <Textarea
                    placeholder="Nhập lý do cấp phát..."
                    value={allocationReason}
                    onChange={(event) => setAllocationReason(event.target.value)}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsCreateTransferDialogOpen(false)}>
                    Hủy
                  </Button>
                  <Button onClick={handleSubmitAllocationRequest} disabled={isRequestSubmitting} className="bg-green-600 hover:bg-green-700">
                    {isRequestSubmitting ? "Đang xử lý..." : "Cấp phát"}
                  </Button>
                </div>
              </div>
            </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="bg-card border-border max-w-2xl">
          <DialogHeader>
            <DialogTitle>Chi tiết yêu cầu điều chuyển</DialogTitle>
          </DialogHeader>

          {selectedTransfer ? (
            <div className="space-y-5 pt-2">
              {/* Header Section */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-secondary/30 rounded-lg border border-border">
                <div>
                  <p className="text-xs text-muted-foreground font-bold">Mã yêu cầu</p>
                  <p className="text-lg font-bold text-foreground">{selectedTransfer.code}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-bold">Trạng thái</p>
                  <div className="mt-1">{statusBadges[selectedTransfer.status]}</div>
                </div>
              </div>

              {/* Device Section */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-foreground">Thông tin thiết bị</h3>
                <div className="grid grid-cols-2 gap-4 px-2">
                  <div>
                    <p className="text-xs text-muted-foreground font-bold">Thiết bị</p>
                    <p className="text-sm font-medium text-foreground mt-1">{selectedTransfer.deviceName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-bold">Vị trí</p>
                    <p className="text-sm font-medium text-foreground mt-1">{String(selectedTransfer.toLocation || "").trim() || "-"}</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Location Section */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-foreground">Địa điểm chuyển</h3>
                <div className="grid grid-cols-2 gap-4 px-2">
                  <div>
                    <p className="text-xs text-muted-foreground font-bold">Từ khoa/phòng</p>
                    <p className="text-sm font-medium text-foreground mt-1">{selectedTransfer.from || "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-bold">Đến khoa/phòng</p>
                    <p className="text-sm font-medium text-foreground mt-1">{selectedTransfer.to || "-"}</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Request Info Section */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm text-foreground">Thông tin yêu cầu</h3>
                <div className="grid grid-cols-2 gap-4 px-2">
                  <div>
                    <p className="text-xs text-muted-foreground font-bold">Ngày yêu cầu</p>
                    <p className="text-sm font-medium text-foreground mt-1">{formatDate(selectedTransfer.requestDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground font-bold">Người yêu cầu</p>
                    <p className="text-sm font-medium text-foreground mt-1">{selectedTransfer.requester}</p>
                  </div>
                </div>
                <div className="px-2">
                  <p className="text-xs text-muted-foreground font-bold">Lý do</p>
                  <p className="text-sm font-medium text-foreground mt-1 p-2 bg-secondary/30 rounded border border-border">
                    {(() => {
                      const reason = String(selectedTransfer.reason || "").trim()
                      const match = reason.match(/\(([^)]+)\)/)
                      return match ? match[1] : reason || "-"
                    })()}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Duyệt yêu cầu và chọn mã serial</DialogTitle>
          </DialogHeader>

          {selectedTransfer ? (
            <div className="space-y-3">
              <p><strong>Mã yêu cầu:</strong> {selectedTransfer.code}</p>
              <p><strong>Thiết bị yêu cầu:</strong> {selectedTransfer.deviceName}</p>
              <p><strong>Yêu cầu bởi:</strong> {selectedTransfer.requester}</p>

              <div>
                <Label className="font-bold">Chọn thiết bị (mã serial)</Label>
                <div className="max-h-48 overflow-auto rounded-md border border-border p-2 space-y-2">
                  {warehouseDevices.filter(d => (
                    String(d.name || "").trim().toLowerCase() === String(selectedTransfer.deviceName || "").trim().toLowerCase()
                  )).length === 0 ? (
                    <div className="text-sm text-muted-foreground">Không tìm thấy thiết bị tương ứng trong kho</div>
                  ) : (
                    warehouseDevices.filter(d => (
                      String(d.name || "").trim().toLowerCase() === String(selectedTransfer.deviceName || "").trim().toLowerCase()
                    )).map((d) => (
                      <label key={d.id} className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded hover:bg-secondary">
                        <input type="radio" name="assignDevice" checked={assigningDeviceId === d.id} onChange={() => setAssigningDeviceId(d.id)} />
                        <div className="text-sm">
                          <div className="font-medium">{d.code}</div>
                          <div className="text-xs text-muted-foreground">{d.category || ""} • {d.location || ""}</div>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)}>Hủy</Button>
                <Button onClick={async () => {
                  if (!selectedTransfer) return
                  try {
                    setIsRequestSubmitting(true)

                    // If an assigning device was chosen, call API to assign it to transfer
                    if (assigningDeviceId) {
                      const resp = await fetch(`${apiBaseUrl}/api/transfers/${selectedTransfer.id}/assign-device`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ deviceId: assigningDeviceId }),
                      })
                      if (!resp.ok) {
                        const data = await resp.json().catch(() => null)
                        alert(data?.message || "Gán thiết bị thất bại")
                        return
                      }
                    }

                    // Approve the transfer (this will apply changes to the device on server)
                    await handleUpdateTransferStatus(selectedTransfer, "approved")
                    setIsApproveDialogOpen(false)
                    toast({ description: `Đã duyệt yêu cầu ${selectedTransfer.code}` })
                  } catch (e) {
                    alert("Không thể duyệt yêu cầu")
                  } finally {
                    setIsRequestSubmitting(false)
                  }
                }} className="bg-green-600 hover:bg-green-700">Duyệt</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>{isAdminUser ? "Yêu cầu cấp phát thiết bị" : "Yêu cầu điều chuyển thiết bị"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1 text-sm">
              {selectedWarehouseDevices.length === 1 ? (
                <>
                  <p><strong>Mã thiết bị:</strong> {selectedWarehouseDevice?.code || "-"}</p>
                  <p><strong>Tên thiết bị:</strong> {selectedWarehouseDevice?.name || "-"}</p>
                </>
              ) : (
                <p><strong>Thiết bị đã chọn:</strong> {selectedWarehouseDevices.length}</p>
              )}
            </div>

            {isAdminUser && (
              <div className="space-y-1">
                <Label className="font-bold">Khoa nhận cấp phát</Label>
                <Select value={requestToDepartment || undefined} onValueChange={setRequestToDepartment}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn khoa" />
                  </SelectTrigger>
                  <SelectContent>
                    {departmentNames.map((department) => (
                      <SelectItem key={department} value={department}>
                        {department}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {isAdminUser && (
              <div className="space-y-1">
                <Label className="font-bold">Vị trí cấp phát</Label>
                <Input
                  placeholder="Nhập vị trí đặt thiết bị tại khoa"
                  value={requestToLocation}
                  onChange={(event) => setRequestToLocation(event.target.value)}
                />
              </div>
            )}

            {isAdminUser && requestToDepartment && (
              <div className="space-y-1">
                <Label>Nhân viên nhận thiết bị</Label>
                <div className="max-h-44 space-y-2 overflow-auto rounded-md border border-border p-2">
                  {employeesBySelectedDepartment.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Không có nhân viên nào trong khoa đã chọn</p>
                  ) : (
                    employeesBySelectedDepartment.map((item) => (
                      <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-secondary">
                        <input
                          type="checkbox"
                          checked={selectedReceiverUserIds.includes(item.id)}
                          onChange={() => toggleReceiverUser(item.id)}
                          className="mt-1 h-4 w-4"
                        />
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.username || "-"}</p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label className="font-bold">{isAdminUser ? "Lý do cấp phát" : "Lý do muốn điều chuyển"}</Label>
              <Textarea
                placeholder={isAdminUser ? "Nhập lý do cấp phát..." : "Nhập lý do điều chuyển..."}
                value={transferReason}
                onChange={(event) => setTransferReason(event.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsRequestDialogOpen(false)}>
                Hủy
              </Button>
              <Button onClick={handleSubmitTransferRequest} disabled={isRequestSubmitting}>
                {isRequestSubmitting ? "Đang xử lý..." : isAdminUser ? "Chuyển thiết bị" : "Gửi yêu cầu"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkTransferDialogOpen} onOpenChange={setIsBulkTransferDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Điều chuyển thiết bị đã chọn</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1 text-sm">
              {selectedTransferDevices.length === 1 ? (
                <>
                  <p><strong>Mã thiết bị:</strong> {selectedTransferDevices[0]?.code || "-"}</p>
                  <p><strong>Tên thiết bị:</strong> {selectedTransferDevices[0]?.name || "-"}</p>
                </>
              ) : (
                <p><strong>Thiết bị đã chọn:</strong> {selectedTransferDevices.length}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Khoa chuyển đến</Label>
              <Select value={bulkTransferToDepartment || undefined} onValueChange={setBulkTransferToDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn khoa chuyển đến" />
                </SelectTrigger>
                <SelectContent>
                  {departmentNames
                    .filter((department) => !excludedBulkTransferDepartments.has(department))
                    .map((department) => (
                      <SelectItem key={department} value={department}>
                        {department}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Vị trí điều chuyển đến</Label>
              <Input
                placeholder="Nhập vị trí nhận thiết bị"
                value={bulkTransferToLocation}
                onChange={(event) => setBulkTransferToLocation(event.target.value)}
              />
            </div>

            {bulkTransferToDepartment && (
              <div className="space-y-1">
                <Label>Người nhận thiết bị</Label>
                <div className="max-h-44 space-y-2 overflow-auto rounded-md border border-border p-2">
                  {employeesByBulkTransferDepartment.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Không có nhân viên nào trong khoa đã chọn</p>
                  ) : (
                    employeesByBulkTransferDepartment.map((item) => (
                      <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-secondary">
                        <input
                          type="checkbox"
                          checked={selectedBulkTransferReceiverIds.includes(item.id)}
                          onChange={() => toggleBulkTransferReceiver(item.id)}
                          className="mt-1 h-4 w-4"
                        />
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.username || "-"}</p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label>Ghi chú</Label>
              <Textarea
                placeholder="Nhập ghi chú điều chuyển (nếu có)"
                value={bulkTransferReason}
                onChange={(event) => setBulkTransferReason(event.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsBulkTransferDialogOpen(false)}>
                Hủy
              </Button>
              <Button onClick={handleSubmitBulkTransfer} disabled={isRequestSubmitting}>
                {isRequestSubmitting ? "Đang xử lý..." : "Xác nhận điều chuyển"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
