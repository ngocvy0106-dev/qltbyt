"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export function NhanVienEntryPage() {
  const router = useRouter()

  useEffect(() => {
    const token = localStorage.getItem("token")

    if (token !== "logged") {
      router.replace("/login")
      return
    }

    router.replace("/devices")
  }, [router])

  return null
}
