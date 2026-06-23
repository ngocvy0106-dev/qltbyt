"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import { BarChart3, Building2, Pencil, Plus, Settings, Shield, Trash2, Users, Wrench, FileText } from "lucide-react"

interface RoleItem {
  id: number
  name: string
  description: string
  permissions: string[]
}

interface RoleCountApiItem {
  roleName: string
  userCount: number
}

interface PermissionModule {
  id: number
  title: string
  permissions: string[]
  icon: React.ComponentType<{ className?: string }>
}

const permissionModules: PermissionModule[] = [
  {
    id: 1,
    title: "Thiết bị",
    icon: Shield,
    permissions: ["Xem thiết bị", "Thêm thiết bị", "Sửa thiết bị", "Xóa thiết bị"],
  },
  {
    id: 2,
    title: "Bảo trì",
    icon: Wrench,
    permissions: [
      "Xem lịch bảo trì",
      "Tạo lịch bảo trì",
      "Cập nhật bảo trì",
      "Quản lý bảo trì",
    ],
  },
  {
    id: 3,
    title: "Báo cáo",
    icon: BarChart3,
    permissions: ["Xem báo cáo", "Xuất báo cáo", "Tạo báo cáo"],
  },
  {
    id: 4,
    title: "Phòng/Khoa",
    icon: Building2,
    permissions: ["Xem phòng/khoa", "Quản lý phòng/khoa"],
  },
  {
    id: 5,
    title: "Quản trị",
    icon: Settings,
    permissions: ["Quản lý người dùng", "Quản lý phân quyền", "Xem nhật ký", "Sao lưu dữ liệu"],
  },
  {
    id: 6,
    title: "Yêu cầu",
    icon: FileText,
    permissions: ["Tạo yêu cầu bảo trì", "Tạo yêu cầu điều chuyển", "Tạo yêu cầu sửa chữa"],
  },
]

function normalizeRoleName(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
}

function isAdminRoleName(value: string) {
  const normalized = normalizeRoleName(value)
  return ["admin", "administrator", "super admin", "quản trị viên", "quan tri vien"].includes(normalized)
}

