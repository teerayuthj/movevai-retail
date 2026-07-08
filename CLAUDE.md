# CLAUDE.md — Frontend (movevai-retail)

Retail delivery dashboard (React 18 + Vite + TS + Tailwind + shadcn-style UI). Backend อยู่คนละ repo: `/Users/teerayutht/WorkSpace/movevai-retail-backend` (ตอนนี้ยังเป็น `ai-platform`; retail backend จริงยังไม่มีในโฟลเดอร์นั้น — ปัจจุบัน frontend ใช้ mock data).

## Stack

- **Build**: Vite 6 + TypeScript 5.7
- **UI**: React 18, Tailwind **v4** (CSS-first config — ไม่มี `tailwind.config.js`; ตั้งค่าใน `src/index.css` ผ่าน `@theme`/`@plugin`/`@utility`, PostCSS ผ่าน `@tailwindcss/postcss`), Radix primitives, lucide-react, recharts
- **Routing**: custom `window.history` + path map (ไม่ใช้ react-router) — ดู `src/lib/routes.ts` และ `src/App.tsx`
- **State**: React Context (`RetailProvider`) — ไม่ใช้ Redux/Zustand
- **Date**: date-fns, react-day-picker
- **Lint/Format**: ESLint flat config + Prettier + Husky + lint-staged

## Surfaces — ใครใช้ entry ไหน (สำคัญต่อ handoff policy)

Repo เดียว แต่แยกเป็น 3 surface ผ่าน multi-entry (`vite.config.ts` → `build.rollupOptions.input`):

| Surface       | Entry                                       | ใช้ที่ไหน                                                                                                                                                         |
| ------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **admin**     | `index.html` → `src/main.tsx` → `App.tsx`   | **web-only** — ทุกหน้าใน sidebar (overview, order-inbox, driver-queue, planning, tracking, drivers, …)                                                            |
| **messenger** | `messenger.html` → `src/main-messenger.tsx` | **mobile app จริง** — Capacitor native bundle boot entry นี้ (mode capacitor build เฉพาะ entry นี้แล้ว copy ทับ `dist/index.html`); บน web เข้าผ่าน `/messenger*` |
| **customer**  | `customer.html` → `src/main-customer.tsx`   | web ผ่าน `/t/*` (ลิงก์สั้น trackingCode), `/track*`, `/customer-track*`; ใน native เข้าถึงได้ผ่าน lazy chunk ใน messenger entry (deep link `/track/...`)          |

- dev: middleware `surfaceEntryRouting()` ใน `vite.config.ts` rewrite `/t/*`+`/track*`→customer.html, `/messenger*`→messenger.html ให้อัตโนมัติ
- **prod hosting ต้องตั้ง rewrite เอง**: `/t/*` + `/track*` + `/customer-track*` → `/customer.html`, `/messenger*` → `/messenger.html`, ที่เหลือ → `/index.html`
- service worker / PWA manifest / native shell / push ผูกกับ messenger entry เท่านั้น — ห้ามลากกลับเข้า `src/main.tsx` (admin)

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
├── vite.config.ts                   # + vite-plugin-pwa (messenger PWA)
├── postcss.config.js                # @tailwindcss/postcss (Tailwind v4)
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
npm run build:cap    # tsc -b && vite build --mode capacitor (.env.capacitor)
npm run agent:ready:ios      # build native bundle + sync เข้า ios/App ให้ Xcode rebuild ได้ทันที
npm run agent:ready:android  # build native bundle + sync เข้า android/ ให้ Android Studio rebuild ได้ทันที
npm run agent:ready:native   # build native bundle + sync ทั้ง iOS/Android
npm run typecheck
npm run lint         # / lint:fix
npm run format       # prettier
```

## Native handoff process — สำคัญมากสำหรับ AI agents

เป้าหมาย: หลัง agent แก้งานที่ต้อง test บน Xcode/Simulator หรือ Android Studio/Emulator แล้ว ผู้ใช้ต้องเหลือแค่กด rebuild/run ใน simulator เท่านั้น ไม่ต้องกลับมารัน build/sync เอง

ให้ทำตามนี้ทุกครั้งก่อนส่งงานให้ผู้ใช้ test:

1. **แก้เฉพาะหน้า admin (surface web-only) = ไม่ต้อง sync native** — รันแค่ `npm run typecheck` + `npm run build` (ดูตาราง Surfaces ข้างบน; admin ไม่อยู่ใน native bundle แล้ว)
2. รัน native ready command เฉพาะเมื่อแก้: messenger surface (`src/main-messenger.tsx`, `src/features/messenger/`, `messenger.html`), customer tracking ที่ต้อง test ใน native, Capacitor config, camera/photo upload, GPS, push, API base, service worker, หรือไฟล์ใน `ios/`/`android/`
3. สำหรับ iOS/Xcode: รัน `npm run agent:ready:ios`
4. สำหรับ Android: รัน `npm run agent:ready:android`
5. ถ้ากระทบทั้งสอง platform หรือไม่แน่ใจว่า platform ไหน: รัน `npm run agent:ready:native`
6. Final response ต้องบอกชัดว่า command ไหนผ่านแล้ว และบอกผู้ใช้ว่าเปิด simulator แล้วกด rebuild/run ได้เลย (กรณี native) หรือบอกว่าเป็น web-only handoff
7. ห้ามจบงานด้วยการบอกให้ผู้ใช้ไปรัน `npm run build` / `npx cap sync ...` เอง ยกเว้น command ล้มเหลวจาก external blocker ที่ agent แก้ไม่ได้

## Conventions

- **Import alias**: `@/...` = `src/...` (config ใน `tsconfig.json` + `vite.config.ts`)
- **Routing**: ทุกหน้าใหม่ต้องลง 3 จุด — `routes.ts` (PageKey + path), `App.tsx` (render), `AppShell.tsx` (nav item ถ้ามี)
- **State**: ใช้ `useRetail()` จาก `state/retailStore.tsx`; แตก slice ตาม domain ใน `state/retail/`
- **Page → Feature delegation**: หน้าที่ซับซ้อน (เช่น Inbox) ให้ `src/pages/Foo.tsx` เป็นแค่ shell แล้ว delegate ไปที่ `src/features/foo/Foo.tsx`
- **Types**: domain types รวมที่ `src/state/retail/types.ts` — อย่าประกาศซ้ำในแต่ละ component
- **Form controls**: dropdown ต้องใช้ `Select` จาก `@/components/ui/select` (ห้ามเขียน `<select>` ดิบ + class เอง — native chevron จะเบียดขอบขวา), text input ใช้ `Input` จาก `@/components/ui/input`; ถ้าจำเป็นต้องใส่ class เอง padding แนวนอนขั้นต่ำคือ `px-3` (ห้าม `px-2`) — คุม width/flex ของ `Select` ผ่าน prop `containerClassName`
- **Backend**: ปัจจุบันใช้ mock; ถ้าจะต่อ API จริงต้องสร้าง layer ใหม่ (ยังไม่มี `src/api/` หรือ react-query) — ตอนนี้ทุกอย่าน sync ผ่าน Context
