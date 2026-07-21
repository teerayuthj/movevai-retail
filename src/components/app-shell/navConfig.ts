import type React from 'react';
import {
  Eye,
  LayoutDashboard,
  Inbox,
  Truck,
  Users,
  BookUser,
  Mailbox,
  Route,
  History,
  FileSpreadsheet,
  FileText,
  Smartphone,
  BellRing,
  Waypoints,
  UserCog,
  ShieldCheck,
  LockKeyhole,
} from 'lucide-react';
import type { PageKey } from '@/lib/routes';

export type NavItem = {
  key: PageKey;
  label: string;
  icon: React.ElementType;
  // แสดง badge จำนวนงานค้าง (ค่าจริงคำนวณจาก store ใน AppShell)
  showBadge?: boolean;
  // แสดง badge สีแดงจำนวนงานผิดปกติที่ต้องรีบแก้ (ค่าจริงคำนวณจาก store ใน AppShell)
  showAlertBadge?: boolean;
};

export type NavSection = {
  id: string;
  // section label โชว์เหนือกลุ่ม (เว้นไว้สำหรับกลุ่มแรกที่ไม่ต้องมีหัวข้อ)
  label?: string;
  items: NavItem[];
};

// แหล่งรวมโครงสร้าง sidebar — จัดเมนูเป็นหมวดตาม flow การทำงานจริง
export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'main',
    items: [{ key: 'overview', label: 'ภาพรวม', icon: LayoutDashboard }],
  },
  {
    id: 'intake',
    label: 'รับงาน',
    items: [
      { key: 'script_transform', label: 'Script Transform', icon: FileSpreadsheet },
      { key: 'inbox', label: 'Intake Inbox', icon: Inbox, showBadge: true },
    ],
  },
  {
    id: 'dispatch',
    label: 'จัดส่ง & มอบหมาย',
    items: [
      { key: 'delivery_workspace', label: 'ศูนย์จัดส่ง', icon: Truck, showBadge: true },
      { key: 'route_builder', label: 'สร้างเที่ยววิ่ง', icon: Waypoints },
    ],
  },
  {
    id: 'tracking',
    label: 'ติดตาม',
    items: [
      {
        key: 'delivery_tracking',
        label: 'ติดตามการจัดส่ง',
        icon: Route,
        showBadge: true,
        showAlertBadge: true,
      },
      { key: 'live_view', label: 'Live View', icon: Eye },
      { key: 'notifications', label: 'แจ้งเตือนลูกค้า', icon: BellRing },
    ],
  },
  {
    id: 'reports',
    label: 'รายงาน',
    items: [
      { key: 'delivery_report', label: 'รายงานงานส่ง', icon: FileText },
      { key: 'tracking_history', label: 'ประวัติการติดตาม', icon: History },
    ],
  },
  {
    id: 'postal',
    label: 'ช่องทางไปรษณีย์',
    items: [{ key: 'postal', label: 'ไปรษณีย์ไทย', icon: Mailbox, showBadge: true }],
  },
  {
    id: 'team',
    label: 'ทีมงาน',
    items: [
      { key: 'drivers', label: 'คนขับ', icon: Users },
      { key: 'customers', label: 'ลูกค้า', icon: BookUser },
      { key: 'messenger', label: 'เปิดแอป Messenger', icon: Smartphone, showBadge: true },
    ],
  },
  {
    id: 'settings',
    label: 'ตั้งค่าระบบ',
    items: [
      { key: 'users', label: 'ผู้ใช้งาน', icon: UserCog },
      { key: 'roles', label: 'Role & Permission', icon: ShieldCheck },
      { key: 'security', label: 'Security & Session', icon: LockKeyhole },
    ],
  },
];
