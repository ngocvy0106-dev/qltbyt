export type AppRole = "admin" | "nhan-vien" | "unknown"

function normalizeText(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
}

function normalizePermission(value: string) {
  return normalizeText(value || "")
}

export function resolveAppRole(roleValue: string | null | undefined): AppRole {
  const role = normalizeText(roleValue || "")

  if (
    role.includes("admin") ||
    role.includes("administrator") ||
    role.includes("super admin") ||
    role.includes("quan tri vien")
  ) {
    return "admin"
  }

  if (role.includes("nhan vien") || role.includes("nhan-vien") || role.includes("employee") || role.includes("staff") || role) {
    return "nhan-vien"
  }

  return "unknown"
}

const roleAllowedPaths: Record<AppRole, string[]> = {
  admin: [
    "/dashboard",
    "/devices",
    "/categories",
    "/transfers",
    "/maintenance",
    "/repairs",
    "/departments",
    "/reports",
    "/users",
    "/permissions",
    "/nhan-vien",
  ],
  "nhan-vien": ["/devices", "/transfers", "/maintenance", "/repairs", "/nhan-vien"],
  unknown: ["/dashboard"],
}

const permissionAllowedPaths: Record<string, string[]> = {
  "xem thiet bi": ["/devices", "/categories"],
  "them thiet bi": ["/devices"],
  "sua thiet bi": ["/devices"],
  "xoa thiet bi": ["/devices"],

  "xem dieu chuyen": ["/transfers"],
  "tao yeu cau dieu chuyen": ["/transfers"],
  "duyet dieu chuyen": ["/transfers"],

  "xem bao tri": ["/maintenance"],
  "tao yeu cau bao tri": ["/maintenance"],
  "cap nhat bao tri": ["/maintenance"],
  "duyet bao tri": ["/maintenance"],

  "xem sua chua": ["/repairs"],
  "tao yeu cau sua chua": ["/repairs"],
  "cap nhat sua chua": ["/repairs"],
  "duyet sua chua": ["/repairs"],

  "xem phong/khoa": ["/departments"],
  "quan ly phong/khoa": ["/departments"],

  "xem bao cao": ["/reports"],
  "xuat bao cao": ["/reports"],
  "tao bao cao": ["/reports"],

  "quan ly nguoi dung": ["/users"],
  "quan ly phan quyen": ["/permissions"],
  "xem nhat ky": ["/reports"],
  "sao luu du lieu": ["/reports"],
}

function resolveAllowedPathsByPermissions(permissions?: string[] | null) {
  const values = Array.isArray(permissions)
    ? permissions.map((permission) => normalizePermission(String(permission || ""))).filter(Boolean)
    : []

  if (values.length === 0) {
    return []
  }

  if (values.includes("toan quyen")) {
    return [...roleAllowedPaths.admin]
  }

  return Array.from(
    new Set(
      values.flatMap((permission) => permissionAllowedPaths[permission] || [])
    )
  )
}

export function getDefaultPathByRole(roleValue: string | null | undefined, permissions?: string[] | null) {
  const hasProvidedPermissions = Array.isArray(permissions)
  const permissionPaths = resolveAllowedPathsByPermissions(permissions)
  if (hasProvidedPermissions && permissionPaths.length > 0) {
    return permissionPaths[0]
  }

  const appRole = resolveAppRole(roleValue)

  if (appRole === "nhan-vien") {
    return "/devices"
  }

  return "/dashboard"
}

export function isPathAllowedForRole(
  pathname: string,
  roleValue: string | null | undefined,
  permissions?: string[] | null
) {
  const appRole = resolveAppRole(roleValue)
  const permissionPaths = resolveAllowedPathsByPermissions(permissions)
  const rolePaths = roleAllowedPaths[appRole] || []

  // Use permissionPaths when permissions are explicitly set AND non-empty.
  // Fall back to rolePaths if permissions is null/undefined/empty (e.g. Admin before sync).
  const allowedPaths = permissionPaths.length > 0 ? permissionPaths : rolePaths

  if (pathname === "/") {
    return false
  }

  return allowedPaths.some((allowedPath) => {
    if (pathname === allowedPath) {
      return true
    }

    return pathname.startsWith(`${allowedPath}/`)
  })
}

// Returns true only when the role is non-admin AND permissions are explicitly
// set to a list that does NOT include the given path.
// null/undefined = not yet loaded → do NOT hide (return false)
// [] = explicitly no permissions → hide everything for non-admin (return true)
export function isPathExplicitlyForbidden(
  pathname: string,
  roleValue: string | null | undefined,
  permissions?: string[] | null
) {
  const appRole = resolveAppRole(roleValue)
  // Admin always sees everything regardless of permissions
  if (appRole === "admin") {
    return false
  }

  // permissions not loaded yet → don't hide
  if (!Array.isArray(permissions)) {
    return false
  }

  const permissionPaths = resolveAllowedPathsByPermissions(permissions)

  // Explicitly empty permissions = no access → hide all paths
  if (permissionPaths.length === 0) {
    return true
  }

  return !permissionPaths.some(
    (allowedPath) => pathname === allowedPath || pathname.startsWith(`${allowedPath}/`)
  )
}
