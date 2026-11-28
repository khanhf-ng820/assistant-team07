# CARENTA Mobile Design System Specification

**Owner / Maintainer:** Đặng Xuân Phát (`Dang-Xuan-Phat` — UI/UX, QA/QC)  
**Component:** `apps/mobile`  
**Reference:** `docs/carenta-implementation-plan.md` (§4), Figma UI Kit & Navigation Sheet (pp. 1–3)

---

## 1. Overview & Principles

The CARENTA Mobile Design System establishes a cohesive, native, banking-grade visual language for the personal finance assistant. All Phase 1, Phase 2, and Phase 3 screens consume shared design tokens and atomic UI primitives from `apps/mobile/src/theme.ts` and `apps/mobile/src/components/`.

### Core Design Principles
1. **Clarity & Financial Trust:** High-contrast color hierarchy, distinct positive/negative financial states, and explicit numeric boundaries.
2. **Deterministic UI Feedback:** Every interactive element provides instantaneous visual, accessible, and state feedback without layout shifts.
3. **Accessibility First (A11y):** Strict adherence to WCAG 2.1 AA contrast thresholds and a mandatory **>= 48×48dp** touch target for all tap targets.
4. **Platform Harmony:** Native typography rendering (`SF Pro Display` via iOS `System` font; `Inter` / system sans-serif on Android/Web).

---

## 2. Design Token Palette (`src/theme.ts`)

### Color Palette

| Token Key | Hex Code | Semantic Role | WCAG Contrast on `#FFFFFF` |
| :--- | :--- | :--- | :--- |
| `primary` | `#0F766E` | Primary Teal — Brand actions, active Stats tab, key CTAs | 5.60 : 1 (AA Pass) |
| `primaryDark` | `#115E59` | Dark Teal — Pressed button states, active badges | 7.35 : 1 (AAA Pass) |
| `primaryLight` | `#CCFBF1` | Soft Teal Tint — Active badge background, subtle highlights | — |
| `blue` | `#2563EB` | Blue Accent — Analytical indicators, category tags | 4.56 : 1 (AA Pass) |
| `savings` / `coral` | `#F43F5E` | Piggy Coral Accent — Savings tab, goal progress, targets | 3.65 : 1 (Large Text Pass) |
| `savingsTint` | `#FFE4E6` | Coral Light Tint — Piggy bank cards, goal badge backgrounds | — |
| `emerald` / `success`| `#10B981` | Success Emerald — Within-budget indicator, confirmed transactions | 3.12 : 1 (UI Component Pass; pair with `successSoft` + `text` for icons) |
| `successSoft` | `#DCFCE7` | Soft Emerald Tint — Accessible badge background for `Toast` (`success`) | — |
| `amber` / `warning` | `#F59E0B` | Warning Amber — Budget nearing limit, caution prompts | 2.14 : 1 (Decorative; pair with `warningSoft` + `text` for icons) |
| `warningSoft` | `#FEF3C7` | Soft Amber Tint — Accessible badge background for `Toast` (`warning`) | — |
| `danger` / `error` | `#EF4444` | Danger Red — Overspending alerts, delete actions, error toasts | 3.98 : 1 (Large Text Pass; pair with `dangerSoft` + `text` for icons) |
| `dangerSoft` | `#FEE2E2` | Soft Red Tint — Accessible badge background for `Toast` (`error`) | — |
| `background` | `#F8FAFC` | App Background — Neutral cool-gray surface | — |
| `surfaceCard` | `#FFFFFF` | Card & Sheet Surface — Pure white container cards | — |
| `surfaceAlt` | `#F1F5F9` | Secondary Surface — Inactive buttons, chips, divider bands | — |
| `text` | `#0F172A` | Primary Text — Slate-900 high legibility typography | 16.10 : 1 (AAA Pass) |
| `textSecondary` / `muted` | `#475569` | Secondary Text — Supporting subtitles, timestamps, labels | 7.02 : 1 (AAA Pass) |
| `border` | `#E2E8F0` | Subtle Card Borders & Nav dividers | — |
| `overlay` | `rgba(15, 23, 42, 0.65)` | Scrim Dimmer — Translucent backdrop for modals & sheets | — |

---

## 3. Typography Hierarchy

Platform-aware typography defined in `typography` (and aliased as `type`):

```ts
import { typography, type } from '../theme';
```

| Role | Font Size | Weight | Line Height | Usage Example |
| :--- | :--- | :--- | :--- | :--- |
| `heroAmount` | 32sp | 700 (Bold) | 40sp | Main ledger balance, big money inputs (`4.500.000 ₫`) |
| `title` | 24sp | 700 (Bold) | 32sp | Screen titles, onboarding headings |
| `heading` | 18sp | 600 (Semibold) | 26sp | Card headers, modal titles, section dividers |
| `subheading` | 16sp | 600 (Semibold) | 24sp | List item titles, merchant names |
| `body` | 14sp | 400 (Regular) | 22sp | Descriptive body copy, transaction notes |
| `bodyBold` | 14sp | 600 (Semibold) | 22sp | Button titles, table row values, status labels |
| `caption` | 12sp | 400 (Regular) | 18sp | Timestamps, helper hints, sub-labels |
| `captionBold` | 12sp | 600 (Semibold) | 18sp | Navigation bar tab labels, chip badges |

