"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { HeartPulse, MonitorSmartphone, Scissors, Stethoscope, Syringe, TestTube2 } from "lucide-react"

interface CategoryItem {
  id: number
  name: string
  deviceCount: number
}

interface LoggedInUser {
  id?: number | string
  username?: string
  fullName?: string
  role?: string
  departmentName?: string | null
  department?: string | null
}

interface DeviceSourceItem {
  id: number
  category?: string | null
}

const iconByName: Array<{
  keywords: string[]
  icon: React.ComponentType<{ className?: string }>
}> = [
  { keywords: ["chẩn đoán", "hình ảnh", "x-quang", "mri", "ct"], icon: MonitorSmartphone },
  { keywords: ["xét nghiệm", "lab"], icon: TestTube2 },
  { keywords: ["hồi sức", "icu", "tim"], icon: HeartPulse },
  { keywords: ["phẫu thuật", "mổ"], icon: Scissors },
  { keywords: ["tiêm", "truyền"], icon: Syringe },
  { keywords: ["khám", "lâm sàng"], icon: Stethoscope },
]

function getCategoryIcon(name: string) {
  const normalizedName = name.toLowerCase()
  const matched = iconByName.find((item) =>
    item.keywords.some((keyword) => normalizedName.includes(keyword))
  )

  return matched?.icon || MonitorSmartphone
}

export function CategoriesPage() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
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
    const loadCategories = async () => {
      try {
        if (!isUserHydrated) {
          return
        }

        setIsLoading(true)

        const params = new URLSearchParams()
        if (isNhanVienRole(String(loggedInUser.role || ""))) {
          params.set("role", String(loggedInUser.role || ""))

          const departmentName = String(loggedInUser.departmentName || "").trim()
          if (departmentName) {
            params.set("departmentName", departmentName)
          }

          const userId = String(loggedInUser.id || "").trim()
          if (userId) {
            params.set("userId", userId)
          }

          const requester = String(loggedInUser.fullName || "").trim()
          const requesterAlt = String(loggedInUser.username || "").trim()
          if (requester) {
            params.set("requester", requester)
          }

          if (requesterAlt) {
            params.set("requesterAlt", requesterAlt)
          }
        }

        const query = params.toString()
        const response = await fetch(`${apiBaseUrl}/api/devices${query ? `?${query}` : ""}`, {
          cache: "no-store",
        })

        if (!response.ok) {
          setCategories([])
          return
        }

        const data = (await response.json()) as { devices?: DeviceSourceItem[] }
        const groupedMap = new Map<string, number>()

        ;(data.devices || []).forEach((device) => {
          const categoryName = String(device.category || "").trim() || "Chưa phân loại"
          groupedMap.set(categoryName, (groupedMap.get(categoryName) || 0) + 1)
        })

        const nextCategories = Array.from(groupedMap.entries())
          .sort((a, b) => {
            if (b[1] !== a[1]) {
              return b[1] - a[1]
            }

            return a[0].localeCompare(b[0], "vi")
          })
          .map(([name, deviceCount], index) => ({
            id: index + 1,
            name,
            deviceCount,
          }))

        setCategories(nextCategories)
      } catch {
        setCategories([])
      } finally {
        setIsLoading(false)
      }
    }

    loadCategories()
  }, [apiBaseUrl, isUserHydrated, loggedInUser.role, loggedInUser.departmentName, loggedInUser.fullName, loggedInUser.username, loggedInUser.id])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">DANH MỤC THIẾT BỊ</h1>
      </div>

      {isLoading && (
        <Card className="border-border bg-card">
          <CardContent className="p-6 text-muted-foreground">Đang tải dữ liệu danh mục...</CardContent>
        </Card>
      )}

      {!isLoading && categories.length === 0 && (
        <Card className="border-border bg-card">
          <CardContent className="p-6 text-muted-foreground">
            Chưa có dữ liệu. 
          </CardContent>
        </Card>
      )}

      {!isLoading && categories.length > 0 && (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {categories.map((category) => {
            const Icon = getCategoryIcon(category.name)

            return (
              <Card key={category.id} className="border-border bg-card transition-all hover:border-primary/35 hover:shadow-sm">
                <CardContent className="p-3">
                  <div className="mb-3 flex items-center">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                  </div>

                  <h2 className="line-clamp-1 text-[1.6rem] font-bold leading-tight text-foreground">{category.name}</h2>
                  <p className="mt-1.5 text-sm text-muted-foreground">Số thiết bị</p>
                  <p className="mt-1 text-2xl font-bold leading-none text-primary">{category.deviceCount}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
