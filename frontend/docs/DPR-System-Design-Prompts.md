# DPR System — Claude Design Prompt Library

A growing collection of page-by-page design prompts for the DPR (Daily Progress Report) construction management system. Paste each prompt into Claude Design one at a time to redesign that screen. The **Project Scope** section below must be read before any individual page prompt.

---

## PROJECT SCOPE

### What is DPR System?

DPR System is a **construction project management web application** used by civil engineering teams to track daily site progress, manage bills of quantities, record worker attendance, handle material procurement, and generate financial reports. It is used by office staff on desktops and by site engineers on mobile phones in the field.

### Two Distinct Interfaces

| Interface | Who uses it | Device | Access |
|---|---|---|---|
| **Desktop / Office** | Project Managers, Quantity Surveyors, Admins, Store Keepers | Desktop & tablet | Sidebar navigation, data-heavy tables |
| **Field / Mobile** | Site Engineers | Mobile phones | Bottom tab or simple top-nav, camera/GPS features |

### User Roles & Access

| Role | Short name | Access level |
|---|---|---|
| `ADMIN` | Admin | Full access to all pages |
| `PROJECT_MANAGER` | PM | Projects, resources, finance, reports |
| `QUANTITY_SURVEYOR` | QS | BOQ, measurements, billing, reports |
| `STORE_KEEPER` | SK | Material indents, expenses |
| `SITE_ENGINEER` | SE | Field interface only |

### Design Tokens (current implementation)

**Typography**
- Font family: `system-ui, 'Segoe UI', Roboto, sans-serif`
- Base font size: `14px`
- Font smoothing: antialiased

**Ant Design tokens**
- `colorPrimary`: `#1677ff` (light) / `#4096ff` (dark)
- `borderRadius`: `6px`
- `fontSize`: `14px`

**Light mode palette**
```
layoutBackground:   #f3f3f3   (outer page / body bg)
headerBackground:   #ffffff
siderBackground:    #ffffff
headerText:         #1f2937
headerMutedText:    #64748b
contentBackground:  #ffffff
contentText:        #0f172a
contentMutedText:   #475569
borderColor:        #e2e8f0
accent:             #1677ff
```

**Dark mode palette**
```
layoutBackground:   #0f172a
headerBackground:   #1a202c
siderBackground:    #1a202c
headerText:         #e2e8f0
headerMutedText:    #94a3b8
contentBackground:  #1a202c
contentText:        #e2e8f0
contentMutedText:   #94a3b8
borderColor:        #2d3748
accent:             #4096ff
```

**Sidebar group header style** (CSS override on Ant Design Menu)
- Font size: `11px`, weight: `700`, uppercase, letter-spacing: `0.06em`
- Background: `rgba(0,0,0,0.05)` on light / `rgba(255,255,255,0.08)` on dark
- Border radius: `6px`

### All Pages

| # | Page | Route | Roles |
|---|---|---|---|
| 01 | **App Shell / Layout** | (wraps all) | all |
| 02 | Login | `/login` | — |
| 03 | Dashboard | `/dashboard` | all |
| 04 | Analytics | `/analytics` | PM, QS, Admin |
| 05 | Projects | `/projects` | PM, Admin |
| 06 | BOQ | `/boq` | PM, QS, Admin |
| 07 | Measurements (MB) | `/measurements` | PM, QS, Admin |
| 08 | DPR History | `/dpr-history` | PM, QS, Admin |
| 09 | Monthly DPR Report | `/dpr-monthly-report` | PM, QS, Admin |
| 10 | Material Indents | `/material-indents` | PM, SK, Admin |
| 11 | Workers & Attendance | `/workers` | PM, Admin |
| 12 | Expenses | `/expenses` | PM, SK, Admin |
| 13 | Running Bills | `/billing` | QS, PM, Admin |
| 14 | Production Progress | `/production-progress` | PM, QS, Admin |
| 15 | Profitability | `/profitability` | PM, Admin |
| 16 | Worker Earnings | `/worker-earnings` | PM, QS, Admin |
| 17 | Master Data | `/masters` | Admin |
| 18 | Users | `/users` | Admin |
| 19 | Org Settings | `/settings` | PM, Admin |
| 20 | Profile | `/profile` | all |
| 21 | Field — Today's DPR | `/field/dpr-today` | SE, PM, Admin |
| 22 | Field — Materials Used | `/field/materials` | SE, PM, Admin |
| 23 | Field — Machinery Used | `/field/machinery` | SE, PM, Admin |
| 24 | Field — Attendance Check-in | `/field/workers` | SE, PM, Admin |
| 25 | Field — Measurement Entry | `/field/measurements` | SE, PM, Admin |
| 26 | Field — My Measurements | `/field/my-measurements` | SE |
| 27 | Field — My Material Indents | `/field/my-indents` | SE |

