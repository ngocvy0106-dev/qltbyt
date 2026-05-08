"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Header } from "@/components/admin/header"
import { Sidebar } from "@/components/admin/sidebar"
import { ReportsPage } from "@/components/admin/pages/reports-page"

export default function ReportsRoutePage() {
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
          <div className="w-full">
            <ReportsPage />
          </div>
        </main>
      </div>
    </div>
  )
}
