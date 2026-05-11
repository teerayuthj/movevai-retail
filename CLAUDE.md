# CLAUDE.md — Frontend (movevai-retail)

Retail delivery dashboard (React 18 + Vite + TS + Tailwind + shadcn-style UI). Backend อยู่คนละ repo: `/Users/teerayutht/WorkSpace/movevai-retail-backend` (ตอนนี้ยังเป็น `ai-platform`; retail backend จริงยังไม่มีในโฟลเดอร์นั้น — ปัจจุบัน frontend ใช้ mock data).

## Stack

- **Build**: Vite 6 + TypeScript 5.7
- **UI**: React 18, Tailwind 3, Radix primitives, lucide-react, recharts
- **Routing**: custom `window.history` + path map (ไม่ใช้ react-router) — ดู `src/lib/routes.ts` และ `src/App.tsx`
- **State**: React Context (`RetailProvider`) — ไม่ใช้ Redux/Zustand
- **Date**: date-fns, react-day-picker
- **Lint/Format**: ESLint flat config + Prettier + Husky + lint-staged

## Layout — เวลา implement หาที่นี่

```
movevai-retail/
├── src/
│   ├── App.tsx                      # router + page switcher (PageKey)
│   ├── main.tsx
│   ├── index.css                    # tailwind base
│   ├── lib/
│   │   ├── routes.ts                # PageKey ↔ path mapping (ตรงนี้คือ source of truth ของ nav)
│   │   ├── deliveryExecution.ts     # business logic: คำนวณสถานะการส่ง
│   │   ├── deliveryPlanning.ts      # business logic: วางแผนรอบส่ง
│   │   ├── export.ts                # export CSV/Excel helpers
│   │   └── utils.ts                 # cn() + tailwind-merge
│   ├── pages/                       # ต่อ 1 ไฟล์ = 1 หน้า (ผูกกับ PageKey)
│   │   ├── Overview.tsx             # 'overview'   — dashboard
│   │   ├── ChatIntake.tsx           # 'chat'       — รับออเดอร์จาก chat
│   │   ├── Inbox.tsx                # 'inbox'      — กล่องขาเข้า (delegate ไปที่ features/inbox)
│   │   ├── Queue.tsx                # 'queue'      — คิวจัดส่ง
│   │   ├── DeliveryTracking.tsx     # 'delivery_tracking'
│   │   ├── Planning.tsx             # 'planning'   — วางแผนรอบ
│   │   ├── PostalQueue.tsx          # 'postal'     — คิวพัสดุไปรษณีย์
│   │   └── Drivers.tsx              # 'drivers'
│   ├── features/
│   │   └── inbox/                   # inbox feature (โครง feature-folder เต็มรูปแบบ)
│   │       ├── Inbox.tsx
│   │       ├── components/         # CustomerInfoForm, ExcelParsingView, OrderDetail,
│   │       │                       # OrderListItem, OrderListPanel, ShippingMethodSelector
│   │       ├── hooks/useOrderFiltering.ts
│   │       └── utils/orderFormatting.ts
│   ├── components/
│   │   ├── AppShell.tsx             # sidebar + topbar layout
│   │   ├── OrderTimeline.tsx
│   │   ├── ResolutionDialog.tsx
│   │   ├── DriverAvatar.tsx
│   │   ├── delivery/
│   │   │   └── DeliveryExecutionShared.tsx
│   │   └── ui/                      # shadcn-style primitives (button, dialog, select, ...)
│   ├── state/
│   │   ├── retailStore.tsx          # RetailProvider + useRetail() hook (Context)
│   │   └── retail/                  # state slices
│   │       ├── orders.ts
│   │       ├── delivery.ts
│   │       ├── planning.ts
│   │       ├── postal.ts
│   │       ├── timeline.ts
│   │       ├── internalChat.ts
│   │       ├── persistence.ts       # localStorage hydrate/persist
│   │       └── types.ts             # canonical domain types (Order, Driver, …)
│   ├── data/
│   │   └── mock.ts                  # seed/mock data — ใช้แทน API จริง
│   └── vite-env.d.ts
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json                    # path alias '@/*' → 'src/*'
```

## หา feature ตรงไหน

| ต้องทำอะไร                          | ดู/แก้ที่ไหน                                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| เพิ่มหน้าใหม่                       | สร้าง `src/pages/<Name>.tsx` → เพิ่ม `PageKey` + path ใน `src/lib/routes.ts` → mount ใน `src/App.tsx`          |
| แก้ navigation / sidebar            | `src/components/AppShell.tsx` + `src/lib/routes.ts`                                                            |
| แก้ logic การส่ง / สถานะออเดอร์     | `src/lib/deliveryExecution.ts`, `src/state/retail/delivery.ts`, `src/state/retail/timeline.ts`                 |
| แก้ logic วางแผนรอบส่ง              | `src/lib/deliveryPlanning.ts` + `src/state/retail/planning.ts`                                                 |
| แก้ domain types (Order, Driver, …) | `src/state/retail/types.ts`                                                                                    |
| แก้ mock/seed data                  | `src/data/mock.ts`                                                                                             |
| เพิ่ม UI primitive                  | `src/components/ui/` (ตามแบบ shadcn — class-variance-authority + tailwind-merge ผ่าน `cn()` ใน `lib/utils.ts`) |
| เพิ่ม inbox sub-feature             | `src/features/inbox/{components,hooks,utils}/`                                                                 |
| persist state ไปที่ localStorage    | `src/state/retail/persistence.ts`                                                                              |

## คำสั่งที่ใช้บ่อย

```bash
npm run dev          # vite dev server
npm run build        # tsc -b && vite build
npm run typecheck
npm run lint         # / lint:fix
npm run format       # prettier
```

## Conventions

- **Import alias**: `@/...` = `src/...` (config ใน `tsconfig.json` + `vite.config.ts`)
- **Routing**: ทุกหน้าใหม่ต้องลง 3 จุด — `routes.ts` (PageKey + path), `App.tsx` (render), `AppShell.tsx` (nav item ถ้ามี)
- **State**: ใช้ `useRetail()` จาก `state/retailStore.tsx`; แตก slice ตาม domain ใน `state/retail/`
- **Page → Feature delegation**: หน้าที่ซับซ้อน (เช่น Inbox) ให้ `src/pages/Foo.tsx` เป็นแค่ shell แล้ว delegate ไปที่ `src/features/foo/Foo.tsx`
- **Types**: domain types รวมที่ `src/state/retail/types.ts` — อย่าประกาศซ้ำในแต่ละ component
- **Backend**: ปัจจุบันใช้ mock; ถ้าจะต่อ API จริงต้องสร้าง layer ใหม่ (ยังไม่มี `src/api/` หรือ react-query) — ตอนนี้ทุกอย่าน sync ผ่าน Context
