import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMaintenanceActivity({
  role,
  fullName,
  action,
  code,
  device,
  appointmentIso,
}: {
  role: string
  fullName: string
  action: string
  code: string
  device: string
  appointmentIso: string
}) {
  const d = new Date(appointmentIso)
  
  // YYYY-MM-DD format
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  const isoDate = `${yyyy}-${mm}-${dd}`
  
  // HH:mm:ss format
  const hh = String(d.getHours()).padStart(2, "0")
  const min = String(d.getMinutes()).padStart(2, "0")
  const ss = String(d.getSeconds()).padStart(2, "0")
  const timeStr = `${hh}:${min}:${ss}`
  
  // DD/MM/YYYY format
  const displayDate = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })
  
  return `${role} [${fullName}] - ${action} ${code} | Thiết bị: ${device} | Ngày hẹn: ${isoDate} - ${timeStr} ${displayDate}`
}
