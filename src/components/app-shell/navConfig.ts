import type React from 'react';
import {
  LayoutDashboard,
  Inbox,
  Truck,
  Users,
  BookUser,
  Mailbox,
  CalendarClock,
  Route,
  History,
  FileSpreadsheet,
  Smartphone,
  BellRing,
} from 'lucide-react';
import type { PageKey } from '@/lib/routes';

export type NavItem = {
  key: PageKey;
  label: string;
  icon: React.ElementType;
  // แสดง badge จำนวนงานค้าง (ค่าจริงคำนวณจาก store ใน AppShell)
  showBadge?: boolean;
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
    label: 'รับออเดอร์',
    items: [
      { key: 'script_transform', label: 'Script Transform', icon: FileSpreadsheet },
      { key: 'inbox', label: 'Order Inbox', icon: Inbox, showBadge: true },
    ],
  },
  {
    id: 'delivery',
    label: 'จัดส่ง',
    items: [
      { key: 'queue', label: 'ส่งทันที', icon: Truck, showBadge: true },
      { key: 'planning', label: 'Planning', icon: CalendarClock, showBadge: true },
      { key: 'delivery_tracking', label: 'ติดตามการจัดส่ง', icon: Route, showBadge: true },
      { key: 'tracking_history', label: 'ประวัติการติดตาม', icon: History },
      { key: 'notifications', label: 'แจ้งเตือนลูกค้า', icon: BellRing },
      { key: 'postal', label: 'ไปรษณีย์ไทย', icon: Mailbox, showBadge: true },
    ],
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
];
