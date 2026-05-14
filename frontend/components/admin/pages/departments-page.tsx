"use client"

import { useEffect, useState } from "react"
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { Building2, Plus, Search, Phone, Mail, MoreVertical, UserRound, Laptop2, Users2 } from "lucide-react"

interface DepartmentSummary {
  totalDepartments: number
  totalDevices: number
  totalEmployees: number | null
  totalFloors: number
}

interface DepartmentItem {
  id?: number
  name: string
  location: string
  head: string | null
  devices: number
  employees: number | null
  phone: string | null
  email: string | null
}

interface DepartmentsResponse {
  summary?: DepartmentSummary
  departments?: DepartmentItem[]
}

export function DepartmentsPage() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"
  const [search, setSearch] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeletingId, setIsDeletingId] = useState<number | null>(null)
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentItem | null>(null)
  const [selectedDeleteDepartment, setSelectedDeleteDepartment] = useState<DepartmentItem | null>(null)
  const [form, setForm] = useState({
    name: "",
    head_name: "",
    phone: "",
    email: "",
  })
  const [summary, setSummary] = useState<DepartmentSummary>({
    totalDepartments: 0,
    totalDevices: 0,
    totalEmployees: null,
    totalFloors: 0,
  })
  const [departments, setDepartments] = useState<DepartmentItem[]>([])

  const loadDepartments = async () => {
    try {
      setIsLoading(true)

      const params = new URLSearchParams()
      if (search.trim()) {
        params.set("search", search.trim())
      }

      const response = await fetch(`${apiBaseUrl}/api/departments/summary?${params.toString()}`, {
        cache: "no-store",
      })

      if (!response.ok) {
        setDepartments([])
        return
      }

      const data = (await response.json()) as DepartmentsResponse

      if (data.summary) {
        setSummary(data.summary)
      }

      setDepartments(data.departments || [])
    } catch {
      setDepartments([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadDepartments()
  }, [apiBaseUrl, search])

  const openCreateDialog = () => {
    setForm({ name: "", head_name: "", phone: "", email: "" })
    setIsCreateDialogOpen(true)
  }

  const openEditDialog = (department: DepartmentItem) => {
    setSelectedDepartment(department)
    setForm({
      name: department.name || "",
      head_name: department.head || "",
      phone: department.phone || "",
      email: department.email || "",
    })
    setIsEditDialogOpen(true)
  }

  const handleCreateDepartment = async () => {
    try {
      setIsSubmitting(true)

      const response = await fetch(`${apiBaseUrl}/api/departments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "Tạo khoa/phòng thất bại")
        return
      }

      setIsCreateDialogOpen(false)
      await loadDepartments()
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEditDepartment = async () => {
    if (!selectedDepartment?.id) {
      return
    }

    try {
      setIsSubmitting(true)

      const response = await fetch(`${apiBaseUrl}/api/departments/${selectedDepartment.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "Cập nhật khoa/phòng thất bại")
        return
      }

      setIsEditDialogOpen(false)
      await loadDepartments()
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteDialogChange = (open: boolean) => {
    setIsDeleteDialogOpen(open)
    if (!open) {
      setSelectedDeleteDepartment(null)
    }
  }

  const handleRequestDeleteDepartment = (department: DepartmentItem) => {
    setSelectedDeleteDepartment(department)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDeleteDepartment = async () => {
    if (!selectedDeleteDepartment) {
      return
    }

    handleDeleteDialogChange(false)
    await handleDeleteDepartment(selectedDeleteDepartment)
  }

  const handleDeleteDepartment = async (department: DepartmentItem) => {
    if (!department.id) {
      return
    }

    try {
      setIsDeletingId(department.id)
      const response = await fetch(`${apiBaseUrl}/api/departments/${department.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "Xóa khoa/phòng thất bại")
        return
      }

      await loadDepartments()
      toast({ description: `Đã xóa ${department.name} thành công` })
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={handleDeleteDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa khoa/phòng?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa {selectedDeleteDepartment?.name} không?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handleDeleteDialogChange(false)}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteDepartment}
              disabled={isDeletingId === selectedDeleteDepartment?.id}
            >
              {isDeletingId === selectedDeleteDepartment?.id ? "Đang xóa..." : "Xóa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tìm kiếm phòng/khoa..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Button className="gap-2" onClick={openCreateDialog}>
          <Plus className="h-4 w-4" />
          Thêm khoa mới
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Đang tải dữ liệu khoa/phòng...</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {departments.map((department, index) => (
          <Card key={`${department.id || department.name}-${index}`} className="border-border bg-card hover:border-primary/40">
            <CardContent className="p-5 space-y-4">
              <div className="mb-4 flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2.5 mt-0.5">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">{department.name}</h3>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32">
                    <DropdownMenuItem onClick={() => openEditDialog(department)}>
                      Chỉnh sửa
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleRequestDeleteDepartment(department)}>
                      Xóa
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-3 text-base text-muted-foreground">
                {department.head && (
                  <p className="flex items-center gap-2">
                    <UserRound className="h-4 w-4" />
                    <span>
                      Trưởng khoa: <span className="font-semibold text-foreground">{department.head}</span>
                    </span>
                  </p>
                )}

                <div className="flex items-center gap-8">
                  <span className="inline-flex items-center gap-2">
                    <Laptop2 className="h-4 w-4" />
                    <span>{department.devices} thiết bị</span>
                  </span>
                  {department.employees !== null && (
                    <span className="inline-flex items-center gap-2">
                      <Users2 className="h-4 w-4" />
                      <span>{department.employees} nhân viên</span>
                    </span>
                  )}
                </div>
              </div>

              {(department.phone || department.email) && (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  {department.phone && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm font-medium">
                      <Phone className="h-3.5 w-3.5" /> {department.phone}
                    </span>
                  )}
                  {department.email && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-sm font-medium">
                      <Mail className="h-3.5 w-3.5" /> {department.email}
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {!isLoading && departments.length === 0 && (
        <p className="text-sm text-muted-foreground">Không có phòng ban trong bảng departments.</p>
      )}

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Thêm khoa/phòng mới</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Tên khoa/phòng" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
            <Input placeholder="Trưởng khoa" value={form.head_name} onChange={(e) => setForm((prev) => ({ ...prev, head_name: e.target.value }))} />
            <Input placeholder="Số điện thoại" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} />
            <Input placeholder="Email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={isSubmitting}>Hủy</Button>
              <Button onClick={handleCreateDepartment} disabled={isSubmitting}>{isSubmitting ? "Đang lưu..." : "Lưu"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa khoa/phòng</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Tên khoa/phòng" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
            <Input placeholder="Trưởng khoa" value={form.head_name} onChange={(e) => setForm((prev) => ({ ...prev, head_name: e.target.value }))} />
            <Input placeholder="Số điện thoại" value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} />
            <Input placeholder="Email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={isSubmitting}>Hủy</Button>
              <Button onClick={handleEditDepartment} disabled={isSubmitting}>{isSubmitting ? "Đang lưu..." : "Cập nhật"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
