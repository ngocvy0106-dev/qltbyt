"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Header } from "@/components/admin/header"
import { Sidebar } from "@/components/admin/sidebar"
import { CategoriesPage } from "@/components/admin/pages/categories-page"
import { DevicesPage } from "@/components/admin/pages/devices-page"

export default function DevicesRoutePage() {
  const router = useRouter()
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null)

  useEffect(() => {
    const token = localStorage.getItem("token")

    if (token === "logged") {
      setIsAuthorized(true)
      return
    }

    setIsAuthorized(false)
    router.replace("/login")
  }, [router])

  if (isAuthorized !== true) {
    return null
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-7xl">
            <div className="space-y-10">
              <DevicesPage />
              <CategoriesPage />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
