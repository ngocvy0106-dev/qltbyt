"use client"

import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Package,
  Wrench,
  BarChart3,
  Settings,
  Building2,
  ChevronDown,
  LogOut,
  Shield,
  UserCog,
  Truck,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { getDefaultPathByRole, isPathAllowedForRole, isPathExplicitlyForbidden } from "@/lib/role-access"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { useToast } from "@/hooks/use-toast"

interface MenuItem {
  title: string
  icon: React.ComponentType<{ className?: string }>
  href: string
  active?: boolean
  badge?: string
  badgeColor?: string
  children?: { title: string; href: string; icon?: React.ComponentType<{ className?: string }> }[]
}

interface MenuSection {
  title: string
  items: MenuItem[]
}

interface LoggedInUser {
  id?: number | string
  username?: string
  fullName?: string
  email?: string | null
  departmentName?: string | null
  role?: string
  permissions?: string[]
}

const menuSections: MenuSection[] = [
  {
    title: "Tổng quan",
    items: [
      {
        title: "Dashboard",
        icon: LayoutDashboard,
        href: "/dashboard",
      },
    ],
  },
  {
    title: "Quản lý thiết bị",
    items: [
      {
        title: "Danh sách thiết bị",
        icon: Package,
        href: "/devices",
      },
      {
        title: "Điều chuyển - Cấp phát",
        icon: Truck,
        href: "/transfers",
      },
      {
        title: "Bảo trì",
        icon: Wrench,
        href: "/maintenance",
      },
      {
        title: "Sửa chữa",
        icon: Settings,
        href: "/repairs",
        badgeColor: "warning",
      },
    ],
  },
  {
    title: "Tổ chức",
    items: [
      {
        title: "Khoa/Phòng ban",
        icon: Building2,
        href: "/departments",
      },
    ],
  },
  {
    title: "Báo cáo",
    items: [
      {
        title: "Báo cáo",
        icon: BarChart3,
        href: "/reports",
      },
    ],
  },
  {
    title: "Quản trị",
    items: [
      {
        title: "Quản lý người dùng",
        icon: UserCog,
        href: "/users",
      },
      {
        title: "Phân quyền",
        icon: Shield,
        href: "/permissions",
      },
    ],
  },
]

interface SidebarItemProps {
  item: MenuItem
  collapsed?: boolean
  disabled?: boolean
  onPrefetch?: (href: string) => void
}

