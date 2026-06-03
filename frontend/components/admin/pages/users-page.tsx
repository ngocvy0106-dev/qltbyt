"use client"

import { useEffect, useMemo, useState } from "react"
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Users,
  UserCheck,
  Shield,
  UserCog,
  Search,
  MoreHorizontal,
  Plus,
  Eye,
  Pencil,
  KeyRound,
  UserX,
  Trash2,
} from "lucide-react"

interface UserItem {
  id: number
  name: string
  username: string
  email: string
  role: string
  roleId?: number | null
  departmentId?: number | null
  department: string | null
  status: string | null
  lastLogin: string | null
}

interface RoleItem {
  id: number
  name: string
}

interface UsersSummary {
  totalUsers: number
  activeUsers: number
  adminUsers: number
  employeeUsers: number
}

interface UsersResponse {
  summary?: UsersSummary
  users?: UserItem[]
  roles?: RoleItem[]
}

interface UserActivityLogItem {
  id: number
  username: string
  fullName: string
  role: string
  action: string
  description: string
  createdAt: string | null
}

interface DepartmentItem {
  id: number
  name: string
}

function formatDateTime(value: string | null) {
  if (!value) return "-"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("vi-VN", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour12: false,
  }).format(date)
}

function normalizeVietnameseText(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
}

function isLockedStatus(value: string | null | undefined) {
  const normalized = normalizeVietnameseText(value)
  return ["khoa", "khoa tai khoan", "locked", "inactive"].includes(normalized)
}

function formatUserLogAction(log: UserActivityLogItem) {
  const action = normalizeVietnameseText(log.action)
  const description = String(log.description || "").trim()

  if (action === "user.login") {
    return "Đăng nhập"
  }

  if (action === "user.logout") {
    return "Đăng xuất"
  }

  if (action.startsWith("transfer.")) {
    const match = description.match(/\|\s([^|\[]+)(\[[^\]]+\])?\s*$/)
    const deviceText = match?.[1]?.trim()
    const serialText = match?.[2]?.trim() || ""
    const deviceLabel = deviceText ? `${deviceText}${serialText ? ` ${serialText}` : ""}` : "thiết bị"
    return `Yêu cầu điều chuyển thiết bị ${deviceLabel}`
  }

  if (action.startsWith("repair.")) {
    if ((action === "repair.confirm" || action === "repair.complete" || action === "repair.request") && description) {
      return description
        .replace(/\s*-\s*kết quả:\s*.*$/i, "")
        .replace(/\s*-\s*ket qua:\s*.*$/i, "")
        .trim()
    }

    const match = description.match(/\|\s([^|\[]+)(\[[^\]]+\])?\s*$/)
    const deviceText = match?.[1]?.trim()
    const serialText = match?.[2]?.trim() || ""
    const deviceLabel = deviceText ? `${deviceText}${serialText ? ` ${serialText}` : ""}` : "thiết bị"
    return `Yêu cầu sửa chữa thiết bị ${deviceLabel}`
  }

  if (action.startsWith("maintenance.")) {
    if (action === "maintenance.confirm" && description) {
      return description
    }
    return "Yêu cầu bảo trì thiết bị"
  }

  if (action.startsWith("device.")) {
    return "Thao tác thiết bị"
  }

  return log.action
}

const roleBadgeClass = (role: string) => {
  const normalized = String(role || "").trim().toLowerCase()

  if (normalized === "admin" || normalized === "quản trị viên" || normalized === "quan tri vien") {
    return "bg-destructive/20 text-destructive"
  }

  return "bg-info/20 text-info"
}

