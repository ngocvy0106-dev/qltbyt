"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff } from "lucide-react"
import { getDefaultPathByRole } from "@/lib/role-access"

export default function LoginPage() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000"
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    try {
      setIsLoading(true)

      const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        alert(data.message || "Sai tài khoản hoặc mật khẩu")
        return
      }

      localStorage.setItem("token", data.token || "logged")
      localStorage.setItem("user", JSON.stringify(data.user || {}))
      router.push(getDefaultPathByRole(data?.user?.role))
    } catch {
      alert("Không thể kết nối backend. Kiểm tra backend đang chạy cổng 4000.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-black">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.75), rgba(0,0,0,0.58)), url('/hinhtb.jpg')",
        }}
      />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-md rounded-2xl border border-white/20 bg-black/40 px-8 py-9 backdrop-blur-xl shadow-2xl"
        >
          <div className="mb-6 flex flex-col items-center">
            <div className="mb-3.5 flex items-center justify-center gap-5">
                <img 
                    src="/logoute.jpg" 
                    alt="Logo 1" 
                    className="h-24 w-24 object-contain"
                    />
                    <img 
                    src="/logofeee.jpg" 
                    alt="Logo 2" 
                    className="h-24 w-24 object-contain"
                    />
                </div>
            <p className="text-[1rem] font-bold uppercase leading-none text-yellow-400 [text-shadow:0_1px_8px_rgba(0,0,0,0.45)]">
              HỆ THỐNG
            </p>
            <h1 className="mt-2 text-center text-[1.25rem] font-extrabold uppercase leading-none tracking-[0.01em] whitespace-nowrap text-white [text-shadow:0_3px_14px_rgba(0,0,0,0.55)] sm:text-[2.05rem]">
              QUẢN LÝ THIẾT BỊ Y TẾ
            </h1>
          </div>

          <div className="space-y-4">
            <input
              type="text"
              placeholder="Tên đăng nhập hoặc email"
              className="h-12 w-full rounded-md border border-white/15 bg-white/20 px-4 text-base font-medium text-white placeholder:text-base placeholder:text-white/72 focus:outline-none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Mật khẩu"
                className="h-12 w-full rounded-md border border-white/15 bg-white/20 px-4 pr-12 text-base font-medium text-white placeholder:text-base placeholder:text-white/72 focus:outline-none"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70"
                aria-label="Hiển thị mật khẩu"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="h-10 w-full rounded-md bg-blue-600 text-lg font-semibold text-white transition hover:bg-blue-700"
            >
              {isLoading ? "Đang đăng nhập..." : "Đăng nhập"}
            </button>
          </div>

          <div className="mt-7 text-center text-sm font-semibold uppercase leading-6 text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.55)]">
            <p>Website quản lý thiết bị y tế</p>
            <p className="text-white/85">ĐỒ ÁN TỐT NGHIỆP 2026</p>
          </div>
        </form>
      </div>
    </div>
  )
}