function SidebarItem({ item, collapsed, disabled = false, onPrefetch }: SidebarItemProps) {
  const pathname = usePathname()
  const [expanded, setExpanded] = useState(false)
  const hasChildren = item.children && item.children.length > 0
  const isActive =
    pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`))

  if (disabled) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm opacity-45 cursor-not-allowed",
          "text-sidebar-foreground/60"
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="flex-1 whitespace-nowrap">{item.title}</span>}
      </div>
    )
  }

  return (
    <div>
      <Link
        href={item.href}
        prefetch
        onMouseEnter={() => onPrefetch?.(item.href)}
        onFocus={() => onPrefetch?.(item.href)}
        onClick={(e) => {
          if (hasChildren) {
            e.preventDefault()
            setExpanded(!expanded)
          }
        }}
        className={cn(
          "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all",
          "hover:bg-sidebar-accent",
          isActive || item.active
            ? "bg-primary/10 text-primary border-l-2 border-primary"
            : "text-sidebar-foreground/70"
        )}
      >
        <item.icon className="h-4 w-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 whitespace-nowrap">{item.title}</span>
            {item.badge && (
              <span
                className={cn(
                  "px-1.5 py-0.5 text-xs rounded-full font-medium",
                  item.badgeColor === "destructive"
                    ? "bg-destructive/20 text-destructive"
                    : item.badgeColor === "warning"
                    ? "bg-warning/20 text-warning"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {item.badge}
              </span>
            )}
            {hasChildren && (
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform text-muted-foreground",
                  expanded && "rotate-180"
                )}
              />
            )}
          </>
        )}
      </Link>
      {hasChildren && expanded && !collapsed && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-3">
          {item.children?.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              prefetch
              onMouseEnter={() => onPrefetch?.(child.href)}
              onFocus={() => onPrefetch?.(child.href)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
            >
              {child.icon && <child.icon className="h-3.5 w-3.5" />}
              <span className="whitespace-nowrap">{child.title}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const navRef = useRef<HTMLElement | null>(null)
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser>({})
  const [isUserHydrated, setIsUserHydrated] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const [isProfileSaving, setIsProfileSaving] = useState(false)
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false)
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false)
  const [profileForm, setProfileForm] = useState({
    fullName: "",
    username: "",
  })
  const [passwordForm, setPasswordForm] = useState({
    newPassword: "",
    confirmPassword: "",
  })
  const [profileRoleId, setProfileRoleId] = useState<number | null>(null)
  const [profileDepartment, setProfileDepartment] = useState<string | null>(null)
  const { toast } = useToast()

  const SIDEBAR_SCROLL_KEY = "admin-sidebar-scroll-top"

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem("user")

      if (!storedUser) {
        setLoggedInUser({})
        setIsUserHydrated(true)
        return
      }

      const parsedUser = JSON.parse(storedUser)
      setLoggedInUser(parsedUser)
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

    setProfileForm({
      fullName: String(loggedInUser.fullName || "").trim(),
      username: String(loggedInUser.username || "").trim(),
    })
    const storedDepartment =
      String((loggedInUser as { departmentName?: string; department_name?: string }).departmentName || "").trim() ||
      String((loggedInUser as { department_name?: string }).department_name || "").trim() ||
      ""
    setProfileDepartment(storedDepartment || null)
    setPasswordForm({
      newPassword: "",
      confirmPassword: "",
    })
    setIsPasswordFormOpen(false)
  }, [isUserHydrated, loggedInUser.fullName, loggedInUser.username])

  const loadUserProfile = async (userId: string) => {
    const response = await fetch(`${apiBaseUrl}/api/users/${userId}`, {
      cache: "no-store",
    })

    if (!response.ok) {
      return
    }

    const data = (await response.json()) as {
      user?: {
        name?: string
        username?: string
        roleId?: number | null
        department?: string | null
        departmentName?: string | null
        department_name?: string | null
      }
    }

    const user = data.user
    if (!user) {
      return
    }

    setProfileForm({
      fullName: String(user.name || loggedInUser.fullName || "").trim(),
      username: String(user.username || loggedInUser.username || "").trim(),
    })
    setProfileRoleId(typeof user.roleId === "number" ? user.roleId : null)
    const apiDepartment =
      String(user.department || "").trim() ||
      String(user.departmentName || "").trim() ||
      String(user.department_name || "").trim() ||
      ""
    const storedDepartment =
      String((loggedInUser as { departmentName?: string; department_name?: string }).departmentName || "").trim() ||
      String((loggedInUser as { department_name?: string }).department_name || "").trim() ||
      ""
    setProfileDepartment(apiDepartment || storedDepartment || null)
  }

  useEffect(() => {
    if (!isUserHydrated || !pathname) {
      return
    }

    const roleValue = String(loggedInUser.role || "").trim()
    if (!roleValue) {
      return
    }

    if (!isPathAllowedForRole(pathname, loggedInUser.role, loggedInUser.permissions)) {
      router.replace(getDefaultPathByRole(loggedInUser.role, loggedInUser.permissions))
    }
  }, [isUserHydrated, pathname, loggedInUser.role, loggedInUser.permissions, router])

  useEffect(() => {
    if (!isUserHydrated) {
      return
    }

    const roleName = String(loggedInUser.role || "").trim()
    if (!roleName) {
      return
    }

    const normalizeText = (value: string) =>
      String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")

    let cancelled = false

    const syncPermissions = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/roles`, {
          cache: "no-store",
        })

        if (!response.ok || cancelled) {
          return
        }

        const data = (await response.json()) as {
          roles?: Array<{ name?: string; permissions?: string[] }>
        }

        const normalizedRoleName = normalizeText(roleName)
        const matchedRole = (data.roles || []).find(
          (role) => normalizeText(String(role.name || "")) === normalizedRoleName
        )

        if (!matchedRole) {
          return
        }

        const nextPermissions = Array.isArray(matchedRole.permissions)
          ? matchedRole.permissions.map((permission) => String(permission || "").trim()).filter(Boolean)
          : []
        const currentPermissions = Array.isArray(loggedInUser.permissions)
          ? loggedInUser.permissions
          : []

        const hasChanged =
          JSON.stringify([...currentPermissions].sort()) !== JSON.stringify([...nextPermissions].sort())

        if (!hasChanged || cancelled) {
          return
        }

        setLoggedInUser((previous) => {
          const updatedUser = {
            ...previous,
            permissions: nextPermissions,
          }

          localStorage.setItem("user", JSON.stringify(updatedUser))
          return updatedUser
        })
      } catch {
        // ignore permission sync errors and keep existing local user data
      }
    }

    void syncPermissions()

    const handleFocus = () => {
      void syncPermissions()
    }

    window.addEventListener("focus", handleFocus)

    return () => {
      cancelled = true
      window.removeEventListener("focus", handleFocus)
    }
  }, [apiBaseUrl, isUserHydrated, loggedInUser.role])

  useEffect(() => {
    if (!isProfileOpen) {
      return
    }

    const userId = String(loggedInUser.id || "").trim()
    if (!userId) {
      return
    }

    let cancelled = false

    const loadProfile = async () => {
      try {
        await loadUserProfile(userId)
      } catch {
        // ignore load profile errors
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [apiBaseUrl, isProfileOpen, loggedInUser.fullName, loggedInUser.id, loggedInUser.username])

  useEffect(() => {
    if (!isUserHydrated) {
      return
    }

    const userId = String(loggedInUser.id || "").trim()
    if (!userId || profileDepartment) {
      return
    }

    const loadProfile = async () => {
      try {
        await loadUserProfile(userId)
      } catch {
        // ignore background profile errors
      }
    }

    void loadProfile()
  }, [isUserHydrated, loggedInUser.id, profileDepartment])

  useEffect(() => {
    const navElement = navRef.current
    if (!navElement) {
      return
    }

    const storedScrollTop = Number(sessionStorage.getItem(SIDEBAR_SCROLL_KEY) || "0")
    if (Number.isFinite(storedScrollTop) && storedScrollTop > 0) {
      navElement.scrollTop = storedScrollTop
    }
  }, [])

  useEffect(() => {
    const navElement = navRef.current
    if (!navElement) {
      return
    }

    const handleScroll = () => {
      sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(navElement.scrollTop || 0))
    }

    navElement.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      navElement.removeEventListener("scroll", handleScroll)
    }
  }, [])

  const displayedMenuSections = isUserHydrated && !!String(loggedInUser.role || "").trim()
    ? menuSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) =>
            !isPathExplicitlyForbidden(item.href, loggedInUser.role, loggedInUser.permissions)
          ),
        }))
        .filter((section) => section.items.length > 0)
    : menuSections

  const prefetchRoute = (href: string) => {
    try {
      router.prefetch(href)
    } catch {
      // ignore prefetch errors to keep navigation uninterrupted
    }
  }

  useEffect(() => {
    const allRoutes = Array.from(
      new Set(
        displayedMenuSections.flatMap((section) =>
          section.items.flatMap((item) => [item.href, ...(item.children?.map((child) => child.href) || [])]),
        ),
      ),
    )

    const schedulePrefetch = () => {
      allRoutes.forEach((href) => prefetchRoute(href))
    }

    const hasIdleCallback = typeof window !== "undefined" && "requestIdleCallback" in window
    if (hasIdleCallback) {
      const idleId = window.requestIdleCallback(schedulePrefetch, { timeout: 1200 })
      return () => window.cancelIdleCallback(idleId)
    }

    const timer = window.setTimeout(schedulePrefetch, 300)
    return () => window.clearTimeout(timer)
  }, [])

  const displayName = loggedInUser.fullName || loggedInUser.username || "Người dùng"
  const displayEmail = String(loggedInUser.email || "").trim()
  const displayRole = loggedInUser.role || "User"
  const normalizeRoleText = (value: string) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
  const isEmployeeRole = ["nhan vien", "nhanvien", "employee", "staff"].includes(
    normalizeRoleText(displayRole),
  )

  const avatarText = displayName
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")

  const handleSaveProfile = async () => {
    const userId = String(loggedInUser.id || "").trim()
    if (!userId) {
      alert("Không tìm thấy tài khoản")
      return
    }

    const nextFullName = profileForm.fullName.trim()
    const nextUsername = profileForm.username.trim()
    const currentFullName = String(loggedInUser.fullName || "").trim()
    const currentUsername = String(loggedInUser.username || "").trim()
    const hasProfileChange =
      nextFullName !== currentFullName || nextUsername !== currentUsername

    if (!nextFullName) {
      alert("Họ tên không được để trống")
      return
    }

    if (!nextUsername) {
      alert("Tài khoản không được để trống")
      return
    }

    if (!profileRoleId) {
      alert("Không xác định vai trò của tài khoản")
      return
    }

    const shouldChangePassword = isPasswordFormOpen

    if (shouldChangePassword) {
      if (!passwordForm.newPassword.trim()) {
        alert("Mật khẩu mới không được để trống")
        return
      }

      if (passwordForm.newPassword.trim().length < 6) {
        alert("Mật khẩu mới phải có ít nhất 6 ký tự")
        return
      }

      if (passwordForm.newPassword.trim() !== passwordForm.confirmPassword.trim()) {
        alert("Xác nhận mật khẩu không khớp")
        return
      }
    }

    try {
      setIsProfileSaving(true)

      const response = await fetch(`${apiBaseUrl}/api/users/${userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: nextFullName,
          username: nextUsername,
          roleId: profileRoleId,
          departmentName: profileDepartment || null,
          actorUserId: loggedInUser.id || null,
          skipActivityLog: true,
        }),
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null
        alert(data?.message || "Cập nhật tài khoản thất bại")
        return
      }

      if (shouldChangePassword) {
        const passwordResponse = await fetch(`${apiBaseUrl}/api/users/${userId}/reset-password`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            newPassword: passwordForm.newPassword.trim(),
            actorUserId: loggedInUser.id || null,
            skipActivityLog: true,
          }),
        })

        if (!passwordResponse.ok) {
          const data = (await passwordResponse.json().catch(() => null)) as { message?: string } | null
          alert(data?.message || "Đổi mật khẩu thất bại")
          return
        }

        setPasswordForm({
          newPassword: "",
          confirmPassword: "",
        })
        setIsPasswordFormOpen(false)
        toast({
          description: "Đổi mật khẩu thành công",
          duration: 2000,
          className: "border-emerald-200 bg-emerald-50 text-emerald-900 rounded-2xl px-4 py-3 shadow-lg",
        })
      }

      if (hasProfileChange) {
        toast({
          description: "Cập nhật thông tin thành công",
          duration: 2000,
          className: "border-emerald-200 bg-emerald-50 text-emerald-900 rounded-2xl px-4 py-3 shadow-lg",
        })
      }

      const updatedUser = {
        ...loggedInUser,
        fullName: nextFullName,
        username: nextUsername,
      }

      setLoggedInUser(updatedUser)
      localStorage.setItem("user", JSON.stringify(updatedUser))
      setIsProfileOpen(false)
    } catch {
      alert("Không thể kết nối server")
    } finally {
      setIsProfileSaving(false)
    }
  }

  const handleRequestLogout = () => {
    setIsLogoutDialogOpen(true)
  }

  const handleLogout = async () => {
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"
      const userId = String(loggedInUser.id || "").trim()
      await fetch(`${apiBaseUrl}/api/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: userId || null,
          username: loggedInUser.username || null,
          fullName: loggedInUser.fullName || null,
        }),
      })
    } catch {
      // Ignore logout logging errors and proceed with local logout.
    }

    localStorage.removeItem("token")
    localStorage.removeItem("user")
    router.replace("/login")
  }

  return (
    <aside className="w-80 h-screen bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden">
      {/* Logo */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center shrink-0">
            <img src="/logoute.jpg" alt="Logo" className="h-full w-full object-cover" />
          </div>
          <div>
            <h1 className="font-semibold text-sidebar-foreground">Đại học công nghệ kỹ thuật TPHCM</h1>
            <p className="text-xs text-sidebar-foreground/60">Quản lý thiết bị y tế</p>
          </div>
        </div>
      </div>

      {/* User info */}
      <div className="p-3 border-b border-sidebar-border">
        <button
          type="button"
          onClick={() => setIsProfileOpen((previous) => !previous)}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg bg-sidebar-accent/50 text-left hover:bg-sidebar-accent cursor-pointer transition-colors"
        >
          <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center">
            <span className="text-sm font-medium text-primary">{avatarText || "U"}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-sidebar-foreground truncate">{displayName}</p>
            {displayEmail && (
              <p className="text-[10px] text-sidebar-foreground/60 leading-none whitespace-nowrap">
                {displayEmail}
              </p>
            )}
            <div className="flex items-center gap-1">
              <Shield className="h-3 w-3 text-primary" />
              <p className="text-xs text-primary truncate">{displayRole}</p>
            </div>
          </div>
        </button>

        {isProfileOpen && (
          <div className="mt-3 space-y-3 rounded-lg border border-sidebar-border bg-sidebar/60 p-3">
            <div className="space-y-1">
              <Label htmlFor="profile-full-name" className="font-semibold">
                Họ tên
              </Label>
              <Input
                id="profile-full-name"
                value={profileForm.fullName}
                onChange={(event) =>
                  setProfileForm((previous) => ({
                    ...previous,
                    fullName: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="profile-username" className="font-semibold">
                Tên đăng nhập
              </Label>
              <Input
                id="profile-username"
                value={profileForm.username}
                onChange={(event) =>
                  setProfileForm((previous) => ({
                    ...previous,
                    username: event.target.value,
                  }))
                }
              />
            </div>
            {displayEmail && (
              <div className="space-y-1">
                <Label className="font-semibold">Email</Label>
                <p className="text-xs text-sidebar-foreground/70 break-words">{displayEmail}</p>
              </div>
            )}
            {isEmployeeRole && (
              <div className="space-y-1">
                <Label className="font-semibold">Khoa/Phòng</Label>
                <p className="text-xs text-sidebar-foreground/70 break-words">
                  {profileDepartment || String(loggedInUser.departmentName || "").trim() || "-"}
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsPasswordFormOpen((previous) => !previous)}
              className="text-xs font-semibold text-primary hover:text-primary/80"
            >
              Đổi mật khẩu
            </button>
            {isPasswordFormOpen && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="profile-new-password" className="font-semibold">
                    Mật khẩu mới
                  </Label>
                  <Input
                    id="profile-new-password"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(event) =>
                      setPasswordForm((previous) => ({
                        ...previous,
                        newPassword: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="profile-confirm-password" className="font-semibold">
                    Xác nhận mật khẩu
                  </Label>
                  <Input
                    id="profile-confirm-password"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) =>
                      setPasswordForm((previous) => ({
                        ...previous,
                        confirmPassword: event.target.value,
                      }))
                    }
                  />
                </div>
              </>
            )}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={handleSaveProfile}
                disabled={isProfileSaving}
              >
                {isProfileSaving ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav ref={navRef} className="flex-1 overflow-auto p-3">
        <div className="min-w-max space-y-4">
          {displayedMenuSections.map((section) => (
            <div key={section.title}>
              <div className="mb-2 px-3">
                <span className="whitespace-nowrap text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
                  {section.title}
                </span>
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <SidebarItem
                    key={item.href}
                    item={item}
                    onPrefetch={prefetchRoute}
                    disabled={
                      isUserHydrated &&
                      !!String(loggedInUser.role || "").trim() &&
                      !isPathAllowedForRole(item.href, loggedInUser.role, loggedInUser.permissions)
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <AlertDialog open={isLogoutDialogOpen} onOpenChange={setIsLogoutDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Đăng xuất?</AlertDialogTitle>
            <AlertDialogDescription>Bạn có chắc chắn muốn đăng xuất không?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsLogoutDialogOpen(false)}>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout}>Đăng xuất</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bottom section */}
      <div className="p-3 border-t border-sidebar-border">
        <button
          type="button"
          onClick={handleRequestLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-destructive/80 hover:bg-destructive/10 hover:text-destructive transition-colors"
        >
          <LogOut className="h-4 w-4" />
          <span>Đăng xuất</span>
        </button>
      </div>
    </aside>
  )
}