---

## 4. Spacing, Radius & Elevation

### Spacing Scale
- `spacing.xs`: 4dp
- `spacing.sm`: 8dp
- `spacing.md`: 12dp
- `spacing.lg`: 16dp (Standard screen margin)
- `spacing.xl`: 24dp (Modal / card padding)
- `spacing.xxl`: 32dp
- `spacing.xxxl`: 48dp

### Border Radius
- `radius.xs`: 4dp (Status tags)
- `radius.sm`: 8dp (Small inputs, chips)
- `radius.md`: 12dp (Buttons, secondary cards)
- `radius.lg`: 16dp (Main cards, sheets)
- `radius.xl`: 24dp (Modal dialogs, bottom sheets)
- `radius.full`: 9999dp (Circular icons, floating plus button)

### Elevation & Shadows
- `shadows.sm`: Subtle card elevation (elevation 1 / opacity 0.05).
- `shadows.md`: Navigation bar, dropdown sheets (elevation 3 / opacity 0.08).
- `shadows.lg`: Modals, dialog sheets, Toast alerts (elevation 6 / opacity 0.12).
- `shadows.floating`: Floating Action Button (`+`) raised glow (elevation 8 / Teal shadow opacity 0.35).

---

## 5. Reusable UI Primitives (`src/components/`)

### `<Card>`
Universal surface container supporting `elevated`, `outlined`, and `flat` variants:
```tsx
import { Card } from '../components/Card';

// Standard Elevated Card
<Card variant="elevated" padding="lg">
  <Text style={typography.heading}>Tổng số dư ghi nhận</Text>
</Card>

// Outlined Clickable Card
<Card variant="outlined" onPress={handleOpenDetails} accessibilityLabel="Xem chi tiết">
  <Text style={typography.body}>Chạm để xem lịch sử</Text>
</Card>
```

### `<Button>`
Full-featured accessible button with >= 48dp touch area:
```tsx
import { Button } from '../components/Button';

// Primary CTA
<Button
  title="Xác nhận"
  variant="primary"
  size="md"
  onPress={handleConfirm}
/>

// Loading State
<Button
  title="Đang lưu..."
  variant="primary"
  loading={isSubmitting}
/>

// Secondary / Ghost / Danger
<Button title="Hủy bỏ" variant="outline" onPress={handleCancel} />
<Button title="Xóa giao dịch" variant="danger" onPress={handleDelete} />
```

### `<Header>`
Standard screen header with accessible back button and right slot:
```tsx
import { Header } from '../components/Header';

<Header
  title="Lịch sử chi tiêu"
  subtitle="Tháng 11/2026"
  onBack={() => router.back()}
  rightAction={<Pressable accessibilityLabel="Cài đặt"><Text>⚙️</Text></Pressable>}
/>
```

### `<Toast>`
Feedback notification banner with status icons and auto-dismiss timer:
```tsx
import { Toast } from '../components/Toast';

<Toast
  visible={showToast}
  message="Khoản chi đã được lưu thành công!"
  type="success" // 'success' | 'warning' | 'error' | 'info'
  duration={3000}
  onDismiss={() => setShowToast(false)}
/>
```

### `<CaptureChooser>`
Full-screen modal overlay for initiating expense entries:
```tsx
import { CaptureChooser } from '../components/CaptureChooser';
import { useLedger } from '../context/LedgerContext';

// Pattern 1: Automatic LedgerContext integration (Issue #45)
// When mounted inside LedgerProvider, CaptureChooser triggers ledger.openManualEntry() automatically.
<CaptureChooser
  visible={isCaptureOpen}
  onClose={() => setIsCaptureOpen(false)}
/>

// Pattern 2: Explicit manual handler or future deep-link navigation (Issue #53)
<CaptureChooser
  visible={isCaptureOpen}
  onClose={() => setIsCaptureOpen(false)}
  onSelectManual={() => router.push('/capture/manual')} // Issue #53 navigation
  onSelectMethod={(method) => console.log('Selected capture method:', method)} // Observer
/>
```

---

## 6. Bottom Navigation Bar Architecture (`_layout.tsx`)

- **Fixed Reference Bar Height:** Strictly 84dp including safe-area insets per `docs/carenta-implementation-plan.md` §4.
- **3-Slot Layout:**
  - **Slot 1 (Left):** `Thống kê` tab (Dashboard & Analytics).
  - **Slot 2 (Center):** Floating 56×56dp `+` button, raised 12dp above bar baseline with `shadows.floating`.
  - **Slot 3 (Right):** `Tiết kiệm` tab (Piggy Bank & Savings Goals).
- **Navigation Contract:** Preserves `screen.getByRole('tab', { name: 'Thống kê' })` and `screen.getByRole('tab', { name: 'Tiết kiệm' })`.
