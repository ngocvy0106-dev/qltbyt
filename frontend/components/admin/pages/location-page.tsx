"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Building,
  Layers,
  DoorOpen,
  MapPin,
  Package,
  MoreHorizontal,
  ChevronRight,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const buildings = [
  { id: 1, name: "Tòa nhà A - Khối điều trị", code: "A", floors: 8, rooms: 120, devices: 450, status: "active" },
  { id: 2, name: "Tòa nhà B - Khối cận lâm sàng", code: "B", floors: 5, rooms: 80, devices: 280, status: "active" },
  { id: 3, name: "Tòa nhà C - Khối hành chính", code: "C", floors: 4, rooms: 45, devices: 65, status: "active" },
  { id: 4, name: "Tòa nhà D - Khối ngoại trú", code: "D", floors: 3, rooms: 60, devices: 120, status: "active" },
  { id: 5, name: "Tòa nhà E - Khối dịch vụ", code: "E", floors: 6, rooms: 90, devices: 180, status: "maintenance" },
]

const floors = [
  { id: 1, name: "Tầng 1", building: "Tòa nhà A", code: "A-T1", rooms: 15, devices: 85, departments: ["Cấp cứu", "Tiếp đón"] },
  { id: 2, name: "Tầng 2", building: "Tòa nhà A", code: "A-T2", rooms: 18, devices: 92, departments: ["Nội khoa"] },
  { id: 3, name: "Tầng 3", building: "Tòa nhà A", code: "A-T3", rooms: 16, devices: 78, departments: ["Ngoại khoa"] },
  { id: 4, name: "Tầng 4", building: "Tòa nhà A", code: "A-T4", rooms: 20, devices: 105, departments: ["Hồi sức tích cực"] },
  { id: 5, name: "Tầng 1", building: "Tòa nhà B", code: "B-T1", rooms: 12, devices: 95, departments: ["Xét nghiệm"] },
  { id: 6, name: "Tầng 2", building: "Tòa nhà B", code: "B-T2", rooms: 10, devices: 85, departments: ["Chẩn đoán hình ảnh"] },
]

const rooms = [
  { id: 1, name: "Phòng cấp cứu 1", code: "A-T1-P01", floor: "Tầng 1", building: "Tòa nhà A", devices: 12, status: "active" },
  { id: 2, name: "Phòng cấp cứu 2", code: "A-T1-P02", floor: "Tầng 1", building: "Tòa nhà A", devices: 10, status: "active" },
  { id: 3, name: "Phòng khám Nội 1", code: "A-T2-P01", floor: "Tầng 2", building: "Tòa nhà A", devices: 5, status: "active" },
  { id: 4, name: "Phòng mổ 1", code: "A-T3-P01", floor: "Tầng 3", building: "Tòa nhà A", devices: 25, status: "active" },
  { id: 5, name: "Phòng mổ 2", code: "A-T3-P02", floor: "Tầng 3", building: "Tòa nhà A", devices: 23, status: "maintenance" },
  { id: 6, name: "Phòng ICU 1", code: "A-T4-P01", floor: "Tầng 4", building: "Tòa nhà A", devices: 18, status: "active" },
  { id: 7, name: "Phòng xét nghiệm sinh hóa", code: "B-T1-P01", floor: "Tầng 1", building: "Tòa nhà B", devices: 35, status: "active" },
  { id: 8, name: "Phòng chụp CT", code: "B-T2-P01", floor: "Tầng 2", building: "Tòa nhà B", devices: 8, status: "active" },
]