export function UsersPage() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"
  const LOG_POLL_INTERVAL_MS = 2000
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [users, setUsers] = useState<UserItem[]>([])
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null)
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeletingId, setIsDeletingId] = useState<number | null>(null)
  const [selectedDeleteUser, setSelectedDeleteUser] = useState<UserItem | null>(null)
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<"resetPassword" | "toggleLock" | null>(null)
  const [confirmUser, setConfirmUser] = useState<UserItem | null>(null)
  const [editForm, setEditForm] = useState({
    name: "",
    username: "",
    roleId: "",
    departmentId: "",
  })
  const [createForm, setCreateForm] = useState({
    name: "",
    username: "",
    email: "",
    roleId: "",
    password: "123456",
    departmentId: "",
  })
  const [summary, setSummary] = useState<UsersSummary>({
    totalUsers: 0,
    activeUsers: 0,
    adminUsers: 0,
    employeeUsers: 0,
  })
  const [search, setSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [userLogs, setUserLogs] = useState<UserActivityLogItem[]>([])
  const [isAdminViewer, setIsAdminViewer] = useState(false)
  const { toast } = useToast()

  const getActorUserId = () => {
    try {
      const userRaw = localStorage.getItem("user")
      const parsed = JSON.parse(userRaw || "{}")
      const actorId = Number(parsed?.id || 0)
      return Number.isInteger(actorId) && actorId > 0 ? actorId : null
    } catch {
      return null
    }
  }

  useEffect(() => {
    try {
      const userRaw = localStorage.getItem("user")
      const roleValue = String(JSON.parse(userRaw || "{}")?.role || "")
      const normalizedRole = normalizeVietnameseText(roleValue)
      setIsAdminViewer(
        normalizedRole.includes("admin") ||
        normalizedRole.includes("quan tri vien") ||
        normalizedRole.includes("administrator"),
      )
    } catch {
      setIsAdminViewer(false)
    }
  }, [])

  const loadUsers = async (options?: { showLoading?: boolean }) => {
    const showLoading = options?.showLoading !== false
    try {
      if (showLoading) {
        setIsLoading(true)
      }

      const params = new URLSearchParams()

      if (search.trim()) {
        params.set("search", search.trim())
      }

      if (roleFilter !== "all") {
        params.set("role", roleFilter)
      }

      if (statusFilter !== "all") {
        params.set("status", statusFilter)
      }

      const response = await fetch(`${apiBaseUrl}/api/users/summary?${params.toString()}`, {
        cache: "no-store",
      })

      if (!response.ok) {
        setUsers([])
        return
      }

      const data = (await response.json()) as UsersResponse

      if (data.summary) {
        setSummary(data.summary)
      }

      setUsers(data.users || [])
      setRoles(data.roles || [])

      const departmentsResponse = await fetch(`${apiBaseUrl}/api/departments/summary`, {
        cache: "no-store",
      })

      if (departmentsResponse.ok) {
        const departmentsData = (await departmentsResponse.json()) as {
          departments?: Array<{ id: number; name: string }>
        }
        setDepartments(departmentsData.departments || [])
      }

      if (isAdminViewer) {
        const userRaw = localStorage.getItem("user")
        let requesterRole = ""
        try {
          requesterRole = String(JSON.parse(userRaw || "{}")?.role || "").trim()
        } catch {
          requesterRole = ""
        }

        const logsParams = new URLSearchParams()
        logsParams.set("requesterRole", requesterRole)
        const logsResponse = await fetch(`${apiBaseUrl}/api/users/activity-logs?${logsParams.toString()}`, {
          cache: "no-store",
        })

        if (logsResponse.ok) {
          const logsData = (await logsResponse.json()) as { logs?: UserActivityLogItem[] }
          setUserLogs(Array.isArray(logsData.logs) ? logsData.logs : [])
        } else {
          setUserLogs([])
        }
      } else {
        setUserLogs([])
      }
    } catch {
      setUsers([])
      setUserLogs([])
    } finally {
      if (showLoading) {
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    loadUsers()
    const intervalId = window.setInterval(() => {
      loadUsers({ showLoading: false })
    }, LOG_POLL_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [apiBaseUrl, search, roleFilter, statusFilter, isAdminViewer])

  const filteredUsers = useMemo(() => users, [users])

  const groupedUsersByRole = useMemo(() => {
    const grouped = new Map<string, UserItem[]>()

    filteredUsers.forEach((item) => {
      const roleName = String(item.role || "").trim() || "Chưa phân vai trò"
      const group = grouped.get(roleName) || []
      group.push(item)
      grouped.set(roleName, group)
    })

    return Array.from(grouped.entries())
      .map(([roleName, items]) => ({
        roleName,
        items: [...items].sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""), "vi", { sensitivity: "base" }),
        ),
      }))
      .sort((a, b) => a.roleName.localeCompare(b.roleName, "vi", { sensitivity: "base" }))
  }, [filteredUsers])

  const orderedUsersByRole = useMemo(
    () => groupedUsersByRole.flatMap((group) => group.items),
    [groupedUsersByRole],
  )

  const openDetailDialog = (user: UserItem) => {
    setSelectedUser(user)
    setIsDetailDialogOpen(true)
  }

  const openEditDialog = (user: UserItem) => {
    setSelectedUser(user)
    // Ensure roleId is set; if missing, try to resolve by role name from roles list
    let resolvedRoleId = user.roleId ? String(user.roleId) : ""
    if (!resolvedRoleId && Array.isArray(roles) && roles.length) {
      const matched = roles.find((r) => normalizeVietnameseText(String(r.name || "")) === normalizeVietnameseText(String(user.role || "")))
      if (matched) {
        resolvedRoleId = String(matched.id)
      }
    }

    let resolvedDepartmentId = ""
    if (typeof user.departmentId === "number" && Number.isInteger(user.departmentId)) {
      resolvedDepartmentId = String(user.departmentId)
    } else if (user.department) {
      const matchedDepartment = departments.find(
        (department) =>
          normalizeVietnameseText(department.name) === normalizeVietnameseText(String(user.department || ""))
      )
      if (matchedDepartment) {
        resolvedDepartmentId = String(matchedDepartment.id)
      }
    }

    setEditForm({
      name: user.name || "",
      username: user.username || "",
      roleId: resolvedRoleId,
      departmentId: resolvedDepartmentId,
    })
    setIsEditDialogOpen(true)
  }

  const getRoleNameById = (roleId: string) => {
    const role = roles.find((item) => String(item.id) === roleId)
    return String(role?.name || "").trim().toLowerCase()
  }

  const isEmployeeRole = (roleId: string) => {
    const roleName = getRoleNameById(roleId)
    return ["nhân viên", "nhan vien", "nhanvien", "employee", "staff"].includes(roleName)
  }

  const handleUpdateUser = async () => {
    if (!selectedUser) {
      return
    }

    try {
      setIsSubmitting(true)

      const response = await fetch(`${apiBaseUrl}/api/users/${selectedUser.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editForm.name.trim(),
          username: editForm.username.trim(),
          roleId: editForm.roleId ? Number(editForm.roleId) : null,
          departmentId: editForm.departmentId ? Number(editForm.departmentId) : null,
          actorUserId: getActorUserId(),
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "người dùng thất bại")
        return
      }

      setIsEditDialogOpen(false)
      await loadUsers()
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateUser = async () => {
    if (!createForm.name.trim()) {
      alert("Họ tên không được để trống")
      return
    }

    if (!createForm.username.trim()) {
      alert("Tài khoản không được để trống")
      return
    }

    if (isEmployeeRole(createForm.roleId) && !createForm.departmentId) {
      alert("Vui lòng chọn khoa/phòng cho vai trò Nhân viên")
      return
    }

    try {
      setIsSubmitting(true)

      const response = await fetch(`${apiBaseUrl}/api/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: createForm.name.trim(),
          username: createForm.username.trim(),
          email: createForm.email.trim(),
          roleId: createForm.roleId ? Number(createForm.roleId) : null,
          password: createForm.password.trim() || "123456",
          status: "Hoạt động",
          departmentId: createForm.departmentId ? Number(createForm.departmentId) : null,
          actorUserId: getActorUserId(),
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "Thêm người dùng thất bại")
        return
      }

      setIsCreateDialogOpen(false)
      setCreateForm({
        name: "",
        username: "",
        email: "",
        roleId: "",
        password: "123456",
        departmentId: "",
      })
      await loadUsers()
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsSubmitting(false)
    }
  }

  const openConfirmDialog = (action: "resetPassword" | "toggleLock", user: UserItem) => {
    setConfirmAction(action)
    setConfirmUser(user)
    setIsConfirmDialogOpen(true)
  }

  const handleResetPassword = (user: UserItem) => {
    openConfirmDialog("resetPassword", user)
  }

  const performResetPassword = async (user: UserItem) => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/users/${user.id}/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ newPassword: "123456", actorUserId: getActorUserId() }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "Đặt lại mật khẩu thất bại")
        return
      }

      toast({
        description: "Đặt lại mật khẩu thành công",
        duration: 2000,
        className: "border-emerald-200 bg-emerald-50 text-emerald-900 rounded-2xl px-4 py-3 shadow-lg",
      })
    } catch {
      alert("Không thể kết nối server")
    }
  }

  const handleToggleLockUser = (user: UserItem) => {
    openConfirmDialog("toggleLock", user)
  }

  const performToggleLockUser = async (user: UserItem) => {
    const currentlyLocked = isLockedStatus(user.status)

    try {
      const response = await fetch(`${apiBaseUrl}/api/users/${user.id}/lock`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ locked: !currentlyLocked, actorUserId: getActorUserId() }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || `${currentlyLocked ? "Mở khóa" : "Tạm khóa"} tài khoản thất bại`)
        return
      }

      await loadUsers()
    } catch {
      alert("Không thể kết nối server")
    }
  }

  const handleConfirmAction = async () => {
    if (!confirmAction || !confirmUser) {
      setIsConfirmDialogOpen(false)
      return
    }

    const action = confirmAction
    const user = confirmUser
    setIsConfirmDialogOpen(false)
    setConfirmAction(null)
    setConfirmUser(null)

    if (action === "resetPassword") {
      await performResetPassword(user)
      return
    }

    await performToggleLockUser(user)
  }

  const handleDeleteDialogChange = (open: boolean) => {
    setIsDeleteDialogOpen(open)
    if (!open) {
      setSelectedDeleteUser(null)
    }
  }

  const handleRequestDeleteUser = (user: UserItem) => {
    setSelectedDeleteUser(user)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDeleteUser = async () => {
    if (!selectedDeleteUser) {
      return
    }

    handleDeleteDialogChange(false)
    await handleDeleteUser(selectedDeleteUser)
  }

  const handleDeleteUser = async (user: UserItem) => {
    try {
      setIsDeletingId(user.id)
      const actorUserId = getActorUserId()
      const actorQuery = actorUserId ? `?actorUserId=${actorUserId}` : ""
      const response = await fetch(`${apiBaseUrl}/api/users/${user.id}${actorQuery}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "Xóa tài khoản thất bại")
        return
      }

      await loadUsers()
      toast({ description: `Đã xóa tài khoản ${user.username} thành công` })
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <AlertDialog open={isConfirmDialogOpen} onOpenChange={setIsConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "resetPassword"
                ? "Đặt lại mật khẩu?"
                : confirmAction === "toggleLock"
                ? isLockedStatus(confirmUser?.status)
                  ? "Mở khóa tài khoản?"
                  : "Tạm khóa tài khoản?"
                : "Xác nhận"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "resetPassword"
                ? `Đặt lại mật khẩu cho ${confirmUser?.username} về mặc định 123456?`
                : confirmAction === "toggleLock"
                ? isLockedStatus(confirmUser?.status)
                  ? `Mở khóa tài khoản ${confirmUser?.username}?`
                  : `Tạm khóa tài khoản ${confirmUser?.username}?`
                : "Bạn có chắc muốn thực hiện thao tác này?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsConfirmDialogOpen(false)}>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction}>Xác nhận</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={handleDeleteDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa tài khoản?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa tài khoản {selectedDeleteUser?.username} không?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleDeleteDialogChange(false)}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteUser}
              disabled={isDeletingId === selectedDeleteUser?.id}
            >
              {isDeletingId === selectedDeleteUser?.id ? "Đang xóa..." : "Xóa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-border bg-card">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Tổng người dùng</p>
              <p className="mt-1 text-4xl font-bold text-foreground">{summary.totalUsers}</p>
            </div>
            <Users className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Đang hoạt động</p>
              <p className="mt-1 text-4xl font-bold text-foreground">{summary.activeUsers}</p>
            </div>
            <UserCheck className="h-8 w-8 text-success" />
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Quản trị viên</p>
              <p className="mt-1 text-4xl font-bold text-foreground">{summary.adminUsers}</p>
            </div>
            <Shield className="h-8 w-8 text-destructive" />
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Nhân viên</p>
              <p className="mt-1 text-4xl font-bold text-foreground">{summary.employeeUsers}</p>
            </div>
            <UserCog className="h-8 w-8 text-info" />
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-card">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-3xl font-semibold text-foreground">Danh sách người dùng</h2>
            </div>
            <Button className="gap-2" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Thêm người dùng
            </Button>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Tìm kiếm người dùng..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-full lg:w-[180px]">
                <SelectValue placeholder="Tất cả vai trò" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả vai trò</SelectItem>
                {Array.from(new Set(users.map((item) => item.role).filter(Boolean))).map((roleName) => (
                  <SelectItem key={roleName} value={roleName}>
                    {roleName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full lg:w-[180px]">
                <SelectValue placeholder="Tất cả trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả trạng thái</SelectItem>
                {Array.from(new Set(users.map((item) => item.status).filter(Boolean))).map((statusName) => (
                  <SelectItem key={statusName || "none"} value={String(statusName)}>
                    {statusName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="max-h-[62vh] overflow-x-auto overflow-y-auto bg-card">
            <table className="w-full min-w-[1100px] table-auto border-collapse text-center align-middle [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-20 [&_thead]:bg-[#a7d8c8] [&_thead_th]:bg-[#a7d8c8] [&_thead_th]:border-b [&_thead_th]:border-[#7fc8af] [&_thead_th]:font-bold [&_thead_th]:text-[#0f3b2f] [&_thead_th:first-child]:rounded-tl-lg [&_thead_th:last-child]:rounded-tr-lg [&_tbody]:bg-card [&_tbody_td]:border-b [&_tbody_td]:border-border/60 [&_th]:border-r [&_th]:border-border/60 [&_td]:border-r [&_td]:border-border/60 [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
              <thead>
                <tr className="border-b border-[#7fc8af] text-center">
                  <th className="min-w-[260px] px-4 py-4 text-sm font-bold text-[#0f3b2f]">Người dùng</th>
                  <th className="min-w-[220px] px-4 py-4 text-sm font-bold text-[#0f3b2f]">Email</th>
                  <th className="w-[110px] whitespace-nowrap px-4 py-4 text-sm font-bold text-[#0f3b2f]">Vai trò</th>
                  <th className="min-w-[220px] px-4 py-4 text-sm font-bold text-[#0f3b2f]">Phòng/Khoa</th>
                  <th className="w-[140px] whitespace-nowrap px-4 py-4 text-sm font-bold text-[#0f3b2f]">Trạng thái</th>
                  <th className="w-[220px] whitespace-nowrap px-4 py-4 text-sm font-bold text-[#0f3b2f]">Đăng nhập cuối</th>
                  <th className="w-12 px-4 py-4" />
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      Đang tải dữ liệu người dùng...
                    </td>
                  </tr>
                )}

                {!isLoading && filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      Không có dữ liệu người dùng từ database
                    </td>
                  </tr>
                )}

                {orderedUsersByRole.map((item) => (
                  <tr key={item.id} className="border-b border-border/60 hover:bg-secondary/40">
                    <td className="px-4 py-4">
                      <p className="font-semibold text-foreground">{item.name}</p>
                      <p className="text-sm text-muted-foreground">{item.username}</p>
                    </td>
                    <td className="px-4 py-4 text-foreground">{item.email || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <Badge className={roleBadgeClass(item.role)}>{item.role}</Badge>
                    </td>
                    <td className="px-4 py-4 text-foreground">{item.department || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-4">
                      <Badge
                        className={
                          !item.status
                            ? "bg-muted text-muted-foreground"
                            : isLockedStatus(item.status)
                              ? "bg-warning/20 text-warning"
                              : "bg-success/20 text-success"
                        }
                      >
                        {item.status || "-"}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-foreground">{formatDateTime(item.lastLogin)}</td>
                    <td className="px-4 py-4 text-center text-muted-foreground">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="rounded-md p-1 hover:bg-secondary">
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44 bg-card border-border">
                          <DropdownMenuLabel>Hành động</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2" onClick={() => openEditDialog(item)}>
                            <Pencil className="h-4 w-4" />
                            Chỉnh sửa
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => handleResetPassword(item)}>
                            <KeyRound className="h-4 w-4" />
                            Đặt lại mật khẩu
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 text-warning focus:text-warning" onClick={() => handleToggleLockUser(item)}>
                            <UserX className="h-4 w-4" />
                            {isLockedStatus(item.status) ? "Mở khóa" : "Tạm khóa"}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 text-destructive focus:text-destructive" onClick={() => handleRequestDeleteUser(item)}>
                            <Trash2 className="h-4 w-4" />
                            Xóa tài khoản
                          </DropdownMenuItem>
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

      {isAdminViewer && (
        <Card className="border-border bg-card">
          <CardContent className="space-y-4 p-6">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">Nhật kí người dùng</h2>
            </div>

            <div className="max-h-[320px] overflow-x-auto overflow-y-auto bg-card">
              <table className="w-full table-auto border-collapse text-center [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-20 [&_thead]:bg-[#e8f5ef] [&_thead_th]:border-b [&_thead_th]:border-[#c7e8da] [&_thead_th]:font-semibold [&_thead_th]:text-[#175a44] [&_tbody_td]:border-b [&_tbody_td]:border-border/60 [&_th]:border-r [&_th]:border-border/60 [&_td]:border-r [&_td]:border-border/60 [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-sm whitespace-nowrap w-[1%]">Thời gian</th>
                    <th className="px-3 py-3 text-sm whitespace-nowrap w-[220px]">Người dùng</th>
                    <th className="px-3 py-3 text-sm whitespace-nowrap w-[110px]">Vai trò</th>
                    <th className="px-4 py-3 text-sm">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {userLogs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">
                        Chưa có nhật kí hành động của người dùng
                      </td>
                    </tr>
                  )}

                  {userLogs.map((log) => (
                    <tr key={`user-log-${log.id}`} className="hover:bg-secondary/30">
                      <td className="px-4 py-3 text-sm text-foreground whitespace-nowrap w-[1%]">{formatDateTime(log.createdAt)}</td>
                      <td className="px-3 py-3 text-sm text-foreground whitespace-nowrap">
                        <p className="font-medium truncate max-w-[180px] mx-auto">{log.fullName}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[180px] mx-auto">{log.username}</p>
                      </td>
                      <td className="px-3 py-3 text-sm text-foreground whitespace-nowrap">{log.role}</td>
                      <td className="px-3 py-3 text-sm text-foreground whitespace-nowrap">
                        {formatUserLogAction(log)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Chi tiết người dùng</DialogTitle>
          </DialogHeader>

          {selectedUser && (
            <div className="space-y-2 text-sm text-foreground">
              <p><strong>Họ tên:</strong> {selectedUser.name}</p>
              <p><strong>Tài khoản:</strong> {selectedUser.username}</p>
              <p><strong>Vai trò:</strong> {selectedUser.role}</p>
              <p><strong>Phòng/Khoa:</strong> {selectedUser.department || "-"}</p>
              <p><strong>Trạng thái:</strong> {selectedUser.status || "-"}</p>
              <p><strong>Đăng nhập cuối:</strong> {formatDateTime(selectedUser.lastLogin)}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa người dùng</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Họ tên</Label>
              <Input
                value={editForm.name}
                onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Tài khoản</Label>
              <Input
                value={editForm.username}
                onChange={(event) => setEditForm((prev) => ({ ...prev, username: event.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Vai trò</Label>
              <Select value={editForm.roleId} onValueChange={(value) => setEditForm((prev) => ({ ...prev, roleId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn vai trò" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={String(role.id)}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isEmployeeRole(editForm.roleId) && (
              <div className="space-y-2">
                <Label>Chọn khoa/phòng</Label>
                <Select
                  value={editForm.departmentId}
                  onValueChange={(value) => setEditForm((prev) => ({ ...prev, departmentId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn khoa/phòng" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((department) => (
                      <SelectItem key={department.id} value={String(department.id)}>
                        {department.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isSubmitting}>
                Hủy
              </Button>
              <Button onClick={handleUpdateUser} disabled={isSubmitting}>
                {isSubmitting ? "Đang lưu..." : "Lưu thay đổi"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Thêm người dùng</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Họ tên</Label>
              <Input
                value={createForm.name}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Tài khoản</Label>
              <Input
                value={createForm.username}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, username: event.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Email</Label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Vai trò</Label>
              <Select value={createForm.roleId} onValueChange={(value) => setCreateForm((prev) => ({ ...prev, roleId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn vai trò" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={String(role.id)}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isEmployeeRole(createForm.roleId) && (
              <div className="space-y-2">
                <Label>Chọn khoa/phòng</Label>
                <Select
                  value={createForm.departmentId}
                  onValueChange={(value) => setCreateForm((prev) => ({ ...prev, departmentId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn khoa/phòng" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((department) => (
                      <SelectItem key={department.id} value={String(department.id)}>
                        {department.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label>Mật khẩu</Label>
              <Input
                value={createForm.password}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, password: event.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isSubmitting}>
                Hủy
              </Button>
              <Button onClick={handleCreateUser} disabled={isSubmitting}>
                {isSubmitting ? "Đang lưu..." : "Thêm người dùng"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