---

---

## PAGE 01 — APP SHELL / LAYOUT

### Claude Design Prompt

Design the **app shell** for DPR System — a construction project management application. This is the persistent chrome that wraps every page: a collapsible sidebar, a top header bar, and a content area. There is no content on this screen itself; the content slot should show a simple placeholder card that says "Page content renders here."

---

### Visual Style

- Clean, professional, enterprise feel — not playful
- Light mode by default (show dark mode as a secondary variant or annotation)
- Ant Design component library (use real antd components: `Layout`, `Menu`, `Button`, `Avatar`, `Dropdown`, `Typography`, `Badge`)
- System font stack: `system-ui, 'Segoe UI', Roboto, sans-serif`
- Border radius: `6px` throughout
- Primary accent: `#1677ff` (Ant Design default blue)
- Backgrounds: body/layout `#f3f3f3`, sidebar `#ffffff`, header `#ffffff`, content card `#ffffff`
- Borders: `1px solid #e2e8f0`
- Text: `#1f2937` primary, `#64748b` muted

---

### Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER (full width, 64px tall, white, bottom border)       │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│   SIDEBAR    │            CONTENT AREA                      │
│   220px      │            (layoutBackground: #f3f3f3)       │
│   white bg   │                                              │
│              │   ┌─────────────────────────────────────┐   │
│   [nav       │   │  white card, border-radius 8px,     │   │
│    groups    │   │  border 1px #e2e8f0, padding 24px   │   │
│    and       │   │                                     │   │
│    items]    │   │  "Page content renders here"        │   │
│              │   └─────────────────────────────────────┘   │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

---

### Header Bar (64px tall, white `#ffffff`, `border-bottom: 1px solid #e2e8f0`)

**Left zone:**
- A text `Button` (type="text") that acts as the sidebar collapse toggle — clicking it on desktop collapses the sidebar from 220px to 64px (icons-only). Label: "Dashboard" (reflects which page is active — for this mockup use "Dashboard")
- Color: `#1f2937`

**Right zone (Space component, align center):**
1. **Notification bell** — `Button` type="text" wrapping a `Badge` with count `3` and a bell icon (`BellOutlined`). Color: `#1f2937`
2. **User avatar dropdown** — a `Dropdown` trigger `Button` type="text" containing:
   - A sun icon (`SunFilled`, theme indicator) in `#1f2937` at 18px — visible only on desktop
   - An `Avatar` with `UserOutlined` icon, background color `#1677ff` (accent)
   - User's full name text "Ravi Kumar" in `#1f2937` — visible only on desktop

   The dropdown menu has these items:
   ```
   [ UserOutlined ]  My Profile
   ─── divider ───
   Theme             (group label, muted, 12px)
   [ SunFilled    ]  Light        ✓ (checkmark in accent blue if active)
   [ MoonFilled   ]  Dark
   [ DesktopOutlined ] System
   ─── divider ───
   [ LogoutOutlined ] Sign out
   ```

---

### Sidebar (220px wide, white `#ffffff`, no right border — relies on layout shadow/separation)

**Top logo area** (64px tall, matches header height, `padding: 0 16px`, flex center):
- App name: `"DPR System"` — Ant Design `Typography.Title` level 4, color `#1f2937`
- When collapsed (64px wide): shows `"DPR"` as Title level 5

**Navigation** — Ant Design `Menu` component, `mode="inline"`, `theme="light"`
- `border-inline-end: none` (remove the default right border)
- Background matches siderBackground: `#ffffff`
- Uses **grouped/submenu structure** — each group is an `antd Menu` submenu

Group header styling (CSS override on `.ant-menu-submenu-title`):
- Font-size: `11px`, font-weight: `700`, text-transform: `uppercase`, letter-spacing: `0.06em`
- Background: `rgba(0,0,0,0.05)`, border-radius: `6px`
- This makes group labels look like subtle section dividers

**Navigation groups and items (in order):**

```
▾ OVERVIEW
    Dashboard           (DashboardOutlined)

▾ PROJECT
    Projects            (ApartmentOutlined)
    BOQ                 (FileTextOutlined)
    Measurements (MB)   (FileTextOutlined)
    DPR History         (FileTextOutlined)
    Monthly DPR Report  (FileTextOutlined)

▾ RESOURCES
    Material Indents    (InboxOutlined)
    Workers & Attendance (TeamOutlined)
    Expenses            (CarOutlined)

▾ FINANCE
    Running Bills       (DollarOutlined)

▾ REPORTS
    Production Progress (RiseOutlined)
    Profitability       (PercentageOutlined)
    Analytics           (BarChartOutlined)
    Worker Earnings     (TeamOutlined)

▾ ADMINISTRATION
    Master Data         (SettingOutlined)
    Users               (IdcardOutlined)
    Organization Settings (GlobalOutlined)
```

Active/selected item: blue `#1677ff` text and background highlight (Ant Design default selected state).
For this mockup, show **Dashboard** as the selected item.

---

### Content Area

- Background: `#f3f3f3` (layoutBackground)
- Padding: `16px` desktop, `8px` mobile
- Contains a single white card:
  - `border-radius: 8px`, `border: 1px solid #e2e8f0`, `padding: 24px`
  - Background: `#ffffff`
  - Text: "Page content renders here" in muted color `#475569`

---

### Collapsed Sidebar State (show as secondary variant)

When the sidebar is collapsed (user clicked the toggle):
- Width shrinks to `64px`
- App name becomes `"DPR"` (shorter title)
- Navigation shows **icons only** — no text labels
- Group labels are hidden
- Hover on an icon shows a tooltip with the item name
- The content area expands to fill the freed space
- The header toggle button changes appearance to indicate "expand" action

---

### Mobile Behavior (show as a third variant at ~390px viewport width)

- Sidebar is **hidden off-screen** by default (translated left by 100%)
- Header toggle button opens the sidebar as a **full-height overlay drawer** from the left
- A semi-transparent overlay backdrop (`rgba(15,23,42,0.35)`) covers the content behind the open sidebar
- Sidebar slides in with `transition: transform 0.25s ease`
- No desktop collapse button — mobile uses the drawer pattern only
- Header right zone: show only the bell badge and the avatar (hide theme icon and name text)
- Content padding: `8px`
- Content card padding: `12px`, border-radius: `0` on mobile

---

### Dark Mode Variant (annotate or show as a fourth variant)

All the same structure, with these color substitutions:
```
Body / layout bg:    #0f172a
Header bg:           #1a202c
Sidebar bg:          #1a202c
Content card bg:     #1a202c
Border color:        #2d3748
Primary text:        #e2e8f0
Muted text:          #94a3b8
Accent:              #4096ff
```
Ant Design `theme="dark"` on the Menu component.
Sidebar group header background: `rgba(255,255,255,0.08)`

---

### Ant Design Components Used

| Component | Where |
|---|---|
| `Layout` | Root layout shell |
| `Layout.Sider` | Sidebar |
| `Layout.Header` | Top bar |
| `Layout.Content` | Page body |
| `Menu` | Sidebar navigation (mode="inline", grouped submenus) |
| `Button` (type="text") | Header collapse toggle, notification bell trigger, avatar trigger |
| `Avatar` | User avatar in header |
| `Badge` | Notification count on bell icon |
| `Dropdown` | User profile dropdown menu |
| `Typography.Title` | App name in sidebar, page titles |
| `Typography.Text` | Username in header, muted labels |
| `Space` | Right-zone grouping in header |
| `Grid.useBreakpoint` | Responsive mobile/desktop logic |
| `Spin` | Full-page loading spinner during auth check |

**Custom components used in layout:**
| Component | File | What it does |
|---|---|---|
| `NotificationBell` | `src/components/layout/NotificationBell.tsx` | Bell icon + badge, fetches unread notification count, opens notification list |
| `InstallBanner` | `src/components/layout/InstallBanner.tsx` | PWA install prompt banner that appears above the header when the browser exposes an install event |

**Icons (all from `@ant-design/icons`):**
`DashboardOutlined`, `ApartmentOutlined`, `FileTextOutlined`, `InboxOutlined`, `TeamOutlined`, `CarOutlined`, `DollarOutlined`, `RiseOutlined`, `PercentageOutlined`, `BarChartOutlined`, `SettingOutlined`, `IdcardOutlined`, `GlobalOutlined`, `BellOutlined`, `UserOutlined`, `SunFilled`, `MoonFilled`, `DesktopOutlined`, `LogoutOutlined`, `CheckOutlined`

---

### What to Redesign / Explore

When using this prompt in Claude Design, you can ask it to:
- Try a **darker sidebar** (e.g. `#1e293b` sidebar with light text) while keeping the header white — a common enterprise variant
- Try a **top navigation** instead of a sidebar for a different layout paradigm
- Explore a **wider sidebar** (260px) with more breathing room between items
- Try **colored header** (accent blue `#1677ff` background) with white text for a bolder brand treatment
- Adjust **sidebar group label style** — try colored pills, plain text, or icon-only separators
- Make the **content card** edge-to-edge (no border/radius) for a flatter, more modern look

---

*Next: PAGE 02 — LOGIN*

---

---

## PAGE 02 — LOGIN

### Claude Design Prompt

Design the **login page** for DPR System — a construction project management application used by civil engineering teams. This is a standalone full-page screen with no sidebar or header. It is the first screen any user sees.

---

### Visual Style

- Clean, minimal, professional — not playful or decorative
- Full-viewport centered layout — the login card floats in the middle of the screen
- Light mode primary; see dark mode variant below
- Ant Design component library (`Card`, `Form`, `Input`, `Button`, `Typography`)
- System font: `system-ui, 'Segoe UI', Roboto, sans-serif`
- Border radius: `6px`
- Primary accent: `#1677ff`
- Page background: `#f3f3f3` (same as the app's layout background — subtle off-white)

---

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                                                     │
│               ┌─────────────────┐                  │
│               │   LOGIN CARD    │                  │
│               │   (360px wide)  │                  │
│               │                 │                  │
│               │  DPR System     │                  │
│               │                 │                  │
│               │  User ID        │                  │
│               │  [___________]  │                  │
│               │                 │                  │
│               │  Password       │                  │
│               │  [___________]  │                  │
│               │                 │                  │
│               │  [  Sign in  ]  │                  │
│               └─────────────────┘                  │
│                                                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

Page layout: `display: flex; min-height: 100vh; align-items: center; justify-content: center`

---

### Login Card

- Ant Design `Card` component, `width: 360px`
- Default card padding and shadow (Ant Design default Card styles)
- No custom border or background override — uses Ant Design defaults on white

**Contents (top to bottom):**

1. **App title** — `Typography.Title` level 3: `"DPR System"`
   - Margin-bottom: default spacing before the form

2. **Form** — Ant Design `Form`, `layout="vertical"`

   **Field 1 — User ID**
   - `Form.Item` label: `"User ID"`
   - `Input` component, placeholder: `"e.g. jsmith"`
   - `autoFocus` — cursor starts here on page load
   - Required validation

   **Field 2 — Password**
   - `Form.Item` label: `"Password"`
   - `Input.Password` component (shows eye toggle to reveal/hide)
   - Required validation

   **Submit button**
   - `Button` type="primary", `htmlType="submit"`, `block` (full width)
   - Label: `"Sign in"`
   - Shows a loading spinner while the API request is in flight

---

### States to Show

| State | Visual |
|---|---|
| **Default** | Empty form, Sign in button enabled |
| **Loading** | Button shows spinner, label stays "Sign in", inputs disabled |
| **Error** | Ant Design `message.error` toast appears top-center: *"Incorrect User ID or password."* — the card itself has no inline error state |

---

### Ant Design Components Used

| Component | Where |
|---|---|
| `Card` | Login card container |
| `Form` | Wraps the two fields + button |
| `Form.Item` | Each labeled field wrapper |
| `Input` | User ID text field |
| `Input.Password` | Password field with show/hide eye icon |
| `Button` (type="primary", block) | Sign in submit button |
| `Typography.Title` | "DPR System" heading |
| `message` | Global toast for login errors (`message.error(...)`) |

**No custom components on this page.** No icons from `@ant-design/icons` are used on the login page itself.

---

### Dark Mode Variant

Same layout and structure; swap these colors:
```
Page background:   #0f172a
Card background:   #1a202c  (Ant Design dark card)
Primary text:      #e2e8f0
Input background:  #0f172a
Input border:      #2d3748
Accent / button:   #4096ff
```

---

### What to Redesign / Explore

When using this prompt in Claude Design, you can ask it to:
- Add a **branded left panel** (half-screen) with a construction site illustration or project photo + tagline, turning the layout into a two-column split screen
- Add the company / organisation **logo** above the "DPR System" title
- Try a **card-less design** — form floats directly on a colored or image background with no card border
- Add **"Forgot password?"** link below the password field (currently not in the app — this is a design exploration)
- Try a **taller card** with a subtle construction-themed header illustration at the top of the card
- Try a **dark gradient background** (`#0f172a` → `#1e293b` diagonal) with a white card for contrast
- Add a **footer line** below the card with the organisation name or version number in muted text
- Try replacing the plain page background with a **subtle grid pattern** or `#1677ff` brand-colored left strip

---

*Next: PAGE 03 — DASHBOARD*