export function LocationPage() {
  const [activeTab, setActiveTab] = useState("buildings")

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Vị trí lắp đặt</h1>
          <p className="text-muted-foreground mt-1">
            Quản lý vị trí tòa nhà, tầng và phòng
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Building className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tòa nhà</p>
                <p className="text-xl font-bold text-foreground">5</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-info/20 flex items-center justify-center">
                <Layers className="h-5 w-5 text-info" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tầng</p>
                <p className="text-xl font-bold text-foreground">26</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                <DoorOpen className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Phòng</p>
                <p className="text-xl font-bold text-foreground">395</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                <Package className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tổng thiết bị</p>
                <p className="text-xl font-bold text-foreground">1,095</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList className="bg-secondary">
            <TabsTrigger value="buildings" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              Tòa nhà
            </TabsTrigger>
            <TabsTrigger value="floors" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              Tầng
            </TabsTrigger>
            <TabsTrigger value="rooms" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              Phòng
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Tìm kiếm..." className="pl-9 w-60 bg-secondary border-border" />
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-4 w-4 mr-2" />
                  Thêm mới
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border">
                <DialogHeader>
                  <DialogTitle>Thêm {activeTab === "buildings" ? "tòa nhà" : activeTab === "floors" ? "tầng" : "phòng"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Tên</Label>
                    <Input placeholder="Nhập tên..." className="bg-secondary border-border" />
                  </div>
                  <div className="space-y-2">
                    <Label>Mã</Label>
                    <Input placeholder="Nhập mã..." className="bg-secondary border-border" />
                  </div>
                  {(activeTab === "floors" || activeTab === "rooms") && (
                    <div className="space-y-2">
                      <Label>Tòa nhà</Label>
                      <Select>
                        <SelectTrigger className="bg-secondary border-border">
                          <SelectValue placeholder="Chọn tòa nhà" />
                        </SelectTrigger>
                        <SelectContent>
                          {buildings.map((b) => (
                            <SelectItem key={b.id} value={b.code}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {activeTab === "rooms" && (
                    <div className="space-y-2">
                      <Label>Tầng</Label>
                      <Select>
                        <SelectTrigger className="bg-secondary border-border">
                          <SelectValue placeholder="Chọn tầng" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Tầng 1</SelectItem>
                          <SelectItem value="2">Tầng 2</SelectItem>
                          <SelectItem value="3">Tầng 3</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button className="w-full bg-primary text-primary-foreground">Lưu</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <TabsContent value="buildings" className="mt-6">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Mã</TableHead>
                    <TableHead className="text-muted-foreground">Tên tòa nhà</TableHead>
                    <TableHead className="text-muted-foreground">Số tầng</TableHead>
                    <TableHead className="text-muted-foreground">Số phòng</TableHead>
                    <TableHead className="text-muted-foreground">Thiết bị</TableHead>
                    <TableHead className="text-muted-foreground">Trạng thái</TableHead>
                    <TableHead className="text-muted-foreground w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buildings.map((building) => (
                    <TableRow key={building.id} className="border-border">
                      <TableCell>
                        <Badge variant="outline" className="font-mono">{building.code}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{building.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{building.floors} tầng</TableCell>
                      <TableCell>{building.rooms} phòng</TableCell>
                      <TableCell>{building.devices} thiết bị</TableCell>
                      <TableCell>
                        <Badge className={building.status === "active" ? "bg-primary/20 text-primary border-0" : "bg-warning/20 text-warning border-0"}>
                          {building.status === "active" ? "Hoạt động" : "Bảo trì"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-card border-border">
                            <DropdownMenuItem className="gap-2">
                              <Edit className="h-4 w-4" /> Chỉnh sửa
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 text-destructive">
                              <Trash2 className="h-4 w-4" /> Xóa
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="floors" className="mt-6">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Mã</TableHead>
                    <TableHead className="text-muted-foreground">Tầng</TableHead>
                    <TableHead className="text-muted-foreground">Tòa nhà</TableHead>
                    <TableHead className="text-muted-foreground">Số phòng</TableHead>
                    <TableHead className="text-muted-foreground">Thiết bị</TableHead>
                    <TableHead className="text-muted-foreground">Khoa/Phòng ban</TableHead>
                    <TableHead className="text-muted-foreground w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {floors.map((floor) => (
                    <TableRow key={floor.id} className="border-border">
                      <TableCell>
                        <Badge variant="outline" className="font-mono">{floor.code}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{floor.name}</TableCell>
                      <TableCell>{floor.building}</TableCell>
                      <TableCell>{floor.rooms} phòng</TableCell>
                      <TableCell>{floor.devices} thiết bị</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {floor.departments.map((dept) => (
                            <Badge key={dept} variant="outline" className="text-xs">{dept}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-card border-border">
                            <DropdownMenuItem className="gap-2">
                              <Edit className="h-4 w-4" /> Chỉnh sửa
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 text-destructive">
                              <Trash2 className="h-4 w-4" /> Xóa
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rooms" className="mt-6">
          <Card className="bg-card border-border">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Mã phòng</TableHead>
                    <TableHead className="text-muted-foreground">Tên phòng</TableHead>
                    <TableHead className="text-muted-foreground">Vị trí</TableHead>
                    <TableHead className="text-muted-foreground">Thiết bị</TableHead>
                    <TableHead className="text-muted-foreground">Trạng thái</TableHead>
                    <TableHead className="text-muted-foreground w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rooms.map((room) => (
                    <TableRow key={room.id} className="border-border">
                      <TableCell>
                        <Badge variant="outline" className="font-mono">{room.code}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <DoorOpen className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{room.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <span>{room.building}</span>
                          <ChevronRight className="h-3 w-3" />
                          <span>{room.floor}</span>
                        </div>
                      </TableCell>
                      <TableCell>{room.devices} thiết bị</TableCell>
                      <TableCell>
                        <Badge className={room.status === "active" ? "bg-primary/20 text-primary border-0" : "bg-warning/20 text-warning border-0"}>
                          {room.status === "active" ? "Hoạt động" : "Bảo trì"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-card border-border">
                            <DropdownMenuItem className="gap-2">
                              <MapPin className="h-4 w-4" /> Xem thiết bị
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2">
                              <Edit className="h-4 w-4" /> Chỉnh sửa
                            </DropdownMenuItem>
                            <DropdownMenuItem className="gap-2 text-destructive">
                              <Trash2 className="h-4 w-4" /> Xóa
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
