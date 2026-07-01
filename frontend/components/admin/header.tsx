"use client"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Bell, Calendar } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { resolveAppRole } from "@/lib/role-access"

interface NotificationItem {
  id: string | number
  title: string
  description: string
  time: string | null
  type: string
  entityId?: string | number
}

interface LoggedInUser {
  id?: number | string
  username?: string
  fullName?: string
  role?: string
}

function normalizeText(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
}

export function Header() {
  const router = useRouter()
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"
  const [currentDateTime, setCurrentDateTime] = useState(new Date())
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [readNotificationKeys, setReadNotificationKeys] = useState<string[]>([])
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser>({})

  const getNotificationKey = (notification: NotificationItem) =>
    `${String(notification.type || "unknown")}::${String(notification.id)}::${String(notification.time || "")}`

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    try {
      const stored = localStorage.getItem("readNotificationKeys")
      if (!stored) {
        setReadNotificationKeys([])
        return
      }

      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        setReadNotificationKeys(parsed.map((item) => String(item || "")).filter(Boolean))
        return
      }

      setReadNotificationKeys([])
    } catch {
      setReadNotificationKeys([])
    }
  }, [])

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem("user")
      if (!storedUser) {
        setLoggedInUser({})
        return
      }

      setLoggedInUser(JSON.parse(storedUser) as LoggedInUser)
    } catch {
      setLoggedInUser({})
    }
  }, [])

  useEffect(() => {
    let active = true

    const loadNotifications = async () => {
      try {
        const params = new URLSearchParams()
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

        const query = params.toString()
        const response = await fetch(`${apiBaseUrl}/api/devices/maintenance-alerts${query ? `?${query}` : ""}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
        })

        if (!response.ok) {
          if (active) {
            setNotifications([])
          }
          return
        }

        const data = (await response.json()) as { notifications?: NotificationItem[] }
        if (active) {
          setNotifications(Array.isArray(data.notifications) ? data.notifications : [])
        }
      } catch {
        if (active) {
          setNotifications([])
        }
      }
    }

    loadNotifications()
    const intervalId = setInterval(loadNotifications, 10 * 1000)

    const refreshOnFocus = () => {
      void loadNotifications()
    }

    window.addEventListener("focus", refreshOnFocus)

    return () => {
      active = false
      clearInterval(intervalId)
      window.removeEventListener("focus", refreshOnFocus)
    }
  }, [apiBaseUrl, loggedInUser.role, loggedInUser.fullName, loggedInUser.username])

  const formatNotificationTime = (value: string | null) => {
    if (!value) {
      return ""
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return String(value)
    }

    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  }

  const dateTimeLabel = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(currentDateTime)

  const unreadNotifications = notifications.filter(
    (notification) => !readNotificationKeys.includes(getNotificationKey(notification))
  )

  const markNotificationAsRead = (notification: NotificationItem) => {
    const key = getNotificationKey(notification)
    const nextReadKeys = Array.from(new Set([...readNotificationKeys, key]))
    setReadNotificationKeys(nextReadKeys)
    localStorage.setItem("readNotificationKeys", JSON.stringify(nextReadKeys))
  }

  const markAllNotificationsAsRead = () => {
    const nextReadKeys = Array.from(
      new Set([...readNotificationKeys, ...notifications.map((item) => getNotificationKey(item))])
    )
    setReadNotificationKeys(nextReadKeys)
    localStorage.setItem("readNotificationKeys", JSON.stringify(nextReadKeys))
  }

  const navigateByNotification = (notification: NotificationItem) => {
    markNotificationAsRead(notification)
    const appRole = resolveAppRole(String(loggedInUser.role || ""))
    const type = String(notification.type || "").trim().toLowerCase()

    if (type === "none") {
      return
    }

    const dispatchRefresh = () => {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("refresh_data"))
      }
    }

    // If the current user is an employee, route based on notification type
    if (appRole === "nhan-vien") {
      if (type === "repair") {
        let route = "/repairs"
        if (notification.entityId) {
          route += `?highlight=${notification.entityId}`
        }
        router.push(route)
        dispatchRefresh()
        return
      }

      if (type === "maintenance") {
        router.push("/maintenance")
        dispatchRefresh()
        return
      }
      router.push("/devices")
      dispatchRefresh()
      return
    }

    // Admin routing based on notification type
    if (type === "transfer") {
      router.push("/transfers?tab=pending")
      dispatchRefresh()
      return
    }

    if (type === "repair") {
      const title = normalizeText(String(notification.title || ""))
      let route = "/repairs"
      
      if (title.includes("hoan thanh")) {
        route = "/repairs?tab=history"
      } else if (title.includes("xac nhan")) {
        route = "/repairs?tab=in-progress"
      } else {
        route = "/repairs?tab=requests"
      }

      if (notification.entityId) {
        route += `&highlight=${notification.entityId}`
      }
      
      router.push(route)
      setTimeout(() => dispatchRefresh(), 50)
      return
    }

    if (type === "maintenance") {
      router.push("/maintenance")
      dispatchRefresh()
      return
    }

    router.push("/dashboard")
    dispatchRefresh()
  }

  return (
    <header className="h-16 border-b border-border bg-card px-6 flex items-center justify-end gap-4">
      {/* Right side */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" className="gap-2 text-muted-foreground" disabled>
          <Calendar className="h-4 w-4" />
          <span>{dateTimeLabel}</span>
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadNotifications.length > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground flex items-center justify-center">
                  {unreadNotifications.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Thông báo</span>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-primary"
                onClick={markAllNotificationsAsRead}
              >
                Đánh dấu đã đọc
              </Button>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="max-h-[240px] overflow-y-auto custom-scrollbar">
              {notifications.length === 0 ? (
                <DropdownMenuItem className="text-sm text-muted-foreground">Không có thông báo mới</DropdownMenuItem>
              ) : (
                notifications.map((notification) => (
                  <DropdownMenuItem
                    key={notification.id}
                    className="flex flex-col items-start gap-1 p-3 cursor-pointer"
                    onSelect={() => navigateByNotification(notification)}
                  >
                    <div className="flex items-start justify-between w-full">
                      <span className="font-medium text-sm">{notification.title}</span>
                      <span className="text-xs text-muted-foreground min-w-max ml-2">{formatNotificationTime(notification.time)}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{notification.description}</span>
                  </DropdownMenuItem>
                ))
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