export function PermissionsPage() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({})
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeletingRoleId, setIsDeletingRoleId] = useState<number | null>(null)
  const [formName, setFormName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formPermissions, setFormPermissions] = useState<string[]>([])
  const [selectedDeleteRole, setSelectedDeleteRole] = useState<RoleItem | null>(null)
  const { toast } = useToast()

  const allPermissions = useMemo(
    () => Array.from(new Set(permissionModules.flatMap((module) => module.permissions))),
    []
  )
  const isAdminForm = useMemo(() => isAdminRoleName(formName), [formName])

  useEffect(() => {
    const loadData = async () => {
      try {
        const [rolesResponse, countsResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/api/roles`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
            cache: "no-store",
          }),
          fetch(`${apiBaseUrl}/api/roles/counts`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
            cache: "no-store",
          }),
        ])

        if (rolesResponse.ok) {
          const rolesData = (await rolesResponse.json()) as { roles?: RoleItem[] }
          setRoles(Array.isArray(rolesData.roles) ? rolesData.roles : [])
        } else {
          setRoles([])
        }

        if (countsResponse.ok) {
          const data = (await countsResponse.json()) as { roles?: RoleCountApiItem[] }
          const countsMap: Record<string, number> = {}

          for (const item of data.roles || []) {
            const normalizedName = String(item.roleName || "").trim().toLowerCase()
            countsMap[normalizedName] = Number(item.userCount || 0)
          }

          setRoleCounts(countsMap)
        } else {
          setRoleCounts({})
        }
      } catch {
        setRoles([])
        setRoleCounts({})
      }
    }

    loadData()
  }, [apiBaseUrl])

  const refreshData = async () => {
    const [rolesResponse, countsResponse] = await Promise.all([
      fetch(`${apiBaseUrl}/api/roles`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }),
      fetch(`${apiBaseUrl}/api/roles/counts`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }),
    ])

    if (rolesResponse.ok) {
      const rolesData = (await rolesResponse.json()) as { roles?: RoleItem[] }
      setRoles(Array.isArray(rolesData.roles) ? rolesData.roles : [])
    }

    if (countsResponse.ok) {
      const data = (await countsResponse.json()) as { roles?: RoleCountApiItem[] }
      const countsMap: Record<string, number> = {}

      for (const item of data.roles || []) {
        const normalizedName = String(item.roleName || "").trim().toLowerCase()
        countsMap[normalizedName] = Number(item.userCount || 0)
      }

      setRoleCounts(countsMap)
    }
  }

  const openCreateDialog = () => {
    setEditingRole(null)
    setFormName("")
    setFormDescription("")
    setFormPermissions([])
    setIsDialogOpen(true)
  }

  const openEditDialog = (role: RoleItem) => {
    setEditingRole(role)
    setFormName(role.name)
    setFormDescription(role.description || "")
    setFormPermissions(isAdminRoleName(role.name) ? allPermissions : role.permissions || [])
    setIsDialogOpen(true)
  }

  const togglePermission = (permission: string, checked: boolean) => {
    setFormPermissions((previous) => {
      if (checked) {
        if (previous.includes(permission)) {
          return previous
        }

        return [...previous, permission]
      }

      return previous.filter((item) => item !== permission)
    })
  }

  const handleSubmitRole = async () => {
    const name = formName.trim()

    if (!name) {
      window.alert("Vui lòng nhập tên vai trò")
      return
    }

    try {
      setIsSubmitting(true)

      const response = await fetch(
        editingRole ? `${apiBaseUrl}/api/roles/${editingRole.id}` : `${apiBaseUrl}/api/roles`,
        {
          method: editingRole ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            description: formDescription.trim(),
            permissions: isAdminRoleName(name) ? allPermissions : formPermissions,
          }),
        }
      )

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { message?: string }
        window.alert(errorData.message || "Không thể lưu vai trò")
        return
      }

      setIsDialogOpen(false)
      setEditingRole(null)
      await refreshData()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteRole = async (role: RoleItem) => {
    try {
      setIsDeletingRoleId(role.id)
      const response = await fetch(`${apiBaseUrl}/api/roles/${role.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { message?: string }
        window.alert(errorData.message || "Không thể xóa vai trò")
        return
      }

      await refreshData()
      toast({ description: `Đã xóa vai trò ${role.name} thành công` })
    } catch {
      window.alert("Không thể xóa vai trò")
    } finally {
      setIsDeletingRoleId(null)
    }
  }

  const handleDeleteDialogChange = (open: boolean) => {
    setIsDeleteDialogOpen(open)
    if (!open) {
      setSelectedDeleteRole(null)
    }
  }

  const handleRequestDeleteRole = (role: RoleItem) => {
    setSelectedDeleteRole(role)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDeleteRole = async () => {
    if (!selectedDeleteRole) {
      return
    }

    handleDeleteDialogChange(false)
    await handleDeleteRole(selectedDeleteRole)
  }

  const rolesWithCount = useMemo(
    () =>
      roles.map((role) => ({
        ...role,
        userCount: roleCounts[String(role.name || "").trim().toLowerCase()] || 0,
        fullAccess:
          isAdminRoleName(role.name) ||
          (role.permissions || []).some((permission) => permission === "Toàn quyền") ||
          allPermissions.every((permission) => (role.permissions || []).includes(permission)),
      })),
    [allPermissions, roleCounts, roles]
  )

  return (
    <div className="space-y-8">
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={handleDeleteDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa vai trò?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa vai trò {selectedDeleteRole?.name} không?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleDeleteDialogChange(false)}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteRole}
              disabled={isDeletingRoleId === selectedDeleteRole?.id}
            >
              {isDeletingRoleId === selectedDeleteRole?.id ? "Đang xóa..." : "Xóa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">PHÂN QUYỀN</h1>
        </div>
        <Button className="gap-2 self-start" onClick={openCreateDialog}>
          <Plus className="h-4 w-4" />
          Thêm vai trò
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {rolesWithCount.map((role) => (
          <Card key={role.id} className="border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground">{role.name}</h3>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(role)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleRequestDeleteRole(role)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-0">
              <div className="flex items-center gap-2 text-base text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>{role.userCount} </span>
              </div>

              <div>
                <p className="mb-2 text-base font-semibold text-foreground">Quyền truy cập:</p>
                <div className="flex flex-wrap gap-2">
                  {role.fullAccess ? (
                    <Badge className="bg-destructive/20 text-destructive">Toàn quyền</Badge>
                  ) : role.permissions.length === 0 ? (
                    <span className="text-sm text-muted-foreground italic">Chưa có quyền nào</span>
                  ) : (
                    role.permissions.map((permission, index) => (
                      <Badge key={`${role.id}-${permission}-${index}`} variant="secondary" className="text-sm">
                        {permission}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <h2 className="text-2xl font-semibold text-foreground">Ma trận quyền hệ thống</h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {permissionModules.map((module) => (
              <div key={module.id} className="rounded-lg border border-border p-4">
                <div className="mb-2 flex items-center gap-2">
                  <module.icon className="h-4 w-4 text-primary" />
                  <h3 className="text-lg font-semibold text-foreground">{module.title}</h3>
                </div>
                <ul className="space-y-1">
                  {module.permissions.map((permission, index) => (
                    <li key={`${module.id}-${index}`} className="text-sm text-muted-foreground">
                      • {permission}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRole ? "Sửa vai trò" : "Thêm vai trò"}</DialogTitle>
            <DialogDescription>Nhập thông tin vai trò và chọn quyền truy cập.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Tên vai trò</p>
              <Input value={formName} onChange={(event) => setFormName(event.target.value)} placeholder="Ví dụ: Nhân viên bảo trì" />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Mô tả</p>
              <Textarea
                value={formDescription}
                onChange={(event) => setFormDescription(event.target.value)}
                placeholder="Mô tả ngắn về phạm vi sử dụng vai trò"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Quyền truy cập</p>
              <div className="grid grid-cols-1 gap-2 rounded-md border border-border p-3 md:grid-cols-2">
                {allPermissions.map((permission) => {
                  const checked = isAdminForm || formPermissions.includes(permission)

                  return (
                    <label key={permission} className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
                      <Checkbox
                        checked={checked}
                        disabled={isAdminForm}
                        onCheckedChange={(value) => togglePermission(permission, Boolean(value))}
                      />
                      <span>{permission}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
              Hủy
            </Button>
            <Button onClick={handleSubmitRole} disabled={isSubmitting}>
              {isSubmitting ? "Đang lưu..." : editingRole ? "Lưu thay đổi" : "Thêm vai trò"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
