

## Plan: Match UI to Reference Image

The reference image shows a polished, dark automotive UI with specific visual details that differ from the current implementation. Key differences to address:

### 1. Dashboard (`Dashboard.tsx`)
- The "Objednat Servis" button should be a full-width bronze gradient button with a phone icon, not split into two columns
- Below it, show two quick action buttons side-by-side: "Objednat Servis" (wrench icon) and "Katalog" (grid/book icon) as separate bordered cards
- Vehicle image should be larger and more prominent with a subtle warm gradient behind it
- Notification bell should have a red dot indicator
- User avatar in top-right corner (currently TondaAvatar, should be a user photo placeholder)

### 2. Service Book (`ServiceBook.tsx`)
- Redesign to match the reference: large "Servisní knížka" heading, "Repair history" subtitle with a "Filtrovat" filter button
- Each record as a bordered card with bronze left border accent
- Format: "15.08.2024 - Výměna oleje - Chrysler Praha"
- Each card shows document links: "Detailení protokol" with download icon
- Remove the timeline dots/line — use simple stacked cards instead
- Remove vehicle selector from top (or make it more minimal)

### 3. Bottom Navigation (`BottomNav.tsx`)
- Match the reference: 5 icons — Home, Service/wrench, Search, Bell/notifications, User/settings
- The reference shows: house, circle-dot, search, bell, gear icons
- Cleaner, no text labels visible (or very subtle)

### 4. Desktop Sidebar (`DesktopSidebar.tsx`)  
- Reference shows: Chrysler CZ logo with wings at top, then nav items: Dashboard, Obodout(?), Servio, Servio, Katalog — simplified navigation
- Keep current structure but ensure visual consistency

### 5. Global CSS (`index.css`)
- Ensure card borders have a subtle bronze/amber tint on hover or active states
- Cards should have slightly rounded corners with thin borders

### Files to modify:
1. **`src/components/dashboard/Dashboard.tsx`** — Restructure hero card: full-width bronze CTA button + two action cards below
2. **`src/pages/ServiceBook.tsx`** — Replace timeline with clean card list, add bronze left-border accent, filter button, document download links
3. **`src/components/BottomNav.tsx`** — Update icons to match reference (add Search, Bell; remove text labels or keep minimal)
4. **`src/components/dashboard/QuickActions.tsx`** — May be removed or simplified since actions are integrated into Dashboard card
5. **`src/index.css`** — Minor tweaks for card border accents

